import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Chunk, ChunkingOptions } from '../types';

/**
 * Text Chunker Service - Custom Implementation
 */
@Injectable()
export class ChunkerService {
    private readonly logger = new Logger(ChunkerService.name);
    private readonly defaultChunkSize: number;
    private readonly defaultOverlap: number;

    constructor(private readonly configService: ConfigService) {
        this.defaultChunkSize = parseInt(this.configService.get<string>('RAG_CHUNK_SIZE') || '1000', 10);
        this.defaultOverlap = parseInt(this.configService.get<string>('RAG_CHUNK_OVERLAP') || '200', 10);
    }

    /**
     * Chunk text with overlap
     */
    chunkText(
        text: string,
        options: ChunkingOptions = {
            chunkSize: this.defaultChunkSize,
            overlap: this.defaultOverlap,
            separator: '\n\n',
        },
    ): Chunk[] {
        try {
            this.logger.debug(`📄 Chunking text (${text.length} chars) with size=${options.chunkSize}, overlap=${options.overlap}`);

            const chunks: Chunk[] = [];
            const separator = options.separator || '\n\n';
            const chunkSize = options.chunkSize;
            const overlap = options.overlap;

            // Split by separator first
            const parts = text.split(separator);
            let currentChunk = '';
            let startIndex = 0;

            for (const part of parts) {
                // If adding this part would exceed chunk size, save current chunk
                if (currentChunk.length + part.length + separator.length > chunkSize && currentChunk.length > 0) {
                    const chunk: Chunk = {
                        id: `chunk_${chunks.length}`,
                        text: currentChunk.trim(),
                        startIndex,
                        endIndex: startIndex + currentChunk.length,
                        metadata: {
                            chunkIndex: chunks.length,
                            totalChunks: 0, // Will be updated later
                        },
                    };
                    chunks.push(chunk);

                    // Start new chunk with overlap
                    const overlapText = currentChunk.slice(-overlap);
                    currentChunk = overlapText + separator + part;
                    startIndex += chunk.text.length - overlap;
                } else {
                    // Add to current chunk
                    if (currentChunk.length > 0) {
                        currentChunk += separator;
                    }
                    currentChunk += part;
                }
            }

            // Add remaining chunk
            if (currentChunk.trim().length > 0) {
                const chunk: Chunk = {
                    id: `chunk_${chunks.length}`,
                    text: currentChunk.trim(),
                    startIndex,
                    endIndex: startIndex + currentChunk.length,
                    metadata: {
                        chunkIndex: chunks.length,
                        totalChunks: chunks.length + 1,
                    },
                };
                chunks.push(chunk);
            }

            // Update total chunks count
            chunks.forEach((chunk) => {
                chunk.metadata.totalChunks = chunks.length;
            });

            this.logger.log(`✅ Created ${chunks.length} chunks`);
            this.logger.debug(`📊 Chunk sizes: min=${Math.min(...chunks.map((c) => c.text.length))}, max=${Math.max(...chunks.map((c) => c.text.length))}`);

            return chunks;
        } catch (error) {
            this.logger.error(`❌ Failed to chunk text: ${error.message}`);
            throw error;
        }
    }

    /**
     * Chunk by character count (simple approach)
     */
    chunkByCharCount(
        text: string,
        chunkSize?: number,
        overlap?: number,
    ): Chunk[] {
        const finalChunkSize = chunkSize ?? this.defaultChunkSize;
        const finalOverlap = overlap ?? this.defaultOverlap;
        try {
            this.logger.debug(`📄 Chunking by character count (${text.length} chars)`);

            const chunks: Chunk[] = [];
            let startIndex = 0;

            while (startIndex < text.length) {
                const endIndex = Math.min(startIndex + finalChunkSize, text.length);
                const chunkText = text.substring(startIndex, endIndex);

                const chunk: Chunk = {
                    id: `chunk_${chunks.length}`,
                    text: chunkText.trim(),
                    startIndex,
                    endIndex,
                    metadata: {
                        chunkIndex: chunks.length,
                    },
                };

                chunks.push(chunk);

                // Move start index, accounting for overlap
                startIndex = endIndex - finalOverlap;

                // Prevent infinite loop
                if (startIndex >= endIndex) {
                    break;
                }
            }

            this.logger.log(`✅ Created ${chunks.length} chunks by character count`);
            return chunks;
        } catch (error) {
            this.logger.error(`❌ Failed to chunk by character count: ${error.message}`);
            throw error;
        }
    }

    /**
     * Chunk by sentences
     */
    chunkBySentences(
        text: string,
        sentencesPerChunk: number = 5,
        overlap: number = 1,
    ): Chunk[] {
        try {
            this.logger.debug(`📄 Chunking by sentences (${sentencesPerChunk} per chunk)`);

            // Simple sentence splitting (can be improved with better regex)
            const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

            const chunks: Chunk[] = [];
            let startIndex = 0;

            for (let i = 0; i < sentences.length; i += sentencesPerChunk - overlap) {
                const chunkSentences = sentences.slice(i, i + sentencesPerChunk);
                const chunkText = chunkSentences.join(' ').trim();

                if (chunkText.length > 0) {
                    const chunk: Chunk = {
                        id: `chunk_${chunks.length}`,
                        text: chunkText,
                        startIndex,
                        endIndex: startIndex + chunkText.length,
                        metadata: {
                            chunkIndex: chunks.length,
                            sentenceCount: chunkSentences.length,
                        },
                    };

                    chunks.push(chunk);
                    startIndex += chunkText.length;
                }
            }

            this.logger.log(`✅ Created ${chunks.length} chunks by sentences`);
            return chunks;
        } catch (error) {
            this.logger.error(`❌ Failed to chunk by sentences: ${error.message}`);
            throw error;
        }
    }

    /**
     * Estimate token count (rough approximation)
     * 1 token ≈ 4 characters
     */
    estimateTokenCount(text: string): number {
        return Math.ceil(text.length / 4);
    }

    /**
     * Validate chunk size
     */
    validateChunkSize(chunkSize: number, minSize: number = 100, maxSize: number = 10000): boolean {
        return chunkSize >= minSize && chunkSize <= maxSize;
    }
}
