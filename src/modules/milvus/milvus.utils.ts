import { SearchResult, MilvusDocument } from './types/milvus.types';

/**
 * Utility functions for Milvus operations
 */

/**
 * Convert Milvus Document to Milvus Document (passthrough)
 */
export function documentToMilvusDocument(doc: MilvusDocument): MilvusDocument {
    return {
        embedding: doc.embedding || [],
        pageContent: doc.pageContent,
        metadata: {
            ...doc.metadata,
            // Remove embedding from metadata to avoid duplication
            embedding: undefined,
        },
    };
}

/**
 * Convert Milvus SearchResult to object
 */
export function searchResultToDocument(result: SearchResult): Record<string, any> {
    return {
        pageContent: result.pageContent,
        metadata: {
            ...result.metadata,
            id: result.id,
            score: result.score,
        },
    };
}

/**
 * Convert array of SearchResults to objects
 */
export function searchResultsToDocuments(results: SearchResult[]): Record<string, any>[] {
    return results.map(searchResultToDocument);
}

/**
 * Generate simple embedding for text (fallback)
 * In production, use actual embedding service
 */
export function generateSimpleEmbedding(text: string, dim: number = 384): number[] {
    const embedding = new Array(dim).fill(0);

    for (let i = 0; i < text.length; i++) {
        embedding[i % dim] += text.charCodeAt(i) / 1000;
    }

    // Normalize
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map((val) => val / (norm || 1));
}

/**
 * Validate embedding dimension
 */
export function validateEmbeddingDim(embedding: number[], expectedDim: number): boolean {
    if (!Array.isArray(embedding)) {
        throw new Error('Embedding must be an array');
    }

    if (embedding.length !== expectedDim) {
        throw new Error(
            `Embedding dimension mismatch: expected ${expectedDim}, got ${embedding.length}`,
        );
    }

    return true;
}

/**
 * Validate embedding values
 */
export function validateEmbeddingValues(embedding: number[]): boolean {
    for (let i = 0; i < embedding.length; i++) {
        if (typeof embedding[i] !== 'number' || !isFinite(embedding[i])) {
            throw new Error(`Invalid embedding value at index ${i}: ${embedding[i]}`);
        }
    }

    return true;
}

/**
 * Normalize embedding vector
 */
export function normalizeEmbedding(embedding: number[]): number[] {
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));

    if (norm === 0) {
        return embedding;
    }

    return embedding.map((val) => val / norm);
}

/**
 * Calculate cosine similarity between two embeddings
 */
export function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
        throw new Error('Embeddings must have the same dimension');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);

    if (denominator === 0) {
        return 0;
    }

    return dotProduct / denominator;
}

/**
 * Build Milvus filter expression
 */
export function buildFilterExpression(
    field: string,
    operator: string,
    value: any,
): string {
    switch (operator) {
        case 'eq':
            return typeof value === 'string' ? `${field} == "${value}"` : `${field} == ${value}`;
        case 'ne':
            return typeof value === 'string' ? `${field} != "${value}"` : `${field} != ${value}`;
        case 'gt':
            return `${field} > ${value}`;
        case 'gte':
            return `${field} >= ${value}`;
        case 'lt':
            return `${field} < ${value}`;
        case 'lte':
            return `${field} <= ${value}`;
        case 'in':
            const values = Array.isArray(value)
                ? value.map((v) => (typeof v === 'string' ? `"${v}"` : v)).join(',')
                : value;
            return `${field} in [${values}]`;
        case 'like':
            return `${field} like "%${value}%"`;
        case 'exists':
            return `${field} != ""`;
        default:
            throw new Error(`Unknown operator: ${operator}`);
    }
}

/**
 * Batch array into chunks
 */
export function batchArray<T>(array: T[], batchSize: number): T[][] {
    const batches: T[][] = [];

    for (let i = 0; i < array.length; i += batchSize) {
        batches.push(array.slice(i, i + batchSize));
    }

    return batches;
}

/**
 * Retry function with exponential backoff
 */
export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    initialDelayMs: number = 1000,
): Promise<T> {
    let lastError: Error = new Error('Unknown error');

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt < maxRetries - 1) {
                const delayMs = initialDelayMs * Math.pow(2, attempt);
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
        }
    }

    throw lastError;
}

/**
 * Sanitize collection name
 */
export function sanitizeCollectionName(name: string): string {
    // Remove invalid characters, keep alphanumeric, underscore, colon
    return name.replace(/[^a-zA-Z0-9_:]/g, '_').toLowerCase();
}

/**
 * Validate collection name
 */
export function validateCollectionName(name: string): boolean {
    if (!name || name.length === 0) {
        throw new Error('Collection name cannot be empty');
    }

    if (name.length > 255) {
        throw new Error('Collection name cannot exceed 255 characters');
    }

    if (!/^[a-zA-Z0-9_:]+$/.test(name)) {
        throw new Error('Collection name can only contain alphanumeric characters, underscore, and colon');
    }

    return true;
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Parse Milvus error message
 */
export function parseMilvusError(error: any): string {
    if (typeof error === 'string') {
        return error;
    }

    if (error.message) {
        return error.message;
    }

    if (error.reason) {
        return error.reason;
    }

    return JSON.stringify(error);
}

/**
 * Check if collection name is reserved
 */
export function isReservedCollectionName(name: string): boolean {
    const reserved = ['_collections_metadata', 'system', 'milvus'];
    return reserved.includes(name.toLowerCase());
}

/**
 * Generate collection name with timestamp
 */
export function generateCollectionName(prefix: string): string {
    const timestamp = Date.now();
    return `${prefix}_${timestamp}`;
}

/**
 * Merge metadata objects
 */
export function mergeMetadata(
    base: Record<string, any>,
    override: Record<string, any>,
): Record<string, any> {
    return {
        ...base,
        ...override,
    };
}

/**
 * Deep clone metadata object
 */
export function cloneMetadata(metadata: Record<string, any>): Record<string, any> {
    return JSON.parse(JSON.stringify(metadata));
}

/**
 * Execute function with timeout
 */
export async function withTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number = 30000,
    operationName: string = 'Operation',
): Promise<T> {
    return Promise.race([
        fn(),
        new Promise<T>((_, reject) =>
            setTimeout(
                () => reject(new Error(`${operationName} timed out after ${timeoutMs}ms`)),
                timeoutMs,
            ),
        ),
    ]);
}

/**
 * Execute with retry and timeout
 */
export async function withRetryAndTimeout<T>(
    fn: () => Promise<T>,
    options: {
        maxRetries?: number;
        timeoutMs?: number;
        initialDelayMs?: number;
        operationName?: string;
    } = {},
): Promise<T> {
    const {
        maxRetries = 2,
        timeoutMs = 30000,
        initialDelayMs = 500,
        operationName = 'Operation',
    } = options;

    let lastError: Error = new Error('Unknown error');

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await withTimeout(fn, timeoutMs, operationName);
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt < maxRetries - 1) {
                const delayMs = initialDelayMs * Math.pow(2, attempt);
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
        }
    }

    throw lastError;
}
