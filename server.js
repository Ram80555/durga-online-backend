const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.json());

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://ramdulare2411_db_user:rbQTRoDRPKuEDkMF@cluster0.pimwfzo.mongodb.net/durgaonline?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log("MongoDB Database Connected");
    // Initial fetch on server start
    MARKET_SCHEDULE.forEach(m => processMarketSettlement(m));
  })
  .catch(err => console.log("Mongo Error: ", err));

// SCHEMAS
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

const betSchema = new mongoose.Schema({
  username: { type: String, required: true },
  market: { type: String, required: true },
  type: { type: String, required: true },
  digit: { type: String, required: true },
  coins: { type: Number, required: true },
  status: { type: String, default: 'PENDING' },
  createdAt: { type: Date, default: Date.now }
});
const Bet = mongoose.model('Bet', betSchema);

const statementSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  username: { type: String, required: true },
  type: { type: String, required: true },
  coins: { type: Number, default: 0 },
  remark: { type: String, default: '' }
});
const Statement = mongoose.model('Statement', statementSchema);

const resultSchema = new mongoose.Schema({
  market: { type: String, required: true, unique: true },
  closingValue: { type: String, default: '0.00' },
  singleDigit: { type: String, default: '-' },
  doubleDigit: { type: String, default: '--' },
  lastUpdated: { type: Date, default: Date.now }
});
const MarketResult = mongoose.model('MarketResult', resultSchema);

async function logStatement(username, type, coins, remark) {
  try {
    const entry = new Statement({ username, type, coins, remark });
    await entry.save();
  } catch(e){}
}

const MARKET_SCHEDULE = [
  { name: 'KOSPI', symbol: '^KS11', settleTime: '11:52' },
  { name: 'HANG SENG', symbol: '^HSI', settleTime: '13:32' },
  { name: 'SENSEX', symbol: '^BSESN', settleTime: '15:32' },
  { name: 'DAX', symbol: '^GDAXI', settleTime: '22:02' },
  { name: 'DOW JONES', symbol: '^DJI', settleTime: '01:32' }
];

// FETCH QUOTE WITH USER-AGENT HEADER (PREVENTS 403 BLOCKS)
function fetchQuotePrice(symbol) {
  return new Promise((resolve, reject) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    };

    https.get(url, options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.chart && json.chart.result && json.chart.result[0]) {
            const meta = json.chart.result[0].meta;
            const price = meta.regularMarketPrice || meta.chartPreviousClose || meta.previousClose;
            resolve(price);
          } else {
            reject('No price meta');
          }
        } catch(e) { reject(e); }
      });
    }).on('error', err => reject(err));
  });
}

// AUTO SETTLE PROCESS
async function processMarketSettlement(m) {
  try {
    const closePrice = await fetchQuotePrice(m.symbol);
    if (!closePrice) return;

    const priceStr = Number(closePrice).toFixed(2);
    const singleDigit = priceStr.slice(-1); // Right-most digit

    const parts = priceStr.split('.');
    const doubleDigit = parts.length > 1 ? parts[1].padEnd(2, '0').slice(0, 2) : priceStr.slice(-2);

    await MarketResult.findOneAndUpdate(
      { market: m.name },
      { closingValue: priceStr, singleDigit, doubleDigit, lastUpdated: new Date() },
      { upsert: true, new: true }
    );

    const pendingBets = await Bet.find({ market: m.name, status: 'PENDING' });

    for (let b of pendingBets) {
      let isWin = false;
      let winMultiplier = 0;

      if (b.type === 'single' && b.digit === singleDigit) {
        isWin = true;
        winMultiplier = 9;
      } else if (b.type === 'double' && b.digit === doubleDigit) {
        isWin = true;
        winMultiplier = 80;
      }

      if (isWin) {
        b.status = 'WIN';
        const winAmount = b.coins * winMultiplier;
        const user = await User.findOne({ username: b.username });
        if (user) {
          user.balance += winAmount;
          user.exposure = Math.max(0, user.exposure - b.coins);
          await user.save();
          await logStatement(user.username, 'BET WIN', winAmount, `Won ${b.market} ${b.type.toUpperCase()} (${b.digit}). Payout ${winMultiplier}x.`);
        }
      } else {
        b.status = 'LOSS';
        const user = await User.findOne({ username: b.username });
        if (user) {
          user.exposure = Math.max(0, user.exposure - b.coins);
          await user.save();
        }
      }
      await b.save();
    }
  } catch (err) {}
}

