import { Injectable, Logger } from '@nestjs/common';
import { MilvusService } from './milvus.service';
import { CollectionMetadata } from './types/milvus.types';

/**
 * Collection Manager Service
 * Manages collection metadata and auto-registration
 */
@Injectable()
export class CollectionManagerService {
    private readonly logger = new Logger(CollectionManagerService.name);
    private readonly METADATA_COLLECTION = 'collections_metadata';
    private readonly VECTOR_DIM = 384;
    private metadataCache: Map<string, CollectionMetadata> = new Map();

    constructor(private readonly milvusService: MilvusService) { }

    /**
     * Initialize metadata collection
     */
    async initialize(): Promise<void> {
        try {
            this.logger.log('🔧 Initializing Collection Manager...');

            // Ensure metadata collection exists
            await this.milvusService.ensureCollectionExists(
                this.METADATA_COLLECTION,
                this.VECTOR_DIM,
            );

            // Load existing metadata
            await this.loadMetadata();

            this.logger.log('✅ Collection Manager initialized');
        } catch (error) {
            this.logger.error(`Failed to initialize Collection Manager: ${error.message}`);
            throw error;
        }
    }

    /**
     * Create a new collection with metadata
     */
    async createCollection(
        name: string,
        tags: string[] = [],
        description: string = '',
    ): Promise<CollectionMetadata> {
        try {
            this.logger.log(`📦 Creating collection: ${name}`);

            // Create collection in Milvus
            await this.milvusService.ensureCollectionExists(name, this.VECTOR_DIM);

            // Create metadata entry
            const metadata: CollectionMetadata = {
                name,
                tags,
                description,
                vectorDim: this.VECTOR_DIM,
                status: 'unloaded',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            // Store metadata
            await this.storeMetadata(metadata);

            // Cache it
            this.metadataCache.set(name, metadata);

            this.logger.log(`✅ Collection created: ${name} with tags: ${tags.join(', ')}`);
            return metadata;
        } catch (error) {
            this.logger.error(`Failed to create collection: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get collection metadata
     */
    async getCollectionMetadata(name: string): Promise<CollectionMetadata | null> {
        try {
            // Check cache first
            if (this.metadataCache.has(name)) {
                return this.metadataCache.get(name) || null;
            }

            // Retrieve from Milvus
            const metadata = await this.retrieveMetadata(name);

            if (metadata) {
                this.metadataCache.set(name, metadata);
            }

            return metadata;
        } catch (error) {
            this.logger.error(`Failed to get collection metadata: ${error.message}`);
            return null;
        }
    }

    /**
     * List all collections with metadata
     */
    async listCollections(): Promise<CollectionMetadata[]> {
        try {
            const collections = await this.milvusService.listCollections();

            const metadata: CollectionMetadata[] = [];

            for (const collectionName of collections) {
                // Skip metadata collection itself
                if (collectionName === this.METADATA_COLLECTION) {
                    continue;
                }

                let meta = await this.getCollectionMetadata(collectionName);

                // If not found, auto-register with unclassified tag
                if (!meta) {
                    meta = await this.autoRegisterCollection(collectionName);
                }

                metadata.push(meta);
            }

            return metadata;
        } catch (error) {
            this.logger.error(`Failed to list collections: ${error.message}`);
            return [];
        }
    }

    /**
     * Auto-register collection found in Milvus
     * This prevents inconsistent collections
     */
    private async autoRegisterCollection(collectionName: string): Promise<CollectionMetadata> {
        try {
            this.logger.warn(
                `⚠️ Collection ${collectionName} not in metadata. Auto-registering...`,
            );

            const metadata: CollectionMetadata = {
                name: collectionName,
                tags: ['auto-registered'],
                description: `Auto-registered collection: ${collectionName}`,
                vectorDim: this.VECTOR_DIM,
                status: 'unloaded',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            await this.storeMetadata(metadata);
            this.metadataCache.set(collectionName, metadata);

            this.logger.log(`✅ Collection auto-registered: ${collectionName}`);
            return metadata;
        } catch (error) {
            this.logger.error(`Failed to auto-register collection: ${error.message}`);
            throw error;
        }
    }

    /**
     * Update collection metadata
     */
    async updateCollectionMetadata(
        name: string,
        updates: Partial<CollectionMetadata>,
    ): Promise<CollectionMetadata> {
        try {
            const existing = await this.getCollectionMetadata(name);

            if (!existing) {
                throw new Error(`Collection ${name} not found`);
            }

            const updated: CollectionMetadata = {
                ...existing,
                ...updates,
                updatedAt: new Date().toISOString(),
            };

            await this.storeMetadata(updated);
            this.metadataCache.set(name, updated);

            this.logger.log(`✅ Collection metadata updated: ${name}`);
            return updated;
        } catch (error) {
            this.logger.error(`Failed to update collection metadata: ${error.message}`);
            throw error;
        }
    }

    /**
     * Delete collection
     */
    async deleteCollection(name: string): Promise<void> {
        try {
            // Delete from Milvus
            await this.milvusService.deleteCollection(name);

            // Delete metadata
            await this.deleteMetadata(name);

            // Remove from cache
            this.metadataCache.delete(name);

            this.logger.log(`✅ Collection deleted: ${name}`);
        } catch (error) {
            this.logger.error(`Failed to delete collection: ${error.message}`);
            throw error;
        }
    }

    /**
     * Store metadata in Milvus metadata collection
     */
    private async storeMetadata(metadata: CollectionMetadata): Promise<void> {
        try {
            const doc = {
                embedding: this.generateMetadataEmbedding(metadata),
                pageContent: JSON.stringify(metadata),
                metadata: {
                    collectionName: metadata.name,
                    tags: metadata.tags,
                    status: metadata.status,
                },
            };

            await this.milvusService.insertDocuments(this.METADATA_COLLECTION, [doc] as any);
        } catch (error) {
            this.logger.error(`Failed to store metadata: ${error.message}`);
            throw error;
        }
    }

    /**
     * Retrieve metadata from Milvus using search with filter
     */
    private async retrieveMetadata(collectionName: string): Promise<CollectionMetadata | null> {
        try {
            this.logger.debug(`🔍 Retrieving metadata for collection: ${collectionName}`);

            // Search with filter for the specific collection name
            const results = await this.milvusService.search(
                this.METADATA_COLLECTION,
                this.generateMetadataEmbedding({ name: collectionName } as any),
                1,
                {
                    field: 'metadata.collectionName',
                    operator: 'eq',
                    value: collectionName,
                },
            );

            if (results.length === 0) {
                this.logger.debug(`⚠️ No metadata found for collection: ${collectionName}`);
                return null;
            }

            const metadata = JSON.parse(results[0].pageContent) as CollectionMetadata;
            this.logger.debug(`✓ Retrieved metadata for collection: ${collectionName}`);
            return metadata;
        } catch (error) {
            this.logger.error(`Failed to retrieve metadata for '${collectionName}': ${error.message}`);
            return null;
        }
    }

    /**
     * Delete metadata
     */
    private async deleteMetadata(collectionName: string): Promise<void> {
        try {
            await this.milvusService.deleteDocuments(this.METADATA_COLLECTION, {
                field: 'metadata.collectionName',
                operator: 'eq',
                value: collectionName,
            });
        } catch (error) {
            this.logger.error(`Failed to delete metadata: ${error.message}`);
            throw error;
        }
    }

    /**
     * Load all metadata into cache
     */
    private async loadMetadata(): Promise<void> {
        try {
            const collections = await this.milvusService.listCollections();

            for (const collectionName of collections) {
                if (collectionName === this.METADATA_COLLECTION) {
                    continue;
                }

                const metadata = await this.retrieveMetadata(collectionName);

                if (metadata) {
                    this.metadataCache.set(collectionName, metadata);
                } else {
                    // Auto-register if not found
                    await this.autoRegisterCollection(collectionName);
                }
            }

            this.logger.log(`✅ Loaded ${this.metadataCache.size} collections into cache`);
        } catch (error) {
            this.logger.error(`Failed to load metadata: ${error.message}`);
        }
    }

    /**
     * Generate simple embedding for metadata (for searching)
     */
    private generateMetadataEmbedding(metadata: any): number[] {
        // Create a simple hash-based embedding for metadata
        const text = `${metadata.name}${(metadata.tags || []).join(',')}${metadata.description || ''}`;
        const embedding = new Array(384).fill(0);

        for (let i = 0; i < text.length; i++) {
            embedding[i % 384] += text.charCodeAt(i) / 1000;
        }

        // Normalize
        const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
        return embedding.map((val) => val / (norm || 1));
    }

    /**
     * Get collection stats
     */
    async getCollectionStats(name: string) {
        try {
            return await this.milvusService.getCollectionStats(name);
        } catch (error) {
            this.logger.error(`Failed to get collection stats: ${error.message}`);
            throw error;
        }
    }

    /**
     * Clear cache
     */
    clearCache(): void {
        this.metadataCache.clear();
        this.logger.log('✅ Metadata cache cleared');
    }
}
