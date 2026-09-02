const router = require('express').Router();
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Friendship = require('../models/Friendship');
const { enrichSenderNames } = require('../utils/enrichMessages');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

async function areFriends(userA, userB) {
  const f = await Friendship.findOne({
    status: 'accepted',
    $or: [
      { requester: userA, recipient: userB },
      { requester: userB, recipient: userA },
    ],
  });
  return !!f;
}

// GET /api/conversations — threads the current user is part of, with a last-message preview
router.get('/', async (req, res) => {
  const conversations = await Conversation.find({ participants: req.userId }).populate('participants', 'name email');
  const results = await Promise.all(
    conversations.map(async (c) => {
      const other = c.participants.find((p) => p._id.toString() !== req.userId);
      const lastMessage = await Message.findOne({ scope: 'direct', conversationId: c._id }).sort({ createdAt: -1 });
      return {
        id: c._id.toString(),
        friend: other ? { id: other._id.toString(), name: other.name, email: other.email } : null,
        lastMessage: lastMessage
          ? { text: lastMessage.text, createdAt: lastMessage.createdAt, senderId: lastMessage.senderId.toString() }
          : null,
      };
    })
  );
  results.sort((a, b) => {
    const at = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
    const bt = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
    return bt - at;
  });
  res.json({ conversations: results });
});

// GET /api/conversations/:id/messages?limit=50
router.get('/:id/messages', async (req, res) => {
  const convo = await Conversation.findById(req.params.id);
  if (!convo || !convo.participants.some((p) => p.toString() === req.userId)) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const messages = await Message.find({ scope: 'direct', conversationId: convo._id })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('senderId', 'name')
    .populate({ path: 'replyTo', select: 'text senderId deleted', populate: { path: 'senderId', select: 'name' } });
  const json = messages.reverse().map((m) => m.toJSON());
  await enrichSenderNames(json);
  res.json({ messages: json });
});

// POST /api/conversations/start  { friendId } — get-or-create a thread with a confirmed friend
router.post('/start', async (req, res) => {
  const friendId = req.body.friendId;
  if (!friendId) return res.status(400).json({ error: 'friendId is required.' });
  if (!(await areFriends(req.userId, friendId))) {
    return res.status(403).json({ error: 'You can only message confirmed friends.' });
  }
  const pair = [req.userId, friendId].sort();
  let convo = await Conversation.findOne({ participants: { $all: pair, $size: 2 } });
  if (!convo) convo = await Conversation.create({ participants: pair });
  res.json({ conversationId: convo._id.toString() });
});

module.exports = router;
