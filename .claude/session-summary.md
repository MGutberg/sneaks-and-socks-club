# Sneaks & Socks Club - Session Summary
**Datum:** 2026-04-27
**Letzter Commit:** 157bb0a

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
- Gimmick-Galerie (Bilder-Grid in Members-Seite)

### 4. Forum
- 6 Kategorien: Allgemein, Sneakers, Socken, Sammlungen, Börse, Off-Topic
- Topics mit Titel, Inhalt, Bild
- Replies mit Bild-Support
- Views-Counter
- Pinned Topics möglich

### 5. Nachrichten
- **Chats:** Konversations-Übersicht
- **Empfangen (Inbox):** Eingehende Nachrichten
- **Gesendet:** Ausgehende Nachrichten
- **Archiv:** Archivierte Nachrichten mit Checkbox-Auswahl, Entarchivieren, Download als TXT

### 6. Erweiterte Profil-Felder (Pulldown-Dropdowns)
Neue Felder im Profil (alle optional, alle als Select):
- **Alter** (`age`): 18 bis 65+
- **Größe** (`height`): 150 bis 210+ cm
- **Gewicht** (`weight`): 45–55 bis 115+ kg
- **Statur** (`body_type`): Schlank, Normal, Sportlich, Muskulös, Kräftig, Mollig
- **Typ** (`look_type`): Bär, Twink, Otter, Daddy, Jock, Cub, Normal, Anderes
- **Körperbehaarung** (`body_hair`): Glatt, Wenig, Mittel, Behaart, Sehr behaart
- **Ich bin** (`orientation`): Gay, Bisexuell, Hetero, Lesbisch, Queer, Pansexuell, Asexuell
- **Raucher** (`smoker`): Nein, Gelegentlich, Ja
- **Sprachen** (`languages`): Chips (Mehrfachauswahl, kommagetrennt in DB)
- **Beziehung** (`relationship`): Single, In Beziehung, Offen, Verheiratet, Getrennt

Im Profil wird eine Box "Persönliche Angaben" angezeigt, sobald mind. ein Feld gesetzt ist.

### 7. Profil-Galerie
- Eigene Bildergalerie pro User (max. 18 Bilder)
- Responsive Grid (3 Spalten mobile, 4 Spalten desktop)
- Lightbox beim Klicken auf ein Bild
- Löschen-Button (nur eigenes Profil, erscheint beim Hover)
- Backend-Tabelle: `profile_gallery`
- Routes: `GET /api/users/:id/gallery`, `POST /api/profile/gallery`, `DELETE /api/profile/gallery/:id`

### 8. Gespeicherte Posts (Bookmarks)
- Lesezeichen-Button (🔖/🏷️) auf jedem Post
- Toggle: Klick speichert/entfernt den Post
- Eigene Seite `/saved` mit allen gespeicherten Posts
- Navbar-Link (Desktop: 🔖-Icon, Mobile: Menü-Eintrag)
- Backend-Tabelle: `saved_posts` (UNIQUE constraint auf user_id + post_id)
- Routes: `GET /api/posts/saved`, `POST /api/posts/:id/save`

### 9. Profilbesucher
- Jeder Profilaufruf wird in `profile_views` gespeichert (außer eigenes Profil)
- Auf dem eigenen Profil: Sektion "Profilbesucher" mit Avatar-Grid der letzten 30 eindeutigen Besucher
- Verlinkung zum jeweiligen Profil via Username
- Route: `GET /api/profile/visitors`

### 10. Emoji-Reaktionen
- Reaktionen auf Posts: 🔥👟🧦❤️😂
- Toggle pro User+Emoji (UNIQUE-Constraint)
- Tabelle: `reactions` (post_id, user_id, emoji)

### 11. @Mentions
- @username in Posts, Kommentaren und Forum-Replies wird automatisch verlinkt
- Case-insensitive Username-Lookup
- `ProfilePage` löst Username direkt auf

### 12. Benachrichtigungs-System (In-App)
- Notifications für: Follow, Like, Kommentar, Forum-Reply, Nachricht
- Tabelle: `notifications` (type, actor_id, content_id, read_at)
- Avatar-URLs korrekt ohne Doppel-Slash

### 13. Admin-Panel
- Dashboard mit Statistiken
- User-Management (Admin-Flag, Löschen)
- Moderation von Posts und Forum-Inhalten
- `authenticateAdmin`-Middleware

