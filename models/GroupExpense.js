const mongoose = require('mongoose');

const groupExpenseSchema = new mongoose.Schema(
  {
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // References the same personal "categories" table used by personal outcomes —
    // whichever member adds this expense picks from their own category list.
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    name: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    date: { type: String, required: true }, // 'YYYY-MM-DD'
    time: { type: String, required: true }, // 'HH:MM'
    description: { type: String, default: '', trim: true },
    // Members this expense is split between (evenly). Defaults to the whole group.
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
    // categoryId may be populated ({_id,name,color}) or a plain ObjectId, depending on the query.
    if (ret.categoryId && ret.categoryId._id) {
      ret.categoryId = { id: ret.categoryId._id.toString(), name: ret.categoryId.name, color: ret.categoryId.color };
    } else if (ret.categoryId) {
      ret.categoryId = ret.categoryId.toString();
    }
    ret.splitBetween = (ret.splitBetween || []).map((id) => id.toString());
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('GroupExpense', groupExpenseSchema);
