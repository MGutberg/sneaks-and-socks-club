# 👟🧦 Sneaks and Socks Club

A community platform for sneaker and sock enthusiasts. Built with React, Node.js, SQLite, and Docker.

## Features

- ✅ User authentication (Register/Login)
- ✅ User profiles with avatars
- ✅ Member directory
- ✅ Post creation with image uploads
- ✅ Likes on posts
- ✅ Comments on posts
- ✅ Responsive design with Tailwind CSS
- ✅ Docker-ready deployment

## Tech Stack

**Frontend:**
- React 18
- Vite
- Tailwind CSS
- React Router

**Backend:**
- Node.js
- Express
- SQLite (better-sqlite3)
- JWT Authentication
- Multer (file uploads)

**Infrastructure:**
- Docker & Docker Compose

## Deployment

### Railway (Recommended)

1. Create a new Railway project
2. Connect your GitHub account
3. Select the `sneaks-and-socks-club` repository
4. Set the **Root Directory** to `.` (the root)
5. Railway will auto-detect the Dockerfile
6. Add Environment Variables:
   - `PORT` = `5000`
   - `JWT_SECRET` = `your-secret-key-here`
   - `DB_PATH` = `/app/data/database.sqlite`
   - `UPLOAD_DIR` = `/app/uploads`
   - `NODE_ENV` = `production`
7. Deploy!

The app will be available at `https://your-project.railway.app`

### Docker (VPS/Local)

```bash
# Clone the repository
git clone https://github.com/MGutberg/sneaks-and-socks-club.git
cd sneaks-and-socks-club

# Build and run with Docker
docker build -t sneaks-and-socks .
docker run -d -p 5000:5000 -v $(pwd)/data:/app/data -v $(pwd)/uploads:/app/uploads sneaks-and-socks
```

Or with Docker Compose:
```bash
docker-compose up --build -d
```

The app will be available at http://localhost:5000

## Local Development

**Backend:**
```bash
cd backend
npm install
npm run dev
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## Project Structure

```
sneaks-and-socks-club/
├── Dockerfile           # Multi-stage build for frontend + backend
├── docker-compose.yml   # Docker Compose for local development
├── backend/
│   ├── package.json
│   └── server.js        # Express API + serves frontend static files
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── src/
│       └── App.jsx      # Main React application
├── data/                # SQLite database (created on first run)
└── uploads/             # User uploaded images
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### Users
- `GET /api/users` - List all members
- `GET /api/users/:id` - Get user profile
- `PUT /api/users/:id` - Update profile

### Posts
- `GET /api/posts` - Get all posts (feed)
- `POST /api/posts` - Create post (with optional image)
- `DELETE /api/posts/:id` - Delete post
- `POST /api/posts/:id/like` - Toggle like

### Comments
- `GET /api/posts/:id/comments` - Get comments
- `POST /api/posts/:id/comments` - Add comment

## Environment Variables

- `PORT` - Server port (default: 5000)
- `DB_PATH` - SQLite database path
- `UPLOAD_DIR` - Upload directory path
- `JWT_SECRET` - Secret for JWT tokens
- `NODE_ENV` - Set to `production` for production mode

## License

MIT
