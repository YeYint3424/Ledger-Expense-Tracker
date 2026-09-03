const mongoose = require('mongoose');

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
