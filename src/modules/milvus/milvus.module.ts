import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MilvusService } from './milvus.service';
import { CollectionManagerService } from './collection-manager.service';
import { MemoryCollectionsService } from './memory-collections.service';
import { MilvusController } from './milvus.controller';

/**
 * Milvus Module - Vector Database Integration
 * Uses custom RAG types 
 */
@Module({
    imports: [ConfigModule],
    providers: [MilvusService, CollectionManagerService, MemoryCollectionsService],
    controllers: [MilvusController],
    exports: [MilvusService, CollectionManagerService, MemoryCollectionsService],
})
export class MilvusModule implements OnModuleInit {
    constructor(
        private readonly collectionManager: CollectionManagerService,
        private readonly memoryCollections: MemoryCollectionsService,
    ) { }

    async onModuleInit() {
        // Initialize collection manager and memory collections on startup (non-blocking)
        try {
            await this.collectionManager.initialize();
            await this.memoryCollections.initialize();
        } catch (error) {
            console.error('Error initializing Milvus collections:', error);
            // Don't crash the app if initialization fails
        }
    }
}
