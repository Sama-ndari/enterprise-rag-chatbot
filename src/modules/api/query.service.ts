import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RagService } from '../rag/services/rag.service';
import { PromptBuilderService } from '../rag/services/prompt-builder.service';
import { RerankerService } from '../rag/services/reranker.service';
import { QueryDto } from './dto/query.dto';
import { QueryResponseDto } from './dto/response.dto';

/**
 * Query Service - Refactored for Custom RAG Pipeline
 * Uses OpenAI + Milvus 
 */
@Injectable()
export class QueryService {
  private readonly logger = new Logger(QueryService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly ragService: RagService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly rerankerService: RerankerService,
  ) { }

  async query(queryDto: QueryDto): Promise<QueryResponseDto> {
    const { collection, question } = queryDto;
    const startTime = Date.now();

    try {
      this.logger.log(`🔍 QUERY START: Collection='${collection}'`);
      this.logger.log(`❓ QUESTION: "${question}"`);

      // Step 1: Query RAG pipeline
      const ragResponse = await this.ragService.query({
        question,
        collection,
        topK: parseInt(this.configService.get<string>('RAG_TOP_K') || '5', 10),
      });

      // Step 2: Optionally rerank results
      const reranked = await this.rerankerService.hybridRerank(
        question,
        ragResponse.sources,
        5,
      );

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Final comprehensive log
      this.logger.log('═══════════════════════════════════════════════════════════');
      this.logger.log(`🎯 QUERY COMPLETED`);
      this.logger.log(`❓ Question: "${question}"`);
      this.logger.log(`💬 Answer: "${ragResponse.answer.substring(0, 100)}${ragResponse.answer.length > 100 ? '...' : ''}"`);
      this.logger.log(`⏱️  Total Time: ${totalTime}ms`);
      this.logger.log(`📊 Collection: ${collection}`);
      this.logger.log(`📄 Sources: ${reranked.length}`);
      this.logger.log('═══════════════════════════════════════════════════════════');

      return {
        answer: ragResponse.answer,
        sourceDocuments: reranked.map((source) => ({
          pageContent: source.text,
          metadata: source.metadata,
        })),
        metadata: {
          totalTimeMs: totalTime,
          executionTimeMs: ragResponse.metadata.totalTime,
          retrievalK: 5,
          collection,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      this.logger.error(`❌ Query failed: ${error.message}`);
      throw error;
    }
  }
}
