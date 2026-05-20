import express from 'express';
import {
  sendMessage,
  getMessages,
  markAsRead,
} from '../controllers/message.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect); // Secure all message routes

router.route('/')
  .post(sendMessage);

router.route('/:conversationId')
  .get(getMessages);

router.route('/:conversationId/read')
  .put(markAsRead);

export default router;
