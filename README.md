# 🤖 Enterprise RAG ChatBot - Custom Microservice

**Status:** ✅ Production Ready | **Framework:** NestJS | **RAG:** Custom (Framework-Free)

---

## 📋 Quick Links

- **Full Documentation:** See [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md) for complete architecture and file structure
- **API Documentation:** Available at `http://localhost:3000/api` (Swagger UI)
- **Tech Stack:** NestJS, OpenAI SDK, Milvus, Kafka, Redis, MinIO

---

## 🎯 What This Project Does

Enterprise RAG ChatBot is a **production-grade microservice** that implements a custom Retrieval-Augmented Generation (RAG) pipeline. It:

1. **Ingests Documents** - Upload files (PDF, TXT, DOCX) via REST API
2. **Processes & Embeds** - Chunks documents and generates embeddings using OpenAI
3. **Stores Vectors** - Indexes embeddings in Milvus vector database
4. **Enables Search** - Provides semantic search through REST API
5. **Generates Answers** - Uses OpenAI to generate contextual responses

---

## ✨ Key Features

| Feature              | Description                                           |
| -------------------- | ----------------------------------------------------- |
| **Custom RAG**       | Framework-free implementation (no LangChain)          |
| **Event-Driven**     | Kafka-based asynchronous document processing          |
| **Semantic Search**  | Vector similarity search with Milvus                  |
| **Guardrails**       | Input/output validation & prompt injection prevention |
| **Caching**          | Redis-based response caching for performance          |
| **Streaming**        | Server-Sent Events for real-time responses            |
| **Multi-Collection** | Query across multiple document collections            |
| **User Profiles**    | Store and retrieve user preferences                   |
| **Fully Documented** | Swagger/OpenAPI integration                           |
| **Containerized**    | Docker with health checks                             |

---

## 🏗️ Architecture at a Glance

```
DOCUMENT UPLOAD → MinIO → Kafka Event → Consumer → RagService → Milvus
                                                        ↓
                                                   Chunker + OpenAI
                                                   Embeddings

USER QUERY → API → Guardrails → Cache Check → RagService → Milvus Search
                                                   ↓
                                            Reranker + PromptBuilder
                                                   ↓
                                            OpenAI Chat API
                                                   ↓
                                            Response + Sources
```

---

## 📁 Project Structure

See [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md) for detailed file descriptions. Quick overview:

```
src/
├── modules/
│   ├── api/              # REST endpoints (8 endpoints)
│   ├── rag/              # RAG pipeline services
│   ├── milvus/           # Vector database integration
│   ├── kafka/            # Event messaging
│   ├── minio/            # File storage
│   ├── redis/            # Caching layer
│   ├── guardrails/       # Security & validation
│   └── health/           # Health checks
├── config/               # Configuration modules
└── common/               # Shared utilities
```

---

## 🌐 API Endpoints (8 Total)

### Query Endpoints

- `POST /query` - Query with guardrails + caching
- `POST /query/stream` - Stream response (SSE)
- `POST /query/multi-collection` - Query multiple collections
- `GET /collections` - List all collections

### File Upload

- `POST /seed` - Upload single file
- `POST /seed/batch` - Upload multiple files

### User Management

- `POST /query/user-profile` - Store user profile
- `POST /query/user-profile/get` - Get user profile

---

## 🔧 Tech Stack

| Component      | Technology                      |
| -------------- | ------------------------------- |
| **Framework**  | NestJS (Node.js)                |
| **RAG**        | Custom (Framework-Free)         |
| **LLM**        | OpenAI SDK v4                   |
| **Embeddings** | OpenAI (text-embedding-3-large) |
| **Vector DB**  | Milvus / Zilliz Cloud           |
| **Messaging**  | Kafka                           |
| **Storage**    | MinIO (S3-compatible)           |
| **Cache**      | Redis                           |
| **Deployment** | Docker                          |
| **API Docs**   | Swagger/OpenAPI                 |

---

## 🚀 Getting Started

### Prerequisites

- Docker and Docker Compose
- `.env` file configured (see example below)
- Access to: Kafka, Milvus, OpenAI API, MinIO, Redis

### Quick Start

```bash
# 1. Start the application
docker-compose up --build -d

# 2. Access the API
http://localhost:3000

# 3. Access Swagger UI
http://localhost:3000/api

# 4. Stop the application
docker-compose down
```

### Environment Variables (`.env`)

```env
# Application
NODE_ENV=production
PORT=3000

# Kafka
KAFKA_BROKER=192.168.20.17:9092
KAFKA_CLIENT_ID=chatbot-service
KAFKA_CONSUMER_GROUP_ID=chatbot-consumer-group
KAFKA_DOCUMENT_INGESTION_TOPIC=document-ingestion-events

# Milvus
MILVUS_ENDPOINT=https://your-cluster.zillizcloud.com
MILVUS_TOKEN=your-api-token
MILVUS_DB_NAME=default

# OpenAI
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4-turbo
OPENAI_EMBEDDING_MODEL=text-embedding-3-large

# RAG Configuration
RAG_TOP_K=5
RAG_CHUNK_SIZE=1000
RAG_CHUNK_OVERLAP=200
RAG_MAX_CONTEXT_LENGTH=4000

# Redis
REDIS_HOST=192.168.20.17
REDIS_PORT=7092

# MinIO
MINIO_ENDPOINT=192.168.20.22
MINIO_PORT=9002
MINIO_ACCESS_KEY=your-access-key
MINIO_SECRET_KEY=your-secret-key
MINIO_BUCKET=chatbot-documents
```

---

## 📚 API Examples

### Query Endpoint

```bash
curl -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{
    "collection": "docs_enterprise",
    "question": "What is this service?"
  }'
```

### Upload Single File

```bash
curl -X POST http://localhost:3000/seed \
  -F "collection=docs_enterprise" \
  -F "file=@document.pdf"
```

### Upload Multiple Files

```bash
curl -X POST http://localhost:3000/seed/batch \
  -F "collection=docs_enterprise" \
  -F "files=@doc1.pdf" \
  -F "files=@doc2.pdf"
```

### Store User Profile

```bash
curl -X POST http://localhost:3000/query/user-profile \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "profile": {
      "name": "John Doe",
      "preferences": { "language": "en" }
    }
  }'
```

---

## 📖 Complete Documentation

For detailed architecture, file structure, and module descriptions, see:

- **[PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md)** - Complete project documentation

---

## ✅ Status

- ✅ Production Ready
- ✅ All endpoints tested
- ✅ Build successful
- ✅ Docker containerized
- ✅ Fully documented

---

**Last Updated:** December 2, 2025 | **Version:** 1.0.0
