const router = require('express').Router();
const GroupCategory = require('../models/GroupCategory');
const Group = require('../models/Group');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /api/group-categories
router.get('/', async (req, res) => {
  const categories = await GroupCategory.find().sort({ name: 1 });
  res.json({ categories });
});

// POST /api/group-categories — reuses an existing name instead of duplicating
router.post('/', async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    const color = req.body.color || '#5B6B8C';
    if (!name) return res.status(400).json({ error: 'Category name is required.' });

    const existing = await GroupCategory.findOne({ name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } });
    if (existing) return res.status(200).json({ category: existing, reused: true });

    const category = await GroupCategory.create({ name, color });
    res.status(201).json({ category, reused: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create category.' });
  }
});

// PUT /api/group-categories/:id
router.put('/:id', async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    const color = req.body.color;
    if (!name) return res.status(400).json({ error: 'Category name is required.' });

    const dupe = await GroupCategory.findOne({
      name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' },
      _id: { $ne: req.params.id },
    });
    if (dupe) return res.status(409).json({ error: `"${dupe.name}" already exists.` });

    const category = await GroupCategory.findByIdAndUpdate(req.params.id, { name, color }, { new: true });
    if (!category) return res.status(404).json({ error: 'Category not found.' });
    res.json({ category });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update category.' });
  }
});

// DELETE /api/group-categories/:id — groups using it fall back to "no category"
router.delete('/:id', async (req, res) => {
  const category = await GroupCategory.findByIdAndDelete(req.params.id);
  if (!category) return res.status(404).json({ error: 'Category not found.' });
  const result = await Group.updateMany({ categoryId: req.params.id }, { categoryId: null });
  res.json({ ok: true, reassigned: result.modifiedCount });
});

module.exports = router;
