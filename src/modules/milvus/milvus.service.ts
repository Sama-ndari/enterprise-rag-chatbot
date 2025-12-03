import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MilvusClient, DataType, MetricType } from '@zilliz/milvus2-sdk-node';
import {
    MilvusConfig,
    CollectionSchema,
    FieldSchema,
    MilvusDocument,
    SearchResult,
    InsertResult,
    SearchFilter,
    CollectionStats,
    IndexInfo,
    UpsertData,
    CollectionMetadata,
} from './types/milvus.types';
import { withRetryAndTimeout } from './milvus.utils';

@Injectable()
export class MilvusService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(MilvusService.name);
    private client: MilvusClient;
    private readonly EMBEDDING_DIM = 384;
    private readonly DEFAULT_METRIC_TYPE = MetricType.COSINE;
    private readonly DEFAULT_INDEX_TYPE = 'IVF_FLAT';
    private collectionExistsCache = new Map<string, { exists: boolean; timestamp: number }>();
    private readonly CACHE_TTL = 30000; // 30 seconds - more resilient to connection issues

    constructor(private readonly configService: ConfigService) { }

    async onModuleInit() {
        await this.connect();
    }

    async onModuleDestroy() {
        await this.disconnect();
    }

    /**
     * Connect to Milvus/Zilliz Cloud
     */
    private async connect(): Promise<void> {
        try {
            const config = this.getMilvusConfig();
            this.logger.log(`🔗 Connecting to Milvus at ${config.host}:${config.port}...`);

            this.client = new MilvusClient(config);

            // Verify connection
            await this.client.checkHealth();
            this.logger.log('✅ Milvus connection successful');
        } catch (error) {
            this.logger.error(`❌ Failed to connect to Milvus: ${error.message}`);
            throw error;
        }
    }

    /**
     * Disconnect from Milvus
     */
    private async disconnect(): Promise<void> {
        try {
            if (this.client) {
                await this.client.closeConnection();
                this.logger.log('✅ Milvus connection closed');
            }
        } catch (error) {
            this.logger.error(`Error disconnecting from Milvus: ${error.message}`);
        }
    }

    /**
     * Get Milvus configuration
     */
    private getMilvusConfig(): any {
        const endpoint = process.env.MILVUS_ENDPOINT || 'http://localhost:19530';
        const token = process.env.MILVUS_TOKEN || '';
        const timeout = parseInt(process.env.MILVUS_TIMEOUT || '60000', 10);

        this.logger.log(`🔗 Milvus Config: endpoint=${endpoint.substring(0, 50)}..., timeout=${timeout}ms`);

        return {
            address: endpoint,
            token: token,
            timeout: timeout,
        };
    }

    /**
     * Ensure collection exists, create if not
     */
    async ensureCollectionExists(
        collectionName: string,
        vectorDim: number = this.EMBEDDING_DIM,
    ): Promise<void> {
        try {
            const exists = await this.collectionExists(collectionName);

            if (!exists) {
                this.logger.log(`📦 Creating collection: ${collectionName}`);
                await this.createCollection(collectionName, vectorDim);
                this.logger.log(`✅ Collection created: ${collectionName}`);
            } else {
                this.logger.verbose(`✓ Collection already exists: ${collectionName}`);
            }
        } catch (error) {
            this.logger.error(`Failed to ensure collection ${collectionName}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Check if collection exists (with caching and timeout)
     */
    async collectionExists(collectionName: string): Promise<boolean> {
        try {
            // Check cache first
            const cached = this.collectionExistsCache.get(collectionName);
            if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
                this.logger.debug(`📦 Cache hit for collection: ${collectionName} (exists: ${cached.exists})`);
                return cached.exists;
            }

            this.logger.debug(`🔍 Checking if collection exists: ${collectionName}`);

            // Use timeout to prevent hanging
            const response = await withRetryAndTimeout(
                () => this.client.hasCollection({ collection_name: collectionName }),
                {
                    maxRetries: 3,
                    timeoutMs: 15000, // 15 seconds per attempt
                    initialDelayMs: 500,
                    operationName: `Check collection ${collectionName}`,
                },
            );

            const exists = (response.value as any) === true;

            // Cache the result
            this.collectionExistsCache.set(collectionName, {
                exists,
                timestamp: Date.now(),
            });

            this.logger.debug(`✓ Collection ${collectionName} exists: ${exists}`);
            return exists;
        } catch (error) {
            this.logger.error(`❌ Error checking collection existence for '${collectionName}': ${error.message}`);

            // If there's a connection error, return cached value if available
            const cached = this.collectionExistsCache.get(collectionName);
            if (cached) {
                this.logger.warn(`⚠️ Connection error, using cached value for ${collectionName}: ${cached.exists}`);
                return cached.exists;
            }

            // On error with no cache, throw error instead of silently returning false
            // This allows controllers to handle connection errors properly
            throw new Error(`Failed to check collection existence: ${error.message}`);
        }
    }

    /**
     * Clear collection existence cache
     */
    clearCollectionExistsCache(collectionName?: string): void {
        if (collectionName) {
            this.collectionExistsCache.delete(collectionName);
            this.logger.debug(`🗑️ Cleared cache for collection: ${collectionName}`);
        } else {
            this.collectionExistsCache.clear();
            this.logger.debug(`🗑️ Cleared all collection existence cache`);
        }
    }

    /**
     * Create a new collection with standard schema
     */
    async createCollection(
        collectionName: string,
        vectorDim: number = this.EMBEDDING_DIM,
    ): Promise<void> {
        try {
            const schema = this.buildCollectionSchema(collectionName, vectorDim);

            this.logger.debug(`Creating collection with schema: ${JSON.stringify(schema)}`);

            await this.client.createCollection({
                collection_name: collectionName,
                fields: schema.fields,
                description: schema.description,
            });

            // Create index on embedding field
            await this.createIndex(collectionName, 'embedding', vectorDim);

            this.logger.log(`✅ Collection ${collectionName} created with index`);
        } catch (error) {
            this.logger.error(`Failed to create collection ${collectionName}: ${error instanceof Error ? error.message : String(error)}`);
            this.logger.error(`Error details: ${JSON.stringify(error)}`);
            throw error;
        }
    }

    /**
     * Build standard collection schema
     */
    private buildCollectionSchema(
        collectionName: string,
        vectorDim: number,
    ): any {
        return {
            name: collectionName,
            description: `Collection: ${collectionName}`,
            fields: [
                {
                    name: 'id',
                    data_type: 'Int64',
                    is_primary_key: true,
                    auto_id: true,
                },
                {
                    name: 'embedding',
                    data_type: 'FloatVector',
                    type_params: { dim: String(vectorDim) },
                },
                {
                    name: 'pageContent',
                    data_type: 'VarChar',
                    type_params: { max_length: '65535' },
                },
                {
                    name: 'metadata',
                    data_type: 'JSON',
                },
            ],
        };
    }

    /**
     * Create index on collection
     */
    private async createIndex(
        collectionName: string,
        fieldName: string,
        vectorDim: number,
    ): Promise<void> {
        try {
            await this.client.createIndex({
                collection_name: collectionName,
                field_name: fieldName,
                index_type: this.DEFAULT_INDEX_TYPE,
                metric_type: this.DEFAULT_METRIC_TYPE,
                params: {
                    nlist: Math.max(128, Math.ceil(Math.sqrt(10000))), // Adaptive nlist
                },
            });

            this.logger.log(
                `✅ Index created on ${collectionName}.${fieldName} (${this.DEFAULT_INDEX_TYPE})`,
            );
        } catch (error) {
            this.logger.error(`Failed to create index: ${error.message}`);
            throw error;
        }
    }

    /**
     * Insert documents into collection
     */
    async insertDocuments(
        collectionName: string,
        documents: Document[],
    ): Promise<InsertResult> {
        try {
            await this.ensureCollectionExists(collectionName);
            await this.ensureCollectionLoaded(collectionName);

            const milvusDocuments = documents.map((doc: any) => ({
                embedding: doc.embedding || [],
                pageContent: doc.pageContent,
                metadata: doc.metadata,
            }));

            const response = await this.client.insert({
                collection_name: collectionName,
                data: milvusDocuments,
            });

            this.logger.log(`✅ Inserted ${milvusDocuments.length} documents into ${collectionName}`);

            return {
                insertCount: milvusDocuments.length,
                ids: (response.IDs as any) || [],
            };
        } catch (error) {
            this.logger.error(`Failed to insert documents: ${error.message}`);
            throw error;
        }
    }

    /**
     * Search for similar vectors
     */
    async search(
        collectionName: string,
        embedding: number[],
        topK: number = 5,
        filter?: SearchFilter,
    ): Promise<SearchResult[]> {
        try {
            await this.ensureCollectionExists(collectionName);
            await this.ensureCollectionLoaded(collectionName);

            const searchParams: any = {
                collection_name: collectionName,
                data: [embedding],
                limit: topK,
                output_fields: ['id', 'pageContent', 'metadata'],
                metric_type: this.DEFAULT_METRIC_TYPE,
                params: {
                    nprobe: Math.min(32, Math.ceil(Math.sqrt(128))), // Adaptive nprobe
                },
            };

            // Add filter if provided
            if (filter) {
                searchParams.filter = this.buildFilterExpression(filter);
            }

            const response = await this.client.search(searchParams);

            const results: SearchResult[] = (response.results || []).map((result: any) => ({
                id: Number(result.id) || 0,
                score: result.score || 0,
                pageContent: result.pageContent || '',
                metadata: this.parseMetadata(result.metadata),
            }));

            this.logger.log(`🔍 Search completed: found ${results.length} results in ${collectionName}`);
            return results;
        } catch (error) {
            this.logger.error(`Search failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Upsert documents (insert or update)
     */
    async upsertDocuments(
        collectionName: string,
        documents: UpsertData[],
    ): Promise<InsertResult> {
        try {
            await this.ensureCollectionExists(collectionName);
            await this.ensureCollectionLoaded(collectionName);

            const milvusDocuments = documents.map((doc) => ({
                id: doc.id,
                embedding: doc.embedding,
                pageContent: doc.pageContent,
                metadata: JSON.stringify(doc.metadata),
            }));

            const response = await this.client.upsert({
                collection_name: collectionName,
                data: milvusDocuments,
            });

            this.logger.log(`✅ Upserted ${milvusDocuments.length} documents in ${collectionName}`);

            return {
                insertCount: milvusDocuments.length,
                ids: (response.IDs as any) || [],
            };
        } catch (error) {
            this.logger.error(`Failed to upsert documents: ${error.message}`);
            throw error;
        }
    }

    /**
     * Delete document by ID
     */
    async deleteDocument(collectionName: string, id: number): Promise<void> {
        try {
            await this.client.delete({
                collection_name: collectionName,
                filter: `id == ${id}`,
            });

            this.logger.log(`✅ Deleted document ${id} from ${collectionName}`);
        } catch (error) {
            this.logger.error(`Failed to delete document: ${error.message}`);
            throw error;
        }
    }

    /**
     * Delete multiple documents by filter
     */
    async deleteDocuments(collectionName: string, filter: SearchFilter): Promise<number> {
        try {
            const filterExpr = this.buildFilterExpression(filter);

            const response = await this.client.delete({
                collection_name: collectionName,
                filter: filterExpr,
            });

            this.logger.log(`✅ Deleted documents from ${collectionName}`);
            return Number(response.delete_cnt) || 0;
        } catch (error) {
            this.logger.error(`Failed to delete documents: ${error.message}`);
            throw error;
        }
    }

    /**
     * List all collections
     */
    async listCollections(): Promise<string[]> {
        try {
            const response = await this.client.showCollections();
            const collections = response.data.map((c) => c.name);
            this.logger.log(`📚 Found ${collections.length} collections`);
            return collections;
        } catch (error) {
            this.logger.error(`Failed to list collections: ${error.message}`);
            throw error;
        }
    }

    /**
     * Delete collection
     */
    async deleteCollection(collectionName: string): Promise<void> {
        try {
            await this.client.dropCollection({
                collection_name: collectionName,
            });

            this.logger.log(`✅ Collection ${collectionName} deleted`);
        } catch (error) {
            this.logger.error(`Failed to delete collection: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get collection statistics
     */
    async getCollectionStats(collectionName: string): Promise<CollectionStats> {
        try {
            const collectionInfo = await this.client.describeCollection({
                collection_name: collectionName,
            });

            const rowCount = await this.client.getCollectionStatistics({
                collection_name: collectionName,
            });

            return {
                name: collectionName,
                rowCount: rowCount.data.row_count || 0,
                vectorDim: this.EMBEDDING_DIM,
                indexes: this.extractIndexInfo(collectionInfo),
                createdAt: new Date().toISOString(),
            };
        } catch (error) {
            this.logger.error(`Failed to get collection stats: ${error.message}`);
            throw error;
        }
    }

    /**
     * Extract index information from collection info
     */
    private extractIndexInfo(collectionInfo: any): IndexInfo[] {
        const indexes: IndexInfo[] = [];

        if (collectionInfo.indexes) {
            collectionInfo.indexes.forEach((index) => {
                indexes.push({
                    name: index.index_name,
                    fieldName: index.field_name,
                    indexType: index.index_type,
                    metricType: index.metric_type || this.DEFAULT_METRIC_TYPE,
                    params: index.params || {},
                });
            });
        }

        return indexes;
    }

    /**
     * Build filter expression from SearchFilter
     */
    private buildFilterExpression(filter: SearchFilter): string {
        const { field, operator, value } = filter;

        switch (operator) {
            case 'eq':
                return `${field} == "${value}"`;
            case 'ne':
                return `${field} != "${value}"`;
            case 'gt':
                return `${field} > ${value}`;
            case 'gte':
                return `${field} >= ${value}`;
            case 'lt':
                return `${field} < ${value}`;
            case 'lte':
                return `${field} <= ${value}`;
            case 'in':
                const values = Array.isArray(value) ? value.join(',') : value;
                return `${field} in [${values}]`;
            case 'like':
                return `${field} like "%${value}%"`;
            default:
                return `${field} == "${value}"`;
        }
    }

    /**
     * Parse metadata JSON string
     */
    private parseMetadata(metadata: any): Record<string, any> {
        if (typeof metadata === 'string') {
            try {
                return JSON.parse(metadata);
            } catch {
                return { raw: metadata };
            }
        }
        return metadata || {};
    }

    /**
     * Load collection into memory
     */
    async loadCollection(collectionName: string): Promise<void> {
        try {
            this.logger.log(`📥 Loading collection: ${collectionName}`);
            await this.client.loadCollection({
                collection_name: collectionName,
            });
            this.logger.log(`✅ Collection loaded: ${collectionName}`);
        } catch (error) {
            this.logger.error(`Failed to load collection ${collectionName}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Unload collection from memory
     */
    async unloadCollection(collectionName: string): Promise<void> {
        try {
            this.logger.log(`📤 Unloading collection: ${collectionName}`);
            await this.client.releaseCollection({
                collection_name: collectionName,
            });
            this.logger.log(`✅ Collection unloaded: ${collectionName}`);
        } catch (error) {
            this.logger.error(`Failed to unload collection ${collectionName}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Check if collection is loaded
     */
    async isCollectionLoaded(collectionName: string): Promise<boolean> {
        try {
            const response = await this.client.getLoadingProgress({
                collection_name: collectionName,
            });
            return (response.progress as any) === 100;
        } catch (error) {
            this.logger.debug(`Failed to check collection load status: ${error.message}`);
            return false;
        }
    }

    /**
     * Ensure collection is loaded before operations
     */
    async ensureCollectionLoaded(collectionName: string): Promise<void> {
        try {
            const isLoaded = await this.isCollectionLoaded(collectionName);
            if (!isLoaded) {
                this.logger.log(`⚠️ Collection not loaded, loading now: ${collectionName}`);
                await this.loadCollection(collectionName);
            }
        } catch (error) {
            this.logger.error(`Failed to ensure collection loaded: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get client for advanced operations
     */
    getClient(): MilvusClient {
        return this.client;
    }
}
