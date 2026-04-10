#!/bin/bash

# Bricht das Skript ab, falls ein kritischer Fehler auftritt
set -e

echo "🚀 Starte Update für den Sneaks & Socks Club..."

# 1. Frontend bauen
echo "📦 1/4: Baue das React-Frontend über Docker..."
cd ~/sneaks-and-socks-club/frontend
docker run --rm -v $(pwd):/app -w /app node:20 /bin/sh -c "npm install && npm run build"

# Zurück ins Hauptverzeichnis
cd ~/sneaks-and-socks-club

# 2. Aufräumen
echo "🧹 2/4: Stoppe und lösche alte Container..."
docker stop sneaks-and-socks-club_app || true
docker rm sneaks-and-socks-club_app || true

# 3. Backend / App bauen
echo "🏗️ 3/4: Baue das neue Docker-Image..."
docker build --no-cache -t sneaks-and-socks-club_app:latest .

# 4. Starten
echo "🚢 4/4: Starte den neuen Server..."
docker run -d -p 5000:5000 --name sneaks-and-socks-club_app -v $(pwd)/data:/app/data -v $(pwd)/uploads:/app/uploads sneaks-and-socks-club_app:latest

echo "✅ Update komplett! Der Club ist wieder online."
