import { registerAs } from '@nestjs/config';

export default registerAs('kafka', () => ({
  broker: process.env.KAFKA_BROKER,
  clientId: process.env.KAFKA_CLIENT_ID,
  consumerGroupId: process.env.KAFKA_CONSUMER_GROUP_ID,
  documentIngestionTopic: process.env.KAFKA_DOCUMENT_INGESTION_TOPIC || 'document-ingestion-events',
}));
