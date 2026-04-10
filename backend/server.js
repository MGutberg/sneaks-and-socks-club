const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'sneaks-and-socks-club-secret-key-2024';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'database.sqlite');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');

function saveFileLocally(buffer, originalname) {
  const ext = path.extname(originalname);
  const filename = `${uuidv4()}${ext}`;
  const filepath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(filepath, buffer);
  return `/uploads/${filename}`;
}

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, 
    password TEXT NOT NULL, display_name TEXT, bio TEXT DEFAULT '', avatar TEXT DEFAULT '',
    location TEXT DEFAULT '', website TEXT DEFAULT '', favorite_sneakers TEXT DEFAULT '',
    favorite_socks TEXT DEFAULT '', sneaker_size TEXT DEFAULT '', sock_size TEXT DEFAULT '',
    favorite_brands TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_active DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, content TEXT NOT NULL, image TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS likes (
    id TEXT PRIMARY KEY, post_id TEXT NOT NULL, user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(post_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY, post_id TEXT NOT NULL, user_id TEXT NOT NULL, content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Automatisch last_active Spalte bei alten Datenbanken nachrüsten
try {
  db.exec("ALTER TABLE users ADD COLUMN last_active DATETIME DEFAULT CURRENT_TIMESTAMP;");
} catch (e) {
  // Spalte existiert bereits, Fehler ignorieren
}

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOAD_DIR));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// --- AUTH ROUTES ---
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, display_name } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const id = uuidv4();
    db.prepare('INSERT INTO users (id, username, email, password, display_name) VALUES (?, ?, ?, ?, ?)').run(id, username, email, hashedPassword, display_name || username);
    const token = jwt.sign({ id, username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id, username, email, display_name: display_name || username } });
  } catch (error) { res.status(500).json({ error: 'Registration failed' }); }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, username);
  if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: 'Invalid credentials' });
  db.prepare("UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user });
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  db.prepare("UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE id = ?").run(req.user.id);
  res.json(db.prepare('SELECT id, username, email, display_name, avatar, bio, location, website FROM users WHERE id = ?').get(req.user.id));
});

// --- HEARTBEAT & ONLINE COUNTER ---
app.post('/api/auth/heartbeat', authenticateToken, (req, res) => {
  db.prepare("UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE id = ?").run(req.user.id);
  res.json({ success: true });
});

app.get('/api/users/online', authenticateToken, (req, res) => {
  const row = db.prepare("SELECT COUNT(*) as count FROM users WHERE last_active >= datetime('now', '-5 minutes')").get();
  res.json({ count: row.count || 0 });
});

// --- USER ROUTES ---
// HIER WAR DER FEHLER: Diese Route fehlte, deshalb war die Members-Seite leer!
app.get('/api/users', authenticateToken, (req, res) => {
  const users = db.prepare('SELECT id, username, display_name, avatar, bio FROM users ORDER BY created_at DESC').all();
  res.json(users);
});

app.get('/api/users/:id', authenticateToken, (req, res) => res.json(db.prepare('SELECT id, username, display_name, avatar, bio, location, website, favorite_sneakers, favorite_socks, sneaker_size, sock_size, favorite_brands FROM users WHERE id = ?').get(req.params.id)));
app.get('/api/users/:id/posts', authenticateToken, (req, res) => res.json(db.prepare('SELECT p.*, u.username, u.display_name, u.avatar FROM posts p JOIN users u ON p.user_id = u.id WHERE p.user_id = ? ORDER BY p.created_at DESC').all(req.params.id)));

app.put('/api/users/:id', authenticateToken, upload.single('avatar'), (req, res) => {
  if (req.user.id !== req.params.id) return res.status(403).json({ error: 'Unauthorized' });
  const { display_name, bio, location, website, favorite_sneakers, favorite_socks, sneaker_size, sock_size, favorite_brands } = req.body;
  let avatar = req.file ? saveFileLocally(req.file.buffer, req.file.originalname) : null;
  db.prepare(`UPDATE users SET display_name=COALESCE(?,display_name), bio=COALESCE(?,bio), avatar=COALESCE(?,avatar), location=COALESCE(?,location), website=COALESCE(?,website), favorite_sneakers=COALESCE(?,favorite_sneakers), favorite_socks=COALESCE(?,favorite_socks), sneaker_size=COALESCE(?,sneaker_size), sock_size=COALESCE(?,sock_size), favorite_brands=COALESCE(?,favorite_brands) WHERE id=?`)
    .run(display_name||null, bio||null, avatar||null, location||null, website||null, favorite_sneakers||null, favorite_socks||null, sneaker_size||null, sock_size||null, favorite_brands||null, req.params.id);
  res.json(db.prepare('SELECT id, username, display_name, avatar, bio, location, website FROM users WHERE id = ?').get(req.params.id));
});

