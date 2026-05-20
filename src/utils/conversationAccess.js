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

export const canAccessConversation = (conversation, user) =>
  isConversationParticipant(conversation, user._id) || isSupportRoleForConversation(user, conversation);

export const ensureConversationParticipant = (conversation, userId) => {
  if (isConversationParticipant(conversation, userId)) {
    return false;
  }

  conversation.participants.push(userId);
  conversation.unreadCount.set(userId.toString(), 0);
  return true;
};
