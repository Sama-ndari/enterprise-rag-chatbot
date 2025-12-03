import { Injectable, Logger } from '@nestjs/common';
import { MinioService } from '../minio/minio.service';
import { RagService } from '../rag/services/rag.service';
import { MilvusService } from '../milvus/milvus.service';
import { Document } from '../rag/types';

/**
 * Consumer Service - Kafka Document Ingestion
 * Uses custom RAG pipeline 
 */
@Injectable()
export class ConsumerService {
  private readonly logger = new Logger(ConsumerService.name);

  constructor(
    private readonly minioService: MinioService,
    private readonly ragService: RagService,
    private readonly milvusService: MilvusService,
  ) { }

  async handleDocumentIngestion(message: any) {
    this.logger.log(`--> Received document ingestion event for collection: ${message.targetCollection}`);
    this.logger.debug(`Full event payload: ${JSON.stringify(message)}`);
    const { documentLocation, targetCollection, documentMimeType } = message;

    try {
      const bucketName = this.minioService.getBucketName();
      const objectName = documentLocation.substring(documentLocation.lastIndexOf('/') + 1);

      const fileStream = await this.minioService.getClient().getObject(bucketName, objectName);
      const fileBuffer = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        fileStream.on('data', (chunk) => chunks.push(chunk));
        fileStream.on('end', () => resolve(Buffer.concat(chunks)));
        fileStream.on('error', reject);
      });

      // Process document using RAG service
      const document: Document = {
        text: fileBuffer.toString('utf-8'),
        metadata: {
          source: objectName,
          mimeType: documentMimeType,
          uploadedAt: new Date().toISOString(),
        },
      };

      const result = await this.ragService.processDocument(targetCollection, document);

      this.logger.log(`🎯 Successfully processed and stored ${result.storedCount} chunks in collection: ${targetCollection}`);
    } catch (err) {
      this.logger.error(`Error processing document ${documentLocation}:`, err.message || err);

      // Log more details for debugging
      if (err.status) {
        this.logger.error(`HTTP Status: ${err.status} - ${err.statusText || 'Unknown'}`);
      }

      // Don't let one document failure stop the entire process
      const fileName = documentLocation.substring(documentLocation.lastIndexOf('/') + 1);
      this.logger.warn(`Skipping document ${fileName} due to processing error`);
    }
  }
}