### 14. Reporting-System
- Melde-Button auf Posts, Kommentaren, Forum-Inhalten
- Admins sehen Melde-Button auf allem
- Admin-Moderationspanel mit offenen/erledigten Reports
- Tabelle: `reports` (reporter_id, content_type, content_id, reason, status)

### 15. Edit-Funktion
- Posts, Forum-Topics und Replies bearbeitbar (nur eigene + Admin)

### 16. Bild-Komprimierung
- Sharp-basierte Komprimierung beim Upload
- WebP-Output, max 1200px
- Avatare auf 400x400 zugeschnitten

### 17. UI/UX
- Responsive Design (Mobile Hamburger-Menü)
- Dark Theme mit Kontrast-Grautönen
- Streetart Hintergrund
- Versteckte Scrollbalken
- Safe-Area Support für Mobile

## Profil-URLs: Username statt UUID
**Alle** Profil-Links in der App verwenden jetzt den Username:
- `/profile/DeepSneaks` statt `/profile/74251691-4b1a-4830-...`
- `ProfilePage` unterstützt beide Formate (UUID und Username) — erkennt UUID per Regex und löst Username via `GET /api/users/by-username/:username` auf
- Geändert in: Navbar, Posts, Forum (Topics + Replies), Follower/Following-Modal, Profilbesucher-Grid, Members-Seite, Suche, Chat-Header

## Datenbank-Schema

### Users
```sql
id, username, email, password, display_name, bio, avatar,
location, website, favorite_sneakers, favorite_socks,
sneaker_size, sock_size, favorite_brands, created_at, last_active,
is_admin,
age, height, weight, body_type, look_type, body_hair,
orientation, smoker, languages, relationship
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

### Profile Gallery
```sql
id, user_id, image, created_at
```

### Saved Posts
```sql
id, user_id, post_id, created_at
UNIQUE(user_id, post_id)
```

### Profile Views
```sql
id, profile_id, viewer_id, viewed_at
```

### Reactions
```sql
id, post_id, user_id, emoji, created_at
UNIQUE(post_id, user_id, emoji)
```

### Push Subscriptions
```sql
id TEXT PRIMARY KEY, user_id TEXT NOT NULL, endpoint TEXT NOT NULL UNIQUE,
p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at DATETIME
```

### Reports
```sql
id, reporter_id, content_type, content_id, reason, status, created_at
```

### Notifications
```sql
id, user_id, type, actor_id, content_id, read_at, created_at
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

## Server-Deployment (37.27.209.32)

### Erstinstallation
```bash
ssh root@37.27.209.32
apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs git
cd /opt
git clone https://github.com/MGutberg/sneaks-and-socks-club.git
cd sneaks-and-socks-club
cd backend && npm install
cd ../frontend && npm install
# .env anpassen:
echo "VITE_API_URL=http://37.27.209.32:5000" > .env
npm run build
npm install -g pm2 serve
cd ../backend
pm2 start server.js --name "sneaks-backend"
pm2 start "serve -s /opt/sneaks-and-socks-club/frontend/dist -p 3000" --name "sneaks-frontend"
pm2 startup && pm2 save
```

### Update deployen
```bash
cd /opt/sneaks-and-socks-club
git pull origin main
cd frontend && npm run build
pm2 restart sneaks-backend
```

### URLs
- Frontend: `https://sneaks-socks.club` (+ `https://www.sneaks-socks.club`)
- Backend API: `https://sneaks-socks.club/api/users` (via Nginx Proxy)
- Direkt: `http://37.27.209.32:3000` (Frontend), `http://37.27.209.32:5000` (Backend)

## Lokales Setup (neuer Rechner)
```bash
git clone https://github.com/MGutberg/sneaks-and-socks-club.git
cd sneaks-and-socks-club
cd frontend && cp .env.example .env && npm install
cd ../backend && npm install
# Terminal 1:
cd backend && node --env-file=.env server.js
# Terminal 2:
cd frontend && npm run dev
```
Backend nutzt seit Node 20+ natives `--env-file=.env` (kein `dotenv`-Paket nötig).
`backend/.env` ist gitignored — Pflichtfelder: `JWT_SECRET` (≥32 Chars), optional SMTP_*/VAPID_*.

## WSL-Dev-Setup (Windows)
- Repo nach `~/projects/sneaks-and-socks-club` clonen (NICHT `/mnt/c/…` — File-I/O 5–20× langsamer, Vite-HMR unzuverlässig)
- `~/start-sneaks.sh` startet Backend + Frontend per `setsid nohup` (übersteht WSL-Session-Ende), Logs in `/tmp/{backend,frontend}.log`
- `~/stop-sneaks.sh` killt beide Prozesse + esbuild-Helper sauber
- Cloudflare Tunnel für externen Test:
  ```bash
  cloudflared tunnel --url http://localhost:3000
  ```
  → wirft `https://*.trycloudflare.com`-URL aus (flüchtig, ändert sich bei jedem Restart)
