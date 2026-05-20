import express from 'express';
import {
  createConversation,
  getConversations,
  getConversationById,
  deleteConversation,
} from '../controllers/conversation.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect); // Secure all conversation routes

router.route('/')
  .post(createConversation)
  .get(getConversations);

router.route('/:id')
  .get(getConversationById)
  .delete(deleteConversation);

export default router;
