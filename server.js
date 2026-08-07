const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://ramdulare2411_db_user:rbQTRoDRPKuEDkMF@cluster0.pimwfzo.mongodb.net/durgaonline?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log("Mongo Error: ", err));

// 1. USER SCHEMA
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'client' },
  balance: { type: Number, default: 0 },
  exposure: { type: Number, default: 0 },
  isLocked: { type: Boolean, default: false },
  sessionToken: { type: String, default: '' }
});
const User = mongoose.model('User', userSchema);

// 2. STATEMENT SCHEMA
const statementSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  username: { type: String, required: true },
  type: { type: String, required: true }, // 'CREATE', 'DEPOSIT', 'WITHDRAW', 'LOCK', 'UNLOCK'
  coins: { type: Number, default: 0 },
  remark: { type: String, default: '' }
});
const Statement = mongoose.model('Statement', statementSchema);

// Helper to Log Statements
async function logStatement(username, type, coins, remark) {
  try {
    const entry = new Statement({ username, type, coins, remark });
    await entry.save();
  } catch(e) { console.log('Statement Logging Error:', e); }
}

// CREATE CLIENT
app.post('/api/admin/create-client', async (req, res) => {
  try {
    const { username, password, initialBalance } = req.body;
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ msg: "User already exists!" });

    const coins = Number(initialBalance) || 0;
    const newUser = new User({ username, password, role: 'client', balance: coins });
    await newUser.save();

    // Log Statement
    await logStatement(username, 'ACCOUNT CREATED', coins, `Account created with ${coins} initial coins.`);

    res.json({ msg: `Client ${username} created successfully!` });
  } catch (err) {
    res.status(500).json({ msg: "Database Error" });
  }
});

// LOGIN WITH SINGLE DEVICE PROTECTION
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username, password });
    if (!user) return res.status(400).json({ msg: "Invalid Username or Password!" });

    if (user.isLocked) return res.status(403).json({ msg: "Account is LOCKED by Admin!" });

    const newToken = Date.now().toString() + Math.random().toString(36).substring(2);
    user.sessionToken = newToken;
    await user.save();

    res.json({
      user: {
        _id: user._id,
        username: user.username,
        role: user.role,
        balance: user.balance,
        exposure: user.exposure,
        sessionToken: newToken
      }
    });
  } catch (err) {
    res.status(500).json({ msg: "Login server error" });
  }
});

// SINGLE DEVICE SESSION CHECK
app.post('/api/auth/verify-session', async (req, res) => {
  try {
    const { username, sessionToken } = req.body;
    const user = await User.findOne({ username });

    if (!user || user.sessionToken !== sessionToken) {
      return res.status(401).json({ valid: false, msg: "Logged in from another device!" });
    }

    res.json({ valid: true, balance: user.balance, exposure: user.exposure });
  } catch (err) {
    res.status(500).json({ valid: false });
  }
});

// FETCH ALL CLIENTS
app.get('/api/admin/clients', async (req, res) => {
  try {
    const clients = await User.find({ role: 'client' });
    res.json(clients);
  } catch (err) {
    res.status(500).json({ msg: "Error fetching clients" });
  }
});

// BANK DEPOSIT / WITHDRAW
app.post('/api/admin/update-coins', async (req, res) => {
  try {
    const { userId, coins, action } = req.body;
    const user = await User.findOne({ $or: [{ _id: userId }, { username: userId }] });
    if (!user) return res.status(404).json({ msg: "User not found" });

    const amount = Number(coins);
    if (action === 'add') {
      user.balance += amount;
      await logStatement(user.username, 'BANK DEPOSIT', amount, `Admin deposited ${amount} coins.`);
    } else if (action === 'withdraw') {
      user.balance -= amount;
      await logStatement(user.username, 'BANK WITHDRAW', amount, `Admin withdrew ${amount} coins.`);
    }

    await user.save();
    res.json({ msg: "Wallet balance updated!" });
  } catch (err) {
    res.status(500).json({ msg: "Error updating balance" });
  }
});

// LOCK / UNLOCK ACCOUNT
app.post('/api/admin/toggle-lock', async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await User.findOne({ $or: [{ _id: userId }, { username: userId }] });
    if (!user) return res.status(404).json({ msg: "User not found" });

    user.isLocked = !user.isLocked;
    await user.save();

    const statusText = user.isLocked ? 'LOCKED' : 'UNLOCKED';
    await logStatement(user.username, `ACCOUNT ${statusText}`, 0, `Account ${statusText.toLowerCase()} by Admin.`);

    res.json({ msg: `User ${statusText} successfully!`, isLocked: user.isLocked });
  } catch (err) {
    res.status(500).json({ msg: "Error toggling lock state" });
  }
});

// FETCH ALL STATEMENTS
app.get('/api/admin/statements', async (req, res) => {
  try {
    const logs = await Statement.find().sort({ timestamp: -1 }).limit(100);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ msg: "Error fetching statements" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
