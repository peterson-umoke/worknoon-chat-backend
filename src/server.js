import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

import connectDB from './config/db.js';
import User from './models/User.js';
import Message from './models/Message.js';
import Conversation from './models/Conversation.js';

import authRoutes from './routes/auth.js';
import conversationRoutes from './routes/conversation.js';
import messageRoutes from './routes/message.js';
import uploadRoutes from './routes/upload.js';

dotenv.config();

const app = express();
const server = http.createServer(app);
const configuredOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:3000',
  process.env.WORDPRESS_URL,
  ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : []),
].filter(Boolean).map((origin) => origin.trim());

const corsOrigin = (origin, callback) => {
  if (!origin || configuredOrigins.includes(origin) || /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
    return callback(null, true);
  }
  return callback(new Error(`Origin ${origin} is not allowed by CORS`));
};

const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

app.use(cors({
  origin: corsOrigin,
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const __dirname = path.resolve();
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

const seedUsers = async () => {
  try {
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      const roles = ['admin', 'agent', 'customer', 'designer', 'merchant'];
      const salt = await bcrypt.genSalt(10);
      const defaultPassword = await bcrypt.hash('Password123!', salt);

      const usersToSeed = roles.map((role) => ({
        username: `${role}_test`,
        email: `${role}@worknoon.com`,
        password: defaultPassword,
        role: role,
        avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${role}`,
        isOnline: false,
      }));

      await User.insertMany(usersToSeed);
      console.log('Successfully seeded 5 test users! Default passwords are Password123!');
    }
  } catch (error) {
    console.error('Error seeding users:', error);
  }
};

app.use('/api/auth', authRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/upload', uploadRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'Worknoon Chat API is running!' });
});

io.use(async (socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.headers.token;
  if (!token) {
    return next(new Error('Authentication error: No token provided'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretworknoonjwtkey123!');
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return next(new Error('Authentication error: User not found'));
    }

    socket.user = user;
    next();
  } catch (err) {
    return next(new Error('Authentication error: Invalid token'));
  }
});

const onlineUsers = new Map();
app.set('io', io);
app.set('onlineUsers', onlineUsers);

io.on('connection', async (socket) => {
  const userId = socket.user._id.toString();
  onlineUsers.set(userId, socket.id);

  // Send current online users immediately so new clients don't render stale offline states.
  socket.emit('onlineUsersSnapshot', {
    userIds: Array.from(onlineUsers.keys()),
  });

  console.log(`User connected: ${socket.user.username} (${socket.user.role})`);

  await User.findByIdAndUpdate(userId, { isOnline: true, lastActive: new Date() });
  io.emit('userPresence', { userId, isOnline: true });

  socket.on('joinRoom', (conversationId) => {
    socket.join(conversationId);
  });

  socket.on('leaveRoom', (conversationId) => {
    socket.leave(conversationId);
  });

  socket.on('sendMessage', async (data) => {
    try {
      const { conversationId, content, fileType } = data;

      const message = await Message.create({
        conversationId,
        sender: socket.user._id,
        content,
        fileType: fileType || 'text',
        isRead: false,
      });

      const conversation = await Conversation.findById(conversationId);
      if (conversation) {
        conversation.lastMessage = message._id;
        conversation.participants.forEach((pId) => {
          if (pId.toString() !== socket.user._id.toString()) {
            const currentCount = conversation.unreadCount.get(pId.toString()) || 0;
            conversation.unreadCount.set(pId.toString(), currentCount + 1);
          }
        });
        await conversation.save();
      }

      const populatedMessage = await Message.findById(message._id)
        .populate('sender', 'username email avatar role');

      io.to(conversationId).emit('messageReceived', populatedMessage);

      if (conversation) {
        conversation.participants.forEach((pId) => {
          const targetUserId = pId.toString();
          if (targetUserId !== socket.user._id.toString()) {
            const targetSocketId = onlineUsers.get(targetUserId);
            if (targetSocketId) {
              io.to(targetSocketId).emit('conversationUpdated', {
                conversationId,
                lastMessage: populatedMessage,
              });
            }
          }
        });
      }
    } catch (error) {
      console.error('Socket sendMessage error:', error);
      socket.emit('error', { message: 'Failed to process message' });
    }
  });

  socket.on('typing', (data) => {
    const { conversationId } = data;
    socket.to(conversationId).emit('typingIndicator', {
      conversationId,
      userId: socket.user._id,
      username: socket.user.username,
    });
  });

  socket.on('stopTyping', (data) => {
    const { conversationId } = data;
    socket.to(conversationId).emit('stopTypingIndicator', {
      conversationId,
      userId: socket.user._id,
      username: socket.user.username,
    });
  });

  socket.on('disconnect', async () => {
    onlineUsers.delete(userId);
    await User.findByIdAndUpdate(userId, { isOnline: false, lastActive: new Date() });
    io.emit('userPresence', { userId, isOnline: false });
  });
});

const PORT = process.env.PORT || 3001;

(async () => {
  await connectDB();
  await seedUsers();
  server.listen(PORT, () => {
    console.log(`Express and Socket.IO Server running on port ${PORT}`);
  });
})();
