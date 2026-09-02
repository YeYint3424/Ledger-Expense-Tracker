# Ledger — Expense Tracker (Node.js + Express + MongoDB + Socket.IO)

A per-user expense tracker with shared expense groups, friend-gated direct
messages, and real-time chat. Each person creates an account; personal data
(transactions, categories) is scoped to their own user id, and group data is
scoped to the group's member list.

## ⚠️ Before you do anything else

A live MongoDB connection string (including its password) was shared in plain text
to generate this project. It's already placed in `.env` so the app runs, but you
should **rotate that database user's password in MongoDB Atlas** as soon as you're
done testing, then update `.env` with the new one. Never commit `.env` to git —
`.gitignore` is already set up to exclude it.

## Project structure

```
ledger-app/
  server.js               Express + HTTP server entry point (also boots Socket.IO)
  config/db.js             MongoDB connection
  sockets/index.js         Socket.IO: JWT-cookie auth, group chat + DM rooms
  models/                  Mongoose schemas:
    User, Category, Transaction          — personal data
    GroupCategory, Group, GroupExpense    — shared expense groups
    Friendship, Conversation, Message     — friends + chat
  middleware/auth.js        JWT auth guard (reads an httpOnly cookie)
  routes/                  REST API, one file per resource (see table below)
  public/                  Static frontend served by Express
    login.html / register.html
    index.html, transactions.html, analytics.html, categories.html
    income-form.html / outcome-form.html / category-form.html
    groups.html, group-form.html, group-detail.html
    group-categories.html, group-category-form.html
    friends.html, messages.html
    style.css
    js/                    One script per page + shared api.js (incl. Socket.IO client helper)
```

## Setup

1. Install dependencies:
   ```
   npm install
   ```
2. Check `.env` — `MONGODB_URI` is already filled in, but set a real random
   `JWT_SECRET` before using this for anything beyond local testing:
   ```
   MONGODB_URI=your_connection_string
   JWT_SECRET=replace_with_a_long_random_string
   PORT=3000
   NODE_ENV=development
   ```
3. Start the server:
   ```
   npm start
   ```
4. Open `http://localhost:3000` — register an account, and try creating a
   second account in another browser/incognito window to test groups, friend
   requests, and chat between two real users.

## How auth works

- Passwords are hashed with bcrypt before being stored.
- On login/register, the server sets a JWT in an **httpOnly cookie** — not
  readable by frontend JavaScript.
- Every REST route (except `/api/auth/*`) requires that cookie via `requireAuth`
  middleware, which scopes personal data to `req.userId`.
- **Socket.IO connections authenticate with the same cookie** during the
  handshake (`sockets/index.js` parses it and verifies the JWT) — there's no
  separate login step for chat.

## Personal data API

| Method | Path | Notes |
|--------|------|-------|
| POST | /api/auth/register | `{ name, email, password }` |
| POST | /api/auth/login | `{ email, password }` |
| POST | /api/auth/logout | |
| GET | /api/auth/me | current user, or 401 |
| GET/POST/PUT/DELETE | /api/categories | personal expense categories |
| GET/POST/PUT/DELETE | /api/transactions | query filters: type, category, name, from, to |
| GET | /api/analytics/summary?months=6 | **server-side MongoDB aggregation** for the charts: totals, outcome-by-category, monthly income/outcome trend, cumulative balance trend |

## Groups (shared expenses) API

| Method | Path | Notes |
|--------|------|-------|
| GET/POST/PUT/DELETE | /api/group-categories | the group's own **topic** (Travel, Relationship, ...), set from `group-form.html` — global, any signed-in user can CRUD |
| GET/POST | /api/groups | list groups you're in / create one |
| GET/PUT/DELETE | /api/groups/:id | edit/delete are admin-only |
| POST | /api/groups/:id/members | any member can add another, by email |
| DELETE | /api/groups/:id/members/:userId | self-leave, or admin removes someone |
| GET/POST | /api/groups/:id/expenses | any member can add an expense |
| PUT/DELETE | /api/groups/:id/expenses/:expenseId | |
| GET | /api/groups/:id/balances | net balance per member — equal split across each expense's chosen participants |
| GET | /api/groups/:id/messages?limit=50 | group chat history (sending happens over the socket) |

**Expense categories come from the personal `categories` table** — the same one
your Income/Outcome forms use (`/api/categories`). Whichever member is adding
the expense picks from their own category list, with the same "➕ Add new
category…" quick-add pattern as the Outcome form. The server validates that
the chosen category belongs to whoever is submitting the form. When viewing
expenses another member added, the category is shown (and, when editing,
selectable) even though it's not in your own personal list — the server
`.populate()`s it so the name/color always display correctly regardless of who
owns it.

There are two distinct category systems here, and it's worth being clear about
which is which:
- **Group category** (`GroupCategory` model, set in `group-form.html`) — the
  group's own topic, like "Travel" or "Relationship."
