const router = require('express').Router();
const ExcelJS = require('exceljs');
const Transaction = require('../models/Transaction');
const Category = require('../models/Category');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/export/xlsx — the user's transactions + categories as a real .xlsx workbook
router.get('/xlsx', async (req, res) => {
  try {
    const [transactions, categories] = await Promise.all([
      Transaction.find({ userId: req.userId }).sort({ date: -1, time: -1 }),
      Category.find({ userId: req.userId }).sort({ name: 1 }),
    ]);
    const catMap = Object.fromEntries(categories.map((c) => [c._id.toString(), c.name]));

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Ledger';
    workbook.created = new Date();

    const txSheet = workbook.addWorksheet('Transactions');
    txSheet.columns = [
      { header: 'Type', key: 'type', width: 12 },
      { header: 'Name', key: 'name', width: 28 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Amount', key: 'amount', width: 14 },
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Time', key: 'time', width: 10 },
      { header: 'Description', key: 'description', width: 36 },
    ];
    txSheet.getRow(1).font = { bold: true };
    txSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF3EC' } };

    transactions.forEach((t) => {
      const row = txSheet.addRow({
        type: t.type === 'income' ? 'Income' : 'Outcome',
        name: t.name,
        category: t.categoryId ? catMap[t.categoryId.toString()] || 'Unknown' : '',
        amount: t.amount,
        date: t.date,
        time: t.time,
        description: t.description || '',
      });
      row.getCell('amount').numFmt = '#,##0.00';
      if (t.type === 'income') row.getCell('type').font = { color: { argb: 'FF3E7D53' }, bold: true };
      else row.getCell('type').font = { color: { argb: 'FFB0462B' }, bold: true };
    });

    const catSheet = workbook.addWorksheet('Categories');
    catSheet.columns = [
      { header: 'Name', key: 'name', width: 28 },
      { header: 'Color', key: 'color', width: 14 },
    ];
    catSheet.getRow(1).font = { bold: true };
    catSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF3EC' } };
    categories.forEach((c) => catSheet.addRow({ name: c.name, color: c.color }));

    const filename = `ledger-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to export data.' });
  }
});

module.exports = router;
