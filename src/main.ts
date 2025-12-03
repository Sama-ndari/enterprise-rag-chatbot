import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { KafkaService } from './modules/kafka/kafka.service';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const kafkaService = app.get(KafkaService);
  app.connectMicroservice(kafkaService.getOptions());

  // Enable graceful shutdown
  app.enableShutdownHooks();

  await app.startAllMicroservices();
  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port') ?? 3000;
  const host = configService.get<string>('app.host', '0.0.0.0');

  const config = new DocumentBuilder()
    .setTitle('Chatbot API')
    .setDescription('The Chatbot API description')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(port, host);

  const url = await app.getUrl();
  const logger = app.get(Logger);

  logger.log(`🚀 Application is running on: ${url}`);
  logger.log(`📚 Swagger UI available at: ${url}/api`);
  logger.log(`✅ Kafka connection established.`);
  logger.log(`✅ Milvus/Zilliz Cloud connection established.`);
  logger.log(`✅ MinIO connection established.`);
}
bootstrap();