setInterval(() => {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + istOffset);
  const curH = istTime.getHours().toString().padStart(2, '0');
  const curM = istTime.getMinutes().toString().padStart(2, '0');
  const currentTimeStr = `${curH}:${curM}`;

  MARKET_SCHEDULE.forEach(m => {
    if (m.settleTime === currentTimeStr) {
      processMarketSettlement(m);
    }
  });
}, 30000);

// AUTH ENDPOINTS
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
  } catch (err) { res.status(500).json({ msg: "Login server error" }); }
});

app.post('/api/auth/verify-session', async (req, res) => {
  try {
    const { username, sessionToken } = req.body;
    const user = await User.findOne({ username });
    if (!user || user.sessionToken !== sessionToken) {
      return res.status(401).json({ valid: false, msg: "Logged in from another device!" });
    }
    res.json({ valid: true, balance: user.balance, exposure: user.exposure });
  } catch (err) { res.status(500).json({ valid: false }); }
});

app.get('/api/market/results', async (req, res) => {
  try {
    let results = await MarketResult.find();
    if (!results || results.length === 0) {
      for (let m of MARKET_SCHEDULE) {
        await processMarketSettlement(m);
      }
      results = await MarketResult.find();
    }
    res.json(results);
  } catch (err) { res.status(500).json({ msg: "Error fetching results" }); }
});

app.post('/api/client/place-bet', async (req, res) => {
  try {
    const { username, userId, market, type, selectedDigit, coins } = req.body;
    const targetUser = username || userId;

    if (!targetUser || !market || !type || !selectedDigit || !coins) {
      return res.status(400).json({ msg: "Missing prediction parameters" });
    }

    const user = await User.findOne({ $or: [{ username: targetUser }, { _id: mongoose.Types.ObjectId.isValid(targetUser) ? targetUser : null }] });
    if (!user) return res.status(404).json({ msg: "User account not found!" });

    const betCoins = Number(coins);
    if (user.balance < betCoins) {
      return res.status(400).json({ msg: "Insufficient balance for prediction!" });
    }

    user.balance -= betCoins;
    user.exposure = (user.exposure || 0) + betCoins;
    await user.save();

    const newBet = new Bet({
      username: user.username,
      market,
      type,
      digit: String(selectedDigit),
      coins: betCoins
    });
    await newBet.save();

    await logStatement(user.username, 'BET PLACED', betCoins, `Prediction placed on ${market} (${type.toUpperCase()}: ${selectedDigit})`);
    res.json({ msg: "Prediction placed successfully!" });
  } catch (err) {
    res.status(500).json({ msg: "Server error processing prediction" });
  }
});

app.get('/api/client/pending-bets/:username', async (req, res) => {
  try {
    const bets = await Bet.find({ username: req.params.username, status: 'PENDING' }).sort({ createdAt: -1 });
    res.json(bets);
  } catch (err) { res.status(500).json({ msg: "Error fetching bets" }); }
});

app.get('/api/client/statements/:username', async (req, res) => {
  try {
    const logs = await Statement.find({ username: req.params.username }).sort({ timestamp: -1 }).limit(50);
    res.json(logs);
  } catch (err) { res.status(500).json({ msg: "Error fetching user statements" }); }
});

app.post('/api/admin/create-client', async (req, res) => {
  try {
    const { username, password, initialBalance } = req.body;
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ msg: "User already exists!" });

    const coins = Number(initialBalance) || 0;
    const newUser = new User({ username, password, role: 'client', balance: coins });
    await newUser.save();
    await logStatement(username, 'ACCOUNT CREATED', coins, `Created with ${coins} coins.`);
    res.json({ msg: `Client ${username} created successfully!` });
  } catch (err) { res.status(500).json({ msg: "Database Error" }); }
});

app.get('/api/admin/clients', async (req, res) => {
  try {
    const clients = await User.find({ role: 'client' });
    res.json(clients);
  } catch (err) { res.status(500).json({ msg: "Error fetching clients" }); }
});

app.post('/api/admin/update-coins', async (req, res) => {
  try {
    const { userId, coins, action } = req.body;
    const user = await User.findOne({ $or: [{ _id: mongoose.Types.ObjectId.isValid(userId) ? userId : null }, { username: userId }] });
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
  } catch (err) { res.status(500).json({ msg: "Error updating balance" }); }
});

app.get('/api/admin/statements', async (req, res) => {
  try {
    const logs = await Statement.find().sort({ timestamp: -1 }).limit(100);
    res.json(logs);
  } catch (err) { res.status(500).json({ msg: "Error fetching statements" }); }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
