const express = require('express');
const path = require('path');
const { initTables } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
// Support serving the same static app both at / and at /company-sns/public (heteml deployment path)
app.use('/company-sns/public', express.static(path.join(__dirname, 'public')));

// API routes (mounted under both /api and /company-sns/public/api)
const apiRouter = express.Router();
apiRouter.use('/auth',  require('./routes/auth'));
apiRouter.use('/posts', require('./routes/posts'));
apiRouter.use('/users', require('./routes/users'));
app.use('/api', apiRouter);
app.use('/company-sns/public/api', apiRouter);

// Post Generator
app.use('/api/post-generator', require('./routes/postGenerator'));
app.use('/post-generator', express.static(path.join(__dirname, 'public/post-generator')));

// Salary calculator (Basic auth: tcd/tcd)
function salaryBasicAuth(req, res, next) {
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Basic ')) {
    const [id, pass] = Buffer.from(auth.slice(6), 'base64').toString().split(':');
    if (id === 'tcd' && pass === 'tcd') return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="salary-calculator"');
  return res.status(401).send('Unauthorized');
}
app.use('/salary-calculator', salaryBasicAuth, express.static('/root/salary-calculator'));

// SPA fallback (do not intercept API routes)
app.get(/^(?!\/(api|company-sns\/public\/api|salary-calculator|post-generator)).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server and initialize database
(async () => {
  try {
    await initTables();
    app.listen(PORT, () => {
      console.log(`\nSNS proto が起動しました`);
      console.log(`   http://localhost:${PORT}\n`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
})();
