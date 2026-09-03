const router = require('express').Router();
const Group = require('../models/Group');
const GroupExpense = require('../models/GroupExpense');
const Category = require('../models/Category');
const Message = require('../models/Message');
const User = require('../models/User');
const { enrichSenderNames } = require('../utils/enrichMessages');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

function isMember(group, userId) {
  return group.members.some((m) => m.userId.toString() === userId.toString());
}
function isAdmin(group, userId) {
  return group.members.some((m) => m.userId.toString() === userId.toString() && m.role === 'admin');
}
async function enrichMembers(group) {
  const ids = group.members.map((m) => m.userId);
  const users = await User.find({ _id: { $in: ids } }).select('name email');
  const userMap = Object.fromEntries(users.map((u) => [u._id.toString(), u]));
  return group.members.map((m) => ({
    userId: m.userId.toString(),
    role: m.role,
    joinedAt: m.joinedAt,
    name: userMap[m.userId.toString()]?.name || 'Unknown',
    email: userMap[m.userId.toString()]?.email || '',
  }));
}
async function toGroupJSON(group) {
  const json = group.toJSON();
  json.members = await enrichMembers(group);
  return json;
}

router.get('/', async (req, res) => {
  const groups = await Group.find({ 'members.userId': req.userId }).sort({ updatedAt: -1 });
  const withMembers = await Promise.all(groups.map(toGroupJSON));
  res.json({ groups: withMembers });
});

router.post('/', async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Group name is required.' });

    const group = await Group.create({
      name,
      description: (req.body.description || '').trim(),
      categoryId: req.body.categoryId || null,
      createdBy: req.userId,
      members: [{ userId: req.userId, role: 'admin' }],
    });
    res.status(201).json({ group: await toGroupJSON(group) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create group.' });
  }
});

router.get('/:id', async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group || !isMember(group, req.userId)) return res.status(404).json({ error: 'Group not found.' });
  res.json({ group: await toGroupJSON(group) });
});

router.put('/:id', async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group || !isMember(group, req.userId)) return res.status(404).json({ error: 'Group not found.' });
  if (!isAdmin(group, req.userId)) return res.status(403).json({ error: 'Only a group admin can edit this group.' });

  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Group name is required.' });
  group.name = name;
  group.description = (req.body.description || '').trim();
  group.categoryId = req.body.categoryId || null;
  await group.save();
  res.json({ group: await toGroupJSON(group) });
});

router.delete('/:id', async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group || !isMember(group, req.userId)) return res.status(404).json({ error: 'Group not found.' });
  if (!isAdmin(group, req.userId)) return res.status(403).json({ error: 'Only a group admin can delete this group.' });

  await Group.deleteOne({ _id: group._id });
  await GroupExpense.deleteMany({ groupId: group._id });
  await Message.deleteMany({ scope: 'group', groupId: group._id });
  res.json({ ok: true });
});

router.post('/:id/members', async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group || !isMember(group, req.userId)) return res.status(404).json({ error: 'Group not found.' });

  const email = (req.body.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ error: 'No account found with that email.' });
  if (isMember(group, user._id)) return res.status(409).json({ error: 'That person is already in the group.' });

  group.members.push({ userId: user._id, role: 'member' });
  await group.save();
  res.status(201).json({ group: await toGroupJSON(group) });
});

router.delete('/:id/members/:userId', async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group || !isMember(group, req.userId)) return res.status(404).json({ error: 'Group not found.' });

  const targetId = req.params.userId;
  const removingSelf = targetId === req.userId;
  if (!removingSelf && !isAdmin(group, req.userId)) {
    return res.status(403).json({ error: 'Only a group admin can remove other members.' });
  }
  const admins = group.members.filter((m) => m.role === 'admin');
  if (removingSelf && admins.length === 1 && admins[0].userId.toString() === req.userId && group.members.length > 1) {
    return res.status(400).json({ error: 'Promote another member to admin before you leave.' });
  }

  group.members = group.members.filter((m) => m.userId.toString() !== targetId);
  if (!group.members.length) {
    await Group.deleteOne({ _id: group._id });
    await GroupExpense.deleteMany({ groupId: group._id });
    await Message.deleteMany({ scope: 'group', groupId: group._id });
    return res.json({ ok: true, deleted: true });
  }
  await group.save();
  res.json({ group: await toGroupJSON(group) });
});

