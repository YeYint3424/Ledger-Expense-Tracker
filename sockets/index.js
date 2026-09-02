const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const Group = require('../models/Group');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Friendship = require('../models/Friendship');
const User = require('../models/User');
const { enrichSenderNames } = require('../utils/enrichMessages');

function isMemberOfGroup(group, userId) {
  return group.members.some((m) => m.userId.toString() === userId.toString());
}

/** Populates sender name + (if present) a nested reply preview in one place. */
async function populateMessage(message) {
  await message.populate('senderId', 'name');
  await message.populate({
    path: 'replyTo',
    select: 'text senderId deleted',
    populate: { path: 'senderId', select: 'name' },
  });
  return message;
}

/**
 * Converts a populated message document to its JSON form and runs it through
 * the same enrichSenderNames() backfill the REST message-history routes use —
 * so a name is guaranteed even if populate() didn't resolve one for some reason.
 */
async function toEnrichedJSON(message) {
  const json = message.toJSON();
  await enrichSenderNames([json]);
  return json;
}

/** The Socket.IO room a given message belongs to, for broadcasting edits/deletes. */
function roomFor(message) {
  return message.scope === 'group' ? `group:${message.groupId}` : `conversation:${message.conversationId}`;
}
function eventFor(message) {
  return message.scope === 'group' ? 'group-message' : 'direct-message';
}

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

