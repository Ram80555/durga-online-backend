const express = require('express');
const cors = require('cors');
require('dotenv').config();
const connectDB = require('./config/db');
const MARKETS = require('./config/market');
const { isMarketOpenForBet } = require('./utils/marketCheck');
const User = require('./models/User');
const Bet = require('./models/Bet');

const app = express();
app.use(express.json());
app.use(cors());

connectDB();

app.get('/', (req, res) => {
  res.send({ status: 'Online', system: 'Durga Online Engine Active' });
});

// Authentication: Login Route
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username, password });
    if (!user) return res.status(400).json({ msg: 'Invalid Credentials' });
    if (user.status === 'blocked') return res.status(403).json({ msg: 'Account Blocked' });

    res.json({
      msg: 'Login Successful',
      user: { id: user._id, username: user.username, role: user.role, balance: user.balance, exposure: user.exposure }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin API: Create Client
app.post('/api/admin/create-client', async (req, res) => {
  const { username, password } = req.body;
  try {
    let user = await User.findOne({ username });
    if (user) return res.status(400).json({ msg: 'Username already exists' });

    user = new User({ username, password, role: 'client' });
    await user.save();
    res.json({ msg: 'Client Created Successfully', user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin API: Update Wallet
app.post('/api/admin/update-coins', async (req, res) => {
  const { userId, coins, action } = req.body;
  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    if (action === 'add') {
      user.balance += Number(coins);
    } else if (action === 'withdraw') {
      if (user.balance < coins) return res.status(400).json({ msg: 'Insufficient Balance' });
      user.balance -= Number(coins);
    }
    await user.save();
    res.json({ msg: `Coins ${action}ed successfully`, balance: user.balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin API: Get All Clients
app.get('/api/admin/clients', async (req, res) => {
  try {
    const clients = await User.find({ role: 'client' }).select('-password');
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Live Market Rates API
app.get('/api/market/live-rates', async (req, res) => {
  try {
    const rates = {
      'KOSPI': (6290 + Math.random() * 10).toFixed(2),
      'HANG SENG': (17200 + Math.random() * 15).toFixed(2),
      'SENSEX': (78380 + Math.random() * 20).toFixed(2),
      'DAX': (18000 + Math.random() * 12).toFixed(2),
      'DOW JONES': (39000 + Math.random() * 25).toFixed(2)
    };
    res.json({ success: true, rates });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Client API: Place Bet (Updated Multipliers: 8x & 80x)
app.post('/api/client/place-bet', async (req, res) => {
  const { userId, market, type, selectedDigit, coins } = req.body;
  try {
    const marketConfig = MARKETS.find(m => m.name === market.toUpperCase());
    if (!marketConfig) return res.status(400).json({ msg: 'Invalid Market Selected' });

    const canBet = isMarketOpenForBet(marketConfig.openTime, marketConfig.lockTime);
    if (!canBet) {
      return res.status(400).json({ msg: `Predictions for ${marketConfig.name} are currently locked.` });
    }

    const user = await User.findById(userId);
    if (!user || user.status === 'blocked' || !user.betAllowed) {
      return res.status(400).json({ msg: 'Betting disabled for this account' });
    }

    if (user.balance < coins) {
      return res.status(400).json({ msg: 'Insufficient Coin Balance' });
    }

    // Single = 8x, Double = 80x
    const multiplier = type === 'single' ? 8 : 80;

    user.balance -= Number(coins);
    user.exposure += Number(coins);
    await user.save();

    const bet = new Bet({
      userId: user._id,
      username: user.username,
      market,
      type,
      selectedDigit,
      coins,
      payoutMultiplier: multiplier
    });
    await bet.save();

    res.json({ msg: 'Bet Placed Successfully', availableBalance: user.balance, exposure: user.exposure });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Durga Online Server running on port ${PORT}`));
