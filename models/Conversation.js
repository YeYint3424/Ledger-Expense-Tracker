const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema(
  {
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
  },
  { timestamps: true }
);

conversationSchema.index({ participants: 1 });

conversationSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    ret.participants = (ret.participants || []).map((p) =>
      p && p._id ? { id: p._id.toString(), name: p.name, email: p.email } : p.toString()
    );
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Conversation', conversationSchema);
