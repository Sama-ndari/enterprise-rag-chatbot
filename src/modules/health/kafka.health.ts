import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { KafkaService } from '../kafka/kafka.service';

@Injectable()
export class KafkaHealthIndicator extends HealthIndicator {
  constructor(private readonly kafkaService: KafkaService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.kafkaService.getAdmin().listTopics();
      return this.getStatus(key, true);
    } catch (e) {
      throw new HealthCheckError('Kafka check failed', e);
    }
  }
}
