# Sneaks & Socks Club - Session Summary
**Datum:** 2026-04-14
**Letzter Commit:** ad2ed39

## Projekt-Übersicht
Social Media Plattform für Sneaker- und Socken-Enthusiasten.

### Tech Stack
- **Frontend:** React + Vite + Tailwind CSS
- **Backend:** Express.js + better-sqlite3
- **Auth:** JWT + bcryptjs
- **Uploads:** Multer (lokal in /backend/uploads/)

### Ports
- Frontend: 3005 (oder nächster freier ab 3000)
- Backend: 5000

### Wichtige Dateien
- `frontend/src/App.jsx` - Gesamte React-App (Single File)
- `backend/server.js` - Express API Server
- `backend/data/database.sqlite` - SQLite Datenbank
- `frontend/.env` - API URL Konfiguration (VITE_API_URL=http://localhost:5000)

## Implementierte Features

### 1. Authentifizierung
- Login/Register mit JWT
- Passwort-Hashing mit bcryptjs
- Heartbeat für Online-Status

### 2. Benutzer-System
- Profil mit Avatar, Bio, Location, Website
- Sneaker/Socken-Präferenzen
- Follower-System
- Benutzersuche
- Members-Seite

### 3. Posts
- Text + Bild Posts
- Like/Kommentar-System
- Gimmick-Galerie (Bilder-Grid)

### 4. Forum (NEU)
- 6 Kategorien: Allgemein, Sneakers, Socken, Sammlungen, Börse, Off-Topic
- Topics mit Titel, Inhalt, Bild
- Replies mit Bild-Support
- Views-Counter
- Pinned Topics möglich

### 5. Nachrichten (ERWEITERT)
- **Chats:** Konversations-Übersicht
- **Empfangen (Inbox):** Eingehende Nachrichten
- **Gesendet:** Ausgehende Nachrichten
- **Archiv:** Archivierte Nachrichten mit:
  - Checkbox-Auswahl
  - Alle auswählen
  - Entarchivieren
  - Download als TXT

### 6. UI/UX
- Responsive Design (Mobile Hamburger-Menü)
- Dark Theme mit Kontrast-Grautönen
- Streetart Hintergrund
- Versteckte Scrollbalken
- Safe-Area Support für Mobile

## Datenbank-Schema

### Users
```sql
id, username, email, password, display_name, bio, avatar,
location, website, favorite_sneakers, favorite_socks,
sneaker_size, sock_size, favorite_brands, created_at, last_active
```

### Posts
```sql
id, user_id, content, image, created_at
```

### Forum Topics
```sql
id, user_id, title, content, image, category,
views, pinned, created_at, updated_at
```

### Forum Replies
```sql
id, topic_id, user_id, content, image, created_at
```

### Messages
```sql
id, conversation_id, sender_id, content, read_at, created_at, archived_by
```

### Conversations
```sql
id, user1_id, user2_id, last_message_at, created_at
```

## Test-Accounts
| Username | Passwort | E-Mail |
|----------|----------|--------|
| DeepSneak | test123 | deepvoiceinc@web.de |
| TestUser | test123 | testuser@example.com |

## Bekannte Konfiguration

### Tailwind Farben (dark)
```js
dark: {
  100: '#1a1a1a',
  200: '#0d0d0d',
  300: '#262626',
}
```

### Forum Kategorien
```js
['general', 'sneakers', 'socks', 'collections', 'trading', 'offtopic']
// Labels: Allgemein, Sneakers, Socken, Sammlungen, Börse, Off-Topic
```

## Setup auf neuem Server

```bash
# Repository klonen
git clone https://github.com/MGutberg/sneaks-and-socks-club.git
cd sneaks-and-socks-club

# Frontend Setup
cd frontend
cp .env.example .env
npm install

# Backend Setup
cd ../backend
npm install

# Starten (2 Terminals)
# Terminal 1: Backend
cd backend && node server.js

# Terminal 2: Frontend
cd frontend && npm run dev
```

## Offene Punkte / Ideen für später
- [ ] Bilder-Komprimierung beim Upload
- [ ] Push-Benachrichtigungen
- [ ] Admin-Panel
- [ ] Reporting-System
- [ ] Emoji-Reaktionen
- [ ] @Mentions in Posts/Replies
