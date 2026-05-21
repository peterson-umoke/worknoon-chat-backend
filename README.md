# Worknoon Chat Backend

Express + MongoDB + Socket.IO backend for the Worknoon real-time chat platform.

## Stack

- Node.js (ES modules)
- Express
- MongoDB + Mongoose
- Socket.IO
- JWT + bcryptjs
- Multer (upload endpoint)

## Implemented Features

- Auth: register, login, profile
- WordPress user sync endpoint with shared secret
- Role model: admin, agent, customer, designer, merchant
- Admin-only users listing and admin-only role updates
- Conversations (create/list/get/delete)
- Messages (send/list/mark-read)
- Realtime events: presence, typing, new messages, conversation updates, read receipts
- Upload endpoint for image/document files

## ACL Summary

- `GET /api/auth/users`: admin only
- `PATCH /api/auth/users/:id/role`: admin only
- Self profile update cannot change role
- Register always creates `customer`

## Project Layout

```text
src/
	config/db.js
	controllers/
		auth.js
		conversation.js
		message.js
	middleware/auth.js
	models/
		User.js
		Conversation.js
		Message.js
	routes/
		auth.js
		conversation.js
		message.js
		upload.js
	server.js
```

## Local Development

### 1) Start MongoDB

The included Compose file only starts MongoDB.

```bash
docker compose -f docker-compose.yml up -d
```

### 2) Run API server

```bash
npm install
npm run dev
```

API base: `http://localhost:3001`

## Environment Variables

- `PORT` (default `3001`)
- `MONGO_URI`
- `JWT_SECRET`
- `FRONTEND_URL` (default `http://localhost:3000`)
- `WORDPRESS_SYNC_SECRET` (default `worknoon-wordpress-dev-secret`)

## Seed Accounts

Server seeds test users when DB is empty.

Password for seeded users: `Password123!`

- `admin@worknoon.com`
- `agent@worknoon.com`
- `customer@worknoon.com`
- `designer@worknoon.com`
- `merchant@worknoon.com`

## REST Endpoints

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/wordpress-sync`
- `GET /api/auth/profile` (protected)
- `PUT /api/auth/profile` (protected)
- `GET /api/auth/users` (protected, admin)
- `PATCH /api/auth/users/:id/role` (protected, admin)

### Conversations

- `POST /api/conversations` (protected)
- `GET /api/conversations` (protected)
- `GET /api/conversations/:id` (protected)
- `DELETE /api/conversations/:id` (protected)

### Messages

- `POST /api/messages` (protected)
- `GET /api/messages/:conversationId` (protected)
- `PUT /api/messages/:conversationId/read` (protected)

### Upload

- `POST /api/upload` (protected, multipart)

## Socket Events

Auth handshake:

```json
{ "auth": { "token": "<jwt>" } }
```

Client to server:

- `joinRoom`
- `leaveRoom`
- `sendMessage`
- `typing`
- `stopTyping`

Server to client:

- `onlineUsersSnapshot`
- `userPresence`
- `messageReceived`
- `conversationUpdated`
- `messagesRead`
- `typingIndicator`
- `stopTypingIndicator`

