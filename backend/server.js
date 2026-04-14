const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const Database = require('better-sqlite3');
const sharp = require('sharp');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'sneaks-and-socks-club-secret-key-2024';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'database.sqlite');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');

async function saveFileLocally(buffer, originalname, isAvatar = false) {
  const filename = `${uuidv4()}.webp`;
  const filepath = path.join(UPLOAD_DIR, filename);
  let pipeline = sharp(buffer);
  if (isAvatar) {
    pipeline = pipeline.resize(400, 400, { fit: 'cover', position: 'centre' });
  } else {
    pipeline = pipeline.resize(1200, 1200, { fit: 'inside', withoutEnlargement: true });
  }
  await pipeline.webp({ quality: 80 }).toFile(filepath);
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
  CREATE TABLE IF NOT EXISTS follows (
    id TEXT PRIMARY KEY, follower_id TEXT NOT NULL, following_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(follower_id, following_id)
  );
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY, user1_id TEXT NOT NULL, user2_id TEXT NOT NULL,
    last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(user1_id, user2_id)
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, sender_id TEXT NOT NULL,
    content TEXT NOT NULL, read_at DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS forum_topics (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL,
    content TEXT NOT NULL, image TEXT DEFAULT '', category TEXT DEFAULT 'general',
    views INTEGER DEFAULT 0, pinned INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS forum_replies (
    id TEXT PRIMARY KEY, topic_id TEXT NOT NULL, user_id TEXT NOT NULL,
    content TEXT NOT NULL, image TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (topic_id) REFERENCES forum_topics(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS reactions (
    id TEXT PRIMARY KEY, post_id TEXT NOT NULL, user_id TEXT NOT NULL,
    emoji TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(post_id, user_id, emoji)
  );
  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    reporter_id TEXT NOT NULL,
    content_type TEXT NOT NULL,
    content_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'open',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (reporter_id) REFERENCES users(id)
  );
`);

// Automatisch Spalten bei alten Datenbanken nachrüsten
try {
  db.exec("ALTER TABLE messages ADD COLUMN archived_by TEXT DEFAULT NULL;");
} catch (e) { /* Spalte existiert bereits */ }

// Automatisch last_active Spalte bei alten Datenbanken nachrüsten
try {
  db.exec("ALTER TABLE users ADD COLUMN last_active DATETIME DEFAULT CURRENT_TIMESTAMP;");
} catch (e) { /* Spalte existiert bereits */ }

// is_admin Spalte nachrüsten
try {
  db.exec("ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0;");
} catch (e) { /* Spalte existiert bereits */ }

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
  res.json(db.prepare('SELECT id, username, email, display_name, avatar, bio, location, website, is_admin FROM users WHERE id = ?').get(req.user.id));
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

// --- SEARCH ROUTE ---
app.get('/api/search', authenticateToken, (req, res) => {
  const q = req.query.q;
  if (!q || q.trim().length === 0) return res.json({ users: [], posts: [] });
  const searchTerm = `%${q.trim()}%`;
  const users = db.prepare(`
    SELECT id, username, display_name, avatar, bio
    FROM users WHERE username LIKE ? OR display_name LIKE ?
    ORDER BY username ASC LIMIT 20
  `).all(searchTerm, searchTerm);
  const posts = db.prepare(`
    SELECT p.*, u.username, u.display_name, u.avatar,
    (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
    (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
    (SELECT 1 FROM likes WHERE post_id = p.id AND user_id = ?) as liked
    FROM posts p JOIN users u ON p.user_id = u.id
    WHERE p.content LIKE ?
    ORDER BY p.created_at DESC LIMIT 50
  `).all(req.user.id, searchTerm);
  res.json({ users, posts });
});

// --- USER ROUTES ---
// HIER WAR DER FEHLER: Diese Route fehlte, deshalb war die Members-Seite leer!
app.get('/api/users', authenticateToken, (req, res) => {
  const users = db.prepare('SELECT id, username, display_name, avatar, bio FROM users ORDER BY created_at DESC').all();
  res.json(users);
});

app.get('/api/users/by-username/:username', authenticateToken, (req, res) => {
  const user = db.prepare('SELECT id, username FROM users WHERE LOWER(username) = LOWER(?)').get(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

app.get('/api/users/:id', authenticateToken, (req, res) => {
  const user = db.prepare('SELECT id, username, display_name, avatar, bio, location, website, favorite_sneakers, favorite_socks, sneaker_size, sock_size, favorite_brands FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const followerCount = db.prepare('SELECT COUNT(*) as count FROM follows WHERE following_id = ?').get(req.params.id).count;
  const followingCount = db.prepare('SELECT COUNT(*) as count FROM follows WHERE follower_id = ?').get(req.params.id).count;
  const isFollowing = db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?').get(req.user.id, req.params.id) ? true : false;
  res.json({ ...user, follower_count: followerCount, following_count: followingCount, is_following: isFollowing });
});
app.get('/api/users/:id/posts', authenticateToken, (req, res) => res.json(db.prepare('SELECT p.*, u.username, u.display_name, u.avatar FROM posts p JOIN users u ON p.user_id = u.id WHERE p.user_id = ? ORDER BY p.created_at DESC').all(req.params.id)));

// --- FOLLOWER ROUTES ---
app.post('/api/users/:id/follow', authenticateToken, (req, res) => {
  if (req.user.id === req.params.id) return res.status(400).json({ error: 'Cannot follow yourself' });
  const existing = db.prepare('SELECT id FROM follows WHERE follower_id = ? AND following_id = ?').get(req.user.id, req.params.id);
  if (existing) {
    db.prepare('DELETE FROM follows WHERE id = ?').run(existing.id);
    res.json({ following: false });
  } else {
    db.prepare('INSERT INTO follows (id, follower_id, following_id) VALUES (?, ?, ?)').run(uuidv4(), req.user.id, req.params.id);
    res.json({ following: true });
  }
});

app.get('/api/users/:id/followers', authenticateToken, (req, res) => {
  const followers = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar, u.bio
    FROM follows f JOIN users u ON f.follower_id = u.id
    WHERE f.following_id = ? ORDER BY f.created_at DESC
  `).all(req.params.id);
  res.json(followers);
});

app.get('/api/users/:id/following', authenticateToken, (req, res) => {
  const following = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar, u.bio
    FROM follows f JOIN users u ON f.following_id = u.id
    WHERE f.follower_id = ? ORDER BY f.created_at DESC
  `).all(req.params.id);
  res.json(following);
});

app.put('/api/users/:id', authenticateToken, upload.single('avatar'), async (req, res) => {
  if (req.user.id !== req.params.id) return res.status(403).json({ error: 'Unauthorized' });
  const { display_name, bio, location, website, favorite_sneakers, favorite_socks, sneaker_size, sock_size, favorite_brands } = req.body;
  let avatar = req.file ? await saveFileLocally(req.file.buffer, req.file.originalname, true) : null;
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
    (SELECT 1 FROM likes WHERE post_id = p.id AND user_id = ?) as liked,
    (SELECT json_group_object(emoji, c) FROM (SELECT emoji, COUNT(*) as c FROM reactions WHERE post_id = p.id GROUP BY emoji)) as reactions_json,
    (SELECT json_group_array(emoji) FROM reactions WHERE post_id = p.id AND user_id = ?) as my_reactions_json
    FROM posts p JOIN users u ON p.user_id = u.id ORDER BY p.created_at DESC
  `).all(req.user.id, req.user.id);
  res.json(posts.map(p => ({
    ...p,
    reactions: p.reactions_json ? JSON.parse(p.reactions_json) : {},
    my_reactions: p.my_reactions_json ? JSON.parse(p.my_reactions_json) : [],
    reactions_json: undefined,
    my_reactions_json: undefined
  })));
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

app.post('/api/posts', authenticateToken, upload.single('image'), async (req, res) => {
  const { content } = req.body;
  const id = uuidv4();
  const image = req.file ? await saveFileLocally(req.file.buffer, req.file.originalname) : '';
  db.prepare('INSERT INTO posts (id, user_id, content, image) VALUES (?, ?, ?, ?)').run(id, req.user.id, content || '', image);
  res.json(db.prepare('SELECT p.*, u.username, u.display_name, u.avatar FROM posts p JOIN users u ON p.user_id = u.id WHERE p.id = ?').get(id));
});

app.put('/api/posts/:id', authenticateToken, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post || post.user_id !== req.user.id) return res.status(403).json({ error: 'Unauthorized' });
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Content required' });
  db.prepare('UPDATE posts SET content = ? WHERE id = ?').run(content.trim(), req.params.id);
  res.json(db.prepare('SELECT p.*, u.username, u.display_name, u.avatar FROM posts p JOIN users u ON p.user_id = u.id WHERE p.id = ?').get(req.params.id));
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

app.post('/api/posts/:id/react', authenticateToken, (req, res) => {
  const ALLOWED = ['🔥', '👟', '🧦', '❤️', '😂'];
  const { emoji } = req.body;
  if (!ALLOWED.includes(emoji)) return res.status(400).json({ error: 'Invalid emoji' });
  const existing = db.prepare('SELECT id FROM reactions WHERE post_id = ? AND user_id = ? AND emoji = ?').get(req.params.id, req.user.id, emoji);
  if (existing) {
    db.prepare('DELETE FROM reactions WHERE id = ?').run(existing.id);
    res.json({ reacted: false, emoji });
  } else {
    db.prepare('INSERT INTO reactions (id, post_id, user_id, emoji) VALUES (?, ?, ?, ?)').run(uuidv4(), req.params.id, req.user.id, emoji);
    res.json({ reacted: true, emoji });
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

// --- DIRECT MESSAGES ROUTES ---
app.get('/api/conversations', authenticateToken, (req, res) => {
  const conversations = db.prepare(`
    SELECT c.*,
      CASE WHEN c.user1_id = ? THEN u2.id ELSE u1.id END as other_user_id,
      CASE WHEN c.user1_id = ? THEN u2.username ELSE u1.username END as other_username,
      CASE WHEN c.user1_id = ? THEN u2.display_name ELSE u1.display_name END as other_display_name,
      CASE WHEN c.user1_id = ? THEN u2.avatar ELSE u1.avatar END as other_avatar,
      (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
      (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id != ? AND read_at IS NULL) as unread_count
    FROM conversations c
    JOIN users u1 ON c.user1_id = u1.id
    JOIN users u2 ON c.user2_id = u2.id
    WHERE c.user1_id = ? OR c.user2_id = ?
    ORDER BY c.last_message_at DESC
  `).all(req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id);
  res.json(conversations);
});

app.post('/api/conversations', authenticateToken, (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id required' });
  if (user_id === req.user.id) return res.status(400).json({ error: 'Cannot message yourself' });
  const [u1, u2] = [req.user.id, user_id].sort();
  let conversation = db.prepare('SELECT * FROM conversations WHERE user1_id = ? AND user2_id = ?').get(u1, u2);
  if (!conversation) {
    const id = uuidv4();
    db.prepare('INSERT INTO conversations (id, user1_id, user2_id) VALUES (?, ?, ?)').run(id, u1, u2);
    conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  }
  res.json(conversation);
});

app.get('/api/conversations/:id', authenticateToken, (req, res) => {
  const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id);
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
  if (conversation.user1_id !== req.user.id && conversation.user2_id !== req.user.id) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  const messages = db.prepare(`
    SELECT m.*, u.username, u.display_name, u.avatar
    FROM messages m JOIN users u ON m.sender_id = u.id
    WHERE m.conversation_id = ? ORDER BY m.created_at ASC
  `).all(req.params.id);
  const otherUserId = conversation.user1_id === req.user.id ? conversation.user2_id : conversation.user1_id;
  const otherUser = db.prepare('SELECT id, username, display_name, avatar FROM users WHERE id = ?').get(otherUserId);
  res.json({ conversation, messages, other_user: otherUser });
});

app.post('/api/conversations/:id/messages', authenticateToken, (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Content required' });
  const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id);
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
  if (conversation.user1_id !== req.user.id && conversation.user2_id !== req.user.id) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  const id = uuidv4();
  db.prepare('INSERT INTO messages (id, conversation_id, sender_id, content) VALUES (?, ?, ?, ?)').run(id, req.params.id, req.user.id, content.trim());
  db.prepare('UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
  const message = db.prepare(`
    SELECT m.*, u.username, u.display_name, u.avatar
    FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.id = ?
  `).get(id);
  res.json(message);
});

app.put('/api/conversations/:id/read', authenticateToken, (req, res) => {
  const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id);
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
  if (conversation.user1_id !== req.user.id && conversation.user2_id !== req.user.id) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  db.prepare('UPDATE messages SET read_at = CURRENT_TIMESTAMP WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL').run(req.params.id, req.user.id);
  res.json({ success: true });
});

// --- MESSAGE FOLDERS (Posteingang, Postausgang, Archiv) ---
app.get('/api/messages/inbox', authenticateToken, (req, res) => {
  const messages = db.prepare(`
    SELECT m.*, u.username, u.display_name, u.avatar,
      c.user1_id, c.user2_id
    FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    JOIN users u ON m.sender_id = u.id
    WHERE (c.user1_id = ? OR c.user2_id = ?)
      AND m.sender_id != ?
      AND (m.archived_by IS NULL OR m.archived_by NOT LIKE ?)
    ORDER BY m.created_at DESC
  `).all(req.user.id, req.user.id, req.user.id, `%${req.user.id}%`);
  res.json(messages);
});

app.get('/api/messages/sent', authenticateToken, (req, res) => {
  const messages = db.prepare(`
    SELECT m.*, u.username as recipient_username, u.display_name as recipient_display_name, u.avatar as recipient_avatar
    FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    JOIN users u ON u.id = CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END
    WHERE m.sender_id = ?
      AND (m.archived_by IS NULL OR m.archived_by NOT LIKE ?)
    ORDER BY m.created_at DESC
  `).all(req.user.id, req.user.id, `%${req.user.id}%`);
  res.json(messages);
});

app.get('/api/messages/archived', authenticateToken, (req, res) => {
  const messages = db.prepare(`
    SELECT m.*,
      sender.username as sender_username, sender.display_name as sender_display_name, sender.avatar as sender_avatar,
      CASE WHEN m.sender_id = ? THEN 'sent' ELSE 'received' END as direction
    FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    JOIN users sender ON m.sender_id = sender.id
    WHERE (c.user1_id = ? OR c.user2_id = ?)
      AND m.archived_by LIKE ?
    ORDER BY m.created_at DESC
  `).all(req.user.id, req.user.id, req.user.id, `%${req.user.id}%`);
  res.json(messages);
});

app.post('/api/messages/:id/archive', authenticateToken, (req, res) => {
  const message = db.prepare(`
    SELECT m.*, c.user1_id, c.user2_id FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    WHERE m.id = ?
  `).get(req.params.id);
  if (!message) return res.status(404).json({ error: 'Message not found' });
  if (message.user1_id !== req.user.id && message.user2_id !== req.user.id) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  const currentArchived = message.archived_by || '';
  if (!currentArchived.includes(req.user.id)) {
    const newArchived = currentArchived ? `${currentArchived},${req.user.id}` : req.user.id;
    db.prepare('UPDATE messages SET archived_by = ? WHERE id = ?').run(newArchived, req.params.id);
  }
  res.json({ success: true, archived: true });
});

app.post('/api/messages/:id/unarchive', authenticateToken, (req, res) => {
  const message = db.prepare(`
    SELECT m.*, c.user1_id, c.user2_id FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    WHERE m.id = ?
  `).get(req.params.id);
  if (!message) return res.status(404).json({ error: 'Message not found' });
  if (message.user1_id !== req.user.id && message.user2_id !== req.user.id) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  const currentArchived = message.archived_by || '';
  const newArchived = currentArchived.split(',').filter(id => id !== req.user.id).join(',');
  db.prepare('UPDATE messages SET archived_by = ? WHERE id = ?').run(newArchived || null, req.params.id);
  res.json({ success: true, archived: false });
});

app.get('/api/messages/export', authenticateToken, (req, res) => {
  const ids = req.query.ids ? req.query.ids.split(',') : [];
  if (ids.length === 0) return res.status(400).json({ error: 'No message IDs provided' });

  const placeholders = ids.map(() => '?').join(',');
  const messages = db.prepare(`
    SELECT m.*,
      sender.username as sender_username, sender.display_name as sender_display_name,
      c.user1_id, c.user2_id
    FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    JOIN users sender ON m.sender_id = sender.id
    WHERE m.id IN (${placeholders})
      AND (c.user1_id = ? OR c.user2_id = ?)
    ORDER BY m.created_at ASC
  `).all(...ids, req.user.id, req.user.id);

  const exportData = messages.map(m => ({
    von: m.sender_display_name || m.sender_username,
    datum: new Date(m.created_at).toLocaleString('de-DE'),
    nachricht: m.content
  }));

  res.json({ messages: exportData, exported_at: new Date().toISOString() });
});

app.get('/api/messages/unread-count', authenticateToken, (req, res) => {
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    WHERE (c.user1_id = ? OR c.user2_id = ?) AND m.sender_id != ? AND m.read_at IS NULL
  `).get(req.user.id, req.user.id, req.user.id);
  res.json({ count: row.count || 0 });
});

// --- FORUM ROUTES ---
const FORUM_CATEGORIES = [
  { id: 'general', name: 'Allgemein', icon: '💬' },
  { id: 'sneakers', name: 'Sneakers', icon: '👟' },
  { id: 'socks', name: 'Socken', icon: '🧦' },
  { id: 'collections', name: 'Sammlungen', icon: '📸' },
  { id: 'trading', name: 'Börse', icon: '💰' },
  { id: 'offtopic', name: 'Off-Topic', icon: '🎲' }
];

app.get('/api/forum/categories', authenticateToken, (req, res) => {
  res.json(FORUM_CATEGORIES);
});

app.get('/api/forum/topics', authenticateToken, (req, res) => {
  const category = req.query.category;
  let query = `
    SELECT t.*, u.username, u.display_name, u.avatar,
    (SELECT COUNT(*) FROM forum_replies WHERE topic_id = t.id) as reply_count
    FROM forum_topics t JOIN users u ON t.user_id = u.id
  `;
  const params = [];
  if (category && category !== 'all') {
    query += ' WHERE t.category = ?';
    params.push(category);
  }
  query += ' ORDER BY t.pinned DESC, t.updated_at DESC';
  res.json(db.prepare(query).all(...params));
});

app.get('/api/forum/topics/:id', authenticateToken, (req, res) => {
  const topic = db.prepare(`
    SELECT t.*, u.username, u.display_name, u.avatar
    FROM forum_topics t JOIN users u ON t.user_id = u.id WHERE t.id = ?
  `).get(req.params.id);
  if (!topic) return res.status(404).json({ error: 'Topic not found' });
  db.prepare('UPDATE forum_topics SET views = views + 1 WHERE id = ?').run(req.params.id);
  const replies = db.prepare(`
    SELECT r.*, u.username, u.display_name, u.avatar
    FROM forum_replies r JOIN users u ON r.user_id = u.id
    WHERE r.topic_id = ? ORDER BY r.created_at ASC
  `).all(req.params.id);
  res.json({ topic: { ...topic, views: topic.views + 1 }, replies });
});

app.post('/api/forum/topics', authenticateToken, upload.single('image'), async (req, res) => {
  const { title, content, category } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Title and content required' });
  const id = uuidv4();
  const image = req.file ? await saveFileLocally(req.file.buffer, req.file.originalname) : '';
  db.prepare('INSERT INTO forum_topics (id, user_id, title, content, image, category) VALUES (?, ?, ?, ?, ?, ?)').run(id, req.user.id, title, content, image, category || 'general');
  const topic = db.prepare(`
    SELECT t.*, u.username, u.display_name, u.avatar
    FROM forum_topics t JOIN users u ON t.user_id = u.id WHERE t.id = ?
  `).get(id);
  res.json(topic);
});

app.put('/api/forum/topics/:id', authenticateToken, (req, res) => {
  const topic = db.prepare('SELECT * FROM forum_topics WHERE id = ?').get(req.params.id);
  if (!topic) return res.status(404).json({ error: 'Not found' });
  if (topic.user_id !== req.user.id) return res.status(403).json({ error: 'Unauthorized' });
  const { title, content } = req.body;
  if (!title?.trim() || !content?.trim()) return res.status(400).json({ error: 'Title and content required' });
  db.prepare('UPDATE forum_topics SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(title.trim(), content.trim(), req.params.id);
  res.json(db.prepare('SELECT t.*, u.username, u.display_name, u.avatar FROM forum_topics t JOIN users u ON t.user_id = u.id WHERE t.id = ?').get(req.params.id));
});

app.delete('/api/forum/topics/:id', authenticateToken, (req, res) => {
  const topic = db.prepare('SELECT * FROM forum_topics WHERE id = ?').get(req.params.id);
  if (!topic) return res.status(404).json({ error: 'Topic not found' });
  if (topic.user_id !== req.user.id) return res.status(403).json({ error: 'Unauthorized' });
  db.transaction(() => {
    db.prepare('DELETE FROM forum_replies WHERE topic_id = ?').run(req.params.id);
    db.prepare('DELETE FROM forum_topics WHERE id = ?').run(req.params.id);
  })();
  res.json({ success: true });
});

app.post('/api/forum/topics/:id/replies', authenticateToken, upload.single('image'), async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Content required' });
  const topic = db.prepare('SELECT * FROM forum_topics WHERE id = ?').get(req.params.id);
  if (!topic) return res.status(404).json({ error: 'Topic not found' });
  const id = uuidv4();
  const image = req.file ? await saveFileLocally(req.file.buffer, req.file.originalname) : '';
  db.prepare('INSERT INTO forum_replies (id, topic_id, user_id, content, image) VALUES (?, ?, ?, ?, ?)').run(id, req.params.id, req.user.id, content, image);
  db.prepare('UPDATE forum_topics SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
  const reply = db.prepare(`
    SELECT r.*, u.username, u.display_name, u.avatar
    FROM forum_replies r JOIN users u ON r.user_id = u.id WHERE r.id = ?
  `).get(id);
  res.json(reply);
});

app.put('/api/forum/replies/:id', authenticateToken, (req, res) => {
  const reply = db.prepare('SELECT * FROM forum_replies WHERE id = ?').get(req.params.id);
  if (!reply) return res.status(404).json({ error: 'Not found' });
  if (reply.user_id !== req.user.id) return res.status(403).json({ error: 'Unauthorized' });
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Content required' });
  db.prepare('UPDATE forum_replies SET content = ? WHERE id = ?').run(content.trim(), reply.id);
  res.json(db.prepare('SELECT r.*, u.username, u.display_name, u.avatar FROM forum_replies r JOIN users u ON r.user_id = u.id WHERE r.id = ?').get(reply.id));
});

app.delete('/api/forum/replies/:id', authenticateToken, (req, res) => {
  const reply = db.prepare('SELECT * FROM forum_replies WHERE id = ?').get(req.params.id);
  if (!reply) return res.status(404).json({ error: 'Reply not found' });
  if (reply.user_id !== req.user.id) return res.status(403).json({ error: 'Unauthorized' });
  db.prepare('DELETE FROM forum_replies WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// --- REPORT ROUTES ---
const REPORT_REASONS = ['Spam', 'Beleidigung', 'Unangemessener Inhalt', 'Fehlinformation', 'Sonstiges'];

// --- ADMIN MIDDLEWARE ---
const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    const user = db.prepare('SELECT id, username, is_admin FROM users WHERE id = ?').get(decoded.id);
    if (!user || !user.is_admin) return res.status(403).json({ error: 'Admin only' });
    req.user = decoded;
    next();
  });
};

app.post('/api/reports', authenticateToken, (req, res) => {
  const { content_type, content_id, reason } = req.body;
  if (!['post', 'comment', 'topic', 'reply'].includes(content_type)) return res.status(400).json({ error: 'Invalid content_type' });
  if (!REPORT_REASONS.includes(reason)) return res.status(400).json({ error: 'Invalid reason' });
  const existing = db.prepare('SELECT id FROM reports WHERE reporter_id = ? AND content_id = ? AND status = ?').get(req.user.id, content_id, 'open');
  if (existing) return res.status(400).json({ error: 'Already reported' });
  db.prepare('INSERT INTO reports (id, reporter_id, content_type, content_id, reason) VALUES (?, ?, ?, ?, ?)').run(uuidv4(), req.user.id, content_type, content_id, reason);
  res.json({ success: true });
});

app.get('/api/admin/reports', authenticateAdmin, (req, res) => {
  const reports = db.prepare(`
    SELECT r.*, u.username as reporter_username, u.display_name as reporter_display
    FROM reports r JOIN users u ON r.reporter_id = u.id
    WHERE r.status = 'open'
    ORDER BY r.created_at DESC
  `).all();

  const enriched = reports.map(r => {
    let content = null;
    try {
      if (r.content_type === 'post') {
        const p = db.prepare('SELECT p.content, p.image, u.username, u.display_name FROM posts p JOIN users u ON p.user_id = u.id WHERE p.id = ?').get(r.content_id);
        content = p;
      } else if (r.content_type === 'comment') {
        const c = db.prepare('SELECT c.content, u.username, u.display_name FROM comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?').get(r.content_id);
        content = c;
      } else if (r.content_type === 'topic') {
        const t = db.prepare('SELECT t.title, t.content, u.username, u.display_name FROM forum_topics t JOIN users u ON t.user_id = u.id WHERE t.id = ?').get(r.content_id);
        content = t;
      } else if (r.content_type === 'reply') {
        const rep = db.prepare('SELECT r.content, u.username, u.display_name FROM forum_replies r JOIN users u ON r.user_id = u.id WHERE r.id = ?').get(r.content_id);
        content = rep;
      }
    } catch(e) {}
    return { ...r, content };
  });
  res.json(enriched);
});

app.put('/api/admin/reports/:id/dismiss', authenticateAdmin, (req, res) => {
  db.prepare("UPDATE reports SET status = 'dismissed' WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

app.delete('/api/admin/reports/:id/delete-content', authenticateAdmin, (req, res) => {
  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });
  try {
    if (report.content_type === 'post') {
      db.prepare('DELETE FROM likes WHERE post_id = ?').run(report.content_id);
      db.prepare('DELETE FROM comments WHERE post_id = ?').run(report.content_id);
      db.prepare('DELETE FROM reactions WHERE post_id = ?').run(report.content_id);
      db.prepare('DELETE FROM posts WHERE id = ?').run(report.content_id);
    } else if (report.content_type === 'comment') {
      db.prepare('DELETE FROM comments WHERE id = ?').run(report.content_id);
    } else if (report.content_type === 'topic') {
      db.prepare('DELETE FROM forum_replies WHERE topic_id = ?').run(report.content_id);
      db.prepare('DELETE FROM forum_topics WHERE id = ?').run(report.content_id);
    } else if (report.content_type === 'reply') {
      db.prepare('DELETE FROM forum_replies WHERE id = ?').run(report.content_id);
    }
  } catch(e) {}
  db.prepare("UPDATE reports SET status = 'resolved' WHERE content_id = ?").run(report.content_id);
  res.json({ success: true });
});

// --- ADMIN ROUTES ---
app.get('/api/admin/stats', authenticateAdmin, (req, res) => {
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const postCount = db.prepare('SELECT COUNT(*) as c FROM posts').get().c;
  const topicCount = db.prepare('SELECT COUNT(*) as c FROM forum_topics').get().c;
  const messageCount = db.prepare('SELECT COUNT(*) as c FROM messages').get().c;
  const commentCount = db.prepare('SELECT COUNT(*) as c FROM comments').get().c;
  const onlineCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE last_active >= datetime('now', '-5 minutes')").get().c;
  res.json({ userCount, postCount, topicCount, messageCount, commentCount, onlineCount });
});

app.get('/api/admin/users', authenticateAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, display_name, email, avatar, bio, is_admin, created_at, last_active FROM users ORDER BY created_at DESC').all();
  res.json(users);
});

app.put('/api/admin/users/:id/toggle-admin', authenticateAdmin, (req, res) => {
  const user = db.prepare('SELECT id, is_admin FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.id === req.user.id) return res.status(400).json({ error: 'Cannot change your own admin status' });
  db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(user.is_admin ? 0 : 1, req.params.id);
  res.json({ is_admin: !user.is_admin });
});

app.delete('/api/admin/users/:id', authenticateAdmin, (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  db.prepare('DELETE FROM likes WHERE user_id = ?').run(req.params.id);
  db.prepare('DELETE FROM comments WHERE user_id = ?').run(req.params.id);
  db.prepare('DELETE FROM reactions WHERE user_id = ?').run(req.params.id);
  db.prepare('DELETE FROM follows WHERE follower_id = ? OR following_id = ?').run(req.params.id, req.params.id);
  db.prepare('DELETE FROM messages WHERE sender_id = ?').run(req.params.id);
  db.prepare('DELETE FROM forum_replies WHERE user_id = ?').run(req.params.id);
  db.prepare('DELETE FROM forum_topics WHERE user_id = ?').run(req.params.id);
  db.prepare('DELETE FROM posts WHERE user_id = ?').run(req.params.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/admin/posts', authenticateAdmin, (req, res) => {
  const posts = db.prepare(`
    SELECT p.id, p.content, p.image, p.created_at,
      u.username, u.display_name, u.avatar,
      (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
      (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count
    FROM posts p JOIN users u ON p.user_id = u.id
    ORDER BY p.created_at DESC LIMIT 100
  `).all();
  res.json(posts);
});

app.delete('/api/admin/posts/:id', authenticateAdmin, (req, res) => {
  db.prepare('DELETE FROM likes WHERE post_id = ?').run(req.params.id);
  db.prepare('DELETE FROM comments WHERE post_id = ?').run(req.params.id);
  db.prepare('DELETE FROM reactions WHERE post_id = ?').run(req.params.id);
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/admin/topics', authenticateAdmin, (req, res) => {
  const topics = db.prepare(`
    SELECT t.id, t.title, t.category, t.views, t.pinned, t.created_at,
      u.username, u.display_name,
      (SELECT COUNT(*) FROM forum_replies WHERE topic_id = t.id) as reply_count
    FROM forum_topics t JOIN users u ON t.user_id = u.id
    ORDER BY t.created_at DESC LIMIT 100
  `).all();
  res.json(topics);
});

app.delete('/api/admin/topics/:id', authenticateAdmin, (req, res) => {
  db.prepare('DELETE FROM forum_replies WHERE topic_id = ?').run(req.params.id);
  db.prepare('DELETE FROM forum_topics WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.put('/api/admin/topics/:id/pin', authenticateAdmin, (req, res) => {
  const topic = db.prepare('SELECT pinned FROM forum_topics WHERE id = ?').get(req.params.id);
  if (!topic) return res.status(404).json({ error: 'Topic not found' });
  db.prepare('UPDATE forum_topics SET pinned = ? WHERE id = ?').run(topic.pinned ? 0 : 1, req.params.id);
  res.json({ pinned: !topic.pinned });
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