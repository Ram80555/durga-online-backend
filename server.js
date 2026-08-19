const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.json());

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://ramdulare2411_db_user:rbQTRoDRPKuEDkMF@cluster0.pimwfzo.mongodb.net/durgaonline?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log("MongoDB Database Connected Successfully");
    try {
      const superAdmin = await User.findOne({ username: 'Vikram16' });
      if (!superAdmin) {
        const newSuper = new User({
          username: 'Vikram16',
          password: 'Rajput8932@',
          role: 'superadmin',
          balance: 0,
          upline: 0,
          createdBy: 'system'
        });
        await newSuper.save();
      } else {
        superAdmin.password = 'Rajput8932@';
        superAdmin.role = 'superadmin';
        await superAdmin.save();
      }
    } catch(e) {}
    MARKET_SCHEDULE.forEach(m => refreshDisplayPrice(m));
  })
  .catch(err => console.log("Mongo Error: ", err));

// SCHEMAS
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'client' },
  createdBy: { type: String, default: 'system' },
  balance: { type: Number, default: 0 },
  upline: { type: Number, default: 0 },
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
  oldBalance: { type: Number, default: 0 },
  newBalance: { type: Number, default: 0 },
  remark: { type: String, default: '' }
});
const Statement = mongoose.model('Statement', statementSchema);

const resultSchema = new mongoose.Schema({
  market: { type: String, required: true, unique: true },
  closingValue: { type: String, default: '0.00' },
  change: { type: String, default: '+0.00' },
  percentChange: { type: String, default: '0.00%' },
  isPositive: { type: Boolean, default: true },
  sparkline: { type: [Number], default: [] },
  singleDigitA: { type: String, default: '-' },
  singleDigitB: { type: String, default: '-' },
  doubleDigit: { type: String, default: '--' },
  lastUpdated: { type: Date, default: Date.now }
});
const MarketResult = mongoose.model('MarketResult', resultSchema);

