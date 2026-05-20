import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import {
  canAccessConversation,
  ensureConversationParticipant,
} from '../utils/conversationAccess.js';
import {
  emitConversationMessage,
  emitConversationUpdated,
  getOnlineSocketIdsForUser,
} from '../utils/socketDelivery.js';

export const sendMessage = async (req, res) => {
  try {
    const { conversationId, content, fileType } = req.body;
    const senderId = req.user._id;

    // Check if conversation exists
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    if (!canAccessConversation(conversation, req.user)) {
      return res.status(403).json({ message: 'Not authorized to send messages in this conversation' });
    }

    ensureConversationParticipant(conversation, senderId);

    // Create the message
    const message = await Message.create({
      conversationId,
      sender: senderId,
      content,
      fileType: fileType || 'text',
      isRead: false,
    });

    // Update conversation metadata
    conversation.lastMessage = message._id;

    // Increment unreadCount for all OTHER participants
    conversation.participants.forEach((participantId) => {
      if (participantId.toString() !== senderId.toString()) {
        const currentCount = conversation.unreadCount.get(participantId.toString()) || 0;
        conversation.unreadCount.set(participantId.toString(), currentCount + 1);
      }
    });

    await conversation.save();

    const populatedMessage = await Message.findById(message._id)
      .populate('sender', 'username email avatar role');

    const io = req.app.get('io');
    const onlineUsers = req.app.get('onlineUsers');

    emitConversationMessage({
      io,
      onlineUsers,
      conversation,
      conversationId,
      message: populatedMessage,
    });
    emitConversationUpdated({
      io,
      onlineUsers,
      conversation,
      conversationId,
      lastMessage: populatedMessage,
      excludeUserId: senderId,
    });

    res.status(201).json(populatedMessage);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const currentUserId = req.user._id;

    // Check if user is participant
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    if (!canAccessConversation(conversation, req.user)) {
      return res.status(403).json({ message: 'Not authorized to access messages' });
    }

    const messages = await Message.find({ conversationId })
      .populate('sender', 'username email avatar role')
      .sort({ createdAt: 1 }); // Chronological order

    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const markAsRead = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const currentUserId = req.user._id;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    if (!canAccessConversation(conversation, req.user)) {
      return res.status(403).json({ message: 'Not authorized to access messages' });
    }

    ensureConversationParticipant(conversation, currentUserId);

    // Reset unread count for current user
    conversation.unreadCount.set(currentUserId.toString(), 0);
    await conversation.save();

    // Mark other users' messages in this conversation as read
    await Message.updateMany(
      { conversationId, sender: { $ne: currentUserId }, isRead: false },
      { $set: { isRead: true } }
    );

    const io = req.app.get('io');
    const onlineUsers = req.app.get('onlineUsers');
    if (io && onlineUsers && conversation) {
      conversation.participants.forEach((participantId) => {
        const targetUserId = participantId.toString();
        if (targetUserId === currentUserId.toString()) return;

        getOnlineSocketIdsForUser(onlineUsers, targetUserId).forEach((socketId) => {
          io.to(socketId).emit('messagesRead', {
            conversationId,
            readerId: currentUserId.toString(),
          });
        });
      });
    }

    res.json({ message: 'Messages marked as read' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
