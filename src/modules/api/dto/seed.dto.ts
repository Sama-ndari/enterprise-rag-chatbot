import { IsEnum, IsNotEmpty, IsObject, IsString } from 'class-validator';

export enum SupportedMimeType {
  JSON = 'application/json',
  TEXT = 'text/plain',
  PDF = 'application/pdf',
  DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

export class SeedDto {
  @IsString()
  @IsNotEmpty()
  collection: string;

  @IsEnum(SupportedMimeType)
  @IsNotEmpty()
  mimeType: SupportedMimeType;

  @IsObject()
  @IsNotEmpty()
  data: Record<string, any> | string;
}
