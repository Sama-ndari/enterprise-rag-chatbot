import { IsString, IsArray, IsOptional, IsNumber } from 'class-validator';

export class MultiCollectionQueryDto {
    @IsArray()
    @IsString({ each: true })
    collections: string[];

    @IsString()
    question: string;

    @IsOptional()
    @IsString()
    sessionId?: string;

    @IsOptional()
    @IsNumber()
    retrievalK?: number;

    @IsOptional()
    @IsString()
    userId?: string;
}