- Vite akzeptiert Tunnel-Hosts via `server.allowedHosts: ['.trycloudflare.com', 'localhost']` in `vite.config.js`

### 18. Profil-Statistiken
- `/api/users/:id/stats`: posts, followers, following, erhaltene Likes/Kommentare/Reaktionen, Forum-Topics/Replies, Profilaufrufe, member_since
- Statistik-Box im Profil

### 19. Infinite Scroll
- `useInfiniteList(buildUrl, deps)` Hook mit IntersectionObserver, PAGE_SIZE=20
- Paginierung auf `/api/posts` (mit `WHERE group_id IS NULL`) und `/api/forum/topics` via `LIMIT/OFFSET`

### 20. Dark/Light-Mode
- `useTheme` Hook mit localStorage + `html.light` Klasse
- CSS-Overrides in `index.css` für `bg-dark-*`, `text-white`, `text-gray-*`
- Toggle-Button in Navbar

### 21. E-Mail-Verifizierung + Passwort-Reset
- Nodemailer mit SMTP-Env (SMTP_HOST=smtp.web.de, Port 587), Fallback auf Console-Log
- Spalten: `email_verified`, `verification_token`, `reset_token`, `reset_expires`
- Routes: `/api/auth/verify-email`, `/resend-verification`, `/forgot-password`, `/reset-password`
- Seiten: `VerifyEmailPage`, `ForgotPasswordPage`, `ResetPasswordPage`, `VerifyEmailBanner`

### 22. DSGVO-Datenexport
- `buildUserExport(userId)` sammelt alle Nutzerdaten
- `/api/profile/export` (JSON), `/api/profile/export/zip` (ZIP mit Bildern via archiver)
- `DataExportBox` Komponente im eigenen Profil
- Enthält: listings, events_created, event_attendance, groups_owned, group_memberships

### 23. Marktplatz
- Tabellen: `listings`, `listing_images`
- Kategorien: sneakers, socks, apparel, accessories, other
- Conditions: 4 Stufen; Status: active, reserved, sold
- Bis zu 5 Bilder pro Listing
- Seiten: `MarketPage`, `MarketDetailPage`, `MarketEditPage`

### 24. Event-Kalender
- Tabellen: `events`, `event_attendees`
- Typen: meetup, release, drop, other
- RSVP: going / interested
- Seiten: `EventsPage`, `EventDetailPage`, `EventEditPage`

### 25. Gruppen/Communities
- Tabellen: `groups`, `group_members`, `posts.group_id`
- Öffentlich/Privat mit Owner-Approval-Flow, Slugify-Helper
- Seiten: `GroupsPage`, `GroupDetailPage`, `GroupEditPage`

### 26. Footer (fixed)
- `Footer` Komponente: schwarz, fixed bottom, Logo links, Links zu legal pages
- Legal-Content-Objekt: impressum, datenschutz, cookies, agb, dsgvo
- Footer-Text: "Powered by IT MEDIA DESIGN Gutberg (c) 2026"
- Main-Padding `pb-40 sm:pb-28` wegen fixed footer

### 27. Navbar-Logo
- Text-Brand durch Login-Logo ersetzt (`<img src="/logo.png" className="h-14 sm:h-16" />`)
- Navbar-Höhe h-20 (vorher h-14)

### 28. Stories (24h-Posts)
- Tabellen: `stories` (expires_at +24h), `story_views`
- `setInterval` Cleanup stündlich
- `StoryBar` + `StoryViewer` auf HomePage
- Eigene Tile: Klick auf Kreis öffnet Viewer (wenn Stories vorhanden), separater `+`-Overlay-Button für Upload
- Viewer-Tracking pro User

### 29. Web Push Notifications (VAPID / Service Worker)
- `web-push` npm-Paket für serverseitige Push-Zustellung
- VAPID-Konfiguration über Env-Vars: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- Tabelle: `push_subscriptions` (user_id, endpoint, p256dh, auth)
- `sendPushToUser(userId, payload)` — sendet an alle Subscriptions, löscht 404/410-Endpoints automatisch
- `notify()` erweitert: sendet Push mit deutschen Labels (Neuer Follower, Neues Like, etc.)
- Routes: `GET /api/push/vapid-key`, `POST /api/push/subscribe`, `DELETE /api/push/subscribe`
- Service Worker: `frontend/public/sw.js` — empfängt Push-Events, zeigt Notification, navigiert bei Klick
- `usePushNotifications()` Hook im Frontend: SW-Registrierung, Subscribe/Unsubscribe
- Push-Toggle-Button in Navbar (🔔 grün = aktiv, 🔕 grau = inaktiv)

