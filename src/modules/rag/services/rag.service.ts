import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MilvusService } from '../../milvus/milvus.service';
import { OpenAIService } from './openai.service';
import { ChunkerService } from './chunker.service';
import { ConverterService } from './converter.service';
import { Document, QueryRequest, QueryResponse, SearchResult, ChatMessage } from '../types';

/**
 * Custom RAG Service - Framework-Free Implementation
 */
@Injectable()
export class RagService {
    private readonly logger = new Logger(RagService.name);
    private readonly maxContextLength: number;
    private readonly defaultTopK: number;

    private readonly defaultChunkSize: number;
    private readonly defaultOverlap: number;

    constructor(
        private readonly configService: ConfigService,
        private readonly milvusService: MilvusService,
        private readonly openaiService: OpenAIService,
        private readonly chunkerService: ChunkerService,
        private readonly converterService: ConverterService,
    ) {
        this.maxContextLength = parseInt(this.configService.get<string>('RAG_MAX_CONTEXT_LENGTH') || '4000', 10);
        this.defaultTopK = parseInt(this.configService.get<string>('RAG_TOP_K') || '5', 10);
        this.defaultChunkSize = parseInt(this.configService.get<string>('RAG_CHUNK_SIZE') || '1000', 10);
        this.defaultOverlap = parseInt(this.configService.get<string>('RAG_CHUNK_OVERLAP') || '200', 10);
    }

    /**
     * Process document: chunk, embed, and store
     */
    async processDocument(
        collectionName: string,
        document: Document,
        options?: {
            chunkSize?: number;
            overlap?: number;
        },
    ): Promise<{ chunkCount: number; storedCount: number }> {
        try {
            const startTime = Date.now();
            this.logger.log(`📄 Processing document for collection: ${collectionName}`);

            // Chunk the document
            const chunkSize = options?.chunkSize ?? this.defaultChunkSize;
            const overlap = options?.overlap ?? this.defaultOverlap;
            const chunks = this.chunkerService.chunkText(document.text, {
                chunkSize,
                overlap,
            });

            this.logger.log(`✅ Created ${chunks.length} chunks`);

            // Generate embeddings for chunks
            const chunkTexts = chunks.map((c) => c.text);
            const embeddings = await this.openaiService.generateEmbeddings(chunkTexts);

            this.logger.log(`✅ Generated ${embeddings.length} embeddings`);

            // Prepare documents for storage
            const docsToStore = chunks.map((chunk, index) => ({
                embedding: embeddings[index],
                pageContent: chunk.text,
                metadata: {
                    ...document.metadata,
                    ...chunk.metadata,
                    originalDocId: document.id,
                    chunkIndex: index,
                    totalChunks: chunks.length,
                },
            }));

            // Store in Milvus
            await this.milvusService.ensureCollectionExists(collectionName);
            await this.milvusService.ensureCollectionLoaded(collectionName);

            const result = await this.milvusService.insertDocuments(collectionName, docsToStore as any);

            const endTime = Date.now();
            this.logger.log(`✅ Document processed in ${endTime - startTime}ms`);
            this.logger.log(`📊 Stored ${result.insertCount} chunks`);

            return {
                chunkCount: chunks.length,
                storedCount: result.insertCount,
            };
        } catch (error) {
            this.logger.error(`❌ Failed to process document: ${error.message}`);
            throw error;
        }
    }

