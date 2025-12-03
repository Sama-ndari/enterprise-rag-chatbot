import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ChatMessage, EmbeddingResponse } from '../types';

/**
 * OpenAI Service - Native OpenAI SDK Integration
 */
@Injectable()
export class OpenAIService {
    private readonly logger = new Logger(OpenAIService.name);
    private client: OpenAI;
    private embeddingModel: string;
    private chatModel: string;

    constructor(private readonly configService: ConfigService) {
        this.initializeClient();
    }

    /**
     * Initialize OpenAI client
     */
    private initializeClient(): void {
        const apiKey = this.configService.get<string>('OPENAI_API_KEY');
        const baseUrl = this.configService.get<string>('OPENAI_BASE_URL') || 'https://api.openai.com/v1';

        if (!apiKey) {
            throw new Error('OPENAI_API_KEY environment variable is not set');
        }

        this.embeddingModel = this.configService.get<string>('OPENAI_EMBEDDING_MODEL') || 'text-embedding-3-large';
        this.chatModel = this.configService.get<string>('OPENAI_MODEL') || 'gpt-4-turbo';

        this.client = new OpenAI({
            apiKey,
            baseURL: baseUrl,
        });

        this.logger.log(`✅ OpenAI client initialized`);
        this.logger.log(`📊 Embedding model: ${this.embeddingModel}`);
        this.logger.log(`💬 Chat model: ${this.chatModel}`);
    }

    /**
     * Generate embedding for text
     */
    async generateEmbedding(text: string): Promise<number[]> {
        try {
            this.logger.debug(`🔄 Generating embedding for text (${text.length} chars)`);

            const response = await this.client.embeddings.create({
                model: this.embeddingModel,
                input: text,
                encoding_format: 'float',
            });

            const embedding = response.data[0].embedding as number[];

            this.logger.debug(`✅ Embedding generated (${embedding.length} dimensions)`);
            return embedding;
        } catch (error) {
            this.logger.error(`❌ Failed to generate embedding: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate embeddings for multiple texts
     */
    async generateEmbeddings(texts: string[]): Promise<number[][]> {
        try {
            this.logger.debug(`🔄 Generating embeddings for ${texts.length} texts`);

            const response = await this.client.embeddings.create({
                model: this.embeddingModel,
                input: texts,
                encoding_format: 'float',
            });

            const embeddings = response.data
                .sort((a, b) => a.index - b.index)
                .map((item) => item.embedding as number[]);

            this.logger.debug(`✅ Generated ${embeddings.length} embeddings`);
            return embeddings;
        } catch (error) {
            this.logger.error(`❌ Failed to generate embeddings: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate chat response
     */
    async generateChatResponse(
        messages: ChatMessage[],
        options?: {
            temperature?: number;
            maxTokens?: number;
            topP?: number;
        },
    ): Promise<string> {
        try {
            this.logger.debug(`💬 Generating chat response (${messages.length} messages)`);

            const response = await this.client.chat.completions.create({
                model: this.chatModel,
                messages: messages.map((m) => ({
                    role: m.role,
                    content: m.content,
                })),
                temperature: options?.temperature ?? 0.7,
                max_tokens: options?.maxTokens ?? 2000,
                top_p: options?.topP ?? 1,
            });

            const content = response.choices[0].message.content || '';

            this.logger.debug(`✅ Chat response generated`);
            this.logger.debug(`📊 Tokens used: ${response.usage?.total_tokens || 0}`);

            return content;
        } catch (error) {
            this.logger.error(`❌ Failed to generate chat response: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate RAG response (question + context)
     */
    async generateRagResponse(
        question: string,
        contextChunks: string[],
        options?: {
            temperature?: number;
            maxTokens?: number;
        },
    ): Promise<string> {
        try {
            this.logger.debug(`🔍 Generating RAG response for: "${question}"`);
            this.logger.debug(`📚 Using ${contextChunks.length} context chunks`);

            const contextText = contextChunks.join('\n\n---\n\n');

            const systemPrompt = `You are a helpful AI assistant. Answer the user's question based on the provided context.
If the context doesn't contain relevant information, say so clearly.
Be concise and accurate.`;

            const userPrompt = `Context:
${contextText}

Question: ${question}

Answer:`;

            const messages: ChatMessage[] = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ];

            const response = await this.generateChatResponse(messages, {
                temperature: options?.temperature ?? 0.5,
                maxTokens: options?.maxTokens ?? 1500,
            });

            this.logger.debug(`✅ RAG response generated`);
            return response;
        } catch (error) {
            this.logger.error(`❌ Failed to generate RAG response: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get embedding dimensions
     */
    async getEmbeddingDimensions(): Promise<number> {
        try {
            this.logger.debug(`📏 Calculating embedding dimensions...`);
            const embedding = await this.generateEmbedding('test');
            const dimensions = embedding.length;
            this.logger.log(`✅ Embedding dimensions: ${dimensions}`);
            return dimensions;
        } catch (error) {
            this.logger.error(`❌ Failed to get embedding dimensions: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get model info
     */
    getModelInfo(): { embedding: string; chat: string } {
        return {
            embedding: this.embeddingModel,
            chat: this.chatModel,
        };
    }
}
