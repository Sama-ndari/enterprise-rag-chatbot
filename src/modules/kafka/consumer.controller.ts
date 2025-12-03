import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ConsumerService } from './consumer.service';

@Controller()
export class ConsumerController {
  constructor(private readonly consumerService: ConsumerService) {}

  // Note: @MessagePattern requires a static value, so we keep the default topic name here
  // If you need to change the topic, update both .env and this decorator
  @MessagePattern('document-ingestion-events')
  handleDocumentIngestion(@Payload() message: any) {
    this.consumerService.handleDocumentIngestion(message);
  }
}