    /**
     * Query RAG pipeline
     */
    async query(request: QueryRequest): Promise<QueryResponse> {
        try {
            const startTime = Date.now();
            const { question, collection, topK = this.defaultTopK } = request;

            this.logger.log(`🔍 RAG Query: "${question}"`);
            this.logger.log(`📚 Collection: ${collection}, topK: ${topK}`);

            // Step 1: Generate embedding for question
            const retrievalStart = Date.now();
            const questionEmbedding = await this.openaiService.generateEmbedding(question);
            this.logger.debug(`✅ Generated question embedding`);

            // Step 2: Search Milvus
            await this.milvusService.ensureCollectionLoaded(collection);

            const milvusResults = await this.milvusService.search(
                collection,
                questionEmbedding,
                topK,
            );

            // Convert Milvus results to RAG format
            const searchResults = this.converterService.convertMilvusToRagSearchResults(milvusResults);

            const retrievalEnd = Date.now();
            this.logger.log(`✅ Retrieved ${searchResults.length} results in ${retrievalEnd - retrievalStart}ms`);

            // Step 3: Build context from results
            const contextChunks = this.buildContext(searchResults);
            this.logger.debug(`📝 Context length: ${contextChunks.join('\n\n').length} chars`);

            // Step 4: Generate response
            const generationStart = Date.now();
            const answer = await this.openaiService.generateRagResponse(question, contextChunks);
            const generationEnd = Date.now();

            this.logger.log(`✅ Generated response in ${generationEnd - generationStart}ms`);

            const endTime = Date.now();

            return {
                question,
                answer,
                sources: searchResults,
                metadata: {
                    retrievalTime: retrievalEnd - retrievalStart,
                    generationTime: generationEnd - generationStart,
                    totalTime: endTime - startTime,
                    modelUsed: this.openaiService.getModelInfo().chat,
                },
            };
        } catch (error) {
            this.logger.error(`❌ RAG query failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Multi-collection query
     */
    async queryMultipleCollections(
        question: string,
        collections: string[],
        topKPerCollection: number = 3,
    ): Promise<QueryResponse> {
        try {
            this.logger.log(`🔍 Multi-collection query: "${question}"`);
            this.logger.log(`📚 Collections: ${collections.join(', ')}`);

            // Generate question embedding once
            const questionEmbedding = await this.openaiService.generateEmbedding(question);

            // Search all collections
            const allResults: SearchResult[] = [];

            for (const collection of collections) {
                try {
                    await this.milvusService.ensureCollectionLoaded(collection);
                    const milvusResults = await this.milvusService.search(
                        collection,
                        questionEmbedding,
                        topKPerCollection,
                    );
                    const ragResults = this.converterService.convertMilvusToRagSearchResults(milvusResults);
                    allResults.push(...ragResults);
                } catch (error) {
                    this.logger.warn(`⚠️ Failed to search collection ${collection}: ${error.message}`);
                }
            }

            // Sort by score and take top results
            const topResults = allResults
                .sort((a, b) => b.score - a.score)
                .slice(0, this.defaultTopK);

            this.logger.log(`✅ Retrieved ${topResults.length} results from ${collections.length} collections`);

            // Generate response
            const contextChunks = this.buildContext(topResults);
            const answer = await this.openaiService.generateRagResponse(question, contextChunks);

            return {
                question,
                answer,
                sources: topResults,
                metadata: {
                    retrievalTime: 0,
                    generationTime: 0,
                    totalTime: 0,
                    modelUsed: this.openaiService.getModelInfo().chat,
                },
            };
        } catch (error) {
            this.logger.error(`❌ Multi-collection query failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Build context from search results
     */
    private buildContext(results: SearchResult[]): string[] {
        try {
            let totalLength = 0;
            const contextChunks: string[] = [];

            for (const result of results) {
                const chunkLength = result.text.length;

                // Check if adding this chunk would exceed max context length
                if (totalLength + chunkLength > this.maxContextLength && contextChunks.length > 0) {
                    this.logger.debug(`⚠️ Context length limit reached (${totalLength} chars)`);
                    break;
                }

                contextChunks.push(result.text);
                totalLength += chunkLength;
            }

            this.logger.debug(`✅ Built context from ${contextChunks.length} chunks (${totalLength} chars)`);
            return contextChunks;
        } catch (error) {
            this.logger.error(`❌ Failed to build context: ${error.message}`);
            return [];
        }
    }

    /**
     * Rephrase query for better retrieval
     */
    async rephraseQuery(originalQuery: string): Promise<string> {
        try {
            this.logger.debug(`🔄 Rephrasing query: "${originalQuery}"`);

            const messages: ChatMessage[] = [
                {
                    role: 'system',
                    content: `You are a query rephrasing assistant. Rephrase the user's query to be more specific and detailed for better document retrieval.
Keep the core meaning but expand with relevant context.
Return ONLY the rephrased query, no additional text.`,
                },
                {
                    role: 'user',
                    content: originalQuery,
                },
            ];

            const rephrasedQuery = await this.openaiService.generateChatResponse(messages, {
                temperature: 0.3,
                maxTokens: 200,
            });

            this.logger.debug(`✅ Rephrased query: "${rephrasedQuery}"`);
            return rephrasedQuery.trim();
        } catch (error) {
            this.logger.error(`❌ Failed to rephrase query: ${error.message}`);
            return originalQuery; // Fallback to original
        }
    }

    /**
     * Summarize documents
     */
    async summarizeDocuments(documents: string[]): Promise<string> {
        try {
            this.logger.debug(`📝 Summarizing ${documents.length} documents`);

            const combinedText = documents.join('\n\n---\n\n');

            const messages: ChatMessage[] = [
                {
                    role: 'system',
                    content: `You are a document summarizer. Create a concise summary of the provided documents.
Focus on key points and main ideas.
Return ONLY the summary, no additional text.`,
                },
                {
                    role: 'user',
                    content: combinedText,
                },
            ];

            const summary = await this.openaiService.generateChatResponse(messages, {
                temperature: 0.5,
                maxTokens: 500,
            });

            this.logger.debug(`✅ Summary generated`);
            return summary.trim();
        } catch (error) {
            this.logger.error(`❌ Failed to summarize documents: ${error.message}`);
            return '';
        }
    }
}
