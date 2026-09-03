const mongoose = require('mongoose');

const groupExpenseSchema = new mongoose.Schema(
  {
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    name: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    date: { type: String, required: true },
    time: { type: String, required: true },
    description: { type: String, default: '', trim: true },
    splitBetween: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

groupExpenseSchema.index({ groupId: 1, date: -1, time: -1 });

groupExpenseSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    ret.groupId = ret.groupId.toString();
    ret.paidBy = ret.paidBy.toString();
    ret.createdBy = ret.createdBy.toString();
    if (ret.categoryId && ret.categoryId.name !== undefined) {
      const catId = ret.categoryId.id || (ret.categoryId._id && ret.categoryId._id.toString());
      ret.category = { id: catId, name: ret.categoryId.name, color: ret.categoryId.color };
    } else if (ret.categoryId) {
      ret.category = { id: ret.categoryId.toString(), name: null, color: null };
    } else {
      ret.category = null;
    }
    delete ret.categoryId;
    ret.splitBetween = (ret.splitBetween || []).map((id) => id.toString());
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('GroupExpense', groupExpenseSchema);
