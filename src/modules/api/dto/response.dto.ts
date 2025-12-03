export class QueryResponseDto {
  answer: string;
  sourceDocuments: Record<string, any>[];
  metadata?: {
    totalTimeMs: number;
    executionTimeMs: number;
    retrievalK: number;
    collection: string;
    timestamp: string;
  };
}
