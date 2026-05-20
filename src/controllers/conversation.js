import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import User from '../models/User.js';

export const createConversation = async (req, res) => {
  try {
    const { participantIds, type, context } = req.body;
    const currentUserId = req.user._id;

    // Build the unique list of participants including the creator
    const participants = Array.from(
      new Set([currentUserId.toString(), ...participantIds.map(id => id.toString())])
    );

    if (participants.length < 2) {
      return res.status(400).json({ message: 'A conversation must have at least 2 participants' });
    }

    // Try to find if a conversation with EXACTLY these participants already exists
    // (Only for standard direct messages where we don't want duplicates)
    if (participants.length === 2) {
      const existing = await Conversation.findOne({
        participants: { $all: participants, $size: participants.length },
      }).populate('participants', '-password').populate('lastMessage');

      if (existing) {
        // If there's new WooCommerce context, update it!
        if (context && (context.productId || context.orderId)) {
          existing.context = {
            productId: context.productId || existing.context.productId,
            productName: context.productName || existing.context.productName,
            productImage: context.productImage || existing.context.productImage,
            productPrice: context.productPrice || existing.context.productPrice,
            orderId: context.orderId || existing.context.orderId,
          };
          if (type) {
            existing.type = type;
          }
          await existing.save();
        }
        return res.json(existing);
      }
    }

    // Otherwise, create a new conversation
    const conversation = await Conversation.create({
      participants,
      type: type || 'general',
      context: context || {
        productId: '',
        productName: '',
        productImage: '',
        productPrice: '',
        orderId: '',
      },
      unreadCount: participants.reduce((acc, userId) => {
        acc[userId] = 0;
        return acc;
      }, {}),
    });

    const populatedConversation = await Conversation.findById(conversation._id)
      .populate('participants', '-password');

    res.status(201).json(populatedConversation);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getConversations = async (req, res) => {
  try {
    const currentUserId = req.user._id;

    const conversations = await Conversation.find({
      participants: currentUserId,
    })
      .populate('participants', '-password')
      .populate({
        path: 'lastMessage',
        populate: {
          path: 'sender',
          select: 'username avatar role',
        },
      })
      .sort({ updatedAt: -1 });

    res.json(conversations);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getConversationById = async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id)
      .populate('participants', '-password')
      .populate('lastMessage');

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    // Check if the user is a participant
    if (!conversation.participants.some(p => p._id.toString() === req.user._id.toString())) {
      return res.status(403).json({ message: 'Not authorized to access this conversation' });
    }

    res.json(conversation);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteConversation = async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id);

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    if (!conversation.participants.some(p => p.toString() === req.user._id.toString())) {
      return res.status(403).json({ message: 'Not authorized to delete this conversation' });
    }

    await Message.deleteMany({ conversationId: conversation._id });
    await conversation.deleteOne();
    res.json({ message: 'Conversation deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
