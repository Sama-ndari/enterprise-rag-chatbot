import { Injectable, Logger } from '@nestjs/common';
import { MilvusService } from './milvus.service';
import { CollectionManagerService } from './collection-manager.service';
import { SearchResult, InsertResult } from './types/milvus.types';

export interface UserMemory {
    userId: string;
    summary: string;
    preferences: Record<string, any>;
    topics: string[];
    lastUpdated: string;
}

export interface SessionMemory {
    sessionId: string;
    userId: string;
    summary: string;
    keyPoints: string[];
    topics: string[];
    timestamp: string;
}

/**
 * Memory Collections Service for Milvus
 * Manages user long-term memory and session summaries
 */
@Injectable()
export class MemoryCollectionsService {
    private readonly logger = new Logger(MemoryCollectionsService.name);
    private readonly USER_MEMORY_COLLECTION = 'memory_users';
    private readonly SESSION_MEMORY_COLLECTION = 'memory_sessions';

    constructor(
        private readonly milvusService: MilvusService,
        private readonly collectionManager: CollectionManagerService,
    ) { }

    /**
     * Initialize memory collections
     */
    async initialize(): Promise<void> {
        try {
            this.logger.log('🧠 Initializing Memory Collections...');

            // Create user memory collection
            await this.collectionManager.createCollection(
                this.USER_MEMORY_COLLECTION,
                ['memory', 'user'],
                'User long-term memory and preferences',
            );

            // Create session memory collection
            await this.collectionManager.createCollection(
                this.SESSION_MEMORY_COLLECTION,
                ['memory', 'session'],
                'Session summaries and key points',
            );

            this.logger.log('✅ Memory Collections initialized');
        } catch (error) {
            this.logger.error(`Failed to initialize Memory Collections: ${error.message}`);
            throw error;
        }
    }

    /**
     * Store user long-term memory
     */
    async storeUserMemory(
        userId: string,
        summary: string,
        preferences: Record<string, any> = {},
        topics: string[] = [],
        embedding: number[] = [],
    ): Promise<InsertResult> {
        try {
            const startTime = Date.now();
            this.logger.log(`💾 Storing user memory for ${userId}...`);

            const userMemory: UserMemory = {
                userId,
                summary,
                preferences,
                topics,
                lastUpdated: new Date().toISOString(),
            };

            const doc = {
                embedding: embedding.length > 0 ? embedding : this.generateEmbedding(summary),
                pageContent: summary,
                metadata: {
                    userId,
                    type: 'user_memory',
                    preferences: JSON.stringify(preferences),
                    topics: topics.join(','),
                    timestamp: new Date().toISOString(),
                },
            };

            const result = await this.milvusService.insertDocuments(
                this.USER_MEMORY_COLLECTION,
                [doc] as any,
            );

            const endTime = Date.now();
            this.logger.log(`✅ User memory stored in ${endTime - startTime}ms`);

            return result;
        } catch (error) {
            this.logger.error(`Failed to store user memory: ${error.message}`);
            throw error;
        }
    }

    /**
     * Retrieve user long-term memory
     */
    async retrieveUserMemory(userId: string, embedding: number[] = []): Promise<string> {
        try {
            this.logger.log(`🔍 Retrieving user memory for ${userId}...`);

            const searchEmbedding =
                embedding.length > 0 ? embedding : this.generateEmbedding(userId);

            const results = await this.milvusService.search(
                this.USER_MEMORY_COLLECTION,
                searchEmbedding,
                1,
                {
                    field: 'metadata.userId',
                    operator: 'eq',
                    value: userId,
                },
            );

            if (results.length === 0) {
                this.logger.log(`ℹ️ No memory found for user ${userId}`);
                return '';
            }

            this.logger.log(`✅ User memory retrieved`);
            return results[0].pageContent;
        } catch (error) {
            this.logger.error(`Failed to retrieve user memory: ${error.message}`);
            return '';
        }
    }

    /**
     * Store session summary
     */
    async storeSessionSummary(
        sessionId: string,
        userId: string,
        summary: string,
        keyPoints: string[] = [],
        topics: string[] = [],
        embedding: number[] = [],
    ): Promise<InsertResult> {
        try {
            const startTime = Date.now();
            this.logger.log(`💾 Storing session summary for ${sessionId}...`);

            const sessionMemory: SessionMemory = {
                sessionId,
                userId,
                summary,
                keyPoints,
                topics,
                timestamp: new Date().toISOString(),
            };

            const doc = {
                embedding: embedding.length > 0 ? embedding : this.generateEmbedding(summary),
                pageContent: summary,
                metadata: {
                    sessionId,
                    userId,
                    type: 'session_memory',
                    keyPoints: keyPoints.join('|'),
                    topics: topics.join(','),
                    timestamp: new Date().toISOString(),
                },
            };

            const result = await this.milvusService.insertDocuments(
                this.SESSION_MEMORY_COLLECTION,
                [doc] as any,
            );

            const endTime = Date.now();
            this.logger.log(`✅ Session summary stored in ${endTime - startTime}ms`);

            return result;
        } catch (error) {
            this.logger.error(`Failed to store session summary: ${error.message}`);
            throw error;
        }
    }

