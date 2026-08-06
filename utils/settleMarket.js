const User = require('../models/User');
const Bet = require('../models/Bet');

async function settleMarketResult(marketName, closingPrice) {
  try {
    // Example: closingPrice = "6296.38" -> decimals = "38"
    const priceParts = closingPrice.toString().split('.');
    if (priceParts.length < 2) return;

    const decimals = priceParts[1].substring(0, 2); // "38"
    const winningDouble = decimals;                 // "38" (Double Digit)
    const winningSingle = decimals.charAt(1);        // "8" (Last Single Digit)

    // Pending bets fetch karein
    const pendingBets = await Bet.find({ market: marketName, status: 'pending' });

    for (let bet of pendingBets) {
      const user = await User.findById(bet.userId);
      if (!user) continue;

      let isWin = false;

      if (bet.type === 'single' && bet.selectedDigit === winningSingle) {
        isWin = true;
      } else if (bet.type === 'double' && bet.selectedDigit === winningDouble) {
        isWin = true;
      }

      // Exposure clear karein
      user.exposure = Math.max(0, user.exposure - bet.coins);

      if (isWin) {
        const winAmount = bet.coins * bet.payoutMultiplier; // Single: 8x, Double: 80x
        user.balance += winAmount;
        user.pl += (winAmount - bet.coins);
        bet.status = 'won';
      } else {
        user.pl -= bet.coins;
        bet.status = 'lost';
      }

      await user.save();
      await bet.save();
    }
  } catch (err) {
    console.error(`Error settling market ${marketName}:`, err);
  }
}

module.exports = { settleMarketResult };