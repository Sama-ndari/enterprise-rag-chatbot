import { Injectable, Logger } from '@nestjs/common';
import { SearchResult as MilvusSearchResult } from '../../milvus/types/milvus.types';
import { SearchResult as RagSearchResult, Document } from '../types';

/**
 * Converter Service - Convert between Milvus and RAG types
 */
@Injectable()
export class ConverterService {
    private readonly logger = new Logger(ConverterService.name);

    /**
     * Convert Milvus SearchResult to RAG SearchResult
     */
    convertMilvusToRagSearchResult(milvusResult: MilvusSearchResult): RagSearchResult {
        return {
            id: milvusResult.id,
            text: milvusResult.pageContent,
            metadata: milvusResult.metadata,
            score: milvusResult.score,
            embedding: undefined, // Not needed in RAG response
        };
    }

    /**
     * Convert array of Milvus SearchResults to RAG SearchResults
     */
    convertMilvusToRagSearchResults(milvusResults: MilvusSearchResult[]): RagSearchResult[] {
        return milvusResults.map((result) => this.convertMilvusToRagSearchResult(result));
    }

    /**
     * Convert RAG Document to Milvus-compatible format
     */
    convertRagDocumentToMilvusFormat(document: Document): any {
        return {
            embedding: document.embedding || [],
            pageContent: document.text,
            metadata: document.metadata,
        };
    }

    /**
     * Convert array of RAG Documents
     */
    convertRagDocumentsToMilvusFormat(documents: Document[]): any[] {
        return documents.map((doc) => this.convertRagDocumentToMilvusFormat(doc));
    }
}
