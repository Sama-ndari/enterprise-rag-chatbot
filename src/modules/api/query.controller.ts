import { Controller, Get, Post, Body, UsePipes, ValidationPipe, HttpCode, UseInterceptors, UploadedFile, UploadedFiles, Logger, Res, Sse, BadRequestException } from '@nestjs/common';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiOperation, ApiResponse, ApiConsumes } from '@nestjs/swagger';
import { QueryService } from './query.service';
import { QueryDto } from './dto/query.dto';
import { QueryStreamDto } from './dto/query-stream.dto';
import { MultiCollectionQueryDto } from './dto/multi-collection-query.dto';
import { SeedDto } from './dto/seed.dto';
import { MilvusService } from '../milvus/milvus.service';
import { MinioService } from '../minio/minio.service';
import { RedisService } from '../redis/redis.service';
import { GuardrailsService } from '../guardrails/guardrails.service';
import { MemoryService } from '../rag/services/memory.service';
import { Kafka } from 'kafkajs';
import { ConfigService } from '@nestjs/config';

@Controller()
export class QueryController {
  private readonly logger = new Logger(QueryController.name);
  private kafkaProducer;

  constructor(
    private readonly queryService: QueryService,
    private readonly milvusService: MilvusService,
    private readonly minioService: MinioService,
    private readonly redisService: RedisService,
    private readonly guardrailsService: GuardrailsService,
    private readonly memoryService: MemoryService,
    private readonly configService: ConfigService,
  ) {
    const broker = this.configService.get<string>('kafka.broker');
    if (!broker) {
      throw new Error('Kafka broker is not configured for the API producer.');
    }
    const kafka = new Kafka({
      clientId: 'api-producer',
      brokers: [broker],
    });
    this.kafkaProducer = kafka.producer();
    this.kafkaProducer.connect();
  }

  @Post('query')
  @HttpCode(200)
  @ApiOperation({ summary: 'Query the chatbot', description: 'Sends a query to the chatbot and returns the response.' })
  @ApiResponse({ status: 200, description: 'The chatbot\'s response.' })
  @UsePipes(new ValidationPipe({ transform: true }))
  async query(@Body() queryDto: QueryDto) {
    const requestStart = Date.now();
    this.logger.log(`🌐 HTTP REQUEST: Query received for collection '${queryDto.collection}'`);

    try {
      // 🛡️ GUARDRAILS: Validate input
      const inputValidation = await this.guardrailsService.validateInput(queryDto.question);
      if (!inputValidation.valid) {
        this.logger.warn(`⚠️ GUARDRAILS BLOCKED: ${inputValidation.reason}`);
        throw new BadRequestException(`Query blocked: ${inputValidation.reason}`);
      }

      const response = await this.queryService.query(queryDto);

      // 🛡️ GUARDRAILS: Validate output
      const outputValidation = await this.guardrailsService.validateOutput(response.answer);
      if (!outputValidation.valid) {
        this.logger.warn(`⚠️ GUARDRAILS SANITIZED OUTPUT: ${outputValidation.reason}`);
        response.answer = this.guardrailsService.sanitizeResponse(response.answer);
      }

      const requestEnd = Date.now();
      const requestTime = requestEnd - requestStart;

      this.logger.log(`🌐 HTTP RESPONSE: Query completed in ${requestTime}ms`);
      return response;
    } catch (error) {
      const requestEnd = Date.now();
      const requestTime = requestEnd - requestStart;

      this.logger.error(`❌ HTTP ERROR: Query failed after ${requestTime}ms - ${error.message}`);
      throw error;
    }
  }

  @Post('query/stream')
  @HttpCode(200)
  @ApiOperation({ summary: 'Stream query response', description: 'Streams the chatbot response word-by-word using Server-Sent Events.' })
  @ApiResponse({ status: 200, description: 'Streaming response.' })
  @UsePipes(new ValidationPipe({ transform: true }))
  async queryStream(@Body() queryDto: QueryStreamDto, @Res() res: Response) {
    const requestStart = Date.now();
    const sessionId = queryDto.sessionId || `session-${Date.now()}`;

    this.logger.log(`🌐 STREAM REQUEST: Query received for collection '${queryDto.collection}' (session: ${sessionId})`);

    try {
      // Set headers for streaming
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');

      // Check cache first
      const cached = await this.redisService.getCachedResponse(queryDto.question, queryDto.collection);
      if (cached) {
        this.logger.log(`✅ Cache hit for query in collection '${queryDto.collection}'`);
        this.streamResponse(res, cached);
        return;
      }

      // Get response from query service
      const response = await this.queryService.query(queryDto);

      // Cache the response
      await this.redisService.cacheResponse(queryDto.question, queryDto.collection, response.answer);

      // Save to chat history
      if (sessionId) {
        await this.redisService.addMessage(sessionId, {
          role: 'user',
          content: queryDto.question,
          timestamp: Date.now(),
        });
        await this.redisService.addMessage(sessionId, {
          role: 'assistant',
          content: response.answer,
          timestamp: Date.now(),
        });
      }

      // Stream the response
      this.streamResponse(res, response.answer);

      const requestEnd = Date.now();
      const requestTime = requestEnd - requestStart;
      this.logger.log(`🌐 STREAM RESPONSE: Query completed in ${requestTime}ms`);
    } catch (error) {
      const requestEnd = Date.now();
      const requestTime = requestEnd - requestStart;

      this.logger.error(`❌ STREAM ERROR: Query failed after ${requestTime}ms - ${error.message}`);
      res.write(`data: {"error": "${error.message}"}\n\n`);
      res.end();
    }
  }

