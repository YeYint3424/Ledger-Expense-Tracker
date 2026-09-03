const mongoose = require('mongoose');
const User = require('../models/User');

function extractIdString(senderIdField) {
  if (senderIdField == null) return null;
  if (typeof senderIdField === 'string') return senderIdField;
  if (typeof senderIdField === 'object') {
    if (senderIdField.id) return String(senderIdField.id);
    if (senderIdField._id) return senderIdField._id.toString ? senderIdField._id.toString() : String(senderIdField._id);
    return null;
  }
  return String(senderIdField);
}

function isValidId(id) {
  return typeof id === 'string' && mongoose.Types.ObjectId.isValid(id);
}

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
