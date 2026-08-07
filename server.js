const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// 1. MONGODB CONNECTION WITH YOUR EXACT URI
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://ramdulare2411_db_user:rbQTRoDRPKuEDkMF@cluster0.pimwfzo.mongodb.net/durgaonline?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB Database Connected Successfully"))
  .catch(err => console.log("Mongo Connection Error: ", err));

// 2. USER MODEL
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'client' },
  balance: { type: Number, default: 0 },
  exposure: { type: Number, default: 0 },
  isLocked: { type: Boolean, default: false }
});

const User = mongoose.model('User', userSchema);

// 3. CREATE CLIENT ROUTE
app.post('/api/admin/create-client', async (req, res) => {
  try {
    const { username, password, initialBalance } = req.body;
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ msg: "User already exists in Database!" });

    const newUser = new User({
      username,
      password,
      role: 'client',
      balance: Number(initialBalance) || 0
    });

    await newUser.save();
    res.json({ msg: `Client ${username} created successfully in Cloud DB!` });
  } catch (err) {
    res.status(500).json({ msg: "Database Error: Unable to create client" });
  }
});

// ALSO SUPPORT /api/users/register ROUTE
app.post('/api/users/register', async (req, res) => {
  try {
    const { username, password, balance } = req.body;
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ msg: "User already exists!" });

    const newUser = new User({ username, password, role: 'client', balance: Number(balance) || 0 });
    await newUser.save();
    res.json({ msg: "Registered successfully" });
  } catch (err) {
    res.status(500).json({ msg: "Error saving user" });
  }
});

// 4. FETCH CLIENTS LIST
app.get('/api/admin/clients', async (req, res) => {
  try {
    const clients = await User.find({ role: 'client' });
    res.json(clients);
  } catch (err) {
    res.status(500).json({ msg: "Error fetching clients" });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const clients = await User.find({ role: 'client' });
    res.json(clients);
  } catch (err) {
    res.status(500).json({ msg: "Error fetching users" });
  }
});

// 5. DEPOSIT / WITHDRAW COINS
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

// 6. LOGIN ROUTE
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username, password });
    if (!user) return res.status(400).json({ msg: "Invalid Username or Password!" });

    res.json({ user });
  } catch (err) {
    res.status(500).json({ msg: "Login server error" });
  }
});

// 7. FETCH SINGLE USER INFO
app.get('/api/client/user-info/:id', async (req, res) => {
  try {
    const user = await User.findOne({ $or: [{ _id: req.params.id }, { username: req.params.id }] });
    if (!user) return res.status(404).json({ msg: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ msg: "Error fetching user info" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server active on port ${PORT}`));
