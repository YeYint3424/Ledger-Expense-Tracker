const router = require('express').Router();
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const Category = require('../models/Category');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/analytics/summary?months=6&month=2026-03
// `months` controls the rolling trend window (always the last N months).
// `month` (optional) scopes totals/byCategory/topCategories to one specific
// month instead of all-time — the trend charts stay on their rolling window
// regardless, since a single month doesn't make sense as a "trend."
router.get('/summary', async (req, res) => {
  try {
    const months = Math.min(Math.max(parseInt(req.query.months) || 6, 1), 24);
    const userId = new mongoose.Types.ObjectId(req.userId);
    const monthFilter = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : null;

    const now = new Date();
    const monthKeys = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthKeys.push(d.toISOString().slice(0, 7));
    }
    const earliestMonth = monthKeys[0];

    // --- totals (all-time, or scoped to one month if requested) ---
    const totalsMatch = monthFilter
      ? { userId, date: { $gte: `${monthFilter}-01`, $lt: `${monthFilter}-32` } }
      : { userId };
    const totalsAgg = await Transaction.aggregate([
      { $match: totalsMatch },
      { $group: { _id: '$type', total: { $sum: '$amount' } } },
    ]);
    const totalIncome = totalsAgg.find((t) => t._id === 'income')?.total || 0;
    const totalOutcome = totalsAgg.find((t) => t._id === 'outcome')?.total || 0;

    // --- outcome grouped by category (same scope as totals above) ---
    const byCategoryMatch = monthFilter
      ? { userId, type: 'outcome', date: { $gte: `${monthFilter}-01`, $lt: `${monthFilter}-32` } }
      : { userId, type: 'outcome' };
    const byCategoryAgg = await Transaction.aggregate([
      { $match: byCategoryMatch },
      { $group: { _id: '$categoryId', total: { $sum: '$amount' } } },
      { $sort: { total: -1 } },
    ]);
    const categoryIds = byCategoryAgg.filter((c) => c._id).map((c) => c._id);
    const categories = await Category.find({ _id: { $in: categoryIds } });
    const catMap = Object.fromEntries(categories.map((c) => [c._id.toString(), c]));
    const byCategory = byCategoryAgg.map((c) => ({
      categoryId: c._id ? c._id.toString() : null,
      name: c._id ? catMap[c._id.toString()]?.name || 'Unknown' : 'Uncategorized',
      color: c._id ? catMap[c._id.toString()]?.color || '#8FA096' : '#8FA096',
      total: c.total,
    }));

    // --- monthly income vs outcome trend ---
    const monthlyAgg = await Transaction.aggregate([
      { $match: { userId, date: { $gte: `${earliestMonth}-01` } } },
      {
        $group: {
          _id: { month: { $substrCP: ['$date', 0, 7] }, type: '$type' },
          total: { $sum: '$amount' },
        },
      },
    ]);
    const monthlyIncome = {};
    const monthlyOutcome = {};
    monthlyAgg.forEach((m) => {
      if (m._id.type === 'income') monthlyIncome[m._id.month] = m.total;
      else monthlyOutcome[m._id.month] = m.total;
    });
    const trend = monthKeys.map((m) => ({
      month: m,
      income: monthlyIncome[m] || 0,
      outcome: monthlyOutcome[m] || 0,
    }));

    // --- cumulative balance trend (running balance carried in from before the window) ---
    const beforeAgg = await Transaction.aggregate([
      { $match: { userId, date: { $lt: `${earliestMonth}-01` } } },
      { $group: { _id: '$type', total: { $sum: '$amount' } } },
    ]);
    let runningBalance =
      (beforeAgg.find((t) => t._id === 'income')?.total || 0) -
      (beforeAgg.find((t) => t._id === 'outcome')?.total || 0);
    const balanceTrend = trend.map((t) => {
      runningBalance += t.income - t.outcome;
      return { month: t.month, balance: Math.round(runningBalance * 100) / 100 };
    });

    res.json({
      totals: { income: totalIncome, outcome: totalOutcome, balance: totalIncome - totalOutcome },
      byCategory,
      topCategories: byCategory.slice(0, 6),
      trend,
      balanceTrend,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load analytics summary.' });
  }
});

module.exports = router;