async function logStatement(username, type, coins, oldBalance, newBalance, remark) {
  try {
    const entry = new Statement({ username, type, coins, oldBalance, newBalance, remark });
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

function fetchQuotePrice(symbol) {
  return new Promise((resolve, reject) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m`;
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
            const resObj = json.chart.result[0];
            const meta = resObj.meta;
            const price = meta.regularMarketPrice || meta.chartPreviousClose || meta.previousClose;
            const prevClose = meta.chartPreviousClose || meta.previousClose || price;
            const diff = price - prevClose;
            const pct = prevClose ? ((diff / prevClose) * 100).toFixed(2) : '0.00';
            
            let rawQuotes = [];
            if (resObj.indicators && resObj.indicators.quote && resObj.indicators.quote[0] && resObj.indicators.quote[0].close) {
              rawQuotes = resObj.indicators.quote[0].close.filter(p => p !== null && !isNaN(p));
            }
            const sparkline = rawQuotes.length > 0 ? rawQuotes.filter((_, idx) => idx % Math.max(1, Math.floor(rawQuotes.length / 25)) === 0) : [];

            resolve({
              price: price,
              change: (diff >= 0 ? `+${diff.toFixed(2)}` : `${diff.toFixed(2)}`),
              percentChange: `${pct}%`,
              isPositive: diff >= 0,
              sparkline: sparkline
            });
          } else { reject('No price meta'); }
        } catch(e) { reject(e); }
      });
    }).on('error', err => reject(err));
  });
}

async function refreshDisplayPrice(m) {
  try {
    const data = await fetchQuotePrice(m.symbol);
    if (!data || !data.price) return;

    const priceFormatted = Number(data.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const priceStr = Number(data.price).toFixed(2);
    const parts = priceStr.split('.');
    const doubleDigit = parts.length > 1 ? parts[1].padEnd(2, '0').slice(0, 2) : priceStr.slice(-2);
    const singleDigitA = doubleDigit.slice(0, 1);
    const singleDigitB = doubleDigit.slice(1, 2);

    await MarketResult.findOneAndUpdate(
      { market: m.name },
      { 
        closingValue: priceFormatted, 
        change: data.change,
        percentChange: data.percentChange,
        isPositive: data.isPositive,
        sparkline: data.sparkline,
        singleDigitA, 
        singleDigitB, 
        doubleDigit, 
        lastUpdated: new Date() 
      },
      { upsert: true, new: true }
    );
  } catch (err) {}
}

setInterval(() => {
  MARKET_SCHEDULE.forEach(m => refreshDisplayPrice(m));
}, 30000);

async function processMarketSettlement(m) {
  try {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + istOffset);
    const dayOfWeek = istTime.getDay();

    if (dayOfWeek === 0 || dayOfWeek === 6) return;

    const data = await fetchQuotePrice(m.symbol);
    if (!data || !data.price) return;

    const priceStr = Number(data.price).toFixed(2);
    const priceFormatted = Number(data.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const parts = priceStr.split('.');
    const doubleDigit = parts.length > 1 ? parts[1].padEnd(2, '0').slice(0, 2) : priceStr.slice(-2);
    const singleDigitA = doubleDigit.slice(0, 1);
    const singleDigitB = doubleDigit.slice(1, 2);

    await MarketResult.findOneAndUpdate(
      { market: m.name },
      { 
        closingValue: priceFormatted, 
        change: data.change,
        percentChange: data.percentChange,
        isPositive: data.isPositive,
        sparkline: data.sparkline,
        singleDigitA, 
        singleDigitB, 
        doubleDigit, 
        lastUpdated: new Date() 
      },
      { upsert: true, new: true }
    );

    const pendingBets = await Bet.find({ market: m.name, status: 'PENDING' });

    for (let b of pendingBets) {
      let isWin = false;
      let winMultiplier = 0;

      if (b.type === 'single_a' && b.digit === singleDigitA) {
        isWin = true;
        winMultiplier = 9;
      } else if (b.type === 'single_b' && b.digit === singleDigitB) {
        isWin = true;
        winMultiplier = 9;
      } else if (b.type === 'double' && b.digit === doubleDigit) {
        isWin = true;
        winMultiplier = 80;
      }

      const user = await User.findOne({ username: b.username });
      if (user) {
        const parentAdmin = await User.findOne({ username: user.createdBy });

        if (isWin) {
          b.status = 'WIN';
          const winAmount = b.coins * winMultiplier;
          const oldBal = user.balance;
          user.balance += winAmount;
          user.exposure = Math.max(0, user.exposure - b.coins);
          await user.save();
          await logStatement(user.username, 'BET WIN', winAmount, oldBal, user.balance, `Won ${b.market} ${b.type.toUpperCase()} (${b.digit}). Payout ${winMultiplier}x.`);

          const netWinCoins = winAmount - b.coins;
          if (parentAdmin) {
            parentAdmin.upline = (parentAdmin.upline || 0) - netWinCoins;
            await parentAdmin.save();
          }
        } else {
          b.status = 'LOSS';
          user.exposure = Math.max(0, user.exposure - b.coins);
          await user.save();

          if (parentAdmin) {
            parentAdmin.upline = (parentAdmin.upline || 0) + b.coins;
            await parentAdmin.save();
          }
        }
      }
      await b.save();
    }
  } catch (err) {}
}

let lastSettledMinute = '';
setInterval(() => {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + istOffset);
  const curH = istTime.getHours().toString().padStart(2, '0');
  const curM = istTime.getMinutes().toString().padStart(2, '0');
  const currentTimeStr = `${curH}:${curM}`;

  if (lastSettledMinute !== currentTimeStr) {
    MARKET_SCHEDULE.forEach(m => {
      if (m.settleTime === currentTimeStr) {
        lastSettledMinute = currentTimeStr;
        processMarketSettlement(m);
      }
    });
  }
}, 30000);

// AUTH ENDPOINTS
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username: { $regex: new RegExp(`^${username.trim()}$`, 'i') }, password });
    if (!user) return res.status(400).json({ msg: "Invalid Username or Password!" });
    if (user.isLocked) return res.status(403).json({ msg: "Account is LOCKED by Admin!" });

    if (user.username.toLowerCase() === 'vikram16' && user.role !== 'superadmin') {
      user.role = 'superadmin';
    }

    const newToken = Date.now().toString() + Math.random().toString(36).substring(2);
    user.sessionToken = newToken;
    await user.save();

    res.json({
      user: {
        _id: user._id,
        username: user.username,
        role: user.role,
        balance: user.balance,
        upline: user.upline || 0,
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

    let calculatedUpline = user.upline || 0;
    let totalCirculatingBal = user.balance || 0;

    if (user.role === 'superadmin' || user.username.toLowerCase() === 'vikram16') {
      const allAdmins = await User.find({ role: 'admin' });
      totalCirculatingBal = allAdmins.reduce((sum, a) => sum + (a.balance || 0), 0);
      calculatedUpline = allAdmins.reduce((sum, a) => sum + (a.upline || 0), 0);
    }

    res.json({ 
      valid: true, 
      balance: user.balance, 
      totalBal: totalCirculatingBal,
      upline: calculatedUpline, 
      exposure: user.exposure, 
      role: user.role 
    });
  } catch (err) { res.status(500).json({ valid: false }); }
});

app.post('/api/client/change-password', async (req, res) => {
  try {
    const { username, oldPassword, newPassword } = req.body;
    const user = await User.findOne({ username, password: oldPassword });
    if (!user) return res.status(400).json({ msg: "Old password does not match!" });
    user.password = newPassword;
    await user.save();
    await logStatement(username, 'PASSWORD CHANGED', 0, user.balance, user.balance, 'User updated account password.');
    res.json({ msg: "Password changed successfully!" });
  } catch (err) { res.status(500).json({ msg: "Error updating password" }); }
});

app.get('/api/market/results', async (req, res) => {
  try {
    let results = await MarketResult.find();
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

    const oldBal = user.balance;
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

    await logStatement(user.username, 'BET PLACED', betCoins, oldBal, user.balance, `Prediction placed on ${market} (${type.toUpperCase()}: ${selectedDigit})`);
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

// SUPER ADMIN APIS
app.post('/api/superadmin/create-admin', async (req, res) => {
  try {
    const { superAdminUsername, newAdminUsername, password, initialBalance } = req.body;
    const superAdmin = await User.findOne({ username: superAdminUsername });
    if (!superAdmin || (superAdmin.role !== 'superadmin' && superAdmin.username !== 'Vikram16')) {
      return res.status(403).json({ msg: "Unauthorized!" });
    }

    const cleanUsername = newAdminUsername.trim();
    const reservedNames = ['vikram16', 'admin', 'superadmin', 'root', 'master'];
    if (reservedNames.includes(cleanUsername.toLowerCase())) {
      return res.status(400).json({ msg: "This admin username is reserved!" });
    }

    const existing = await User.findOne({ username: { $regex: new RegExp(`^${cleanUsername}$`, 'i') } });
    if (existing) return res.status(400).json({ msg: "Admin username already exists!" });

    const coins = Number(initialBalance) || 0;
    const newAdmin = new User({
      username: cleanUsername,
      password: password.trim(),
      role: 'admin',
      createdBy: superAdminUsername,
      balance: coins,
      upline: 0
    });
    await newAdmin.save();
    await logStatement(superAdminUsername, 'ADMIN CREATED', coins, 0, 0, `Created Admin ${cleanUsername} with ${coins} coins.`);
    res.json({ msg: `Admin ${cleanUsername} created successfully!` });
  } catch (err) { res.status(500).json({ msg: "Database Error" }); }
});

app.get('/api/superadmin/admins', async (req, res) => {
  try {
    const admins = await User.find({ role: 'admin' }).sort({ _id: -1 });
    res.json(admins);
  } catch (err) { res.status(500).json({ msg: "Error fetching admins" }); }
});

app.post('/api/superadmin/update-coins', async (req, res) => {
  try {
    const { superAdminUsername, adminUsername, coins, action } = req.body;
    const superAdmin = await User.findOne({ username: superAdminUsername });
    if (!superAdmin || (superAdmin.role !== 'superadmin' && superAdmin.username !== 'Vikram16')) {
      return res.status(403).json({ msg: "Unauthorized!" });
    }

    const admin = await User.findOne({ username: adminUsername, role: 'admin' });
    if (!admin) return res.status(404).json({ msg: "Admin account not found!" });

    const amount = Number(coins);
    if (action === 'add') {
      admin.balance += amount;
      await logStatement(superAdminUsername, 'COINS DEPOSITED TO ADMIN', amount, 0, 0, `Deposited ${amount} coins to Admin ${adminUsername}`);
    } else if (action === 'withdraw') {
      if (admin.balance < amount) return res.status(400).json({ msg: "Admin balance is insufficient to withdraw!" });
      admin.balance -= amount;
      await logStatement(superAdminUsername, 'COINS WITHDRAWN FROM ADMIN', amount, 0, 0, `Withdrew ${amount} coins from Admin ${adminUsername}`);
    }

    await admin.save();
    res.json({ msg: `Admin ${adminUsername} balance updated: ${admin.balance} C` });
  } catch (err) { res.status(500).json({ msg: "Error updating admin balance" }); }
});

app.post('/api/superadmin/change-admin-password', async (req, res) => {
  try {
    const { superAdminUsername, adminUsername, newPassword } = req.body;
    const superAdmin = await User.findOne({ username: superAdminUsername });
    if (!superAdmin || (superAdmin.role !== 'superadmin' && superAdmin.username !== 'Vikram16')) {
      return res.status(403).json({ msg: "Unauthorized!" });
    }

    const admin = await User.findOne({ username: adminUsername, role: 'admin' });
    if (!admin) return res.status(404).json({ msg: "Admin not found!" });

    admin.password = newPassword.trim();
    await admin.save();
    await logStatement(superAdminUsername, 'ADMIN PASSWORD RESET', 0, 0, 0, `Reset password for Admin ${adminUsername}`);
    res.json({ msg: `Password for Admin ${adminUsername} updated successfully!` });
  } catch (err) { res.status(500).json({ msg: "Server Error" }); }
});

app.post('/api/superadmin/toggle-admin-lock', async (req, res) => {
  try {
    const { superAdminUsername, adminUsername } = req.body;
    const superAdmin = await User.findOne({ username: superAdminUsername });
    if (!superAdmin || (superAdmin.role !== 'superadmin' && superAdmin.username !== 'Vikram16')) {
      return res.status(403).json({ msg: "Unauthorized!" });
    }

    const admin = await User.findOne({ username: adminUsername, role: 'admin' });
    if (!admin) return res.status(404).json({ msg: "Admin not found!" });

    admin.isLocked = !admin.isLocked;
    await admin.save();
    await logStatement(superAdminUsername, admin.isLocked ? 'ADMIN LOCKED' : 'ADMIN UNLOCKED', 0, 0, 0, `${admin.isLocked ? 'Locked' : 'Unlocked'} Admin ${adminUsername}`);
    res.json({ msg: `Admin ${adminUsername} is now ${admin.isLocked ? 'LOCKED' : 'ACTIVE'}` });
  } catch (err) { res.status(500).json({ msg: "Server Error" }); }
});

// NORMAL ADMIN APIS
app.post('/api/admin/create-client', async (req, res) => {
  try {
    const { adminUsername, username, password, initialBalance } = req.body;
    const cleanUsername = (username || '').trim();

    const reservedNames = ['vikram16', 'admin', 'superadmin', 'root', 'master'];
    if (reservedNames.includes(cleanUsername.toLowerCase())) {
      return res.status(400).json({ msg: "This username is reserved!" });
    }

    const admin = await User.findOne({ username: adminUsername });
    if (!admin || (admin.role !== 'admin' && admin.role !== 'superadmin')) {
      return res.status(403).json({ msg: "Unauthorized!" });
    }

    const existing = await User.findOne({ username: { $regex: new RegExp(`^${cleanUsername}$`, 'i') } });
    if (existing) return res.status(400).json({ msg: "Username already exists in database!" });

    const coins = Number(initialBalance) || 0;
    if (admin.role === 'admin') {
      if (admin.balance < coins) {
        return res.status(400).json({ msg: `Insufficient balance! Your Admin balance is ${admin.balance} C.` });
      }
      admin.balance -= coins;
      await admin.save();
      await logStatement(admin.username, 'CLIENT CREATED', coins, admin.balance + coins, admin.balance, `Created client ${cleanUsername} with ${coins} coins`);
    }

    const newUser = new User({
      username: cleanUsername,
      password: password.trim(),
      role: 'client',
      createdBy: adminUsername,
      balance: coins
    });
    await newUser.save();
    await logStatement(cleanUsername, 'ACCOUNT CREATED', coins, 0, coins, `Created by Admin ${adminUsername}`);
    res.json({ msg: `Client ${cleanUsername} created successfully!` });
  } catch (err) { res.status(500).json({ msg: "Database Error" }); }
});

app.get('/api/admin/clients/:adminUsername', async (req, res) => {
  try {
    const { adminUsername } = req.params;
    const admin = await User.findOne({ username: adminUsername });
    if (!admin) return res.status(404).json({ msg: "Admin not found" });

    const query = (admin.role === 'superadmin' || admin.username.toLowerCase() === 'vikram16') ? { role: 'client' } : { role: 'client', createdBy: adminUsername };
    const clients = await User.find(query).sort({ _id: -1 });
    res.json(clients);
  } catch (err) { res.status(500).json({ msg: "Error fetching clients" }); }
});

app.post('/api/admin/update-coins', async (req, res) => {
  try {
    const { adminUsername, userId, coins, action } = req.body;
    const admin = await User.findOne({ username: adminUsername });
    if (!admin) return res.status(403).json({ msg: "Unauthorized!" });

    const user = await User.findOne({ $or: [{ _id: mongoose.Types.ObjectId.isValid(userId) ? userId : null }, { username: userId }] });
    if (!user) return res.status(404).json({ msg: "User not found" });

    if (admin.role !== 'superadmin' && admin.username.toLowerCase() !== 'vikram16' && user.createdBy !== adminUsername) {
      return res.status(403).json({ msg: "Unauthorized! You can only manage your own clients." });
    }

    const amount = Number(coins);
    const oldClientBal = user.balance;

    if (action === 'add') {
      if (admin.role === 'admin') {
        if (admin.balance < amount) {
          return res.status(400).json({ msg: `Insufficient Admin balance! Available: ${admin.balance} C.` });
        }
        admin.balance -= amount;
        await admin.save();
        await logStatement(admin.username, 'DEPOSITED TO CLIENT', amount, admin.balance + amount, admin.balance, `Transferred ${amount} C to ${user.username}`);
      }

      user.balance += amount;
      await logStatement(user.username, 'ADMIN DEPOSIT', amount, oldClientBal, user.balance, `Admin ${adminUsername} deposited ${amount} coins.`);
    } else if (action === 'withdraw') {
      if (user.balance < amount) return res.status(400).json({ msg: "Client balance is insufficient to withdraw!" });

      user.balance -= amount;
      if (admin.role === 'admin') {
        admin.balance += amount;
        await admin.save();
        await logStatement(admin.username, 'WITHDRAWN FROM CLIENT', amount, admin.balance - amount, admin.balance, `Withdrew ${amount} C from ${user.username}`);
      }

      await logStatement(user.username, 'ADMIN WITHDRAW', amount, oldClientBal, user.balance, `Admin ${adminUsername} withdrew ${amount} coins.`);
    }

    await user.save();
    res.json({ msg: `Transaction successful! Client balance: ${user.balance} C` });
  } catch (err) { res.status(500).json({ msg: "Error updating balance" }); }
});

app.post('/api/admin/change-client-password', async (req, res) => {
  try {
    const { adminUsername, clientUsername, newPassword } = req.body;
    const admin = await User.findOne({ username: adminUsername });
    if (!admin) return res.status(403).json({ msg: "Unauthorized!" });

    const client = await User.findOne({ username: clientUsername, role: 'client' });
    if (!client) return res.status(404).json({ msg: "Client not found!" });

    if (admin.role !== 'superadmin' && admin.username.toLowerCase() !== 'vikram16' && client.createdBy !== adminUsername) {
      return res.status(403).json({ msg: "Unauthorized! You can only manage your own clients." });
    }

    client.password = newPassword.trim();
    await client.save();
    await logStatement(adminUsername, 'CLIENT PASSWORD RESET', 0, 0, 0, `Reset password for client ${clientUsername}`);
    res.json({ msg: `Password for ${clientUsername} updated successfully!` });
  } catch (err) { res.status(500).json({ msg: "Server Error" }); }
});

app.post('/api/admin/toggle-client-lock', async (req, res) => {
  try {
    const { adminUsername, clientUsername } = req.body;
    const admin = await User.findOne({ username: adminUsername });
    if (!admin) return res.status(403).json({ msg: "Unauthorized!" });

    const client = await User.findOne({ username: clientUsername, role: 'client' });
    if (!client) return res.status(404).json({ msg: "Client not found!" });

    if (admin.role !== 'superadmin' && admin.username.toLowerCase() !== 'vikram16' && client.createdBy !== adminUsername) {
      return res.status(403).json({ msg: "Unauthorized! You can only manage your own clients." });
    }

    client.isLocked = !client.isLocked;
    await client.save();
    await logStatement(adminUsername, client.isLocked ? 'CLIENT LOCKED' : 'CLIENT UNLOCKED', 0, 0, 0, `${client.isLocked ? 'Locked' : 'Unlocked'} client ${clientUsername}`);
    res.json({ msg: `Client ${clientUsername} is now ${client.isLocked ? 'LOCKED' : 'ACTIVE'}` });
  } catch (err) { res.status(500).json({ msg: "Server Error" }); }
});

// TOP PERFORMERS
app.get('/api/admin/top-performers/:adminUsername', async (req, res) => {
  try {
    const { adminUsername } = req.params;
    const admin = await User.findOne({ username: adminUsername });
    if (!admin) return res.status(404).json({ msg: "Admin not found" });

    if (admin.role === 'superadmin' || admin.username.toLowerCase() === 'vikram16') {
      const topAdmins = await User.find({ role: 'admin' }).sort({ upline: -1 }).limit(10);
      return res.json({ type: 'admins', data: topAdmins });
    }

    const myClients = await User.find({ role: 'client', createdBy: adminUsername }).sort({ balance: -1 }).limit(10);
    res.json({ type: 'clients', data: myClients });
  } catch (err) { res.status(500).json({ msg: "Error fetching top performers" }); }
});

// WEEKLY REPORT
app.get('/api/admin/weekly-report/:adminUsername', async (req, res) => {
  try {
    const { adminUsername } = req.params;
    const admin = await User.findOne({ username: adminUsername });
    if (!admin) return res.status(404).json({ msg: "Admin not found" });

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    let betQuery = { createdAt: { $gte: sevenDaysAgo } };
    if (admin.role !== 'superadmin' && admin.username.toLowerCase() !== 'vikram16') {
      const myClients = await User.find({ createdBy: adminUsername }).select('username');
      const clientUsernames = myClients.map(c => c.username);
      betQuery.username = { $in: clientUsernames };
    }

    const weeklyBets = await Bet.find(betQuery);
    const totalVolume = weeklyBets.reduce((sum, b) => sum + b.coins, 0);
    const winningBets = weeklyBets.filter(b => b.status === 'WIN');
    const losingBets = weeklyBets.filter(b => b.status === 'LOSS');
    const pendingBets = weeklyBets.filter(b => b.status === 'PENDING');

    res.json({
      totalBets: weeklyBets.length,
      totalVolume,
      winCount: winningBets.length,
      lossCount: losingBets.length,
      pendingCount: pendingBets.length,
      netUplinePnl: admin.upline || 0
    });
  } catch (err) { res.status(500).json({ msg: "Error fetching weekly report" }); }
});

// ANALYSIS & STATEMENTS
app.get('/api/admin/market-analysis/:adminUsername', async (req, res) => {
  try {
    const { adminUsername } = req.params;
    const admin = await User.findOne({ username: adminUsername });
    if (!admin) return res.status(404).json({ msg: "Admin not found" });

    let betQuery = { status: 'PENDING' };
    if (admin.role !== 'superadmin' && admin.username.toLowerCase() !== 'vikram16') {
      const myClients = await User.find({ createdBy: adminUsername }).select('username');
      const clientUsernames = myClients.map(c => c.username);
      betQuery.username = { $in: clientUsernames };
    }

    const pendingBets = await Bet.find(betQuery);

    const analysis = {};
    MARKET_SCHEDULE.forEach(m => {
      analysis[m.name] = { totalBets: 0, totalCoins: 0, andarCoins: 0, baharCoins: 0, doubleCoins: 0 };
    });

    pendingBets.forEach(b => {
      if (!analysis[b.market]) {
        analysis[b.market] = { totalBets: 0, totalCoins: 0, andarCoins: 0, baharCoins: 0, doubleCoins: 0 };
      }
      analysis[b.market].totalBets += 1;
      analysis[b.market].totalCoins += b.coins;
      if (b.type === 'single_a') analysis[b.market].andarCoins += b.coins;
      if (b.type === 'single_b') analysis[b.market].baharCoins += b.coins;
      if (b.type === 'double') analysis[b.market].doubleCoins += b.coins;
    });

    res.json(analysis);
  } catch (err) { res.status(500).json({ msg: "Error fetching market analysis" }); }
});

// ADMIN'S OWN STATEMENT (Dropdown statement shows ONLY Admin's direct activities)
app.get('/api/admin/statements/:adminUsername', async (req, res) => {
  try {
    const { adminUsername } = req.params;
    const logs = await Statement.find({ username: adminUsername }).sort({ timestamp: -1 }).limit(100);
    res.json(logs);
  } catch (err) { res.status(500).json({ msg: "Error fetching statements" }); }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
