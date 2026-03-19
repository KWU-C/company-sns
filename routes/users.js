const router = require('express').Router();
const { getConnection } = require('../db');
const auth = require('../middleware/auth');

router.get('/:id', auth, async (req, res) => {
  const conn = await getConnection();
  try {
    const [users] = await conn.query('SELECT id, name, email, profile, created_at FROM users WHERE id = ?', [req.params.id]);
    if (!users[0]) return res.status(404).json({ error: 'ユーザーが見つかりません' });
    
    const [counts] = await conn.query('SELECT COUNT(*) AS c FROM posts WHERE user_id = ?', [req.params.id]);
    res.json({ ...users[0], post_count: counts[0].c });
  } finally {
    conn.release();
  }
});

router.get('/:id/posts', auth, async (req, res) => {
  const conn = await getConnection();
  try {
    const [posts] = await conn.query(`
      SELECT p.*, u.name AS user_name,
        (SELECT COUNT(*) FROM likes WHERE post_id = p.id) AS like_count,
        (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comment_count,
        (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = ?) AS liked
      FROM posts p JOIN users u ON p.user_id = u.id
      WHERE p.user_id = ? ORDER BY p.created_at DESC
    `, [req.user.id, req.params.id]);
    res.json(posts);
  } finally {
    conn.release();
  }
});

router.put('/me/profile', auth, async (req, res) => {
  const { name, profile } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: '名前を入力してください' });
  
  const conn = await getConnection();
  try {
    await conn.query('UPDATE users SET name = ?, profile = ? WHERE id = ?', [name.trim(), (profile || '').trim(), req.user.id]);
    const [users] = await conn.query('SELECT id, name, email, profile, created_at FROM users WHERE id = ?', [req.user.id]);
    res.json(users[0]);
  } finally {
    conn.release();
  }
});

module.exports = router;
