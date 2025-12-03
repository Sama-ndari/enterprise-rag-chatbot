import { z } from 'zod';

export const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST_IP: z.string(),

  // Kafka
  KAFKA_BROKER: z.string(),
  KAFKA_CLIENT_ID: z.string(),
  KAFKA_CONSUMER_GROUP_ID: z.string(),

  // Milvus / Zilliz Cloud
  MILVUS_ENDPOINT: z.string().url(),
  MILVUS_TOKEN: z.string(),
  MILVUS_DB_NAME: z.string().default('default'),
  MILVUS_TIMEOUT: z.coerce.number().default(60000),

  // OpenAI Configuration
  OPENAI_API_KEY: z.string(),
  OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  OPENAI_MODEL: z.string().default('gpt-4-turbo'),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-large'),

  // RAG Pipeline Configuration
  RAG_CHUNK_SIZE: z.coerce.number().default(1000),
  RAG_CHUNK_OVERLAP: z.coerce.number().default(200),
  RAG_TOP_K: z.coerce.number().default(5),
  RAG_MAX_CONTEXT_LENGTH: z.coerce.number().default(4000),

  // MinIO Configuration
  MINIO_ENDPOINT: z.string(),
  MINIO_PORT: z.coerce.number(),
  MINIO_ACCESS_KEY: z.string(),
  MINIO_SECRET_KEY: z.string(),
  MINIO_BUCKET: z.string(),
  MINIO_USE_SSL: z.preprocess((val) => val === 'false', z.boolean()).default(false),

});
