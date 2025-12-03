export const guardrailsConfig = {
    // Input validation settings
    input: {
        maxLength: 500,
        minLength: 1,
        checkPromptInjection: true,
        checkBusinessRules: true,
        checkHarmfulContent: false, // Can enable if needed
    },

    // Output validation settings
    output: {
        maxLength: 5000,
        checkConfidentialInfo: true,
        checkHarmfulContent: false,
        checkFormat: true,
    },

    // Rate limiting
    rateLimit: {
        enabled: true,
        perMinute: 30,
        perHour: 500,
        perDay: 5000,
    },

    // Blocked keywords (case-insensitive)
    blockedKeywords: [
        // Database operations
        'delete all',
        'drop table',
        'truncate table',
        'drop database',
        'delete from',
        'update all',

        // System/Admin
        'admin password',
        'root password',
        'system password',
        'api key',
        'secret key',
        'private key',
        'access token',

        // Dangerous operations
        'rm -rf',
        'format drive',
        'wipe data',
    ],

    // Confidential information patterns
    confidentialPatterns: [
        {
            name: 'SSN',
            pattern: /\d{3}-\d{2}-\d{4}/g,
            description: 'Social Security Number',
        },
        {
            name: 'CreditCard',
            pattern: /\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}/g,
            description: 'Credit Card Number',
        },
        {
            name: 'Password',
            pattern: /password\s*[:=]\s*[\w@!#$%^&*]+/gi,
            description: 'Password mention',
        },
        {
            name: 'APIKey',
            pattern: /api[_-]?key\s*[:=]\s*[\w\-\.]+/gi,
            description: 'API Key',
        },
        {
            name: 'Email',
            pattern: /[\w\.-]+@[\w\.-]+\.\w+/g,
            description: 'Email address',
        },
        {
            name: 'PhoneNumber',
            pattern: /(\+\d{1,3}[-.\s]?)?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/g,
            description: 'Phone number',
        },
    ],

    // Prompt injection patterns
    promptInjectionPatterns: [
        {
            name: 'InstructionOverride',
            pattern: /ignore\s+(previous\s+)?instructions?/gi,
            description: 'Attempt to override instructions',
        },
        {
            name: 'SystemPromptLeakage',
            pattern: /show\s+(me\s+)?(the\s+)?system\s+prompt/gi,
            description: 'Attempt to leak system prompt',
        },
        {
            name: 'RoleSwitch',
            pattern: /you\s+are\s+now\s+a\s+/gi,
            description: 'Attempt to change role',
        },
        {
            name: 'SQLInjection',
            pattern: /('|(--)|;|\/\*|\*\/|xp_|sp_)/gi,
            description: 'SQL injection attempt',
        },
        {
            name: 'CodeInjection',
            pattern: /(eval|exec|system|shell_exec|passthru)\s*\(/gi,
            description: 'Code injection attempt',
        },
    ],

    // Business rules - Role-Based Access Control (RBAC)
    businessRules: {
        // Default role (used if user role not specified)
        defaultRole: 'guest',

        // Role definitions with permissions
        roles: {
            guest: {
                description: 'Guest user - limited access',
                operations: ['query'],
                collectionAccess: 'public', // Can access collections tagged as 'public'
                maxQueriesPerMinute: 5,
                maxQueriesPerHour: 50,
                maxQueriesPerDay: 500,
            },
            user: {
                description: 'Regular user - standard access',
                operations: ['query', 'stream'],
                collectionAccess: 'public', // Can access 'public' collections
                maxQueriesPerMinute: 30,
                maxQueriesPerHour: 500,
                maxQueriesPerDay: 5000,
            },
            premium: {
                description: 'Premium user - extended access',
                operations: ['query', 'stream'],
                collectionAccess: ['public', 'premium'], // Can access 'public' and 'premium' collections
                maxQueriesPerMinute: 100,
                maxQueriesPerHour: 2000,
                maxQueriesPerDay: 20000,
            },
            admin: {
                description: 'Administrator - full access',
                operations: ['query', 'stream', 'seed', 'delete', 'manage'],
                collectionAccess: '*', // Can access ALL collections
                maxQueriesPerMinute: 1000,
                maxQueriesPerHour: 10000,
                maxQueriesPerDay: 100000,
            },
        },

        // Collection definitions with access levels
        // This can be loaded from database or environment
        collections: {
            // Format: collectionName: { tags: ['tag1', 'tag2'], description: '...' }
            'docs_enterprise': { tags: ['public'], description: 'Enterprise documentation' },
            'docs_company': { tags: ['public'], description: 'Company documentation' },
            'docs_policies': { tags: ['premium'], description: 'Company policies' },
            'docs_internal': { tags: ['admin'], description: 'Internal documentation' },
            'docs_customer_data': { tags: ['admin'], description: 'Customer data' },
            'docs_financial': { tags: ['admin'], description: 'Financial reports' },
            // Add more collections dynamically as needed
        },

        // Maximum queries per session (global)
        maxQueriesPerSession: 100,

        // Enable dynamic collection loading from database
        enableDynamicCollections: true, // Set to true to load from DB
    },

    // Harmful content keywords
    harmfulKeywords: [
        'bomb',
        'weapon',
        'kill',
        'murder',
        'violence',
        'abuse',
        'illegal',
        'hack',
        'crack',
    ],
};
