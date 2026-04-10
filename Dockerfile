# STAGE 1: Frontend bauen
FROM node:20 AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build

# STAGE 2: Backend und Frontend vereinen
FROM node:20
WORKDIR /app

# Backend installieren
COPY backend/package*.json ./backend/
RUN cd backend && npm install

COPY backend/ ./backend/

# Hier wird der generierte dist-Ordner aus Stage 1 ins Backend kopiert!
COPY --from=frontend-builder /app/frontend/dist ./backend/dist

EXPOSE 5000

# Startbefehl
CMD ["node", "backend/server.js"]
