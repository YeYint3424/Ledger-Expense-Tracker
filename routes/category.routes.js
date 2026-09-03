const router = require('express').Router();
const Category = require('../models/Category');
const Transaction = require('../models/Transaction');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get('/', async (req, res) => {
  const categories = await Category.find({ userId: req.userId }).sort({ name: 1 });
  res.json({ categories });
});

router.post('/', async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    const color = req.body.color || '#B98B2E';
    if (!name) return res.status(400).json({ error: 'Category name is required.' });

    const existing = await Category.findOne({
      userId: req.userId,
      name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' },
    });
    if (existing) {
      return res.status(200).json({ category: existing, reused: true });
    }

    const category = await Category.create({ userId: req.userId, name, color });
    res.status(201).json({ category, reused: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create category.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    const color = req.body.color;
    if (!name) return res.status(400).json({ error: 'Category name is required.' });

    const dupe = await Category.findOne({
      userId: req.userId,
      name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' },
      _id: { $ne: req.params.id },
    });
    if (dupe) return res.status(409).json({ error: `"${dupe.name}" already exists.` });

    const category = await Category.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { name, color },
      { new: true }
    );
    if (!category) return res.status(404).json({ error: 'Category not found.' });
    res.json({ category });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update category.' });
  }
});

router.delete('/:id', async (req, res) => {
  const category = await Category.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  if (!category) return res.status(404).json({ error: 'Category not found.' });
  const result = await Transaction.updateMany(
    { userId: req.userId, categoryId: req.params.id },
    { categoryId: null }
  );
  res.json({ ok: true, reassigned: result.modifiedCount });
});

module.exports = router;
