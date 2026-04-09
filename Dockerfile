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

# Install dependencies for backend
COPY package*.json ./
RUN npm install --production

# Copy backend files
COPY backend/ ./

# Create directories for data and uploads
RUN mkdir -p /app/data /app/uploads

# Copy built frontend
COPY --from=frontend-builder /frontend/dist ./public

# Expose ports
EXPOSE 3000 5000

# Start script
CMD ["sh", "-c", "node server.js & sleep 5 && npx serve -s public -l 3000"]
