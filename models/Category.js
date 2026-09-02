const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    color: { type: String, required: true, default: '#B98B2E' },
  },
  { timestamps: true }
);

categorySchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    ret.userId = ret.userId ? ret.userId.toString() : ret.userId;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Category', categorySchema);
