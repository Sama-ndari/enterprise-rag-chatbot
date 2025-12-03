import { Module } from '@nestjs/common';
import { KafkaService } from './kafka.service';
import { ConsumerController } from './consumer.controller';
import { ConsumerService } from './consumer.service';
import { RagModule } from '../rag/rag.module';
import { MilvusModule } from '../milvus/milvus.module';
import { MinioModule } from '../minio/minio.module';

/**
 * Kafka Module - Document ingestion via Kafka
 * Uses custom RAG pipeline 
 */
@Module({
  imports: [RagModule, MilvusModule, MinioModule],
  controllers: [ConsumerController],
  providers: [KafkaService, ConsumerService],
  exports: [KafkaService],
})
export class KafkaModule { }

