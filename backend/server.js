const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const Database = require('better-sqlite3');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'sneaks-and-socks-club-secret-key-2024';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'database.sqlite');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
const IMGBB_API_KEY = process.env.IMGBB_API_KEY || '';

// Helper function to save file locally
function saveFileLocally(buffer, originalname) {
  const ext = path.extname(originalname);
  const filename = `${uuidv4()}${ext}`;
  const filepath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(filepath, buffer);
  return `/uploads/${filename}`;
}

// Helper function to upload image to ImgBB
async function uploadToImgBB(fileBuffer, filename) {
  if (!IMGBB_API_KEY) {
    return null;
  }
  try {
    const base64 = fileBuffer.toString('base64');
    const response = await axios.post(
      `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`,
      { image: base64, name: filename },
      { headers: { 'Content-Type': 'application/json' } }
    );
    
    if (response.data && response.data.data && response.data.data.url) {
      return response.data.data.url;
    }
  } catch (error) {
    console.error('ImgBB upload error:', error.message);
  }
  return null;
}

// Ensure directories exist
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Initialize SQLite database
const db = new Database(DB_PATH);

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    display_name TEXT,
    bio TEXT DEFAULT '',
    avatar TEXT DEFAULT '',
    location TEXT DEFAULT '',
    website TEXT DEFAULT '',
    favorite_sneakers TEXT DEFAULT '',
    favorite_socks TEXT DEFAULT '',
    sneaker_size TEXT DEFAULT '',
    sock_size TEXT DEFAULT '',
    favorite_brands TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    image TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS likes (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(post_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOAD_DIR));

