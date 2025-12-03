import { registerAs } from '@nestjs/config';

export default registerAs('minio', () => {
  const requiredEnvVars = [
    'MINIO_ENDPOINT',
    'MINIO_PORT',
    'MINIO_USE_SSL',
    'MINIO_ACCESS_KEY',
    'MINIO_SECRET_KEY',
    'MINIO_BUCKET',
  ];

  for (const varName of requiredEnvVars) {
    if (!process.env[varName]) {
      throw new Error(`Environment variable ${varName} is not defined.`);
    }
  }

  return {
    endpoint: process.env.MINIO_ENDPOINT as string,
    port: parseInt(process.env.MINIO_PORT as string, 10),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY as string,
    secretKey: process.env.MINIO_SECRET_KEY as string,
    bucket: process.env.MINIO_BUCKET as string,
  };
});
