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

## Getting Started

### Prerequisites

- Docker & Docker Compose installed
- Node.js 20+ (for local development)

### Quick Start with Docker

```bash
# Clone the repository
git clone <your-repo-url>
cd sneaks-and-socks-club

# Start with Docker Compose
docker-compose up --build
```

The app will be available at:
- **Frontend:** http://localhost:3000
- **API:** http://localhost:5000

### Local Development (without Docker)

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
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── server.js          # Express API server
│   ├── data/              # SQLite database (created on first run)
│   └── uploads/            # User uploaded images
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    └── src/
        └── App.jsx         # Main React application
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

Backend:
- `PORT` - Server port (default: 5000)
- `DB_PATH` - SQLite database path
- `UPLOAD_DIR` - Upload directory path
- `JWT_SECRET` - Secret for JWT tokens

Frontend:
- `VITE_API_URL` - API URL for development

## License

MIT
