import { Controller, Get, Logger } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { MilvusHealthIndicator } from './milvus.health';
import { KafkaHealthIndicator } from './kafka.health';

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly health: HealthCheckService,
    private readonly milvusHealth: MilvusHealthIndicator,
    private readonly kafkaHealth: KafkaHealthIndicator,
  ) { }

  @Get()
  @HealthCheck()
  check() {
    this.logger.log('Health check endpoint called.');
    return this.health.check([
      () => this.milvusHealth.isHealthy('milvus'),
      () => this.kafkaHealth.isHealthy('kafka'),
    ]);
  }
}
