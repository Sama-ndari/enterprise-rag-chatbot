/**
 * Core RAG Type Definitions (Framework-Free)
 */

/**
 * Document representation
 */
export interface Document {
    id?: string | number;
    text: string;
    metadata: Record<string, any>;
    embedding?: number[];
}

/**
 * Chunk representation
 */
export interface Chunk {
    id?: string;
    text: string;
    startIndex: number;
    endIndex: number;
    metadata: Record<string, any>;
}

/**
 * Search result from vector store
 */
export interface SearchResult {
    id: string | number;
    text: string;
    metadata: Record<string, any>;
    score: number;
    embedding?: number[];
}

/**
 * Query request
 */
export interface QueryRequest {
    question: string;
    collection: string;
    topK?: number;
    filters?: Record<string, any>;
    context?: string;
}

/**
 * Query response
 */
export interface QueryResponse {
    question: string;
    answer: string;
    sources: SearchResult[];
    metadata: {
        retrievalTime: number;
        generationTime: number;
        totalTime: number;
        modelUsed: string;
        tokensUsed?: number;
    };
}

/**
 * Chat message
 */
export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: number;
}

/**
 * Embedding request/response
 */
export interface EmbeddingRequest {
    text: string | string[];
    model?: string;
}

export interface EmbeddingResponse {
    embeddings: number[][];
    model: string;
    usage: {
        promptTokens: number;
        totalTokens: number;
    };
}

/**
 * Collection metadata
 */
export interface CollectionMetadata {
    name: string;
    tags: string[];
    description: string;
    vectorDim: number;
    status: 'loaded' | 'unloaded';
    createdAt: string;
    updatedAt: string;
}

/**
 * Chunking options
 */
export interface ChunkingOptions {
    chunkSize: number;
    overlap: number;
    separator?: string;
}

/**
 * RAG Pipeline configuration
 */
export interface RagConfig {
    embeddingModel: string;
    llmModel: string;
    chunkSize: number;
    chunkOverlap: number;
    topK: number;
    maxContextLength: number;
}