// Multer setup - use memory storage to get buffer for ImgBB upload
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Auth middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'No token provided' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// ============ AUTH ROUTES ============

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, display_name } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email and password required' });
    }

    const existingUser = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
    if (existingUser) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const id = uuidv4();

    db.prepare(
      'INSERT INTO users (id, username, email, password, display_name) VALUES (?, ?, ?, ?, ?)'
    ).run(id, username, email, hashedPassword, display_name || username);

    const token = jwt.sign({ id, username }, JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, user: { id, username, email, display_name: display_name || username } });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        display_name: user.display_name,
        bio: user.bio,
        avatar: user.avatar,
        location: user.location,
        website: user.website,
        favorite_sneakers: user.favorite_sneakers,
        favorite_socks: user.favorite_socks,
        sneaker_size: user.sneaker_size,
        sock_size: user.sock_size,
        favorite_brands: user.favorite_brands
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
app.get('/api/auth/me', authenticateToken, (req, res) => {
  const user = db.prepare('SELECT id, username, email, display_name, bio, avatar, location, website, favorite_sneakers, favorite_socks, sneaker_size, sock_size, favorite_brands, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// ============ USER ROUTES ============

// Get all members
app.get('/api/users', authenticateToken, (req, res) => {
  const users = db.prepare('SELECT id, username, display_name, avatar, bio, location, website, favorite_sneakers, favorite_socks, sneaker_size, sock_size, favorite_brands, created_at FROM users ORDER BY created_at DESC').all();
  res.json(users);
});

// Get user profile
app.get('/api/users/:id', authenticateToken, (req, res) => {
  const user = db.prepare('SELECT id, username, display_name, bio, avatar, location, website, favorite_sneakers, favorite_socks, sneaker_size, sock_size, favorite_brands, created_at FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const posts = db.prepare('SELECT * FROM posts WHERE user_id = ? ORDER BY created_at DESC').all(req.params.id);
  const postCount = posts.length;

  res.json({ ...user, post_count: postCount });
});

// Update profile
app.put('/api/users/:id', authenticateToken, upload.single('avatar'), async (req, res) => {
  if (req.user.id !== req.params.id) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const { display_name, bio, location, website, favorite_sneakers, favorite_socks, sneaker_size, sock_size, favorite_brands } = req.body;
  
  let avatar = null;
  if (req.file) {
    if (IMGBB_API_KEY) {
      // Upload to ImgBB for permanent storage
      avatar = await uploadToImgBB(req.file.buffer, req.file.originalname);
      console.log('ImgBB result:', avatar);
    }
    if (!avatar) {
      // Fallback to local storage
      console.log('Using local storage fallback');
      avatar = saveFileLocally(req.file.buffer, req.file.originalname);
    }
  }

  if (avatar) {
    db.prepare(`UPDATE users SET 
      display_name = COALESCE(?, display_name), 
      bio = COALESCE(?, bio), 
      avatar = ?,
      location = COALESCE(?, location),
      website = COALESCE(?, website),
      favorite_sneakers = COALESCE(?, favorite_sneakers),
      favorite_socks = COALESCE(?, favorite_socks),
      sneaker_size = COALESCE(?, sneaker_size),
      sock_size = COALESCE(?, sock_size),
      favorite_brands = COALESCE(?, favorite_brands)
    WHERE id = ?`)
      .run(display_name, bio, avatar, location, website, favorite_sneakers, favorite_socks, sneaker_size, sock_size, favorite_brands, req.params.id);
  } else {
    db.prepare(`UPDATE users SET 
      display_name = COALESCE(?, display_name), 
      bio = COALESCE(?, bio),
      location = COALESCE(?, location),
      website = COALESCE(?, website),
      favorite_sneakers = COALESCE(?, favorite_sneakers),
      favorite_socks = COALESCE(?, favorite_socks),
      sneaker_size = COALESCE(?, sneaker_size),
      sock_size = COALESCE(?, sock_size),
      favorite_brands = COALESCE(?, favorite_brands)
    WHERE id = ?`)
      .run(display_name, bio, location, website, favorite_sneakers, favorite_socks, sneaker_size, sock_size, favorite_brands, req.params.id);
  }

  const user = db.prepare('SELECT id, username, display_name, bio, avatar, location, website, favorite_sneakers, favorite_socks, sneaker_size, sock_size, favorite_brands, created_at FROM users WHERE id = ?').get(req.params.id);
  res.json(user);
});

// ============ POST ROUTES ============

// Get all posts (feed)
app.get('/api/posts', authenticateToken, (req, res) => {
  const posts = db.prepare(`
    SELECT 
      p.*,
      u.username,
      u.display_name,
      u.avatar,
      (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
      (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count
    FROM posts p
    JOIN users u ON p.user_id = u.id
    ORDER BY p.created_at DESC
  `).all();

  // Add liked status for current user
  const postsWithLikeStatus = posts.map(post => {
    const liked = db.prepare('SELECT id FROM likes WHERE post_id = ? AND user_id = ?').get(post.id, req.user.id);
    return { ...post, liked: !!liked };
  });

  res.json(postsWithLikeStatus);
});

// Get user's posts
app.get('/api/users/:id/posts', authenticateToken, (req, res) => {
  const posts = db.prepare(`
    SELECT 
      p.*,
      u.username,
      u.display_name,
      u.avatar,
      (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
      (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count
    FROM posts p
    JOIN users u ON p.user_id = u.id
    WHERE p.user_id = ?
    ORDER BY p.created_at DESC
  `).all(req.params.id);

  const postsWithLikeStatus = posts.map(post => {
    const liked = db.prepare('SELECT id FROM likes WHERE post_id = ? AND user_id = ?').get(post.id, req.user.id);
    return { ...post, liked: !!liked };
  });

  res.json(postsWithLikeStatus);
});

// Create post
app.post('/api/posts', authenticateToken, upload.single('image'), (req, res) => {
  const { content } = req.body;
  
  if (!content && !req.file) {
    return res.status(400).json({ error: 'Post must have content or an image' });
  }

  const id = uuidv4();
  const image = req.file ? `/uploads/${req.file.filename}` : '';

  db.prepare('INSERT INTO posts (id, user_id, content, image) VALUES (?, ?, ?, ?)')
    .run(id, req.user.id, content || '', image);

  const post = db.prepare(`
    SELECT p.*, u.username, u.display_name, u.avatar
    FROM posts p
    JOIN users u ON p.user_id = u.id
    WHERE p.id = ?
  `).get(id);

  res.json({ ...post, like_count: 0, comment_count: 0, liked: false });
});

// Delete post
app.delete('/api/posts/:id', authenticateToken, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

  // Delete likes and comments first
  db.prepare('DELETE FROM likes WHERE post_id = ?').run(req.params.id);
  db.prepare('DELETE FROM comments WHERE post_id = ?').run(req.params.id);
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);

  // Delete image file if exists
  if (post.image) {
    const imagePath = path.join(__dirname, post.image);
    if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
  }

  res.json({ success: true });
});

// ============ LIKE ROUTES ============

// Toggle like
app.post('/api/posts/:id/like', authenticateToken, (req, res) => {
  const postId = req.params.id;
  const userId = req.user.id;

  const existing = db.prepare('SELECT id FROM likes WHERE post_id = ? AND user_id = ?').get(postId, userId);

  if (existing) {
    db.prepare('DELETE FROM likes WHERE id = ?').run(existing.id);
    res.json({ liked: false });
  } else {
    db.prepare('INSERT INTO likes (id, post_id, user_id) VALUES (?, ?, ?)').run(uuidv4(), postId, userId);
    res.json({ liked: true });
  }
});

// ============ COMMENT ROUTES ============

// Get comments for a post
app.get('/api/posts/:id/comments', authenticateToken, (req, res) => {
  const comments = db.prepare(`
    SELECT c.*, u.username, u.display_name, u.avatar
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.post_id = ?
    ORDER BY c.created_at ASC
  `).all(req.params.id);

  res.json(comments);
});

// Add comment
app.post('/api/posts/:id/comments', authenticateToken, (req, res) => {
  const { content } = req.body;
  
  if (!content) {
    return res.status(400).json({ error: 'Comment content required' });
  }

  const id = uuidv4();
  db.prepare('INSERT INTO comments (id, post_id, user_id, content) VALUES (?, ?, ?, ?)')
    .run(id, req.params.id, req.user.id, content);

  const comment = db.prepare(`
    SELECT c.*, u.username, u.display_name, u.avatar
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.id = ?
  `).get(id);

  res.json(comment);
});

// ============ SERVE FRONTEND IN PRODUCTION ============

const publicPath = path.join(__dirname, 'public');

// Serve static files from public directory
if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath));
  
  // Serve index.html for all non-API routes (SPA support)
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
      const indexPath = path.join(publicPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Frontend not built yet. Run npm run build in frontend directory.');
      }
    }
  });
}

// ============ START SERVER ============

app.listen(PORT, () => {
  console.log(`Sneaks and Socks Club running on port ${PORT}`);
});
