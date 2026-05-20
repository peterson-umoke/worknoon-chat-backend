const getId = (value) => {
  if (!value) return '';
  return (value._id || value).toString();
};

const getParticipantIds = (conversation) =>
  (conversation?.participants || [])
    .map(getId)
    .filter(Boolean);

const getRoomSocketIds = (io, roomName) => {
  if (!io || !roomName) return [];
  return Array.from(io.sockets.adapter.rooms.get(roomName) || []);
};

export const getOnlineSocketIdsForUser = (onlineUsers, userId) => {
  if (!onlineUsers || !userId) {
    return [];
  }

  const socketIds = onlineUsers.get(userId.toString());
  if (!socketIds) {
    return [];
  }

  if (socketIds instanceof Set) {
    return Array.from(socketIds);
  }

  return [socketIds];
};

const getParticipantSocketIds = (onlineUsers, conversation) => {
  if (!onlineUsers || !conversation) return [];

  return getParticipantIds(conversation)
    .flatMap((userId) => getOnlineSocketIdsForUser(onlineUsers, userId));
};

export const emitConversationMessage = ({
  io,
  onlineUsers,
  conversation,
  conversationId,
  message,
  senderSocket,
}) => {
  if (!io || !conversation || !conversationId || !message) {
    return;
  }

  const socketIds = new Set([
    ...getRoomSocketIds(io, conversationId),
    ...getParticipantSocketIds(onlineUsers, conversation),
  ]);

  if (senderSocket?.id) {
    socketIds.add(senderSocket.id);
  }

  socketIds.forEach((socketId) => {
    io.to(socketId).emit('messageReceived', message);
  });
};

export const emitConversationUpdated = ({
  io,
  onlineUsers,
  conversation,
  conversationId,
  lastMessage,
  excludeUserId,
}) => {
  if (!io || !onlineUsers || !conversation || !conversationId || !lastMessage) {
    return;
  }

  const excludedId = excludeUserId ? excludeUserId.toString() : '';

  getParticipantIds(conversation).forEach((participantId) => {
    if (participantId === excludedId) {
      return;
    }

    getOnlineSocketIdsForUser(onlineUsers, participantId).forEach((socketId) => {
      io.to(socketId).emit('conversationUpdated', {
        conversationId,
        lastMessage,
      });
    });
  });
};
