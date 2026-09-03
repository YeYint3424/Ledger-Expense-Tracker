const router = require('express').Router();
const Friendship = require('../models/Friendship');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', async (req, res) => {
  const friendships = await Friendship.find({
    status: 'accepted',
    $or: [{ requester: req.userId }, { recipient: req.userId }],
  })
    .populate('requester', 'name email')
    .populate('recipient', 'name email');

  const friends = friendships.map((f) => {
    const other = f.requester._id.toString() === req.userId ? f.recipient : f.requester;
    return { friendshipId: f._id.toString(), userId: other._id.toString(), name: other.name, email: other.email };
  });
  res.json({ friends });
});

router.get('/requests', async (req, res) => {
  const incoming = await Friendship.find({ recipient: req.userId, status: 'pending' }).populate('requester', 'name email');
  const outgoing = await Friendship.find({ requester: req.userId, status: 'pending' }).populate('recipient', 'name email');
  res.json({
    incoming: incoming.map((f) => ({
      id: f._id.toString(),
      from: { id: f.requester._id.toString(), name: f.requester.name, email: f.requester.email },
    })),
    outgoing: outgoing.map((f) => ({
      id: f._id.toString(),
      to: { id: f.recipient._id.toString(), name: f.recipient.name, email: f.recipient.email },
    })),
  });
});

router.post('/requests', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const target = await User.findOne({ email });
    if (!target) return res.status(404).json({ error: 'No account found with that email.' });
    if (target._id.toString() === req.userId) return res.status(400).json({ error: "You can't add yourself." });

    const existing = await Friendship.findOne({
      $or: [
        { requester: req.userId, recipient: target._id },
        { requester: target._id, recipient: req.userId },
      ],
    });
    if (existing) {
      if (existing.status === 'accepted') return res.status(409).json({ error: 'You are already friends.' });
      if (existing.status === 'pending') return res.status(409).json({ error: 'A friend request is already pending.' });
      existing.status = 'pending';
      existing.requester = req.userId;
      existing.recipient = target._id;
      await existing.save();
      return res.status(201).json({ ok: true });
    }

    await Friendship.create({ requester: req.userId, recipient: target._id, status: 'pending' });
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send friend request.' });
  }
});

router.post('/requests/:id/accept', async (req, res) => {
  const request = await Friendship.findOne({ _id: req.params.id, recipient: req.userId, status: 'pending' });
  if (!request) return res.status(404).json({ error: 'Friend request not found.' });
  request.status = 'accepted';
  await request.save();

  const pair = [request.requester.toString(), request.recipient.toString()].sort();
  let convo = await Conversation.findOne({ participants: { $all: pair, $size: 2 } });
  if (!convo) convo = await Conversation.create({ participants: pair });

  res.json({ ok: true, conversationId: convo._id.toString() });
});

router.post('/requests/:id/decline', async (req, res) => {
  const request = await Friendship.findOne({ _id: req.params.id, recipient: req.userId, status: 'pending' });
  if (!request) return res.status(404).json({ error: 'Friend request not found.' });
  request.status = 'declined';
  await request.save();
  res.json({ ok: true });
});

router.delete('/:userId', async (req, res) => {
  const result = await Friendship.findOneAndDelete({
    status: 'accepted',
    $or: [
      { requester: req.userId, recipient: req.params.userId },
      { requester: req.params.userId, recipient: req.userId },
    ],
  });
  if (!result) return res.status(404).json({ error: 'Friendship not found.' });
  res.json({ ok: true });
});

module.exports = router;
