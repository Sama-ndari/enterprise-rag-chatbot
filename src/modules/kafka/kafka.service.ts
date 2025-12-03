import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Kafka, Admin } from 'kafkajs';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name);
  private kafka: Kafka;
  private admin: Admin;

  constructor(private readonly configService: ConfigService) {
    const broker = this.configService.get<string>('kafka.broker');
    if (!broker) {
      throw new Error('Kafka broker is not configured.');
    }
    this.kafka = new Kafka({
      clientId: this.configService.get<string>('kafka.clientId'),
      brokers: [broker],
    });
    this.admin = this.kafka.admin();
  }

  async onModuleInit() {
    this.logger.log('Connecting Kafka admin...');
    await this.admin.connect();
    this.logger.log('Kafka admin connected successfully.');
  }

  async onModuleDestroy() {
    await this.admin.disconnect();
    this.logger.log('Kafka admin disconnected');
  }

  getAdmin() {
    return this.admin;
  }

  getOptions(): MicroserviceOptions {
    const broker = this.configService.get<string>('kafka.broker');
    const clientId = this.configService.get<string>('kafka.clientId');
    const groupId = this.configService.get<string>('kafka.consumerGroupId');

    if (!broker || !clientId || !groupId) {
      throw new Error('Kafka configuration is missing or incomplete.');
    }

    this.logger.log(
      `Connecting to Kafka broker at ${broker} with client ID '${clientId}' and group ID '${groupId}'`,
    );

    return {
      transport: Transport.KAFKA,
      options: {
        client: {
          clientId,
          brokers: [broker],
        },
        consumer: {
          groupId,
        },
        subscribe: {
          fromBeginning: true, // Process messages from the start of the topic
        },
      },
    };
  }
}
