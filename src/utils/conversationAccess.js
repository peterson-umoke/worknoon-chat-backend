import User from '../models/User.js';

const supportRolesByType = {
  'customer-to-agent': ['agent'],
  'customer-to-designer': ['designer'],
  'customer-to-merchant': ['merchant'],
  general: ['agent'],
};

export const getSupportedConversationTypesForRole = (role) => {
  return Object.entries(supportRolesByType)
    .filter(([, roles]) => roles.includes(role))
    .map(([type]) => type);
};

export const isConversationParticipant = (conversation, userId) =>
  conversation.participants.some((participantId) => {
    const id = participantId._id || participantId;
    return id.toString() === userId.toString();
  });

export const isSupportRoleForConversation = (user, conversation) => {
  if (!user || !conversation) {
    return false;
  }

  return (supportRolesByType[conversation.type] || []).includes(user.role);
};

export const getCustomerParticipantIds = async () => {
  const customers = await User.find({ role: 'customer' }).select('_id');
  return customers.map((customer) => customer._id);
};

const hasPopulatedCustomerParticipant = (conversation) =>
  conversation.participants.some((participant) => participant?.role === 'customer');

export const hasCustomerParticipant = async (conversation) => {
  if (hasPopulatedCustomerParticipant(conversation)) {
    return true;
  }

  const customer = await User.exists({
    _id: { $in: conversation.participants },
    role: 'customer',
  });

  return Boolean(customer);
};

export const canAccessConversation = async (conversation, user) => {
  if (isConversationParticipant(conversation, user._id)) {
    return true;
  }

  if (!isSupportRoleForConversation(user, conversation)) {
    return false;
  }

  return hasCustomerParticipant(conversation);
};

export const ensureConversationParticipant = (conversation, userId) => {
  if (isConversationParticipant(conversation, userId)) {
    return false;
  }

  conversation.participants.push(userId);
  conversation.unreadCount.set(userId.toString(), 0);
  return true;
};
