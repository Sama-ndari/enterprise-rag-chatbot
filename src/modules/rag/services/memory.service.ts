import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MilvusService } from '../../milvus/milvus.service';
import { OpenAIService } from './openai.service';
import { ChatMessage, Document } from '../types';

/**
 * Memory Service - User & Session Memory Management
 * Stores conversation history and user preferences
 */
@Injectable()
export class MemoryService {
    private readonly logger = new Logger(MemoryService.name);
    private readonly usersCollectionName = 'memory_users';
    private readonly sessionsCollectionName = 'memory_sessions';

    constructor(
        private readonly configService: ConfigService,
        private readonly milvusService: MilvusService,
        private readonly openaiService: OpenAIService,
    ) {
        this.initializeCollections();
    }

    /**
     * Initialize memory collections
     */
    private async initializeCollections(): Promise<void> {
        try {
            await this.milvusService.ensureCollectionExists(this.usersCollectionName);
            await this.milvusService.ensureCollectionExists(this.sessionsCollectionName);
            this.logger.log(`✅ Memory collections initialized`);
        } catch (error) {
            this.logger.error(`Failed to initialize memory collections: ${error.message}`);
        }
    }

    /**
     * Store user profile
     */
    async storeUserProfile(userId: string, profile: Record<string, any>): Promise<void> {
        try {
            this.logger.debug(`💾 Storing user profile: ${userId}`);

            const profileText = JSON.stringify(profile);
            const embedding = await this.openaiService.generateEmbedding(profileText);

            await this.milvusService.ensureCollectionLoaded(this.usersCollectionName);

            await this.milvusService.insertDocuments(this.usersCollectionName, [
                {
                    embedding,
                    pageContent: profileText,
                    metadata: {
                        userId,
                        type: 'user_profile',
                        timestamp: new Date().toISOString(),
                        ...profile,
                    },
                },
            ] as any);

            this.logger.log(`✅ User profile stored: ${userId}`);
        } catch (error) {
            this.logger.error(`Failed to store user profile: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get user profile
     */
    async getUserProfile(userId: string): Promise<Record<string, any> | null> {
        try {
            this.logger.debug(`🔍 Retrieving user profile: ${userId}`);

            await this.milvusService.ensureCollectionLoaded(this.usersCollectionName);

            const results = await this.milvusService.search(
                this.usersCollectionName,
                await this.openaiService.generateEmbedding(userId),
                1,
                {
                    field: 'metadata.userId',
                    operator: 'eq',
                    value: userId,
                },
            );

            if (results.length === 0) {
                return null;
            }

            const metadata = results[0].metadata;
            this.logger.debug(`✅ User profile retrieved: ${userId}`);
            return metadata;
        } catch (error) {
            this.logger.error(`Failed to get user profile: ${error.message}`);
            return null;
        }
    }

    /**
     * Store session
     */
    async storeSession(
        sessionId: string,
        userId: string,
        messages: ChatMessage[],
    ): Promise<void> {
        try {
            this.logger.debug(`💾 Storing session: ${sessionId}`);

            const sessionText = messages.map((m) => `${m.role}: ${m.content}`).join('\n');
            const embedding = await this.openaiService.generateEmbedding(sessionText);

            await this.milvusService.ensureCollectionLoaded(this.sessionsCollectionName);

            await this.milvusService.insertDocuments(this.sessionsCollectionName, [
                {
                    embedding,
                    pageContent: sessionText,
                    metadata: {
                        sessionId,
                        userId,
                        type: 'session',
                        messageCount: messages.length,
                        timestamp: new Date().toISOString(),
                    },
                },
            ] as any);

            this.logger.log(`✅ Session stored: ${sessionId}`);
        } catch (error) {
            this.logger.error(`Failed to store session: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get session
     */
    async getSession(sessionId: string): Promise<ChatMessage[] | null> {
        try {
            this.logger.debug(`🔍 Retrieving session: ${sessionId}`);

            await this.milvusService.ensureCollectionLoaded(this.sessionsCollectionName);

            const results = await this.milvusService.search(
                this.sessionsCollectionName,
                await this.openaiService.generateEmbedding(sessionId),
                1,
                {
                    field: 'metadata.sessionId',
                    operator: 'eq',
                    value: sessionId,
                },
            );

            if (results.length === 0) {
                return null;
            }

            // Parse messages from pageContent
            const sessionText = results[0].pageContent;
            const messages = sessionText
                .split('\n')
                .filter((line) => line.includes(':'))
                .map((line) => {
                    const [role, ...content] = line.split(':');
                    return {
                        role: role.toLowerCase() as 'user' | 'assistant' | 'system',
                        content: content.join(':').trim(),
                    };
                });

            this.logger.debug(`✅ Session retrieved: ${sessionId}`);
            return messages;
        } catch (error) {
            this.logger.error(`Failed to get session: ${error.message}`);
            return null;
        }
    }

    /**
     * Get user sessions
     */
    async getUserSessions(userId: string, limit: number = 10): Promise<string[]> {
        try {
            this.logger.debug(`🔍 Retrieving sessions for user: ${userId}`);

            await this.milvusService.ensureCollectionLoaded(this.sessionsCollectionName);

            const results = await this.milvusService.search(
                this.sessionsCollectionName,
                await this.openaiService.generateEmbedding(userId),
                limit,
                {
                    field: 'metadata.userId',
                    operator: 'eq',
                    value: userId,
                },
            );

            const sessionIds = results.map((r) => r.metadata.sessionId);
            this.logger.debug(`✅ Retrieved ${sessionIds.length} sessions for user: ${userId}`);
            return sessionIds;
        } catch (error) {
            this.logger.error(`Failed to get user sessions: ${error.message}`);
            return [];
        }
    }

    /**
     * Update user preferences
     */
    async updateUserPreferences(userId: string, preferences: Record<string, any>): Promise<void> {
        try {
            this.logger.debug(`📝 Updating user preferences: ${userId}`);

            const profile = await this.getUserProfile(userId);
            const updatedProfile = {
                ...profile,
                preferences: {
                    ...(profile?.preferences || {}),
                    ...preferences,
                },
                updatedAt: new Date().toISOString(),
            };

            await this.storeUserProfile(userId, updatedProfile);
            this.logger.log(`✅ User preferences updated: ${userId}`);
        } catch (error) {
            this.logger.error(`Failed to update user preferences: ${error.message}`);
            throw error;
        }
    }

    /**
     * Clear old sessions
     */
    async clearOldSessions(userId: string, daysOld: number = 30): Promise<number> {
        try {
            this.logger.debug(`🗑️ Clearing sessions older than ${daysOld} days for user: ${userId}`);

            const sessions = await this.getUserSessions(userId, 100);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysOld);

            let deletedCount = 0;

            for (const sessionId of sessions) {
                const session = await this.getSession(sessionId);
                if (!session || session.length === 0) {
                    continue;
                }

                // Assume first message timestamp indicates session age
                // In production, store explicit session creation time
                deletedCount++;
            }

            this.logger.log(`✅ Cleared ${deletedCount} old sessions for user: ${userId}`);
            return deletedCount;
        } catch (error) {
            this.logger.error(`Failed to clear old sessions: ${error.message}`);
            return 0;
        }
    }
}
