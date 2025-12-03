# ---- Base ----
FROM node:20-alpine AS base
WORKDIR /usr/src/app

# Install system dependencies for PDF processing
RUN apk add --no-cache \
    poppler-utils \
    && rm -rf /var/cache/apk/*

# ---- Dependencies ----
FROM base AS dependencies
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

# ---- Build ----
FROM base AS build
COPY --from=dependencies /usr/src/app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- Release ----
FROM base AS release
COPY --from=build /usr/src/app/dist ./dist
COPY --from=dependencies /usr/src/app/node_modules ./node_modules
COPY package.json ./

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

EXPOSE 3000

# Run as non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

CMD ["node", "dist/main"]
