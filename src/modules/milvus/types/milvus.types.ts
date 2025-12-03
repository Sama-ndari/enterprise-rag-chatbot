/**
 * Milvus Vector Database Types
 */

export interface MilvusConfig {
    host: string;
    port: number;
    username?: string;
    password?: string;
    ssl?: boolean;
    timeout?: number;
}

export interface CollectionSchema {
    name: string;
    fields: FieldSchema[];
    description?: string;
}

export interface FieldSchema {
    name: string;
    dataType: string; // DataType enum
    isPrimary?: boolean;
    autoID?: boolean;
    dim?: number; // For vector fields
    maxLength?: number; // For varchar fields
    elementType?: string; // For array fields
}

export interface CollectionMetadata {
    name: string;
    tags: string[];
    description: string;
    vectorDim: number;
    status: 'loaded' | 'unloaded';
    createdAt: string;
    updatedAt: string;
}

export interface MilvusDocument {
    id?: number;
    embedding: number[];
    pageContent: string;
    metadata: Record<string, any>;
}

export interface SearchResult {
    id: number;
    score: number;
    pageContent: string;
    metadata: Record<string, any>;
}

export interface InsertResult {
    insertCount: number;
    ids: number[];
}

export interface SearchFilter {
    field: string;
    operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'like';
    value: any;
}

export interface CollectionStats {
    name: string;
    rowCount: number;
    vectorDim: number;
    indexes: IndexInfo[];
    createdAt: string;
}

export interface IndexInfo {
    name: string;
    fieldName: string;
    indexType: string;
    metricType: string;
    params: Record<string, any>;
}

export interface UpsertData {
    id?: number;
    embedding: number[];
    pageContent: string;
    metadata: Record<string, any>;
}
