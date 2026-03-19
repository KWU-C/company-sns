const router = require('express').Router();
const { getConnection } = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middleware/auth');
const SECRET = process.env.JWT_SECRET || 'tcd-sns-secret-2026';

router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: '全ての項目を入力してください' });
  if (password.length < 6)
    return res.status(400).json({ error: 'パスワードは6文字以上で入力してください' });

  const conn = await getConnection();
  try {
    const hash = bcrypt.hashSync(password, 10);
    const [result] = await conn.query('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)', [name.trim(), email.trim(), hash]);
    const [rows] = await conn.query('SELECT id, name, email, profile, created_at FROM users WHERE id = ?', [result.insertId]);
    const user = rows[0];
    const token = jwt.sign({ id: user.id, email: user.email }, SECRET, { expiresIn: '30d' });
    res.status(201).json({ token, user });
  } catch (err) {
    if (err.message.includes('Duplicate entry') || err.message.includes('UNIQUE constraint failed'))
      return res.status(400).json({ error: 'このメールアドレスは既に登録されています' });
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  } finally {
    conn.release();
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'メールアドレスとパスワードを入力してください' });

  const conn = await getConnection();
  try {
    const [rows] = await conn.query('SELECT * FROM users WHERE email = ?', [email.trim()]);
    const user = rows[0];
    if (!user || !bcrypt.compareSync(password, user.password_hash))
      return res.status(401).json({ error: 'メールアドレスまたはパスワードが正しくありません' });

    const token = jwt.sign({ id: user.id, email: user.email }, SECRET, { expiresIn: '30d' });
    const { password_hash, ...userSafe } = user;
    res.json({ token, user: userSafe });
  } finally {
    conn.release();
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  const conn = await getConnection();
  try {
    const [rows] = await conn.query('SELECT id, name, email, profile, created_at FROM users WHERE id = ?', [req.user.id]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });
    res.json(user);
  } finally {
    conn.release();
  }
});

module.exports = router;
