import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    type: {
      type: String,
      enum: ['customer-to-agent', 'customer-to-designer', 'customer-to-merchant', 'general'],
      default: 'general',
    },
    context: {
      productId: { type: String, default: '' },
      productName: { type: String, default: '' },
      productImage: { type: String, default: '' },
      productPrice: { type: String, default: '' },
      orderId: { type: String, default: '' },
    },
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
    },
    unreadCount: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

const Conversation = mongoose.model('Conversation', conversationSchema);
export default Conversation;
