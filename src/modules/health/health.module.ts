import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { MilvusModule } from '../milvus/milvus.module';
import { MilvusHealthIndicator } from './milvus.health';
import { KafkaModule } from '../kafka/kafka.module';
import { KafkaHealthIndicator } from './kafka.health';

@Module({
  imports: [TerminusModule, MilvusModule, KafkaModule],
  controllers: [HealthController],
  providers: [MilvusHealthIndicator, KafkaHealthIndicator],
})
export class HealthModule { }
