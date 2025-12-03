import {
    Controller,
    Get,
    Post,
    Delete,
    Body,
    Param,
    HttpCode,
    Logger,
    BadRequestException,
    NotFoundException,
    InternalServerErrorException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { CollectionManagerService } from './collection-manager.service';
import { MilvusService } from './milvus.service';
import { CollectionMetadata } from './types/milvus.types';

@Controller('collections')
export class MilvusController {
    private readonly logger = new Logger(MilvusController.name);

    constructor(
        private readonly collectionManager: CollectionManagerService,
        private readonly milvusService: MilvusService,
    ) { }

    /**
     * Create a new collection
     * POST /collections
     */
    @Post()
    @HttpCode(201)
    @ApiOperation({ summary: 'Create a new collection' })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                name: { type: 'string', example: 'docs_mycompany' },
                tags: { type: 'array', items: { type: 'string' }, example: ['public', 'internal'] },
                description: { type: 'string', example: 'Company documentation' },
            },
            required: ['name'],
        },
    })
    @ApiResponse({ status: 201, description: 'Collection created successfully' })
    @ApiResponse({ status: 400, description: 'Invalid request' })
    async createCollection(
        @Body()
        body: {
            name: string;
            tags?: string[];
            description?: string;
        },
    ): Promise<{ success: boolean; data: CollectionMetadata }> {
        try {
            const { name, tags = [], description = '' } = body;

            if (!name || name.trim().length === 0) {
                throw new BadRequestException('Collection name is required');
            }

            // Check if collection already exists
            const exists = await this.milvusService.collectionExists(name);
            if (exists) {
                throw new BadRequestException(`Collection ${name} already exists`);
            }

            const metadata = await this.collectionManager.createCollection(name, tags, description);

            this.logger.log(`✅ Collection created: ${name}`);
            return {
                success: true,
                data: metadata,
            };
        } catch (error) {
            this.logger.error(`Failed to create collection: ${error.message}`);
            throw error;
        }
    }

    /**
     * List all collections
     * GET /collections
     */
    @Get()
    @ApiOperation({ summary: 'List all collections with metadata' })
    @ApiResponse({ status: 200, description: 'Collections retrieved successfully' })
    async listCollections(): Promise<{ success: boolean; data: CollectionMetadata[] }> {
        try {
            const collections = await this.collectionManager.listCollections();

            this.logger.log(`📚 Retrieved ${collections.length} collections`);
            return {
                success: true,
                data: collections,
            };
        } catch (error) {
            this.logger.error(`Failed to list collections: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get collection metadata and statistics
     * GET /collections/:name
     */
    @Get(':name')
    @ApiOperation({ summary: 'Get collection metadata and statistics' })
    @ApiResponse({ status: 200, description: 'Collection info retrieved' })
    @ApiResponse({ status: 404, description: 'Collection not found' })
    async getCollectionInfo(
        @Param('name') name: string,
    ): Promise<{
        success: boolean;
        metadata: CollectionMetadata | null;
        stats: any;
    }> {
        try {
            if (!name || name.trim().length === 0) {
                throw new BadRequestException('Collection name is required');
            }

            this.logger.log(`📖 Getting info for collection: '${name}'`);

            try {
                const exists = await this.milvusService.collectionExists(name);
                if (!exists) {
                    this.logger.warn(`⚠️ Collection '${name}' does not exist`);
                    throw new NotFoundException(`Collection '${name}' does not exist`);
                }
            } catch (error) {
                // If it's a connection error, still try to get metadata (collection likely exists)
                if (error instanceof NotFoundException) {
                    throw error;
                }
                this.logger.warn(`⚠️ Connection issue checking collection, proceeding with retrieval: ${error.message}`);
            }

            const metadata = await this.collectionManager.getCollectionMetadata(name);
            const stats = await this.milvusService.getCollectionStats(name);

            this.logger.log(`✅ Retrieved metadata and statistics for collection: '${name}'`);
            return {
                success: true,
                metadata: metadata || null,
                stats,
            };
        } catch (error) {
            if (error instanceof NotFoundException || error instanceof BadRequestException) {
                throw error;
            }
            this.logger.error(`❌ Failed to get collection info for '${name}': ${error.message}`);
            throw new InternalServerErrorException(
                `Failed to get collection '${name}': ${error.message}`,
            );
        }
    }

    /**
     * Update collection metadata
     * PATCH /collections/:name
     */
    @Post(':name/metadata')
    @HttpCode(200)
    @ApiOperation({ summary: 'Update collection metadata' })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                tags: { type: 'array', items: { type: 'string' } },
                description: { type: 'string' },
                status: { type: 'string', enum: ['active', 'inactive', 'unclassified'] },
            },
        },
    })
    @ApiResponse({ status: 200, description: 'Metadata updated successfully' })
    @ApiResponse({ status: 404, description: 'Collection not found' })
    async updateCollectionMetadata(
        @Param('name') name: string,
        @Body() updates: Partial<CollectionMetadata>,
    ): Promise<{ success: boolean; data: CollectionMetadata }> {
        try {
            if (!name || name.trim().length === 0) {
                throw new BadRequestException('Collection name is required');
            }

            if (!updates || Object.keys(updates).length === 0) {
                throw new BadRequestException('At least one field must be updated');
            }

            this.logger.log(`📝 Updating metadata for collection: '${name}'`);

            try {
                const exists = await this.milvusService.collectionExists(name);
                if (!exists) {
                    this.logger.warn(`⚠️ Collection '${name}' does not exist`);
                    throw new NotFoundException(`Collection '${name}' does not exist`);
                }
            } catch (error) {
                // If it's a connection error, still try to update (collection likely exists)
                if (error instanceof NotFoundException) {
                    throw error;
                }
                this.logger.warn(`⚠️ Connection issue checking collection, proceeding with update: ${error.message}`);
            }

            const updated = await this.collectionManager.updateCollectionMetadata(name, updates);

            // Clear cache after update
            this.milvusService.clearCollectionExistsCache(name);

            this.logger.log(`✅ Updated metadata for collection: '${name}'`);
            return {
                success: true,
                data: updated,
            };
        } catch (error) {
            if (error instanceof NotFoundException || error instanceof BadRequestException) {
                throw error;
            }
            this.logger.error(`❌ Failed to update collection metadata for '${name}': ${error.message}`);
            throw new InternalServerErrorException(
                `Failed to update collection '${name}': ${error.message}`,
            );
        }
    }

    /**
     * Delete collection
     * DELETE /collections/:name
     */
    @Delete(':name')
    @HttpCode(200)
    @ApiOperation({ summary: 'Delete a collection' })
    @ApiResponse({ status: 200, description: 'Collection deleted successfully' })
    @ApiResponse({ status: 404, description: 'Collection not found' })
    async deleteCollection(
        @Param('name') name: string,
    ): Promise<{ success: boolean; message: string }> {
        try {
            if (!name || name.trim().length === 0) {
                throw new BadRequestException('Collection name is required');
            }

            this.logger.log(`🗑️ Deleting collection: '${name}'`);

            try {
                const exists = await this.milvusService.collectionExists(name);
                if (!exists) {
                    this.logger.warn(`⚠️ Collection '${name}' does not exist`);
                    throw new NotFoundException(`Collection '${name}' does not exist. Cannot delete non-existent collection.`);
                }
            } catch (error) {
                // If it's a connection error, still try to delete (collection likely exists)
                if (error instanceof NotFoundException) {
                    throw error;
                }
                this.logger.warn(`⚠️ Connection issue checking collection, proceeding with deletion: ${error.message}`);
            }

            await this.collectionManager.deleteCollection(name);

            // Clear cache after deletion
            this.milvusService.clearCollectionExistsCache(name);

            this.logger.log(`✅ Deleted collection: '${name}'`);
            return {
                success: true,
                message: `Collection '${name}' deleted successfully`,
            };
        } catch (error) {
            if (error instanceof NotFoundException || error instanceof BadRequestException) {
                throw error;
            }
            this.logger.error(`❌ Failed to delete collection '${name}': ${error.message}`);
            throw new InternalServerErrorException(
                `Failed to delete collection '${name}': ${error.message}`,
            );
        }
    }


    /**
     * Sync collections (detect and register unregistered collections)
     * POST /collections/sync
     */
    @Post('sync/all')
    @HttpCode(200)
    @ApiOperation({ summary: 'Sync collections - detect and register unregistered ones' })
    @ApiResponse({ status: 200, description: 'Sync completed' })
    async syncCollections(): Promise<{ success: boolean; synced: number; data: CollectionMetadata[] }> {
        try {
            this.logger.log('🔄 Syncing collections...');

            // Clear cache to force reload
            this.collectionManager.clearCache();

            // List all collections (this will auto-register unregistered ones)
            const collections = await this.collectionManager.listCollections();

            this.logger.log(`✅ Sync completed: ${collections.length} collections`);
            return {
                success: true,
                synced: collections.length,
                data: collections,
            };
        } catch (error) {
            this.logger.error(`Failed to sync collections: ${error.message}`);
            throw error;
        }
    }
}
