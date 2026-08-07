const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://ramdulare2411_db_user:rbQTRoDRPKuEDkMF@cluster0.pimwfzo.mongodb.net/durgaonline?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB Database Connected"))
  .catch(err => console.log("Mongo Error: ", err));

// USER SCHEMA WITH SESSION TOKEN
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'client' },
  balance: { type: Number, default: 0 },
  exposure: { type: Number, default: 0 },
  isLocked: { type: Boolean, default: false },
  sessionToken: { type: String, default: '' } // Session Tracking
});

const User = mongoose.model('User', userSchema);

// CREATE CLIENT
app.post('/api/admin/create-client', async (req, res) => {
  try {
    const { username, password, initialBalance } = req.body;
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ msg: "User already exists!" });

    const newUser = new User({
      username,
      password,
      role: 'client',
      balance: Number(initialBalance) || 0
    });

    await newUser.save();
    res.json({ msg: `Client ${username} created successfully!` });
  } catch (err) {
    res.status(500).json({ msg: "Database Error" });
  }
});

// LOGIN WITH SINGLE DEVICE TOKEN GENERATION
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username, password });
    if (!user) return res.status(400).json({ msg: "Invalid Username or Password!" });

    if (user.isLocked) return res.status(403).json({ msg: "Account is LOCKED by Admin!" });

    // Generate new unique token for this login session
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

// SINGLE DEVICE SESSION VALIDATION CHECK
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

// FETCH CLIENTS LIST
app.get('/api/admin/clients', async (req, res) => {
  try {
    const clients = await User.find({ role: 'client' });
    res.json(clients);
  } catch (err) {
    res.status(500).json({ msg: "Error fetching clients" });
  }
});

// UPDATE COINS
app.post('/api/admin/update-coins', async (req, res) => {
  try {
    const { userId, coins, action } = req.body;
    const user = await User.findOne({ $or: [{ _id: userId }, { username: userId }] });
    if (!user) return res.status(404).json({ msg: "User not found" });

    if (action === 'add') user.balance += Number(coins);
    if (action === 'withdraw') user.balance -= Number(coins);

    await user.save();
    res.json({ msg: "Wallet balance updated!" });
  } catch (err) {
    res.status(500).json({ msg: "Error updating balance" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
