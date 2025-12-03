import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(RedisService.name);
    private client: RedisClientType;
    private isConnected = false;

    constructor(private readonly configService: ConfigService) { }

    async onModuleInit() {
        await this.connect();
    }

    async onModuleDestroy() {
        await this.disconnect();
    }

    private async connect() {
        try {
            const host = this.configService.get<string>('REDIS_HOST') || 'localhost';
            const port = this.configService.get<number>('REDIS_PORT') || 6379;

            this.client = createClient({
                socket: {
                    host,
                    port,
                    reconnectStrategy: (retries) => Math.min(retries * 50, 500),
                },
            });

            this.client.on('error', (err) => {
                this.logger.error('Redis client error:', err);
            });

            this.client.on('connect', () => {
                this.logger.log('✅ Redis connected successfully');
                this.isConnected = true;
            });

            await this.client.connect();
        } catch (error) {
            this.logger.error('Failed to connect to Redis:', error.message);
            throw error;
        }
    }

    private async disconnect() {
        if (this.client && this.isConnected) {
            await this.client.quit();
            this.logger.log('Redis disconnected');
        }
    }

    /**
     * Store chat history for a session
     */
    async saveChatHistory(sessionId: string, messages: ChatMessage[]): Promise<void> {
        try {
            const key = `chat:${sessionId}`;
            const ttl = 24 * 60 * 60; // 24 hours
            await this.client.setEx(key, ttl, JSON.stringify(messages));
            this.logger.debug(`💾 Saved chat history for session ${sessionId}`);
        } catch (error) {
            this.logger.error(`Failed to save chat history for session ${sessionId}:`, error.message);
            throw error;
        }
    }

    /**
     * Retrieve chat history for a session
     */
    async getChatHistory(sessionId: string): Promise<ChatMessage[]> {
        try {
            const key = `chat:${sessionId}`;
            const data = await this.client.get(key);
            if (!data) {
                return [];
            }
            return JSON.parse(data) as ChatMessage[];
        } catch (error) {
            this.logger.error(`Failed to retrieve chat history for session ${sessionId}:`, error.message);
            return [];
        }
    }

    /**
     * Add a message to chat history
     */
    async addMessage(sessionId: string, message: ChatMessage): Promise<void> {
        try {
            const history = await this.getChatHistory(sessionId);
            history.push(message);
            await this.saveChatHistory(sessionId, history);
            this.logger.debug(`📝 Added message to session ${sessionId}`);
        } catch (error) {
            this.logger.error(`Failed to add message to session ${sessionId}:`, error.message);
            throw error;
        }
    }

    /**
     * Cache query response
     */
    async cacheResponse(query: string, collection: string, response: string, ttl = 3600): Promise<void> {
        try {
            const key = `cache:${collection}:${this.hashQuery(query)}`;
            await this.client.setEx(key, ttl, response);
            this.logger.debug(`💾 Cached response for query in collection ${collection}`);
        } catch (error) {
            this.logger.error(`Failed to cache response:`, error.message);
            throw error;
        }
    }

    /**
     * Get cached response
     */
    async getCachedResponse(query: string, collection: string): Promise<string | null> {
        try {
            const key = `cache:${collection}:${this.hashQuery(query)}`;
            const cached = await this.client.get(key);
            if (cached) {
                this.logger.debug(`✅ Cache hit for query in collection ${collection}`);
            }
            return cached;
        } catch (error) {
            this.logger.error(`Failed to retrieve cached response:`, error.message);
            return null;
        }
    }

    /**
     * Clear cache for a collection
     */
    async clearCollectionCache(collection: string): Promise<void> {
        try {
            const pattern = `cache:${collection}:*`;
            const keys = await this.client.keys(pattern);
            if (keys.length > 0) {
                await this.client.del(keys);
                this.logger.log(`🗑️ Cleared ${keys.length} cache entries for collection ${collection}`);
            }
        } catch (error) {
            this.logger.error(`Failed to clear cache for collection ${collection}:`, error.message);
            throw error;
        }
    }

    /**
     * Simple hash function for query caching
     */
    private hashQuery(query: string): string {
        let hash = 0;
        for (let i = 0; i < query.length; i++) {
            const char = query.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(16);
    }

    /**
     * Check if Redis is connected
     */
    isReady(): boolean {
        return this.isConnected;
    }
}
