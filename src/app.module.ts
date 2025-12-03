import { Module, Logger } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule } from '@nestjs/config';
import { envSchema } from './config/env.schema';
import appConfig from './config/app.config';
import kafkaConfig from './config/kafka.config';
import minioConfig from './config/minio.config';
import { ApiModule } from './modules/api/api.module';
import { KafkaModule } from './modules/kafka/kafka.module';
import { MilvusModule } from './modules/milvus/milvus.module';
import { RagModule } from './modules/rag/rag.module';
import { HealthModule } from './modules/health/health.module';
import { MinioModule } from './modules/minio/minio.module';

/**
 * App Module - Main application module
 * Uses custom RAG pipeline with OpenAI
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env`,
      load: [appConfig, kafkaConfig, minioConfig],
      validate: (config) => {
        const result = envSchema.safeParse(config);
        if (!result.success) {
          throw new Error(
            `Environment validation failed: ${result.error.message}`,
          );
        }
        return result.data;
      },
    }),
    ApiModule,
    MinioModule,
    KafkaModule,
    MilvusModule,
    RagModule,
    HealthModule,
  ],
  controllers: [],
  providers: [Logger],
})
export class AppModule { }