  private streamResponse(res: Response, text: string) {
    const words = text.split(' ');
    let index = 0;

    const sendWord = () => {
      if (index < words.length) {
        const word = words[index];
        res.write(`data: ${JSON.stringify({ word, index })}\n\n`);
        index++;
        setTimeout(sendWord, 50); // 50ms delay between words for smooth streaming
      } else {
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      }
    };

    sendWord();
  }

  @Post('query/multi-collection')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Query multiple collections',
    description: 'Search across multiple collections simultaneously and return combined results.'
  })
  @ApiResponse({ status: 200, description: 'Combined results from all collections.' })
  @UsePipes(new ValidationPipe({ transform: true }))
  async queryMultiCollection(@Body() queryDto: MultiCollectionQueryDto) {
    const requestStart = Date.now();
    this.logger.log(`🌐 MULTI-COLLECTION QUERY: Collections=${queryDto.collections.join(', ')}`);

    try {
      const results: Array<{ collection: string; answer: string; retrievedDocs: number }> = [];

      // Query each collection
      for (const collection of queryDto.collections) {
        try {
          this.logger.log(`  🔍 Querying collection: ${collection}`);
          const response = await this.queryService.query({
            collection,
            question: queryDto.question,
          });

          results.push({
            collection,
            answer: response.answer,
            retrievedDocs: response.sourceDocuments?.length || 0,
          });
        } catch (error) {
          this.logger.error(`  ❌ Error querying collection ${collection}: ${error.message}`);
          results.push({
            collection,
            answer: `Error querying collection: ${error.message}`,
            retrievedDocs: 0,
          });
        }
      }

      const requestEnd = Date.now();
      const requestTime = requestEnd - requestStart;

      this.logger.log(`🌐 MULTI-COLLECTION RESPONSE: Completed in ${requestTime}ms`);

      return {
        question: queryDto.question,
        collections: queryDto.collections,
        results,
        totalTime: requestTime,
      };
    } catch (error) {
      const requestEnd = Date.now();
      const requestTime = requestEnd - requestStart;

      this.logger.error(`❌ MULTI-COLLECTION ERROR: Failed after ${requestTime}ms - ${error.message}`);
      throw error;
    }
  }

  @Post('seed')
  @HttpCode(202) // Accepted
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Seed the database with a file', description: 'Uploads a file (PDF, TXT, or DOCX) to be processed and stored in Milvus.' })
  @ApiBody({
    description: 'The file to upload and the collection to store it in.',
    schema: {
      type: 'object',
      properties: {
        collection: { type: 'string' },
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 202, description: 'The seeding request has been accepted.' })
  async seed(
    @UploadedFile() file: Express.Multer.File,
    @Body('collection') collection: string,
  ) {
    this.logger.log(`Received file upload for collection '${collection}': ${file.originalname} (${file.size} bytes)`);
    const bucketName = this.minioService.getBucketName();
    const objectName = `${Date.now()}-${file.originalname}`;

    this.logger.log(`Uploading file to MinIO bucket '${bucketName}' as '${objectName}'...`);
    await this.minioService.getClient().putObject(bucketName, objectName, file.buffer, file.size, {
      'Content-Type': file.mimetype,
    });
    this.logger.log('File uploaded to MinIO successfully.');

    const payload = {
      sourceService: 'API',
      documentLocation: `minio://${bucketName}/${objectName}`,
      documentMimeType: file.mimetype,
      targetCollection: collection,
      timestamp: new Date().toISOString(),
    };

    const topic = this.configService.get<string>('kafka.documentIngestionTopic');
    this.logger.log(`Publishing seeding event to Kafka topic '${topic}'...`);
    await this.kafkaProducer.send({
      topic,
      messages: [{ value: JSON.stringify(payload) }],
    });
    this.logger.log('Seeding event published to Kafka successfully.');

    return { message: 'Seeding request accepted.', ...payload };
  }

  @Post('seed/batch')
  @HttpCode(202) // Accepted
  @UseInterceptors(FilesInterceptor('files', 10)) // Max 10 files
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Seed the database with multiple files',
    description: 'Uploads multiple files (PDF, TXT, or DOCX) to be processed and stored in the same Milvus collection. Files are processed sequentially.'
  })
  @ApiBody({
    description: 'Multiple files to upload and the collection to store them in.',
    schema: {
      type: 'object',
      properties: {
        collection: { type: 'string' },
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
        },
      },
    },
  })
  @ApiResponse({ status: 202, description: 'The batch seeding request has been accepted.' })
  async seedBatch(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('collection') collection: string,
  ) {
    if (!files || files.length === 0) {
      throw new Error('No files provided for batch seeding');
    }

    this.logger.log(`Received batch upload for collection '${collection}': ${files.length} files`);

    const bucketName = this.minioService.getBucketName();
    const uploadedFiles: Array<{
      originalName: string;
      objectName: string;
      size: number;
      mimeType: string;
    }> = [];
    const kafkaMessages: Array<{ value: string }> = [];

    // Process each file
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const objectName = `${Date.now()}-${i}-${file.originalname}`;

      this.logger.log(`Uploading file ${i + 1}/${files.length}: ${file.originalname} (${file.size} bytes)`);

      try {
        // Upload to MinIO
        await this.minioService.getClient().putObject(bucketName, objectName, file.buffer, file.size, {
          'Content-Type': file.mimetype,
        });

        // Prepare Kafka message
        const payload = {
          sourceService: 'API',
          documentLocation: `minio://${bucketName}/${objectName}`,
          documentMimeType: file.mimetype,
          targetCollection: collection,
          timestamp: new Date().toISOString(),
          batchId: Date.now().toString(), // Group files from same batch
          fileIndex: i + 1,
          totalFiles: files.length,
        };

        uploadedFiles.push({
          originalName: file.originalname,
          objectName,
          size: file.size,
          mimeType: file.mimetype,
        });

        kafkaMessages.push({ value: JSON.stringify(payload) });

        this.logger.log(`File ${i + 1}/${files.length} uploaded successfully: ${objectName}`);
      } catch (error) {
        this.logger.error(`Failed to upload file ${i + 1}/${files.length}: ${file.originalname}`, error);
        throw new Error(`Failed to upload file: ${file.originalname}`);
      }
    }

    // Send all messages to Kafka in batch
    const topic = this.configService.get<string>('kafka.documentIngestionTopic');
    this.logger.log(`Publishing ${kafkaMessages.length} seeding events to Kafka topic '${topic}'...`);

    await this.kafkaProducer.send({
      topic,
      messages: kafkaMessages,
    });

    this.logger.log(`Batch seeding completed: ${files.length} files uploaded and ${kafkaMessages.length} events published`);

    return {
      message: `Batch seeding request accepted for ${files.length} files`,
      collection,
      filesCount: files.length,
      uploadedFiles,
      batchId: kafkaMessages[0] ? JSON.parse(kafkaMessages[0].value).batchId : null,
    };
  }

  /**
   * Store User Profile
   * POST /query/user-profile
   */
  @Post('query/user-profile')
  @HttpCode(200)
  @ApiOperation({ summary: 'Store User Profile', description: 'Store user profile and preferences in memory' })
  @ApiBody({
    description: 'User profile to store',
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string', example: 'user123' },
        profile: {
          type: 'object',
          example: { name: 'John Doe', preferences: { language: 'en' } }
        },
      },
      required: ['userId', 'profile'],
    },
  })
  @ApiResponse({ status: 200, description: 'User profile stored' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async storeUserProfile(
    @Body() body: { userId: string; profile: Record<string, any> },
  ): Promise<{ success: boolean; message: string }> {
    try {
      const { userId, profile } = body;

      if (!userId || userId.trim().length === 0) {
        throw new BadRequestException('User ID is required');
      }

      this.logger.log(`💾 Storing user profile: ${userId}`);

      await this.memoryService.storeUserProfile(userId, profile);

      this.logger.log(`✅ User profile stored: ${userId}`);

      return {
        success: true,
        message: `User profile stored for ${userId}`,
      };
    } catch (error) {
      this.logger.error(`❌ Failed to store user profile: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get User Profile
   * POST /query/user-profile/get
   */
  @Post('query/user-profile/get')
  @HttpCode(200)
  @ApiOperation({ summary: 'Get User Profile', description: 'Retrieve user profile and preferences from memory' })
  @ApiBody({
    description: 'User ID to retrieve profile',
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string', example: 'user123' },
      },
      required: ['userId'],
    },
  })
  @ApiResponse({ status: 200, description: 'User profile retrieved' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async getUserProfile(@Body() body: { userId: string }): Promise<Record<string, any> | null> {
    try {
      const { userId } = body;

      if (!userId || userId.trim().length === 0) {
        throw new BadRequestException('User ID is required');
      }

      this.logger.log(`🔍 Retrieving user profile: ${userId}`);

      const profile = await this.memoryService.getUserProfile(userId);

      this.logger.log(`✅ User profile retrieved: ${userId}`);

      return profile;
    } catch (error) {
      this.logger.error(`❌ Failed to get user profile: ${error.message}`);
      throw error;
    }
  }

}
