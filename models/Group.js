const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'GroupCategory', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        role: { type: String, enum: ['admin', 'member'], default: 'member' },
        joinedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

groupSchema.index({ 'members.userId': 1 });

groupSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    ret.createdBy = ret.createdBy ? ret.createdBy.toString() : ret.createdBy;
    ret.categoryId = ret.categoryId ? ret.categoryId.toString() : null;
    if (ret.members) {
      ret.members = ret.members.map((m) => ({
        userId: m.userId && m.userId._id ? m.userId._id.toString() : m.userId.toString(),
        role: m.role,
        joinedAt: m.joinedAt,
      }));
    }
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Group', groupSchema);
