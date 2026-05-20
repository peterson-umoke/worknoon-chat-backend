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

// Connect to MongoDB
connectDB();

const app = express();
const server = http.createServer(app);

// Setup Socket.IO with CORS configured
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Middlewares
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure upload directory exists
const __dirname = path.resolve();
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Serve uploaded files statically
app.use('/uploads', express.static(uploadDir));

// Seed default test users
const seedUsers = async () => {
  try {
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      console.log('Seeding default test accounts...');
      
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
seedUsers();

// Mount REST Routes
app.use('/api/auth', authRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/upload', uploadRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'Worknoon Chat API is running!' });
});

// Socket.IO Connection Handler with JWT Auth
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

// Active online users directory: Map of userId -> socket.id
const onlineUsers = new Map();

io.on('connection', async (socket) => {
  const userId = socket.user._id.toString();
  onlineUsers.set(userId, socket.id);
  
  console.log(`User connected: ${socket.user.username} (${socket.user.role})`);

  // Update user online status in database
  await User.findByIdAndUpdate(userId, { isOnline: true, lastActive: new Date() });
  
  // Broadcast presence updates
  io.emit('userPresence', { userId, isOnline: true });

  // Handle joining a specific conversation room
  socket.on('joinRoom', (conversationId) => {
    socket.join(conversationId);
    console.log(`User ${socket.user.username} joined room ${conversationId}`);
  });

  // Handle leaving a specific room
  socket.on('leaveRoom', (conversationId) => {
    socket.leave(conversationId);
    console.log(`User ${socket.user.username} left room ${conversationId}`);
  });

  // Handle real-time messaging
  socket.on('sendMessage', async (data) => {
    try {
      const { conversationId, content, fileType } = data;

      // 1. Save to DB
      const message = await Message.create({
        conversationId,
        sender: socket.user._id,
        content,
        fileType: fileType || 'text',
        isRead: false,
      });

      // Update Conversation lastMessage metadata
      const conversation = await Conversation.findById(conversationId);
      if (conversation) {
        conversation.lastMessage = message._id;
        // Increment unreadCount for all OTHER participants
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

      // 2. Broadcast to room
      io.to(conversationId).emit('messageReceived', populatedMessage);
      
      // 3. Emit notification update to other participants' private sockets if not in room
      if (conversation) {
        conversation.participants.forEach((pId) => {
          const targetUserId = pId.toString();
          if (targetUserId !== socket.user._id.toString()) {
            const targetSocketId = onlineUsers.get(targetUserId);
            if (targetSocketId) {
              // Send inbox refresh signal
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

  // Handle real-time typing indicators
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
    });
  });

  // Handle manual disconnect
  socket.on('disconnect', async () => {
    console.log(`User disconnected: ${socket.user.username}`);
    onlineUsers.delete(userId);
    
    // Update user offline status in DB
    await User.findByIdAndUpdate(userId, { isOnline: false, lastActive: new Date() });
    
    // Broadcast presence updates
    io.emit('userPresence', { userId, isOnline: false });
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Express and Socket.IO Server running on port ${PORT}`);
});
