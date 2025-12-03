import { Module } from '@nestjs/common';
import { QueryController } from './query.controller';
import { QueryService } from './query.service';
import { MilvusModule } from '../milvus/milvus.module';
import { RagModule } from '../rag/rag.module';
import { MinioModule } from '../minio/minio.module';
import { RedisModule } from '../redis/redis.module';
import { GuardrailsModule } from '../guardrails/guardrails.module';

/**
 * API Module - Unified Query Controller
 * Combines legacy query system with new RAG pipeline
 */
@Module({
  imports: [MilvusModule, RagModule, MinioModule, RedisModule, GuardrailsModule],
  controllers: [QueryController],
  providers: [QueryService],
})
export class ApiModule { }
