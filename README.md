# Worknoon Chat Backend

Real-time chat backend for the Worknoon eCommerce platform, built with Node.js, Express, MongoDB, and Socket.IO.

## Technologies

- **Node.js** with ES modules
- **Express.js** — REST API server
- **MongoDB** with Mongoose — Data persistence
- **Socket.IO** — Real-time WebSocket messaging
- **JWT** — Authentication & authorization
- **bcrypt** — Password hashing
- **Multer** — File upload handling

## Features

- JWT-based authentication (register/login)
- Role-based access control (admin, agent, customer, designer, merchant)
- Real-time messaging via Socket.IO with JWT-protected connections
- Conversation CRUD with WooCommerce product/order context
- File upload with mimetype validation (images, documents)
- Online presence tracking
- Typing indicators
- Unread message counters
- Auto-seeded test accounts for sandbox testing

## Project Structure

```
src/
├── config/
│   └── db.js              # Mongoose connection
├── controllers/
│   ├── auth.js            # Register, login, profile, users
│   ├── conversation.js    # Conversation CRUD
│   └── message.js         # Message CRUD & read status
├── middleware/
│   └── auth.js            # JWT guard & role checker
├── models/
│   ├── User.js            # User schema with roles
│   ├── Conversation.js    # Conversations with context
│   └── Message.js         # Messages with file types
├── routes/
│   ├── auth.js
│   ├── conversation.js
│   ├── message.js
│   └── upload.js
└── server.js              # Express + Socket.IO entry point
```

## Setup

### Prerequisites

- Node.js 18+
- Docker & Docker Compose

### Installation

```bash
# Install dependencies
npm install

# Start MongoDB
docker compose up -d

# Start the server
npm run dev
```

The server runs on `http://localhost:3001`.

### Default Test Accounts

All accounts use password: `Password123!`

| Email | Role |
|---|---|
| admin@worknoon.com | admin |
| agent@worknoon.com | agent |
| customer@worknoon.com | customer |
| designer@worknoon.com | designer |
| merchant@worknoon.com | merchant |

## API Endpoints

### Auth
- `POST /api/auth/register` — Create account
- `POST /api/auth/login` — Authenticate
- `GET /api/auth/profile` — Get current user (protected)
- `PUT /api/auth/profile` — Update profile (protected)
- `GET /api/auth/users` — List all users except self (protected)

### Conversations
- `POST /api/conversations` — Create/find conversation (protected)
- `GET /api/conversations` — List user's conversations (protected)
- `GET /api/conversations/:id` — Get single conversation (protected)
- `DELETE /api/conversations/:id` — Delete conversation (protected)

### Messages
- `POST /api/messages` — Send message (protected)
- `GET /api/messages/:conversationId` — Get conversation messages (protected)
- `PUT /api/messages/:conversationId/read` — Mark as read (protected)

### Upload
- `POST /api/upload` — Upload file (protected, multipart)

## Socket.IO Events

Connect with `{ auth: { token: "<jwt>" } }`.

**Client → Server:** `joinRoom`, `leaveRoom`, `sendMessage`, `typing`, `stopTyping`
**Server → Client:** `userPresence`, `messageReceived`, `conversationUpdated`, `typingIndicator`, `stopTypingIndicator`

## Challenges

- **JWT-protected WebSocket connections** — Socket.IO middleware validates JWT before allowing connections, ensuring the same auth guarantees as REST endpoints.
- **Real-time unread counters** — Map-based unread counts in MongoDB that increment/decrement atomically as messages are sent and read.
- **Presence synchronization** — Online status tracked both in-memory (Map) and persisted to MongoDB, broadcast to all connected clients.

## Demo

[Demo video walkthrough](#) — *Add your Loom/YouTube link here*
