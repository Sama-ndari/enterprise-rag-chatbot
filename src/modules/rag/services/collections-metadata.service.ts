import { Injectable, Logger } from '@nestjs/common';
import { MilvusService } from '../../milvus/milvus.service';
import { OpenAIService } from './openai.service';
import { CollectionMetadata } from '../types';

/**
 * Collections Metadata Service
 * Manages metadata for all collections in Milvus
 */
@Injectable()
export class CollectionsMetadataService {
    private readonly logger = new Logger(CollectionsMetadataService.name);
    private readonly metadataCollectionName = '_collections_metadata';
    private metadataCache = new Map<string, CollectionMetadata>();

    constructor(
        private readonly milvusService: MilvusService,
        private readonly openaiService: OpenAIService,
    ) {
        this.initializeMetadataCollection();
    }

    /**
     * Initialize metadata collection
     */
    private async initializeMetadataCollection(): Promise<void> {
        try {
            await this.milvusService.ensureCollectionExists(this.metadataCollectionName);
            this.logger.log(`✅ Metadata collection initialized: ${this.metadataCollectionName}`);
        } catch (error) {
            this.logger.error(`Failed to initialize metadata collection: ${error.message}`);
        }
    }

    /**
     * Create collection metadata
     */
    async createCollectionMetadata(
        collectionName: string,
        metadata: Partial<CollectionMetadata>,
    ): Promise<CollectionMetadata> {
        try {
            this.logger.log(`📝 Creating metadata for collection: ${collectionName}`);

            const fullMetadata: CollectionMetadata = {
                name: collectionName,
                tags: metadata.tags || [],
                description: metadata.description || '',
                vectorDim: metadata.vectorDim || 384,
                status: 'unloaded',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            // Store in Milvus
            await this.storeMetadata(fullMetadata);

            // Cache it
            this.metadataCache.set(collectionName, fullMetadata);

            this.logger.log(`✅ Collection metadata created: ${collectionName}`);
            return fullMetadata;
        } catch (error) {
            this.logger.error(`Failed to create collection metadata: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get collection metadata
     */
    async getCollectionMetadata(collectionName: string): Promise<CollectionMetadata | null> {
        try {
            // Check cache first
            if (this.metadataCache.has(collectionName)) {
                this.logger.debug(`📦 Cache hit for metadata: ${collectionName}`);
                return this.metadataCache.get(collectionName) || null;
            }

            this.logger.debug(`🔍 Retrieving metadata for collection: ${collectionName}`);

            // Search in Milvus
            await this.milvusService.ensureCollectionLoaded(this.metadataCollectionName);

            const embedding = await this.openaiService.generateEmbedding(collectionName);

            const results = await this.milvusService.search(
                this.metadataCollectionName,
                embedding,
                1,
                {
                    field: 'metadata.name',
                    operator: 'eq',
                    value: collectionName,
                },
            );

            if (results.length === 0) {
                this.logger.debug(`⚠️ No metadata found for collection: ${collectionName}`);
                return null;
            }

            const metadata = JSON.parse(results[0].pageContent) as CollectionMetadata;

            // Cache it
            this.metadataCache.set(collectionName, metadata);

            this.logger.debug(`✅ Retrieved metadata for collection: ${collectionName}`);
            return metadata;
        } catch (error) {
            this.logger.error(`Failed to get collection metadata: ${error.message}`);
            return null;
        }
    }

    /**
     * Update collection metadata
     */
    async updateCollectionMetadata(
        collectionName: string,
        updates: Partial<CollectionMetadata>,
    ): Promise<CollectionMetadata> {
        try {
            this.logger.log(`📝 Updating metadata for collection: ${collectionName}`);

            const existing = await this.getCollectionMetadata(collectionName);

            if (!existing) {
                throw new Error(`Collection metadata not found: ${collectionName}`);
            }

            const updated: CollectionMetadata = {
                ...existing,
                ...updates,
                name: collectionName, // Ensure name doesn't change
                createdAt: existing.createdAt, // Preserve creation time
                updatedAt: new Date().toISOString(),
            };

            // Store updated metadata
            await this.storeMetadata(updated);

            // Update cache
            this.metadataCache.set(collectionName, updated);

            this.logger.log(`✅ Collection metadata updated: ${collectionName}`);
            return updated;
        } catch (error) {
            this.logger.error(`Failed to update collection metadata: ${error.message}`);
            throw error;
        }
    }

    /**
     * List all collections metadata
     */
    async listCollectionsMetadata(): Promise<CollectionMetadata[]> {
        try {
            this.logger.debug(`📚 Listing all collections metadata`);

            await this.milvusService.ensureCollectionLoaded(this.metadataCollectionName);

            const allCollections = await this.milvusService.listCollections();

            const metadataList: CollectionMetadata[] = [];

            for (const collectionName of allCollections) {
                // Skip metadata collection itself
                if (collectionName === this.metadataCollectionName) {
                    continue;
                }

                const metadata = await this.getCollectionMetadata(collectionName);
                if (metadata) {
                    metadataList.push(metadata);
                }
            }

            this.logger.log(`✅ Listed ${metadataList.length} collections metadata`);
            return metadataList;
        } catch (error) {
            this.logger.error(`Failed to list collections metadata: ${error.message}`);
            return [];
        }
    }

    /**
     * Update collection status
     */
    async updateCollectionStatus(
        collectionName: string,
        status: 'loaded' | 'unloaded',
    ): Promise<void> {
        try {
            this.logger.debug(`📊 Updating collection status: ${collectionName} -> ${status}`);

            await this.updateCollectionMetadata(collectionName, { status });

            this.logger.log(`✅ Collection status updated: ${collectionName} -> ${status}`);
        } catch (error) {
            this.logger.error(`Failed to update collection status: ${error.message}`);
            throw error;
        }
    }

    /**
     * Delete collection metadata
     */
    async deleteCollectionMetadata(collectionName: string): Promise<void> {
        try {
            this.logger.log(`🗑️ Deleting metadata for collection: ${collectionName}`);

            // Remove from cache
            this.metadataCache.delete(collectionName);

            // In production, also delete from Milvus
            // For now, just remove from cache

            this.logger.log(`✅ Collection metadata deleted: ${collectionName}`);
        } catch (error) {
            this.logger.error(`Failed to delete collection metadata: ${error.message}`);
            throw error;
        }
    }

    /**
     * Clear metadata cache
     */
    clearCache(collectionName?: string): void {
        if (collectionName) {
            this.metadataCache.delete(collectionName);
            this.logger.debug(`🗑️ Cleared cache for collection: ${collectionName}`);
        } else {
            this.metadataCache.clear();
            this.logger.debug(`🗑️ Cleared all metadata cache`);
        }
    }

    /**
     * Store metadata in Milvus
     */
    private async storeMetadata(metadata: CollectionMetadata): Promise<void> {
        try {
            const metadataText = JSON.stringify(metadata);
            const embedding = await this.openaiService.generateEmbedding(metadataText);

            await this.milvusService.ensureCollectionLoaded(this.metadataCollectionName);

            await this.milvusService.insertDocuments(this.metadataCollectionName, [
                {
                    embedding,
                    pageContent: metadataText,
                    metadata: {
                        name: metadata.name,
                        type: 'collection_metadata',
                        timestamp: new Date().toISOString(),
                    },
                },
            ] as any);

            this.logger.debug(`✅ Metadata stored in Milvus: ${metadata.name}`);
        } catch (error) {
            this.logger.error(`Failed to store metadata in Milvus: ${error.message}`);
            throw error;
        }
    }
}