### 30. Admin User-Deletion (Transaction Fix)
- `DELETE /api/admin/users/:id` in Transaction mit `safe()` Helper
- Bereinigt alle 24+ Tabellen inkl. Kaskaden (listing_images, group posts, etc.)

### 31. Request-Origin-basierte Mail-Links
- Neuer `buildLink(req, path)` Helper im Backend (`server.js`)
- Reihenfolge: `req.get('origin')` → `${req.protocol}://${req.get('host')}` → `APP_URL`-Fallback
- `app.set('trust proxy', true)` damit Express X-Forwarded-Host/Proto vom Nginx ehrt
- Verwendet in: `/api/auth/register`, `/api/auth/resend-verification`, `/api/auth/forgot-password`
- Vorteil: Reset-/Verify-Mails zeigen automatisch auf die jeweilige URL (localhost, Tunnel, Live) — kein Per-Env-`APP_URL` mehr nötig

### 32. JWT_SECRET als Pflicht-Env-Variable
- Hardcoded Default `'sneaks-and-socks-club-secret-key-2024'` entfernt (war im public Repo → JWT-Forgery möglich)
- Backend crasht beim Start, wenn `JWT_SECRET` fehlt oder < 32 Zeichen
- Live-Deploy benötigt `JWT_SECRET` in `ecosystem.config.cjs`
- Achtung: Secret-Änderung invalidiert alle aktiven JWT-Sessions (gewollt)

### 33. Mobile-Navbar & Footer-Refactor
- Mobile-Header reduziert auf: Logo + ✉️ Messages + ☰ Hamburger (mit Unread-Badge auf Hamburger = sum(notifs+messages))
- Bell, Push-Toggle, Theme-Toggle, Saved-Posts: `hidden sm:inline-flex` → nur Desktop
- Push-Toggle neu im Hamburger-Menü
- Logo: `flex-shrink-0` + `h-12 sm:h-16` (kann nicht mehr zerquetscht werden)
- Footer Mobile kompakter: `py-3`, Logo `h-9`, `gap-2`, Nav-Links `text-[11px]`/`gap-x-2.5` (passt auf eine Zeile)
- Main-Padding: `pb-48 sm:pb-32` (verhindert Footer-Overlap)

### 34. Bug-Fixes
- `is_admin && <Component>` rendete bei Nicht-Admins die Zahl `0` als Text → `!!user?.is_admin` (Boolean-Coercion)
- VerifyEmailPage: `useRef`-Guard gegen StrictMode-Doppelaufruf (Token wurde sonst beim 2. Fire bereits konsumiert → fälschliches "❌ Token ungültig")

### 35. Email-Format-Validierung (Frontend)
- `validateEmail(email)` Helper in App.jsx
- 3-stufige Prüfung:
  1. Format-Regex (`user@domain.tld`)
  2. Explizites Dict für häufige Domain-Tippfehler (`gmial.com` → `gmail.com`, `web.com` → `web.de`, …) und TLD-Tippfehler (`.coom` → `.com`, `.con`, `.cmo`, `.ogr`, `.ney`, …)
  3. Heuristik: Endbuchstabe mehrfach wiederholt → kollabieren und gegen `TLD_COLLAPSE_TARGETS` prüfen (fängt `.dee`, `.deee`, `.commm`, … ohne explizite Aufzählung)
- Verwendet in `RegisterPage` (alert) und `ForgotPasswordPage` (inline error state)
- Trigger: realer Prod-Vorfall mit `deepvoiceinc@gmail.coom` → SMTP-Bounce → Account stuck unverified

