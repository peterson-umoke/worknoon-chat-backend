import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import {
  canAccessConversation,
  getSupportedConversationTypesForRole,
  isConversationParticipant,
} from '../utils/conversationAccess.js';

const conversationTypes = ['customer-to-agent', 'customer-to-designer', 'customer-to-merchant', 'general'];

const targetRoleByType = {
  'customer-to-agent': 'agent',
  'customer-to-designer': 'designer',
  'customer-to-merchant': 'merchant',
  general: 'agent',
};

const normalizeContext = (context = {}) => ({
  productId: context.productId || '',
  productName: context.productName || '',
  productImage: context.productImage || '',
  productPrice: context.productPrice || '',
  orderId: context.orderId || '',
});

const resolveRoleParticipant = async (type, currentUserId) => {
  const preferredRole = targetRoleByType[type] || 'agent';
  const findByRole = (role) => User.findOne({
    _id: { $ne: currentUserId },
    role,
  })
    .sort({ isOnline: -1, lastActive: -1, createdAt: 1 })
    .select('_id');

  const preferredUser = await findByRole(preferredRole);
  if (preferredUser || preferredRole === 'agent') {
    return preferredUser;
  }

  return findByRole('agent');
};

export const createConversation = async (req, res) => {
  try {
    const { participantIds = [], type = 'general', context } = req.body;
    const currentUserId = req.user._id;
    const normalizedType = conversationTypes.includes(type) ? type : null;

    if (!normalizedType) {
      return res.status(400).json({ message: 'Invalid conversation type' });
    }

    let requestedParticipantIds = Array.isArray(participantIds) ? participantIds : [];

    if (requestedParticipantIds.length === 0) {
      const assignedUser = await resolveRoleParticipant(normalizedType, currentUserId);
      if (!assignedUser) {
        return res.status(404).json({ message: 'No available chat recipient found' });
      }
      requestedParticipantIds = [assignedUser._id.toString()];
    }

    // Build the unique list of participants including the creator
    const participants = Array.from(
      new Set([currentUserId.toString(), ...requestedParticipantIds.map(id => id.toString())])
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
          existing.type = normalizedType;
          await existing.save();
        }
        return res.json(existing);
      }
    }

    // Otherwise, create a new conversation
    const conversation = await Conversation.create({
      participants,
      type: normalizedType,
      context: normalizeContext(context),
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
    const supportedTypes = getSupportedConversationTypesForRole(req.user.role);
    const query = supportedTypes.length > 0
      ? {
          $or: [
            { participants: currentUserId },
            { type: { $in: supportedTypes } },
          ],
        }
      : { participants: currentUserId };

    const conversations = await Conversation.find(query)
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

    if (!canAccessConversation(conversation, req.user)) {
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

    if (!isConversationParticipant(conversation, req.user._id)) {
      return res.status(403).json({ message: 'Not authorized to delete this conversation' });
    }

    await Message.deleteMany({ conversationId: conversation._id });
    await conversation.deleteOne();
    res.json({ message: 'Conversation deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
