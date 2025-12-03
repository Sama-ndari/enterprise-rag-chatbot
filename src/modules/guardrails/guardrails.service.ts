import { Injectable, Logger } from '@nestjs/common';
import { guardrailsConfig } from '../../config/guardrails.config';

export interface ValidationResult {
    valid: boolean;
    reason?: string;
    violations?: string[];
}

@Injectable()
export class GuardrailsService {
    private readonly logger = new Logger(GuardrailsService.name);
    private rateLimitMap: Map<string, { count: number; resetTime: number }> = new Map();

    /**
     * Validate user input
     */
    async validateInput(query: string, userId?: string): Promise<ValidationResult> {
        try {
            this.logger.log(`🔍 Validating input: "${query.substring(0, 50)}..."`);

            const violations: string[] = [];

            // Check length
            if (query.length > guardrailsConfig.input.maxLength) {
                violations.push(
                    `Query too long (${query.length} > ${guardrailsConfig.input.maxLength} chars)`,
                );
            }

            if (query.length < guardrailsConfig.input.minLength) {
                violations.push(`Query too short (minimum ${guardrailsConfig.input.minLength} char)`);
            }

            // Check for prompt injection
            if (guardrailsConfig.input.checkPromptInjection) {
                const injectionCheck = this.checkPromptInjection(query);
                if (!injectionCheck.valid) {
                    violations.push(...(injectionCheck.violations || []));
                }
            }

            // Check for blocked keywords
            const keywordCheck = this.checkBlockedKeywords(query);
            if (!keywordCheck.valid) {
                violations.push(...(keywordCheck.violations || []));
            }

            // Check rate limit
            if (userId && guardrailsConfig.rateLimit.enabled) {
                const rateLimitCheck = this.checkRateLimit(userId);
                if (!rateLimitCheck.valid) {
                    violations.push(...(rateLimitCheck.violations || []));
                }
            }

            const isValid = violations.length === 0;

            if (isValid) {
                this.logger.log(`✅ Input validation passed`);
            } else {
                this.logger.warn(`⚠️ Input validation failed: ${violations.join(', ')}`);
            }

            return {
                valid: isValid,
                reason: violations.length > 0 ? violations[0] : undefined,
                violations: violations.length > 0 ? violations : undefined,
            };
        } catch (error) {
            this.logger.error(`Error validating input: ${error.message}`);
            return { valid: false, reason: 'Validation error' };
        }
    }

    /**
     * Validate LLM output
     */
    async validateOutput(response: string): Promise<ValidationResult> {
        try {
            this.logger.log(`🔍 Validating output: "${response.substring(0, 50)}..."`);

            const violations: string[] = [];

            // Check length
            if (response.length > guardrailsConfig.output.maxLength) {
                violations.push(
                    `Response too long (${response.length} > ${guardrailsConfig.output.maxLength} chars)`,
                );
            }

            // Check for confidential information
            if (guardrailsConfig.output.checkConfidentialInfo) {
                const confidentialCheck = this.checkConfidentialInfo(response);
                if (!confidentialCheck.valid) {
                    violations.push(...(confidentialCheck.violations || []));
                }
            }

            const isValid = violations.length === 0;

            if (isValid) {
                this.logger.log(`✅ Output validation passed`);
            } else {
                this.logger.warn(`⚠️ Output validation failed: ${violations.join(', ')}`);
            }

            return {
                valid: isValid,
                reason: violations.length > 0 ? violations[0] : undefined,
                violations: violations.length > 0 ? violations : undefined,
            };
        } catch (error) {
            this.logger.error(`Error validating output: ${error.message}`);
            return { valid: false, reason: 'Validation error' };
        }
    }

    /**
     * Check for prompt injection attempts
     */
    private checkPromptInjection(query: string): ValidationResult {
        const violations: string[] = [];

        for (const pattern of guardrailsConfig.promptInjectionPatterns) {
            if (pattern.pattern.test(query)) {
                violations.push(`Potential ${pattern.name}: ${pattern.description}`);
            }
        }

        return {
            valid: violations.length === 0,
            violations: violations.length > 0 ? violations : undefined,
        };
    }

    /**
     * Check for blocked keywords
     */
    private checkBlockedKeywords(query: string): ValidationResult {
        const violations: string[] = [];
        const lowerQuery = query.toLowerCase();

        for (const keyword of guardrailsConfig.blockedKeywords) {
            if (lowerQuery.includes(keyword.toLowerCase())) {
                violations.push(`Blocked keyword detected: "${keyword}"`);
            }
        }

        return {
            valid: violations.length === 0,
            violations: violations.length > 0 ? violations : undefined,
        };
    }

    /**
     * Check for confidential information
     */
    private checkConfidentialInfo(response: string): ValidationResult {
        const violations: string[] = [];

        for (const pattern of guardrailsConfig.confidentialPatterns) {
            if (pattern.pattern.test(response)) {
                violations.push(`Potential ${pattern.name} detected: ${pattern.description}`);
                // Reset pattern for next test
                pattern.pattern.lastIndex = 0;
            }
        }

        return {
            valid: violations.length === 0,
            violations: violations.length > 0 ? violations : undefined,
        };
    }

