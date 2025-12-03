import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { MilvusService } from '../milvus/milvus.service';

@Injectable()
export class MilvusHealthIndicator extends HealthIndicator {
    constructor(private readonly milvusService: MilvusService) {
        super();
    }

    async isHealthy(key: string): Promise<HealthIndicatorResult> {
        try {
            const client = this.milvusService.getClient();
            await client.checkHealth();
            return this.getStatus(key, true);
        } catch (error) {
            throw new HealthCheckError(
                'Milvus health check failed',
                this.getStatus(key, false, { message: error.message }),
            );
        }
    }
}
