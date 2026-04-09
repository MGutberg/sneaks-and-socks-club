# Build stage for frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend

COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy backend package.json and install dependencies
COPY backend/package*.json ./
RUN npm install --production

# Copy backend files
COPY backend/ ./

# Create directories for data and uploads
RUN mkdir -p /app/data /app/uploads

# Copy built frontend
COPY --from=frontend-builder /frontend/dist ./public

# Expose port
EXPOSE 5000

CMD ["node", "server.js"]
