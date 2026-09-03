require('dotenv').config();

const express = require('express');
const path = require('path');
const http = require('http');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/db');
const initSockets = require('./sockets');

const authRoutes = require('./routes/auth.routes');
const categoryRoutes = require('./routes/category.routes');
const transactionRoutes = require('./routes/transaction.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const groupCategoryRoutes = require('./routes/groupCategory.routes');
const groupRoutes = require('./routes/group.routes');
const friendRoutes = require('./routes/friend.routes');
const conversationRoutes = require('./routes/conversation.routes');
const exportRoutes = require('./routes/export.routes');

const app = express();
const httpServer = http.createServer(app);

connectDB();

app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/group-categories', groupCategoryRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/export', exportRoutes);

app.use(express.static(path.join(__dirname, 'public')));

initSockets(httpServer);

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Ledger server running at http://localhost:${PORT}`);
});
