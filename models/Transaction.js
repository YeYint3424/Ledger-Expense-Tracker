const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['income', 'outcome'], required: true },
    name: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    date: { type: String, required: true }, // 'YYYY-MM-DD'
    time: { type: String, required: true }, // 'HH:MM'
    description: { type: String, default: '', trim: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
  },
  { timestamps: true }
);

transactionSchema.index({ userId: 1, date: -1, time: -1 });

transactionSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    ret.userId = ret.userId ? ret.userId.toString() : ret.userId;
    ret.categoryId = ret.categoryId ? ret.categoryId.toString() : null;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Transaction', transactionSchema);
