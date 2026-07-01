FROM node:22-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy full source
COPY . .

# Build the app (same WASM mode as Vercel — works in Node.js too)
ENV PRISMA_CLIENT_ENGINE_TYPE=wasm
RUN npm run build

EXPOSE 3000
COPY docker-entrypoint.sh .
RUN chmod +x docker-entrypoint.sh
CMD ["sh", "docker-entrypoint.sh"]
