import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class QueryDto {
  @ApiProperty({ description: 'The name of the collection to query.', example: 'docs_enterprise' })
  @IsString()
  @IsNotEmpty()
  collection: string;

  @ApiProperty({ description: 'The question to ask the chatbot.', example: 'Quelle est la politique de télétravail?' })
  @IsString()
  @IsNotEmpty()
  question: string;
}
