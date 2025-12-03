import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import * as Minio from 'minio';
import minioConfig from '../../config/minio.config';

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private readonly client: Minio.Client;
  private readonly bucketName: string;

  constructor(
    @Inject(minioConfig.KEY) private config: ConfigType<typeof minioConfig>,
  ) {
    this.client = new Minio.Client({
      endPoint: config.endpoint,
      port: config.port,
      useSSL: false,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
    });
    this.bucketName = config.bucket;
  }

  async onModuleInit() {
    this.logger.log(`Checking for MinIO bucket: '${this.bucketName}'...`);
    try {
      const bucketExists = await this.client.bucketExists(this.bucketName);
      if (!bucketExists) {
        this.logger.warn(`Bucket '${this.bucketName}' does not exist. Creating...`);
        await this.client.makeBucket(this.bucketName, 'us-east-1');
        this.logger.log(`Bucket '${this.bucketName}' created successfully.`);
      } else {
        this.logger.log(`MinIO bucket '${this.bucketName}' found.`);
      }
    } catch (err) {
      this.logger.error('Failed to initialize MinIO bucket.', err);
      throw err;
    }
  }

  getClient() {
    return this.client;
  }

  getBucketName() {
    return this.bucketName;
  }
}
