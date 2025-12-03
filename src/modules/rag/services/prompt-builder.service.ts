import { Injectable, Logger } from '@nestjs/common';

/**
 * Prompt Builder Service - Professional Prompt Templates
 * Centralized prompt management for RAG pipeline
 */
@Injectable()
export class PromptBuilderService {
    private readonly logger = new Logger(PromptBuilderService.name);

    /**
     * Build system prompt for RAG response generation
     */
    buildRagSystemPrompt(context?: string): string {
        return `You are a professional AI assistant with expertise in providing accurate, helpful, and well-structured responses.

Your responsibilities:
1. Answer questions based on the provided context
2. Be clear, concise, and professional
3. Cite sources when relevant
4. Admit when you don't know something
5. Provide structured responses when appropriate

Guidelines:
- Use the provided context to inform your answer
- If the context doesn't contain relevant information, say so clearly
- Structure complex answers with bullet points or numbered lists
- Maintain a professional and helpful tone
- Be accurate and avoid speculation`;
    }

    /**
     * Build user prompt for RAG query
     */
    buildRagUserPrompt(question: string, context: string): string {
        return `Context:
${context}

Question: ${question}

Please provide a comprehensive answer based on the context above.`;
    }

    /**
     * Build query rephrasing prompt
     */
    buildRephrasingPrompt(): string {
        return `You are a query optimization assistant. Your task is to rephrase user queries to be more specific, detailed, and suitable for document retrieval.

Instructions:
1. Expand the query with relevant context
2. Keep the core meaning intact
3. Make it more specific for better search results
4. Return ONLY the rephrased query, no additional text
5. Do not add explanations or meta-commentary

Example:
Input: "What is AI?"
Output: "What is artificial intelligence and what are its main applications in modern technology?"`;
    }

    /**
     * Build summarization prompt
     */
    buildSummarizationPrompt(): string {
        return `You are a professional summarization expert. Create a concise, well-structured summary of the provided documents.

Instructions:
1. Capture the main ideas and key points
2. Maintain accuracy and context
3. Use clear, professional language
4. Organize information logically
5. Keep the summary concise but comprehensive
6. Return ONLY the summary, no additional commentary`;
    }

    /**
     * Build multi-collection context prompt
     */
    buildMultiCollectionPrompt(question: string, contexts: Map<string, string>): string {
        let prompt = `Question: ${question}\n\nContext from multiple sources:\n\n`;

        for (const [collection, context] of contexts) {
            prompt += `From ${collection}:\n${context}\n\n`;
        }

        prompt += `Please provide a comprehensive answer synthesizing information from all sources.`;
        return prompt;
    }

    /**
     * Build fact-checking prompt
     */
    buildFactCheckingPrompt(statement: string, context: string): string {
        return `Fact-Check the following statement against the provided context:

Statement: "${statement}"

Context:
${context}

Provide:
1. Verdict: True/False/Partially True/Cannot Determine
2. Explanation: Brief explanation of your verdict
3. Evidence: Relevant quotes from context if applicable`;
    }

    /**
     * Build comparison prompt
     */
    buildComparisonPrompt(items: string[], context: string): string {
        return `Compare the following items based on the provided context:

Items to compare:
${items.map((item, i) => `${i + 1}. ${item}`).join('\n')}

Context:
${context}

Provide a structured comparison highlighting similarities, differences, and key characteristics.`;
    }

    /**
     * Build analysis prompt
     */
    buildAnalysisPrompt(topic: string, context: string): string {
        return `Provide a detailed analysis of the following topic based on the context:

Topic: ${topic}

Context:
${context}

Include:
1. Overview
2. Key Points
3. Implications
4. Potential Issues
5. Recommendations`;
    }

    /**
     * Build explanation prompt
     */
    buildExplanationPrompt(concept: string, context: string, targetAudience: string = 'general'): string {
        return `Explain the following concept to a ${targetAudience} audience:

Concept: ${concept}

Context:
${context}

Provide:
1. Simple definition
2. Key characteristics
3. Real-world examples
4. Why it matters
5. Common misconceptions`;
    }

    /**
     * Build Q&A prompt
     */
    buildQAPrompt(question: string, context: string): string {
        return `Answer the following question based on the provided context:

Question: ${question}

Context:
${context}

Requirements:
1. Be direct and concise
2. Use the context to support your answer
3. If the context doesn't contain the answer, say so
4. Provide relevant details
5. Maintain professional tone`;
    }

    /**
     * Build extraction prompt
     */
    buildExtractionPrompt(extractionType: string, context: string): string {
        return `Extract ${extractionType} from the following context:

Context:
${context}

Provide the extracted information in a structured format.
Return ONLY the extracted data, no additional commentary.`;
    }

    /**
     * Build classification prompt
     */
    buildClassificationPrompt(text: string, categories: string[], context?: string): string {
        let prompt = `Classify the following text into one of these categories:

Categories:
${categories.map((cat, i) => `${i + 1}. ${cat}`).join('\n')}

Text: "${text}"`;

        if (context) {
            prompt += `\n\nContext:\n${context}`;
        }

        prompt += `\n\nProvide ONLY the category number and name, no explanation.`;
        return prompt;
    }

    /**
     * Format messages for chat completion
     */
    formatMessages(
        systemPrompt: string,
        userMessage: string,
        conversationHistory?: Array<{ role: string; content: string }>,
    ): Array<{ role: string; content: string }> {
        const messages: Array<{ role: string; content: string }> = [
            { role: 'system', content: systemPrompt },
        ];

        if (conversationHistory && conversationHistory.length > 0) {
            messages.push(...conversationHistory);
        }

        messages.push({ role: 'user', content: userMessage });

        return messages;
    }

    /**
     * Build streaming prompt
     */
    buildStreamingPrompt(question: string, context: string): string {
        return `${this.buildRagSystemPrompt()}\n\n---\n\n${this.buildRagUserPrompt(question, context)}`;
    }

    /**
     * Get prompt templates registry
     */
    getPromptRegistry(): Record<string, (params: any) => string> {
        return {
            rag: (params) => this.buildRagUserPrompt(params.question, params.context),
            rephrase: () => this.buildRephrasingPrompt(),
            summarize: () => this.buildSummarizationPrompt(),
            factCheck: (params) => this.buildFactCheckingPrompt(params.statement, params.context),
            compare: (params) => this.buildComparisonPrompt(params.items, params.context),
            analyze: (params) => this.buildAnalysisPrompt(params.topic, params.context),
            explain: (params) => this.buildExplanationPrompt(params.concept, params.context, params.audience),
            qa: (params) => this.buildQAPrompt(params.question, params.context),
            extract: (params) => this.buildExtractionPrompt(params.type, params.context),
            classify: (params) => this.buildClassificationPrompt(params.text, params.categories, params.context),
        };
    }
}
