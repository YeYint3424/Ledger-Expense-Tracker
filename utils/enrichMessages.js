const mongoose = require('mongoose');
const User = require('../models/User');

/** Pulls a plain id string out of senderId no matter what shape it currently is. */
function extractIdString(senderIdField) {
  if (senderIdField == null) return null;
  if (typeof senderIdField === 'string') return senderIdField;
  if (typeof senderIdField === 'object') {
    if (senderIdField.id) return String(senderIdField.id);
    if (senderIdField._id) return senderIdField._id.toString ? senderIdField._id.toString() : String(senderIdField._id);
    return null; // an object with neither .id nor ._id isn't a usable id — don't blindly String() it
  }
  return String(senderIdField);
}

/** True only for something that can actually be cast to a Mongo ObjectId. */
function isValidId(id) {
  return typeof id === 'string' && mongoose.Types.ObjectId.isValid(id);
}

/**
 * Guarantees every message in `jsonMessages` (already run through .toJSON())
 * ends up with senderId as a real { id, name } object — even if Mongoose's
 * populate('senderId', 'name') didn't resolve a name for some reason — by
 * looking up any still-unresolved senders directly. Also backfills
 * replyTo.senderName the same way, using the senderId the Message model's
 * transform now carries alongside it.
 *
 * Every id is validated with isValidId() before it's ever used in a Mongo
 * query, so a malformed/unexpected value can never crash the request — it
 * just falls back to the 'Member' placeholder for that one message instead.
 *
 * Mutates and returns the same array.
 */
async function enrichSenderNames(jsonMessages) {
  const idsNeeded = new Set();

  jsonMessages.forEach((m) => {
    const hasName = m.senderId && typeof m.senderId === 'object' && m.senderId.name;
    const id = extractIdString(m.senderId);
    if (id && isValidId(id) && !hasName) idsNeeded.add(id);

    if (m.replyTo && typeof m.replyTo === 'object' && !m.replyTo.senderName) {
      const replyId = extractIdString(m.replyTo.senderId);
      if (replyId && isValidId(replyId)) idsNeeded.add(replyId);
    }
  });

  let nameMap = {};
  if (idsNeeded.size) {
    try {
      const users = await User.find({ _id: { $in: [...idsNeeded] } }).select('name');
      nameMap = Object.fromEntries(users.map((u) => [u._id.toString(), u.name]));
    } catch (err) {
      // Shouldn't happen now that ids are pre-validated, but never let a lookup
      // failure here take down the whole message list — just fall back below.
      console.error('enrichSenderNames: user lookup failed', err.message);
    }
  }

  jsonMessages.forEach((m) => {
    const id = extractIdString(m.senderId);
    const existingName = m.senderId && typeof m.senderId === 'object' ? m.senderId.name : null;
    m.senderId = { id, name: existingName || (id && nameMap[id]) || 'Member' };

    if (m.replyTo && typeof m.replyTo === 'object' && !m.replyTo.senderName) {
      const replyId = extractIdString(m.replyTo.senderId);
      m.replyTo.senderName = (replyId && nameMap[replyId]) || 'Member';
    }
  });

  return jsonMessages;
}

module.exports = { enrichSenderNames, extractIdString, isValidId };