router.get('/:id/expenses', async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group || !isMember(group, req.userId)) return res.status(404).json({ error: 'Group not found.' });
  const expenses = await GroupExpense.find({ groupId: group._id })
    .sort({ date: -1, time: -1 })
    .populate('categoryId', 'name color');
  res.json({ expenses });
});

router.post('/:id/expenses', async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group || !isMember(group, req.userId)) return res.status(404).json({ error: 'Group not found.' });

  try {
    const { name, amount, date, time, description, paidBy, splitBetween, categoryId } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required.' });
    if (!date || !time) return res.status(400).json({ error: 'Date and time are required.' });
    if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'Amount must be greater than 0.' });
    if (!categoryId) return res.status(400).json({ error: 'Category is required.' });

    const category = await Category.findOne({ _id: categoryId, userId: req.userId });
    if (!category) return res.status(400).json({ error: 'Choose a category from your own category list.' });

    const payer = paidBy || req.userId;
    if (!isMember(group, payer)) return res.status(400).json({ error: 'The payer must be a group member.' });

    let split = Array.isArray(splitBetween) && splitBetween.length ? splitBetween : group.members.map((m) => m.userId.toString());
    split = split.filter((id) => isMember(group, id));
    if (!split.length) split = group.members.map((m) => m.userId.toString());

    const expense = await GroupExpense.create({
      groupId: group._id,
      paidBy: payer,
      createdBy: req.userId,
      categoryId,
      name: name.trim(),
      amount: Number(amount),
      date,
      time,
      description: (description || '').trim(),
      splitBetween: split,
    });
    await expense.populate('categoryId', 'name color');
    res.status(201).json({ expense });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add expense.' });
  }
});

router.put('/:id/expenses/:expenseId', async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group || !isMember(group, req.userId)) return res.status(404).json({ error: 'Group not found.' });

  const { name, amount, date, time, description, paidBy, splitBetween, categoryId } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required.' });
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'Amount must be greater than 0.' });
  if (!categoryId) return res.status(400).json({ error: 'Category is required.' });

  const category = await Category.findOne({ _id: categoryId, userId: req.userId });
  if (!category) return res.status(400).json({ error: 'Choose a category from your own category list.' });

  const payer = paidBy || req.userId;
  let split = Array.isArray(splitBetween) && splitBetween.length ? splitBetween : group.members.map((m) => m.userId.toString());
  split = split.filter((id) => isMember(group, id));

  const expense = await GroupExpense.findOneAndUpdate(
    { _id: req.params.expenseId, groupId: group._id },
    {
      name: name.trim(),
      amount: Number(amount),
      date,
      time,
      description: (description || '').trim(),
      paidBy: payer,
      categoryId,
      splitBetween: split,
    },
    { new: true }
  ).populate('categoryId', 'name color');
  if (!expense) return res.status(404).json({ error: 'Expense not found.' });
  res.json({ expense });
});

router.delete('/:id/expenses/:expenseId', async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group || !isMember(group, req.userId)) return res.status(404).json({ error: 'Group not found.' });
  const expense = await GroupExpense.findOneAndDelete({ _id: req.params.expenseId, groupId: group._id });
  if (!expense) return res.status(404).json({ error: 'Expense not found.' });
  res.json({ ok: true });
});

router.get('/:id/balances', async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group || !isMember(group, req.userId)) return res.status(404).json({ error: 'Group not found.' });

  const expenses = await GroupExpense.find({ groupId: group._id });
  const members = await enrichMembers(group);

  const net = {};
  members.forEach((m) => { net[m.userId] = 0; });

  expenses.forEach((e) => {
    const payerId = e.paidBy.toString();
    const share = e.amount / (e.splitBetween.length || 1);
    net[payerId] = (net[payerId] || 0) + e.amount;
    e.splitBetween.forEach((uid) => {
      const id = uid.toString();
      net[id] = (net[id] || 0) - share;
    });
  });

  const balances = members.map((m) => ({
    userId: m.userId,
    name: m.name,
    email: m.email,
    balance: Math.round((net[m.userId] || 0) * 100) / 100,
  }));

  const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);

  res.json({ balances, totalSpent });
});

router.get('/:id/messages', async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group || !isMember(group, req.userId)) return res.status(404).json({ error: 'Group not found.' });

  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const messages = await Message.find({ scope: 'group', groupId: group._id })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('senderId', 'name')
    .populate({ path: 'replyTo', select: 'text senderId deleted', populate: { path: 'senderId', select: 'name' } });
  const json = messages.reverse().map((m) => m.toJSON());
  await enrichSenderNames(json);
  res.json({ messages: json });
});

module.exports = router;
