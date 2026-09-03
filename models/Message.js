const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    scope: { type: String, enum: ['group', 'direct'], required: true },
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', default: null },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true },

    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },

    forwardedFrom: {
      senderName: { type: String, default: null },
      text: { type: String, default: null },
    },

    edited: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },

    deleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

messageSchema.index({ groupId: 1, createdAt: -1 });
messageSchema.index({ conversationId: 1, createdAt: -1 });

messageSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    ret.groupId = ret.groupId ? ret.groupId.toString() : null;
    ret.conversationId = ret.conversationId ? ret.conversationId.toString() : null;
    if (ret.senderId && typeof ret.senderId === 'object' && !(ret.senderId instanceof mongoose.Types.ObjectId)) {
      const senderIdValue = ret.senderId.id || (ret.senderId._id && ret.senderId._id.toString());
      ret.senderId = { id: senderIdValue, name: ret.senderId.name };
    } else if (ret.senderId) {
      ret.senderId = ret.senderId.toString();
    }

    if (ret.deleted) {
      ret.text = null;
    }

    if (ret.replyTo && typeof ret.replyTo === 'object' && !(ret.replyTo instanceof mongoose.Types.ObjectId)) {
      const r = ret.replyTo;
      const rId = r.id || (r._id && r._id.toString());
      const rSenderIdObj = r.senderId && typeof r.senderId === 'object' && !(r.senderId instanceof mongoose.Types.ObjectId)
        ? r.senderId
        : null;
      const rSenderId = rSenderIdObj ? rSenderIdObj.id : (r.senderId || null);
      const rSenderName = rSenderIdObj ? rSenderIdObj.name : null;
      ret.replyTo = {
        id: rId,
        text: r.deleted ? null : r.text,
        deleted: !!r.deleted,
        senderId: rSenderId,
        senderName: rSenderName || null,
      };
    } else if (ret.replyTo) {
      ret.replyTo = ret.replyTo.toString();
    }

    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Message', messageSchema);
