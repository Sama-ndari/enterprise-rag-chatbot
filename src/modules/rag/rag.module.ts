import { Module } from '@nestjs/common';
import { MilvusModule } from '../milvus/milvus.module';
import { RagService } from './services/rag.service';
import { OpenAIService } from './services/openai.service';
import { ChunkerService } from './services/chunker.service';
import { ConverterService } from './services/converter.service';
import { MemoryService } from './services/memory.service';
import { CollectionsMetadataService } from './services/collections-metadata.service';
import { PromptBuilderService } from './services/prompt-builder.service';
import { RerankerService } from './services/reranker.service';

/**
 * RAG Module - Custom RAG Pipeline 
 */
@Module({
    imports: [MilvusModule],
    providers: [
        RagService,
        OpenAIService,
        ChunkerService,
        ConverterService,
        MemoryService,
        CollectionsMetadataService,
        PromptBuilderService,
        RerankerService,
    ],
    exports: [
        RagService,
        OpenAIService,
        ChunkerService,
        ConverterService,
        MemoryService,
        CollectionsMetadataService,
        PromptBuilderService,
        RerankerService,
    ],
})
export class RagModule { }
