function isMarketOpenForBet(openTimeStr, lockTimeStr) {
  const now = new Date();
  
  // IST Time offset calculation (UTC + 5:30)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + istOffset);
  
  const currentTotalMinutes = istTime.getHours() * 60 + istTime.getMinutes();

  const [openH, openM] = openTimeStr.split(':').map(Number);
  const openTotalMinutes = openH * 60 + openM;

  const [lockH, lockM] = lockTimeStr.split(':').map(Number);
  const lockTotalMinutes = lockH * 60 + lockM;

  // Handles overnight markets (e.g. Dow Jones 22:00 to 02:00)
  if (openTotalMinutes > lockTotalMinutes) {
    return currentTotalMinutes >= openTotalMinutes || currentTotalMinutes < lockTotalMinutes;
  }

  // Regular Daytime Markets
  return currentTotalMinutes >= openTotalMinutes && currentTotalMinutes < lockTotalMinutes;
}

module.exports = { isMarketOpenForBet };