function initSockets(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: true, credentials: true },
    // Tolerate brief network blips (mobile tab backgrounded, wifi hiccup, Vercel cold start)
    // without the client falling into a broken "Session ID unknown" state: instead of the
    // engine.io session being torn down the moment a ping is missed, it's kept alive for a
    // grace window so a client that comes back can resume the same session and its room
    // membership (group/conversation joins) instead of having to reconnect from scratch.
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: false,
    },
    pingTimeout: 30000,
    pingInterval: 25000,
  });

  // Auth handshake: read the same httpOnly JWT cookie the REST API uses.
  io.use((socket, next) => {
    try {
      const rawCookie = socket.handshake.headers.cookie || '';
      const parsed = cookie.parse(rawCookie);
      const token = parsed.token;
      if (!token) return next(new Error('Not authenticated'));
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = payload.userId;
      next();
    } catch (err) {
      next(new Error('Not authenticated'));
    }
  });

  io.on('connection', async (socket) => {
    // Join every room this user belongs to right away, so they get real-time
    // notifications (new group message, new DM) no matter which page they're
    // on — not only while the specific chat is open.
    try {
      const groups = await Group.find({ 'members.userId': socket.userId }).select('_id');
      groups.forEach((g) => socket.join(`group:${g._id}`));
      const conversations = await Conversation.find({ participants: socket.userId }).select('_id');
      conversations.forEach((c) => socket.join(`conversation:${c._id}`));
    } catch (err) {
      console.error('Failed to auto-join rooms for socket', err);
    }

    /* ---- group chat ---- */

    socket.on('join-group', async (groupId) => {
      const group = await Group.findById(groupId);
      if (group && isMemberOfGroup(group, socket.userId)) {
        socket.join(`group:${groupId}`);
      }
    });

    socket.on('leave-group', (groupId) => {
      socket.leave(`group:${groupId}`);
    });

    socket.on('group-message', async ({ groupId, text, replyTo }) => {
      if (!text || !text.trim()) return;
      const group = await Group.findById(groupId);
      if (!group || !isMemberOfGroup(group, socket.userId)) return;

      let replyToId = null;
      if (replyTo) {
        const original = await Message.findOne({ _id: replyTo, scope: 'group', groupId });
        if (original) replyToId = original._id;
      }

      const message = await Message.create({
        scope: 'group',
        groupId,
        senderId: socket.userId,
        text: text.trim(),
        replyTo: replyToId,
      });
      await populateMessage(message);
      io.to(`group:${groupId}`).emit('group-message', await toEnrichedJSON(message));
    });

    /* ---- direct messages (friends only) ---- */

    socket.on('join-conversation', async (conversationId) => {
      const convo = await Conversation.findById(conversationId);
      if (convo && convo.participants.some((p) => p.toString() === socket.userId)) {
        socket.join(`conversation:${conversationId}`);
      }
    });

    socket.on('leave-conversation', (conversationId) => {
      socket.leave(`conversation:${conversationId}`);
    });

    socket.on('direct-message', async ({ conversationId, text, replyTo }) => {
      if (!text || !text.trim()) return;
      const convo = await Conversation.findById(conversationId);
      if (!convo || !convo.participants.some((p) => p.toString() === socket.userId)) return;

      const otherId = convo.participants.find((p) => p.toString() !== socket.userId);
      if (!(await areFriends(socket.userId, otherId))) return; // unfriended since the thread started — block sending

      let replyToId = null;
      if (replyTo) {
        const original = await Message.findOne({ _id: replyTo, scope: 'direct', conversationId });
        if (original) replyToId = original._id;
      }

      const message = await Message.create({
        scope: 'direct',
        conversationId,
        senderId: socket.userId,
        text: text.trim(),
        replyTo: replyToId,
      });
      await populateMessage(message);
      io.to(`conversation:${conversationId}`).emit('direct-message', await toEnrichedJSON(message));
    });

    /* ---- edit / delete (soft) / forward — works for both group & direct ---- */

    socket.on('edit-message', async ({ messageId, text }) => {
      if (!text || !text.trim()) return;
      const message = await Message.findById(messageId);
      if (!message) return;
      if (message.senderId.toString() !== socket.userId) return; // only the author can edit
      if (message.deleted) return;

      message.text = text.trim();
      message.edited = true;
      message.editedAt = new Date();
      await message.save();
      await populateMessage(message);

      io.to(roomFor(message)).emit('message-edited', await toEnrichedJSON(message));
    });

    socket.on('delete-message', async ({ messageId }) => {
      const message = await Message.findById(messageId);
      if (!message) return;
      if (message.senderId.toString() !== socket.userId) return; // only the author can delete their own message
      if (message.deleted) return;

      message.deleted = true;
      message.deletedAt = new Date();
      await message.save();

      io.to(roomFor(message)).emit('message-deleted', {
        id: message._id.toString(),
        scope: message.scope,
        groupId: message.groupId ? message.groupId.toString() : null,
        conversationId: message.conversationId ? message.conversationId.toString() : null,
      });
    });

    socket.on('forward-message', async ({ messageId, targetScope, targetId }) => {
      const original = await Message.findById(messageId).populate('senderId', 'name');
      if (!original || original.deleted) return;

      // Requester must actually have access to the source message.
      if (original.scope === 'group') {
        const sourceGroup = await Group.findById(original.groupId);
        if (!sourceGroup || !isMemberOfGroup(sourceGroup, socket.userId)) return;
      } else {
        const sourceConvo = await Conversation.findById(original.conversationId);
        if (!sourceConvo || !sourceConvo.participants.some((p) => p.toString() === socket.userId)) return;
      }

      const forwardedFrom = {
        senderName: original.senderId.name || 'Someone',
        text: original.text,
      };

      if (targetScope === 'group') {
        const targetGroup = await Group.findById(targetId);
        if (!targetGroup || !isMemberOfGroup(targetGroup, socket.userId)) return;

        const message = await Message.create({
          scope: 'group',
          groupId: targetId,
          senderId: socket.userId,
          text: original.text,
          forwardedFrom,
        });
        await populateMessage(message);
        io.to(`group:${targetId}`).emit('group-message', await toEnrichedJSON(message));
      } else if (targetScope === 'direct') {
        const targetConvo = await Conversation.findById(targetId);
        if (!targetConvo || !targetConvo.participants.some((p) => p.toString() === socket.userId)) return;
        const otherId = targetConvo.participants.find((p) => p.toString() !== socket.userId);
        if (!(await areFriends(socket.userId, otherId))) return;

        const message = await Message.create({
          scope: 'direct',
          conversationId: targetId,
          senderId: socket.userId,
          text: original.text,
          forwardedFrom,
        });
        await populateMessage(message);
        io.to(`conversation:${targetId}`).emit('direct-message', await toEnrichedJSON(message));
      }
    });
  });

  return io;
}

module.exports = initSockets;
