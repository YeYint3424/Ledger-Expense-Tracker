const mongoose = require('mongoose');

// Group categories (Travel, Relationship, Roommates, ...) are shared across all
// users, unlike personal expense categories which are scoped per user — a group
// itself is already a shared object, so its "type" label works the same way.
const groupCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    color: { type: String, required: true, default: '#5B6B8C' },
  },
  { timestamps: true }
);

groupCategorySchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('GroupCategory', groupCategorySchema);
