import { IsString, IsOptional } from 'class-validator';

export class QueryStreamDto {
    @IsString()
    collection: string;

    @IsString()
    question: string;

    @IsOptional()
    @IsString()
    sessionId?: string;

    @IsOptional()
    @IsString()
    userId?: string;
}