// --- POST ROUTES ---
app.get('/api/posts', authenticateToken, (req, res) => {
  const posts = db.prepare(`
    SELECT p.*, u.username, u.display_name, u.avatar,
    (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
    (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
    (SELECT 1 FROM likes WHERE post_id = p.id AND user_id = ?) as liked
    FROM posts p JOIN users u ON p.user_id = u.id ORDER BY p.created_at DESC
  `).all(req.user.id);
  res.json(posts);
});

// NEUE ROUTE: API für die Gimmick-Galerie
app.get('/api/posts/gallery', authenticateToken, (req, res) => {
  const galleryPosts = db.prepare(`
    SELECT p.id, p.content, p.image, u.username, u.avatar
    FROM posts p
    JOIN users u ON p.user_id = u.id
    WHERE p.image != ''
    ORDER BY p.created_at DESC
    LIMIT 12
  `).all();
  res.json(galleryPosts);
});

app.post('/api/posts', authenticateToken, upload.single('image'), (req, res) => {
  const { content } = req.body;
  const id = uuidv4();
  const image = req.file ? saveFileLocally(req.file.buffer, req.file.originalname) : '';
  db.prepare('INSERT INTO posts (id, user_id, content, image) VALUES (?, ?, ?, ?)').run(id, req.user.id, content || '', image);
  res.json(db.prepare('SELECT p.*, u.username, u.display_name, u.avatar FROM posts p JOIN users u ON p.user_id = u.id WHERE p.id = ?').get(id));
});

app.delete('/api/posts/:id', authenticateToken, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post || post.user_id !== req.user.id) return res.status(403).json({ error: 'Unauthorized' });
  db.transaction(() => {
    db.prepare('DELETE FROM likes WHERE post_id = ?').run(req.params.id);
    db.prepare('DELETE FROM comments WHERE post_id = ?').run(req.params.id);
    db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  })();
  if (post.image && fs.existsSync(path.join(__dirname, post.image))) fs.unlinkSync(path.join(__dirname, post.image));
  res.json({ success: true });
});

// --- LIKES & COMMENTS ---
app.post('/api/posts/:id/like', authenticateToken, (req, res) => {
  const existing = db.prepare('SELECT id FROM likes WHERE post_id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (existing) {
    db.prepare('DELETE FROM likes WHERE id = ?').run(existing.id);
    res.json({ liked: 0 });
  } else {
    db.prepare('INSERT INTO likes (id, post_id, user_id) VALUES (?, ?, ?)').run(uuidv4(), req.params.id, req.user.id);
    res.json({ liked: 1 });
  }
});

app.get('/api/posts/:id/comments', authenticateToken, (req, res) => {
  res.json(db.prepare('SELECT c.*, u.username, u.display_name, u.avatar FROM comments c JOIN users u ON c.user_id = u.id WHERE c.post_id = ? ORDER BY c.created_at ASC').all(req.params.id));
});

app.post('/api/posts/:id/comments', authenticateToken, (req, res) => {
  if (!req.body.content) return res.status(400).json({ error: 'Content required' });
  const id = uuidv4();
  db.prepare('INSERT INTO comments (id, post_id, user_id, content) VALUES (?, ?, ?, ?)').run(id, req.params.id, req.user.id, req.body.content);
  res.json(db.prepare('SELECT c.*, u.username, u.display_name, u.avatar FROM comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?').get(id));
});

// --- FRONTEND SERVING ---
const frontendPath = fs.existsSync(path.join(__dirname, 'dist')) ? path.join(__dirname, 'dist') : path.join(__dirname, 'public');
app.use(express.static(frontendPath));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
    const indexPath = path.join(frontendPath, 'index.html');
    if (fs.existsSync(indexPath)) res.sendFile(indexPath);
    else res.status(404).send('Frontend not built.');
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));