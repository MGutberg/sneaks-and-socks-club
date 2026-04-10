#!/bin/bash

# Bricht bei Fehlern ab
set -e

cd ~/sneaks-and-socks-club

echo "📦 Welche Änderungen hast du gemacht? (Kurze Beschreibung):"
read commit_message

echo "⚙️ Füge Dateien hinzu..."
git add .

echo "📝 Speichere (Commit)..."
git commit -m "$commit_message"

echo "🚀 Pushe zu GitHub..."
git push

echo "✅ Fertig! Deine Änderungen sind jetzt sicher auf GitHub."
