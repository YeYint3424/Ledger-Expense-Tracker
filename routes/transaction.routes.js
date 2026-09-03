const router = require('express').Router();
const Transaction = require('../models/Transaction');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get('/', async (req, res) => {
  const { type, category, name, from, to } = req.query;
  const query = { userId: req.userId };

  if (type && type !== 'all') query.type = type;
  if (category && category !== 'all') query.categoryId = category;
  if (name) query.name = { $regex: escapeRegex(name), $options: 'i' };
  if (from || to) {
    query.date = {};
    if (from) query.date.$gte = from;
    if (to) query.date.$lte = to;
  }

  const transactions = await Transaction.find(query).sort({ date: -1, time: -1 });
  res.json({ transactions });
});

router.get('/months', async (req, res) => {
  const months = await Transaction.distinct('date', { userId: req.userId });
  const distinctMonths = Array.from(new Set(months.map((d) => d.slice(0, 7)))).sort().reverse();
  res.json({ months: distinctMonths });
});

router.get('/:id', async (req, res) => {
  const tx = await Transaction.findOne({ _id: req.params.id, userId: req.userId });
  if (!tx) return res.status(404).json({ error: 'Transaction not found.' });
  res.json({ transaction: tx });
});

router.post('/', async (req, res) => {
  try {
    const { type, name, amount, date, time, description, categoryId } = req.body;
    if (!['income', 'outcome'].includes(type)) {
      return res.status(400).json({ error: 'Type must be "income" or "outcome".' });
    }
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required.' });
    if (!date || !time) return res.status(400).json({ error: 'Date and time are required.' });
    if (type === 'outcome' && !categoryId) {
      return res.status(400).json({ error: 'Category is required for an outcome.' });
    }

    const tx = await Transaction.create({
      userId: req.userId,
      type,
      name: name.trim(),
      amount: Number(amount) || 0,
      date,
      time,
      description: (description || '').trim(),
      categoryId: type === 'outcome' ? categoryId : null,
    });
    res.status(201).json({ transaction: tx });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create transaction.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { type, name, amount, date, time, description, categoryId } = req.body;
    if (!['income', 'outcome'].includes(type)) {
      return res.status(400).json({ error: 'Type must be "income" or "outcome".' });
    }
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required.' });
    if (!date || !time) return res.status(400).json({ error: 'Date and time are required.' });
    if (type === 'outcome' && !categoryId) {
      return res.status(400).json({ error: 'Category is required for an outcome.' });
    }

    const tx = await Transaction.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      {
        type,
        name: name.trim(),
        amount: Number(amount) || 0,
        date,
        time,
        description: (description || '').trim(),
        categoryId: type === 'outcome' ? categoryId : null,
      },
      { new: true }
    );
    if (!tx) return res.status(404).json({ error: 'Transaction not found.' });
    res.json({ transaction: tx });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update transaction.' });
  }
});

router.delete('/:id', async (req, res) => {
  const tx = await Transaction.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  if (!tx) return res.status(404).json({ error: 'Transaction not found.' });
  res.json({ ok: true });
});

module.exports = router;
