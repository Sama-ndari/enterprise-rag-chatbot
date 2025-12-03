/**
 * Milvus Configuration
 */

export const milvusConfig = {
    // Connection settings
    connection: {
        // Local Milvus
        host: process.env.MILVUS_HOST || 'localhost',
        port: parseInt(process.env.MILVUS_PORT || '19530', 10),
        username: process.env.MILVUS_USERNAME || 'minioadmin',
        password: process.env.MILVUS_PASSWORD || 'minioadmin',
        ssl: process.env.MILVUS_SSL === 'true' || false,
        timeout: parseInt(process.env.MILVUS_TIMEOUT || '30000', 10),

        // Zilliz Cloud example:
        // host: 'your-cluster.zillizcloud.com',
        // port: 443,
        // username: 'your-username',
        // password: 'your-password',
        // ssl: true,
    },

    // Collection settings
    collection: {
        vectorDim: 384, // Must match your embedding model
        metricType: 'COSINE', // COSINE, L2, IP
        indexType: 'IVF_FLAT', // IVF_FLAT, IVF_SQ8, HNSW
        indexParams: {
            nlist: 128, // Number of clusters (adjust based on data size)
        },
        searchParams: {
            nprobe: 16, // Number of probes (balance between speed and accuracy)
        },
    },

    // Memory collections
    memory: {
        userCollection: 'memory:users',
        sessionCollection: 'memory:sessions',
        metadataCollection: '_collections_metadata',
    },

    // Performance settings
    performance: {
        batchSize: 100, // Documents per batch insert
        searchTimeout: 30000, // Search timeout in ms
        insertTimeout: 60000, // Insert timeout in ms
    },

    // Logging
    logging: {
        enabled: true,
        level: 'info', // debug, info, warn, error
    },
};

/**
 * Get Milvus config from environment or defaults
 */
export function getMilvusConfig() {
    return {
        host: process.env.MILVUS_HOST || milvusConfig.connection.host,
        port: parseInt(process.env.MILVUS_PORT || String(milvusConfig.connection.port), 10),
        username: process.env.MILVUS_USERNAME || milvusConfig.connection.username,
        password: process.env.MILVUS_PASSWORD || milvusConfig.connection.password,
        ssl: process.env.MILVUS_SSL === 'true' ? true : milvusConfig.connection.ssl,
        timeout: parseInt(process.env.MILVUS_TIMEOUT || String(milvusConfig.connection.timeout), 10),
    };
}

/**
 * Validate Milvus configuration
 */
export function validateMilvusConfig(): boolean {
    const config = getMilvusConfig();

    if (!config.host) {
        throw new Error('MILVUS_HOST is required');
    }

    if (!config.port || config.port < 1 || config.port > 65535) {
        throw new Error('MILVUS_PORT must be a valid port number');
    }

    return true;
}
