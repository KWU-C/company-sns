const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'tcd-sns-secret-2026';

module.exports = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: '認証が必要です' });
  }
  try {
    req.user = jwt.verify(auth.slice(7), SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'トークンが無効です' });
  }
};
