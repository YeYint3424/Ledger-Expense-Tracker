/* =========================================================
   SEED SCRIPT — creates real accounts + sample data in your
   actual MongoDB database.

   Run with:  node seed.js   (or  npm run seed)

   Safe to re-run: it checks for existing users/data by email
   and skips anything that's already there instead of duplicating.
   ========================================================= */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const connectDB = require('./config/db');

const User = require('./models/User');
const Category = require('./models/Category');
const Transaction = require('./models/Transaction');
const GroupCategory = require('./models/GroupCategory');
const Group = require('./models/Group');
const GroupExpense = require('./models/GroupExpense');
const Friendship = require('./models/Friendship');
const Conversation = require('./models/Conversation');
const Message = require('./models/Message');

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function minutesAgoDate(n) {
  return new Date(Date.now() - n * 60000);
}

async function findOrCreateUser(name, email, password) {
  let user = await User.findOne({ email });
  if (user) {
    console.log(`- User ${email} already exists, reusing.`);
    return user;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  user = await User.create({ name, email, passwordHash });
  console.log(`✓ Created user ${email}`);
  return user;
}

async function findOrCreateCategory(userId, name, color) {
  let cat = await Category.findOne({ userId, name });
  if (cat) return cat;
  return Category.create({ userId, name, color });
}

async function seedCategoriesForUser(user) {
  const defs = [
    ['Food & Dining', '#B0462B'],
    ['Transport', '#3E7D53'],
    ['Shopping', '#B98B2E'],
    ['Bills & Utilities', '#5B6B8C'],
    ['Entertainment', '#8E4E8C'],
  ];
  const map = {};
  for (const [name, color] of defs) {
    map[name] = await findOrCreateCategory(user._id, name, color);
  }
  return map;
}

async function seedTransactionsForUser(user, categories) {
  const existing = await Transaction.countDocuments({ userId: user._id });
  if (existing > 0) {
    console.log(`- Transactions already exist for ${user.email}, skipping.`);
    return;
  }

  const incomeItems = [
    { name: 'Monthly salary', amount: 3200, days: 28 },
    { name: 'Freelance project', amount: 450, days: 14 },
    { name: 'Birthday gift', amount: 100, days: 5 },
  ];
  for (const item of incomeItems) {
    await Transaction.create({
      userId: user._id,
      type: 'income',
      name: item.name,
      amount: item.amount,
      date: daysAgo(item.days),
      time: '09:00',
      description: '',
      categoryId: null,
    });
  }

  const outcomeItems = [
    { name: 'Grocery shopping', amount: 85.5, cat: 'Food & Dining', days: 20 },
    { name: 'Bus pass', amount: 40, cat: 'Transport', days: 18 },
    { name: 'Movie night', amount: 32, cat: 'Entertainment', days: 10 },
    { name: 'Electricity bill', amount: 65, cat: 'Bills & Utilities', days: 7 },
    { name: 'Dinner out', amount: 48.75, cat: 'Food & Dining', days: 3 },
    { name: 'New headphones', amount: 59.99, cat: 'Shopping', days: 2 },
  ];
  for (const item of outcomeItems) {
    await Transaction.create({
      userId: user._id,
      type: 'outcome',
      name: item.name,
      amount: item.amount,
      date: daysAgo(item.days),
      time: '18:30',
      description: '',
      categoryId: categories[item.cat]._id,
    });
  }
  console.log(`✓ Seeded income + outcome transactions for ${user.email}`);
}

async function seedFriendshipAndDirectMessages(userA, userB) {
  let friendship = await Friendship.findOne({
    $or: [
      { requester: userA._id, recipient: userB._id },
      { requester: userB._id, recipient: userA._id },
    ],
  });
  if (!friendship) {
    friendship = await Friendship.create({ requester: userA._id, recipient: userB._id, status: 'accepted' });
    console.log(`✓ Created friendship: ${userA.email} <-> ${userB.email}`);
  } else if (friendship.status !== 'accepted') {
    friendship.status = 'accepted';
    await friendship.save();
    console.log(`✓ Confirmed pending friendship: ${userA.email} <-> ${userB.email}`);
  } else {
    console.log(`- Friendship already exists between ${userA.email} and ${userB.email}.`);
  }

  const pair = [userA._id.toString(), userB._id.toString()].sort();
  let convo = await Conversation.findOne({ participants: { $all: pair, $size: 2 } });
  if (!convo) {
    convo = await Conversation.create({ participants: pair });
    console.log('✓ Created direct-message conversation');
  }

  const existingCount = await Message.countDocuments({ scope: 'direct', conversationId: convo._id });
  if (existingCount > 0) {
    console.log('- Direct messages already exist, skipping.');
    return convo;
  }

  const thread = [
    { sender: userA, text: "Hey! How's the budget tracking going?", mins: 130 },
    { sender: userB, text: "Pretty good — I've been logging everything this week", mins: 125 },
    { sender: userA, text: 'Nice. Want to split the trip expenses in a group?', mins: 100 },
    { sender: userB, text: 'Sure, set it up whenever works', mins: 95 },
    { sender: userA, text: 'Done — check the Groups tab', mins: 90 },
    { sender: userB, text: 'Got it, added the hotel already 👍', mins: 60 },
  ];
  for (const m of thread) {
    await Message.create({
      scope: 'direct',
      conversationId: convo._id,
      senderId: m.sender._id,
      text: m.text,
      createdAt: minutesAgoDate(m.mins),
    });
  }
  console.log(`✓ Seeded ${thread.length} direct messages`);
  return convo;
}

async function seedGroupAndGroupMessages(userA, userB) {
  let groupCategory = await GroupCategory.findOne({ name: 'Trip' });
  if (!groupCategory) {
    groupCategory = await GroupCategory.create({ name: 'Trip', color: '#B98B2E' });
    console.log('✓ Created group category "Trip"');
  }

  let group = await Group.findOne({ name: 'Weekend Getaway', createdBy: userA._id });
  if (!group) {
    group = await Group.create({
      name: 'Weekend Getaway',
      description: 'Splitting costs for our weekend trip',
      categoryId: groupCategory._id,
      createdBy: userA._id,
      members: [
        { userId: userA._id, role: 'admin' },
        { userId: userB._id, role: 'member' },
      ],
    });
    console.log('✓ Created group "Weekend Getaway" with both users as members');
  } else {
    console.log('- Group "Weekend Getaway" already exists, reusing.');
  }

  // Group expenses use the payer's own personal categories (matches the app's design).
  const userACats = await seedCategoriesForUser(userA);

  const existingExpenses = await GroupExpense.countDocuments({ groupId: group._id });
  if (existingExpenses === 0) {
    await GroupExpense.create({
      groupId: group._id,
      paidBy: userA._id,
      createdBy: userA._id,
      categoryId: userACats['Food & Dining']._id,
      name: 'Hotel booking',
      amount: 220,
      date: daysAgo(6),
      time: '14:00',
      description: 'Two nights, split evenly',
      splitBetween: [userA._id, userB._id],
    });
    await GroupExpense.create({
      groupId: group._id,
      paidBy: userB._id,
      createdBy: userB._id,
      categoryId: userACats['Transport']._id,
      name: 'Gas and tolls',
      amount: 60,
      date: daysAgo(5),
      time: '10:00',
      description: '',
      splitBetween: [userA._id, userB._id],
    });
    console.log('✓ Seeded group expenses');
  } else {
    console.log('- Group expenses already exist, skipping.');
  }

  const existingGroupMsgs = await Message.countDocuments({ scope: 'group', groupId: group._id });
  if (existingGroupMsgs > 0) {
    console.log('- Group chat messages already exist, skipping.');
    return group;
  }

  const groupThread = [
    { sender: userA, text: 'I booked the hotel, sending the receipt now', mins: 200 },
    { sender: userB, text: 'Awesome, thank you!', mins: 195 },
    { sender: userB, text: "I'll cover gas on the way there", mins: 180 },
    { sender: userA, text: 'Sounds good 👍', mins: 175 },
  ];
  for (const m of groupThread) {
    await Message.create({
      scope: 'group',
      groupId: group._id,
      senderId: m.sender._id,
      text: m.text,
      createdAt: minutesAgoDate(m.mins),
    });
  }
  console.log(`✓ Seeded ${groupThread.length} group chat messages`);
  return group;
}

async function main() {
  await connectDB();
  console.log('');

  const yeying = await findOrCreateUser('Yeying', 'yeying@gmail.com', '123456');
  const thel = await findOrCreateUser('Thel', 'thel@gmail.com', '123456');
  console.log('');

  const yeyingCats = await seedCategoriesForUser(yeying);
  const thelCats = await seedCategoriesForUser(thel);
  console.log('✓ Personal categories ready for both users\n');

  await seedTransactionsForUser(yeying, yeyingCats);
  await seedTransactionsForUser(thel, thelCats);
  console.log('');

  await seedFriendshipAndDirectMessages(yeying, thel);
  console.log('');

  await seedGroupAndGroupMessages(yeying, thel);

  console.log('\n============================================');
  console.log('Seed complete! Log in with either account:');
  console.log('  yeying@gmail.com / 123456');
  console.log('  thel@gmail.com   / 123456');
  console.log('============================================\n');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n✗ Seed failed:', err.message);
  console.error(err);
  process.exit(1);
});
