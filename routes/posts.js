const router = require('express').Router();
const { getConnection } = require('../db');
const auth = require('../middleware/auth');

// Timeline
router.get('/', auth, async (req, res) => {
  const conn = await getConnection();
  try {
    const [posts] = await conn.query(`
      SELECT p.*, u.name AS user_name,
        (SELECT COUNT(*) FROM likes WHERE post_id = p.id) AS like_count,
        (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comment_count,
        (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = ?) AS liked
      FROM posts p JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC LIMIT 100
    `, [req.user.id]);
    res.json(posts);
  } finally {
    conn.release();
  }
});

// Create post
router.post('/', auth, async (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: '本文を入力してください' });
  if (content.length > 500) return res.status(400).json({ error: '500文字以内で入力してください' });

  const conn = await getConnection();
  try {
    const [result] = await conn.query('INSERT INTO posts (user_id, content) VALUES (?, ?)', [req.user.id, content.trim()]);
    const [rows] = await conn.query(`
      SELECT p.*, u.name AS user_name, 0 AS like_count, 0 AS comment_count, 0 AS liked
      FROM posts p JOIN users u ON p.user_id = u.id WHERE p.id = ?
    `, [result.insertId]);
    res.status(201).json(rows[0]);
  } finally {
    conn.release();
  }
});

// Get post detail + comments
router.get('/:id', auth, async (req, res) => {
  const conn = await getConnection();
  try {
    const [posts] = await conn.query(`
      SELECT p.*, u.name AS user_name,
        (SELECT COUNT(*) FROM likes WHERE post_id = p.id) AS like_count,
        (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comment_count,
        (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = ?) AS liked
      FROM posts p JOIN users u ON p.user_id = u.id WHERE p.id = ?
    `, [req.user.id, req.params.id]);
    
    if (!posts[0]) return res.status(404).json({ error: '投稿が見つかりません' });

    const [comments] = await conn.query(`
      SELECT c.*, u.name AS user_name
      FROM comments c JOIN users u ON c.user_id = u.id
      WHERE c.post_id = ? ORDER BY c.created_at ASC
    `, [req.params.id]);

    res.json({ ...posts[0], comments });
  } finally {
    conn.release();
  }
});

// Update post
router.put('/:id', auth, async (req, res) => {
  const conn = await getConnection();
  try {
    const [posts] = await conn.query('SELECT * FROM posts WHERE id = ?', [req.params.id]);
    const post = posts[0];
    if (!post) return res.status(404).json({ error: '投稿が見つかりません' });
    if (post.user_id !== req.user.id) return res.status(403).json({ error: '編集権限がありません' });

    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: '本文を入力してください' });
    await conn.query('UPDATE posts SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [content.trim(), req.params.id]);
    res.json({ ...post, content: content.trim() });
  } finally {
    conn.release();
  }
});

// Delete post
router.delete('/:id', auth, async (req, res) => {
  const conn = await getConnection();
  try {
    const [posts] = await conn.query('SELECT * FROM posts WHERE id = ?', [req.params.id]);
    const post = posts[0];
    if (!post) return res.status(404).json({ error: '投稿が見つかりません' });
    if (post.user_id !== req.user.id) return res.status(403).json({ error: '削除権限がありません' });
    await conn.query('DELETE FROM posts WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } finally {
    conn.release();
  }
});

// Like
router.post('/:id/like', auth, async (req, res) => {
  const conn = await getConnection();
  try {
    const [posts] = await conn.query('SELECT id FROM posts WHERE id = ?', [req.params.id]);
    if (!posts[0]) return res.status(404).json({ error: '投稿が見つかりません' });
    
    try {
      await conn.query('INSERT INTO likes (post_id, user_id) VALUES (?, ?)', [req.params.id, req.user.id]);
    } catch (err) {
      return res.status(400).json({ error: '既にいいねしています' });
    }
    
    const [counts] = await conn.query('SELECT COUNT(*) AS c FROM likes WHERE post_id = ?', [req.params.id]);
    res.json({ liked: true, like_count: counts[0].c });
  } finally {
    conn.release();
  }
});

// Unlike
router.delete('/:id/like', auth, async (req, res) => {
  const conn = await getConnection();
  try {
    await conn.query('DELETE FROM likes WHERE post_id = ? AND user_id = ?', [req.params.id, req.user.id]);
    const [counts] = await conn.query('SELECT COUNT(*) AS c FROM likes WHERE post_id = ?', [req.params.id]);
    res.json({ liked: false, like_count: counts[0].c });
  } finally {
    conn.release();
  }
});

// Add comment
router.post('/:id/comments', auth, async (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'コメントを入力してください' });
  
  const conn = await getConnection();
  try {
    const [posts] = await conn.query('SELECT id FROM posts WHERE id = ?', [req.params.id]);
    if (!posts[0]) return res.status(404).json({ error: '投稿が見つかりません' });

    const [result] = await conn.query('INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)', [req.params.id, req.user.id, content.trim()]);
    const [comments] = await conn.query(`
      SELECT c.*, u.name AS user_name FROM comments c
      JOIN users u ON c.user_id = u.id WHERE c.id = ?
    `, [result.insertId]);
    res.status(201).json(comments[0]);
  } finally {
    conn.release();
  }
});

// Delete comment
router.delete('/:postId/comments/:id', auth, async (req, res) => {
  const conn = await getConnection();
  try {
    const [comments] = await conn.query('SELECT * FROM comments WHERE id = ?', [req.params.id]);
    const comment = comments[0];
    if (!comment) return res.status(404).json({ error: 'コメントが見つかりません' });
    if (comment.user_id !== req.user.id) return res.status(403).json({ error: '削除権限がありません' });
    await conn.query('DELETE FROM comments WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } finally {
    conn.release();
  }
});

module.exports = router;
