import { Injectable, Logger } from '@nestjs/common';
import { OpenAIService } from './openai.service';
import { SearchResult } from '../types';

/**
 * Reranker Service - Professional Result Reranking
 * Reranks search results based on relevance to query
 */
@Injectable()
export class RerankerService {
    private readonly logger = new Logger(RerankerService.name);

    constructor(private readonly openaiService: OpenAIService) { }

    /**
     * Rerank search results based on query relevance
     */
    async rerank(
        query: string,
        results: SearchResult[],
        topK: number = 5,
    ): Promise<SearchResult[]> {
        try {
            if (results.length === 0) {
                return [];
            }

            this.logger.debug(`🔄 Reranking ${results.length} results for query: "${query}"`);

            // Calculate relevance scores
            const scoredResults = await Promise.all(
                results.map(async (result) => ({
                    ...result,
                    relevanceScore: await this.calculateRelevance(query, result.text),
                })),
            );

            // Sort by relevance score (descending)
            const reranked = scoredResults
                .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
                .slice(0, topK)
                .map(({ relevanceScore, ...result }) => result);

            this.logger.debug(`✅ Reranked ${reranked.length} results`);
            return reranked;
        } catch (error) {
            this.logger.error(`Failed to rerank results: ${error.message}`);
            // Return original results if reranking fails
            return results.slice(0, topK);
        }
    }

    /**
     * Calculate relevance score between query and text
     */
    private async calculateRelevance(query: string, text: string): Promise<number> {
        try {
            // Simple relevance calculation based on keyword matching
            const queryTerms = query.toLowerCase().split(/\s+/);
            const textLower = text.toLowerCase();

            let matchCount = 0;
            for (const term of queryTerms) {
                if (term.length > 2 && textLower.includes(term)) {
                    matchCount++;
                }
            }

            // Calculate relevance score (0-1)
            const relevanceScore = queryTerms.length > 0 ? matchCount / queryTerms.length : 0;

            // Boost score based on text length (longer texts with matches are more relevant)
            const lengthBoost = Math.min(text.length / 1000, 1) * 0.2;

            return Math.min(relevanceScore + lengthBoost, 1);
        } catch (error) {
            this.logger.debug(`Error calculating relevance: ${error.message}`);
            return 0;
        }
    }

    /**
     * Semantic reranking using embeddings
     */
    async semanticRerank(
        query: string,
        results: SearchResult[],
        topK: number = 5,
    ): Promise<SearchResult[]> {
        try {
            if (results.length === 0) {
                return [];
            }

            this.logger.debug(`🔄 Semantic reranking ${results.length} results`);

            // Generate query embedding
            const queryEmbedding = await this.openaiService.generateEmbedding(query);

            // Calculate similarity scores
            const scoredResults = results.map((result) => ({
                ...result,
                semanticScore: this.cosineSimilarity(
                    queryEmbedding,
                    result.embedding || [],
                ),
            }));

            // Sort by semantic score (descending)
            const reranked = scoredResults
                .sort((a, b) => (b.semanticScore || 0) - (a.semanticScore || 0))
                .slice(0, topK)
                .map(({ semanticScore, ...result }) => result);

            this.logger.debug(`✅ Semantic reranked ${reranked.length} results`);
            return reranked;
        } catch (error) {
            this.logger.error(`Failed to semantic rerank: ${error.message}`);
            return results.slice(0, topK);
        }
    }

    /**
     * Hybrid reranking (keyword + semantic)
     */
    async hybridRerank(
        query: string,
        results: SearchResult[],
        topK: number = 5,
        keywordWeight: number = 0.3,
        semanticWeight: number = 0.7,
    ): Promise<SearchResult[]> {
        try {
            if (results.length === 0) {
                return [];
            }

            this.logger.debug(`🔄 Hybrid reranking ${results.length} results`);

            // Calculate keyword scores
            const queryTerms = query.toLowerCase().split(/\s+/);
            const keywordScores = results.map((result) => {
                let matchCount = 0;
                const textLower = result.text.toLowerCase();
                for (const term of queryTerms) {
                    if (term.length > 2 && textLower.includes(term)) {
                        matchCount++;
                    }
                }
                return queryTerms.length > 0 ? matchCount / queryTerms.length : 0;
            });

            // Calculate semantic scores
            const queryEmbedding = await this.openaiService.generateEmbedding(query);
            const semanticScores = results.map((result) =>
                this.cosineSimilarity(queryEmbedding, result.embedding || []),
            );

            // Combine scores
            const hybridScores = results.map((_, i) => {
                const keywordScore = keywordScores[i] || 0;
                const semanticScore = semanticScores[i] || 0;
                return keywordScore * keywordWeight + semanticScore * semanticWeight;
            });

            // Sort by hybrid score
            const reranked = results
                .map((result, i) => ({ result, score: hybridScores[i] }))
                .sort((a, b) => b.score - a.score)
                .slice(0, topK)
                .map(({ result }) => result);

            this.logger.debug(`✅ Hybrid reranked ${reranked.length} results`);
            return reranked;
        } catch (error) {
            this.logger.error(`Failed to hybrid rerank: ${error.message}`);
            return results.slice(0, topK);
        }
    }

    /**
     * Diversity reranking (reduce duplicate/similar results)
     */
    async diversityRerank(
        results: SearchResult[],
        topK: number = 5,
        similarityThreshold: number = 0.8,
    ): Promise<SearchResult[]> {
        try {
            if (results.length === 0) {
                return [];
            }

            this.logger.debug(`🔄 Diversity reranking ${results.length} results`);

            const selected: SearchResult[] = [];
            const selectedEmbeddings: number[][] = [];

            for (const result of results) {
                if (selected.length >= topK) {
                    break;
                }

                // Check similarity with already selected results
                let isDuplicate = false;
                for (const selectedEmbedding of selectedEmbeddings) {
                    const similarity = this.cosineSimilarity(
                        result.embedding || [],
                        selectedEmbedding,
                    );
                    if (similarity > similarityThreshold) {
                        isDuplicate = true;
                        break;
                    }
                }

                if (!isDuplicate) {
                    selected.push(result);
                    if (result.embedding) {
                        selectedEmbeddings.push(result.embedding);
                    }
                }
            }

            this.logger.debug(`✅ Diversity reranked to ${selected.length} results`);
            return selected;
        } catch (error) {
            this.logger.error(`Failed to diversity rerank: ${error.message}`);
            return results.slice(0, topK);
        }
    }

    /**
     * Calculate cosine similarity between two vectors
     */
    private cosineSimilarity(a: number[], b: number[]): number {
        if (a.length === 0 || b.length === 0) {
            return 0;
        }

        if (a.length !== b.length) {
            return 0;
        }

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        const denominator = Math.sqrt(normA) * Math.sqrt(normB);

        if (denominator === 0) {
            return 0;
        }

        return dotProduct / denominator;
    }

    /**
     * Get reranking strategies
     */
    getStrategies(): string[] {
        return ['keyword', 'semantic', 'hybrid', 'diversity'];
    }
}