### 36. PWA Install (Add-to-Home-Screen)
- `frontend/public/manifest.json`: name, icons (192/512), `display: standalone`, theme/background color
- Icons aus `logo.png` (1024x1024) generiert: `icon-192.png`, `icon-512.png`, `icon-180.png` (Apple Touch)
- `index.html` Meta-Tags: theme-color, apple-mobile-web-app-capable, viewport-fit=cover
- `sw.js` erweitert: leerer `fetch`-Listener (Chrome-Install-Voraussetzung) + `skipWaiting()` + `clients.claim()` für sofortige Übernahme bei Updates
- Service-Worker-Registrierung von `usePushNotifications`-Hook (auth-gated) in `main.jsx` (bei jedem Load) verschoben — Chrome braucht das für Install-Eligibility
- Bekanntes offenes Problem: Chrome auf Honor V5 zeigt nach Cleanup noch keinen Install-Button. Desktop Chrome OK. Vermutung: Chrome-Mobile-State nicht restlos clean. Workaround: Edge oder Firefox Mobile.

## Domain & HTTPS
- Domain: `sneaks-socks.club` (+ `www.sneaks-socks.club`)
- DNS: A-Records bei IONOS → `37.27.209.32`
- Let's Encrypt Zertifikat via Certbot (`--nginx --redirect`)
- Automatische Erneuerung via `certbot renew` (systemd timer)
- Nginx Reverse Proxy: Port 3000 (Frontend), Port 5000 (Backend)

## Umgebungsvariablen (Backend)
```
SMTP_HOST=smtp.web.de
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=...
APP_URL=https://sneaks-socks.club
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:deepvoiceinc@web.de
```

## PM2 Ecosystem
- Datei: `/opt/sneaks-and-socks-club/ecosystem.config.cjs` (MUSS `.cjs` sein, da frontend/package.json `"type":"module"` hat)

## Erledigte Punkte (ehemals offen)
- [x] Bilder-Komprimierung beim Upload (Sharp / WebP)
- [x] Admin-Panel
- [x] Reporting-System
- [x] Emoji-Reaktionen
- [x] @Mentions in Posts/Replies
- [x] In-App Benachrichtigungen (Follow/Like/Kommentar/Reply/Message)
- [x] Profil-Statistiken
- [x] Infinite Scroll (Feed + Forum)
- [x] Dark/Light-Toggle
- [x] E-Mail-Verifizierung + Passwort-Reset
- [x] DSGVO-Datenexport (JSON + ZIP)
- [x] Marktplatz mit Listings/Bildern/Status
- [x] Event-Kalender (Meetups/Releases/Drops)
- [x] Gruppen/Communities (public/private)
- [x] Fixed Footer mit Legal Pages
- [x] Logo in Navbar statt Text
- [x] Stories (24h-Posts) mit Viewer-Tracking
- [x] Web Push Notifications (VAPID / Service Worker)
- [x] Admin User-Deletion Fix (Transaction über alle Tabellen)
- [x] Domain sneaks-socks.club + HTTPS (Let's Encrypt + Nginx)
- [x] Request-Origin-basierte Mail-Links (buildLink Helper)
- [x] JWT_SECRET als Pflicht-Env-Var (Sicherheit)
- [x] Mobile-Header & Footer kompakt überarbeitet
- [x] is_admin Boolean-Coercion Fix
- [x] VerifyEmailPage StrictMode-Fix (useRef-Guard)
- [x] Email-Tippfehler-Validierung (Frontend)
- [x] PWA Install Support (manifest, icons, SW lifecycle)

## Offene Punkte / Ideen für später
- [ ] Link-Preview (OpenGraph) für Posts/Mails + dynamische OG-Tags pro Route
- [ ] Drafts (localStorage)
- [ ] Keyboard-Shortcuts
- [ ] Passwort-ändern-Dialog im Profil
- [ ] Tag-System
- [ ] Bessere Suche (FTS5 in SQLite)
- [ ] Blockieren/Stummschalten von Usern
- [ ] 2FA
- [ ] Rate-Limiting auf Auth-Endpoints (express-rate-limit)
- [ ] Multer 1.x → 2.x Upgrade (1.x deprecated, CVEs)
- [ ] PWA-Install auf Honor V5 Chrome reproduzieren (Desktop OK, Mobile Chrome zeigt nichts)
- [ ] Notif-Liste auf Mobile sichtbar machen (Bell wurde entfernt → aktuell nur Badge + Push)
- [ ] iOS-Auto-Zoom-Prevention (`text-base` auf allen Form-Inputs)
- [ ] App.jsx splitten (4000 Zeilen → Komponenten in eigene Dateien)
- [ ] TypeScript schrittweise einführen
- [ ] Video-Uploads
- [ ] PostgreSQL Migration
- [ ] S3/MinIO
- [ ] WebSockets (Realtime Chat)
- [ ] Mobile App (echte native, nicht nur PWA)
- [ ] Monetarisierung
- [ ] KI-Moderation