- **Personal category** (`Category` model, managed on `categories.html`) —
  what each expense line item is filed under (Food, Transport, ...), reused
  as-is for group expenses.

## Friends + direct messages API

| Method | Path | Notes |
|--------|------|-------|
| GET | /api/friends | accepted friends |
| GET | /api/friends/requests | `{ incoming, outgoing }` pending requests |
| POST | /api/friends/requests | `{ email }` — send a request |
| POST | /api/friends/requests/:id/accept | also creates the DM conversation |
| POST | /api/friends/requests/:id/decline | |
| DELETE | /api/friends/:userId | unfriend |
| GET | /api/conversations | your DM threads, with last-message preview |
| GET | /api/conversations/:id/messages?limit=50 | history |
| POST | /api/conversations/start | `{ friendId }` — get-or-create a thread (blocked unless you're confirmed friends) |

## Socket.IO events

| Direction | Event | Payload |
|-----------|-------|---------|
| emit | `join-group` / `leave-group` | groupId |
| emit | `group-message` | `{ groupId, text }` |
| on | `group-message` | the saved message, broadcast to everyone in the group room |
| emit | `join-conversation` / `leave-conversation` | conversationId |
| emit | `direct-message` | `{ conversationId, text }` |
| on | `direct-message` | the saved message, broadcast to both participants |

Messages are persisted to MongoDB (`Message` model) the moment they're sent, so
chat history survives reconnects and is also available via the REST endpoints
above for initial page load.

## Editing, replying, forwarding, and deleting messages

Every message bubble (group chat and direct messages alike) reveals a small
action row on hover: **Reply**, **Forward**, and — for your own messages only —
**Edit** and **Delete**. All four go through the socket, not REST:

| Event | Payload | Behavior |
|-------|---------|----------|
| `edit-message` | `{ messageId, text }` | Author-only. Sets `edited: true` + `editedAt`, broadcasts `message-edited`. |
| `delete-message` | `{ messageId }` | Author-only. **Soft delete** — `deleted: true` + `deletedAt` is set, the row stays in MongoDB, but `toJSON()` strips the real `text` before it ever reaches a client. Broadcasts `message-deleted`. |
| `forward-message` | `{ messageId, targetScope, targetId }` | Copies the message into another group or conversation you belong to, tagged with a `forwardedFrom: { senderName, text }` snapshot of the original (so it still reads correctly even if the source message is later edited or deleted). |
| `group-message` / `direct-message` | now also accept `{ replyTo: messageId }` | Nests a quoted preview of the original under the new message. |

Soft-deleted messages are never actually removed — clients only ever see a
"This message was deleted" placeholder, which is enforced in the `Message`
model's `toJSON()`, not just in the UI.

The shared rendering/wiring for all of this lives in `public/js/chat-ui.js`
(`ChatUI.mount(...)`), used by both `group-detail.js` and `messages.js` so the
two chat surfaces don't duplicate this logic.

## Excel export

The "Export data" button (sidebar) hits `GET /api/export/xlsx`, which builds a
real `.xlsx` workbook server-side with `exceljs` — a Transactions sheet and a
Categories sheet, formatted (bold header row, colored income/outcome text,
currency number format) rather than a bare data dump.

## Profile page

`profile.html` lets you edit your name and email, and separately change your
password (current password required). Both go through `PUT /api/auth/me`.

## Analytics month filter

The Analytics page has a month dropdown (`GET /api/transactions/months` for
the list of months you actually have data for). Selecting a month scopes the
**totals and category breakdown** to just that month; the **trend charts**
(income/outcome line, balance line) intentionally keep showing their fixed
6-month rolling window regardless, since a single month isn't a "trend" —
that distinction is called out in a small note on the page when a month is
selected.

## Navigation layout

- **Sidebar** (desktop): Home, Transactions, Analytics, Categories, Groups,
  Friends, Messages, Profile.
- **Bottom tab bar** (mobile): the same list minus Messages, which instead
  gets its own icon on the **top-right of the mobile top bar** — tap it to
  jump straight to `messages.html` from anywhere in the app.

## Real-time notifications (not window.alert)

Every protected page loads the Socket.IO client and, once signed in, listens for
incoming `group-message` / `direct-message` events. When one arrives for a chat
you're *not* currently looking at, a small dismissible card slides in from the
top-right — click it to jump straight to that group or conversation, or the ✕ to
dismiss. It auto-clears after 8 seconds. This works from any page (Home,
Transactions, Analytics, etc.), not just the chat pages themselves, because every
socket connection auto-joins all of that user's group and conversation rooms the
moment it connects.

## Known simplifications

- **Group expense splitting is always even** across whichever members are
  checked for that expense. There's no support yet for uneven/percentage
  splits or "settling up" (marking a debt as paid) — the balances view shows
  who owes whom, but doesn't record repayments.
- Chat history loads the most recent 50 messages with no pagination/infinite
  scroll yet.