    /**
     * Check rate limit for user
     */
    private checkRateLimit(userId: string): ValidationResult {
        const now = Date.now();
        const userLimit = this.rateLimitMap.get(userId);

        if (!userLimit || now > userLimit.resetTime) {
            // Reset or create new entry
            this.rateLimitMap.set(userId, {
                count: 1,
                resetTime: now + 60000, // 1 minute
            });
            return { valid: true };
        }

        userLimit.count++;

        if (userLimit.count > guardrailsConfig.rateLimit.perMinute) {
            return {
                valid: false,
                violations: [
                    `Rate limit exceeded: ${userLimit.count}/${guardrailsConfig.rateLimit.perMinute} queries per minute`,
                ],
            };
        }

        return { valid: true };
    }

    /**
     * Check business rules with dynamic RBAC
     */
    async checkBusinessRules(
        query: string,
        userId: string,
        collection: string,
        userRole: string = 'guest',
    ): Promise<ValidationResult> {
        try {
            this.logger.log(`🔐 Checking business rules for user ${userId} (role: ${userRole})...`);

            const violations: string[] = [];

            // Get role definition
            const role = guardrailsConfig.businessRules.roles[userRole];
            if (!role) {
                violations.push(`Invalid user role: "${userRole}"`);
                return {
                    valid: false,
                    reason: violations[0],
                    violations,
                };
            }

            // Check if operation is allowed for this role
            const operation = 'query'; // Default operation
            if (!role.operations.includes(operation)) {
                violations.push(
                    `Operation "${operation}" not allowed for role "${userRole}". Allowed: ${role.operations.join(', ')}`,
                );
            }

            // Check collection access
            const collectionConfig = guardrailsConfig.businessRules.collections[collection];
            if (!collectionConfig) {
                violations.push(`Collection "${collection}" not found in configuration`);
            } else {
                const hasAccess = this.checkCollectionAccess(role, collectionConfig);
                if (!hasAccess) {
                    violations.push(
                        `Access denied to collection "${collection}" for role "${userRole}"`,
                    );
                }
            }

            const isValid = violations.length === 0;

            if (isValid) {
                this.logger.log(`✅ Business rules check passed for user ${userId}`);
            } else {
                this.logger.warn(`⚠️ Business rules check failed: ${violations.join(', ')}`);
            }

            return {
                valid: isValid,
                reason: violations.length > 0 ? violations[0] : undefined,
                violations: violations.length > 0 ? violations : undefined,
            };
        } catch (error) {
            this.logger.error(`Error checking business rules: ${error.message}`);
            return { valid: false, reason: 'Business rules check error' };
        }
    }

    /**
     * Check if role has access to collection based on tags
     */
    private checkCollectionAccess(
        role: any,
        collectionConfig: any,
    ): boolean {
        // Admin has access to everything
        if (role.collectionAccess === '*') {
            return true;
        }

        // If collectionAccess is a string, check if collection has that tag
        if (typeof role.collectionAccess === 'string') {
            return collectionConfig.tags.includes(role.collectionAccess);
        }

        // If collectionAccess is an array, check if collection has any of those tags
        if (Array.isArray(role.collectionAccess)) {
            return collectionConfig.tags.some((tag) =>
                role.collectionAccess.includes(tag),
            );
        }

        return false;
    }

    /**
     * Get role permissions
     */
    getRolePermissions(userRole: string): any {
        return guardrailsConfig.businessRules.roles[userRole] || null;
    }

    /**
     * Get all available collections
     */
    getAvailableCollections(): object {
        return guardrailsConfig.businessRules.collections;
    }

    /**
     * Add new collection dynamically
     */
    addCollection(
        collectionName: string,
        tags: string[],
        description: string,
    ): void {
        guardrailsConfig.businessRules.collections[collectionName] = {
            tags,
            description,
        };
        this.logger.log(`✅ Collection added: ${collectionName} with tags: ${tags.join(', ')}`);
    }

    /**
     * Add new role dynamically
     */
    addRole(roleName: string, roleConfig: any): void {
        guardrailsConfig.businessRules.roles[roleName] = roleConfig;
        this.logger.log(`✅ Role added: ${roleName}`);
    }

    /**
     * Sanitize response by removing confidential information
     */
    sanitizeResponse(response: string): string {
        let sanitized = response;

        for (const pattern of guardrailsConfig.confidentialPatterns) {
            sanitized = sanitized.replace(pattern.pattern, `[${pattern.name}]`);
        }

        return sanitized;
    }

    /**
     * Get guardrails status
     */
    getStatus(): object {
        return {
            inputValidation: guardrailsConfig.input.checkPromptInjection,
            outputValidation: guardrailsConfig.output.checkConfidentialInfo,
            rateLimitEnabled: guardrailsConfig.rateLimit.enabled,
            activeUsers: this.rateLimitMap.size,
            timestamp: new Date().toISOString(),
        };
    }
}