    /**
     * Retrieve session summary
     */
    async retrieveSessionSummary(sessionId: string, embedding: number[] = []): Promise<string> {
        try {
            this.logger.log(`🔍 Retrieving session summary for ${sessionId}...`);

            const searchEmbedding =
                embedding.length > 0 ? embedding : this.generateEmbedding(sessionId);

            const results = await this.milvusService.search(
                this.SESSION_MEMORY_COLLECTION,
                searchEmbedding,
                1,
                {
                    field: 'metadata.sessionId',
                    operator: 'eq',
                    value: sessionId,
                },
            );

            if (results.length === 0) {
                this.logger.log(`ℹ️ No session summary found for ${sessionId}`);
                return '';
            }

            this.logger.log(`✅ Session summary retrieved`);
            return results[0].pageContent;
        } catch (error) {
            this.logger.error(`Failed to retrieve session summary: ${error.message}`);
            return '';
        }
    }

    /**
     * Get user's session history
     */
    async getUserSessionHistory(userId: string, limit: number = 10): Promise<string[]> {
        try {
            this.logger.log(`📚 Retrieving session history for ${userId}...`);

            const searchEmbedding = this.generateEmbedding(userId);

            const results = await this.milvusService.search(
                this.SESSION_MEMORY_COLLECTION,
                searchEmbedding,
                limit,
                {
                    field: 'metadata.userId',
                    operator: 'eq',
                    value: userId,
                },
            );

            const summaries = results.map((r) => r.pageContent);

            this.logger.log(`✅ Retrieved ${summaries.length} sessions for user ${userId}`);
            return summaries;
        } catch (error) {
            this.logger.error(`Failed to retrieve session history: ${error.message}`);
            return [];
        }
    }

    /**
     * Get memory statistics
     */
    async getMemoryStats(): Promise<object> {
        try {
            this.logger.log('📊 Collecting memory statistics...');

            const userStats = await this.milvusService.getCollectionStats(
                this.USER_MEMORY_COLLECTION,
            );
            const sessionStats = await this.milvusService.getCollectionStats(
                this.SESSION_MEMORY_COLLECTION,
            );

            const stats = {
                userMemory: {
                    collection: this.USER_MEMORY_COLLECTION,
                    rowCount: userStats.rowCount,
                    vectorDim: userStats.vectorDim,
                    indexes: userStats.indexes,
                },
                sessionMemory: {
                    collection: this.SESSION_MEMORY_COLLECTION,
                    rowCount: sessionStats.rowCount,
                    vectorDim: sessionStats.vectorDim,
                    indexes: sessionStats.indexes,
                },
                totalMemories: userStats.rowCount + sessionStats.rowCount,
            };

            this.logger.log(`✅ Memory stats: ${stats.totalMemories} total memories`);
            return stats;
        } catch (error) {
            this.logger.error(`Failed to get memory stats: ${error.message}`);
            throw error;
        }
    }

    /**
     * Clear old session memories (older than specified days)
     */
    async clearOldSessionMemories(daysOld: number = 30): Promise<number> {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysOld);

            this.logger.log(`🗑️ Clearing session memories older than ${daysOld} days...`);

            const deletedCount = await this.milvusService.deleteDocuments(
                this.SESSION_MEMORY_COLLECTION,
                {
                    field: 'metadata.timestamp',
                    operator: 'lt',
                    value: cutoffDate.toISOString(),
                },
            );

            this.logger.log(`✅ Deleted ${deletedCount} old session memories`);
            return deletedCount;
        } catch (error) {
            this.logger.error(`Failed to clear old session memories: ${error.message}`);
            throw error;
        }
    }

    /**
     * Update user memory
     */
    async updateUserMemory(
        userId: string,
        summary: string,
        preferences: Record<string, any> = {},
        topics: string[] = [],
        embedding: number[] = [],
    ): Promise<InsertResult> {
        try {
            this.logger.log(`🔄 Updating user memory for ${userId}...`);

            // Delete old memory
            await this.milvusService.deleteDocuments(this.USER_MEMORY_COLLECTION, {
                field: 'metadata.userId',
                operator: 'eq',
                value: userId,
            });

            // Store new memory
            return await this.storeUserMemory(userId, summary, preferences, topics, embedding);
        } catch (error) {
            this.logger.error(`Failed to update user memory: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate simple embedding for text (fallback)
     * In production, use actual embedding service
     */
    private generateEmbedding(text: string): number[] {
        const embedding = new Array(384).fill(0);

        for (let i = 0; i < text.length; i++) {
            embedding[i % 384] += text.charCodeAt(i) / 1000;
        }

        // Normalize
        const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
        return embedding.map((val) => val / (norm || 1));
    }
}
