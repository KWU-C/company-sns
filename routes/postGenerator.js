const express = require('express');
const router = express.Router();
const { OpenAI } = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ─── コンテキスト定義 ──────────────────────────────────────────────────────

const BOOK_CONTEXT = `
【著者】かわうち（川内 義勝）/ TCD クリエイティブディレクター
日本のグローバルニッチトップ企業を中心に、事業戦略とブランド実装をつなぐ仕事をしている。

【書籍プロジェクト：TCD IP化】
タイトル案：『行動ブランディング』— ブランドとは、社員の「行動」である
コアメッセージ：ブランド力とは「再現性のある組織」
ターゲット：従業員50〜500名のBtoB企業経営者（創業10年以上、組織拡大期）

【思想的枠組み：三位一体モデル】
・思想（Brand Identity）：意思決定の判断基準となる哲学
・行動（Action Identity）：社員の行動規範と実践
・価値（Value Identity）：顧客が受け取る体験の一貫性

【高パフォーマンスの実績パターン】
・4000+views：社会トピック×固有名詞（立命館・東大デザイン学部新設）
・1000+views：通説否定×具体的問い（デザイン思考はなぜ定着しなかったのか）
・500+views：対比構造（ホンダのチャレンジ精神 vs トヨタのカイゼン）
・低パフォーマンス：リンクのみ・抽象語スタート・定義文で始まる投稿
`;

const THREADS_POLICY = `
【Threads編集ポリシー】
成功の方程式：違和感（フック）→ 通説 → 否定 → 本質

1行目の鉄則（0.5秒でスクロール停止）：
・否定型：「〜では勝てない」
・疑問型：「なぜ〜なのか」
・通説否定：「〜と思われがちだが、実は違う」
・具体的違和感：状況描写でいきなり問題を示す
・NG：抽象語スタート（企業文化、戦略、構造）・正論スタート・定義文

文章ルール：
・1文1メッセージ、1文20文字前後、改行でリズム
・ですます調、断定ベース（曖昧表現は最小限）
・要素は最大3つ、映像が浮かぶ言葉

コンテンツタイプ：
・発見系（固有名詞・社会性・強い違和感）→ 1000+views期待
・思想系（抽象テーマ・内省）→ 100-500views
`;

// ─── ユーティリティ ────────────────────────────────────────────────────────

function parseAIJson(text) {
  const clean = text.replace(/^```json\n?/m, '').replace(/\n?```$/m, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('AIレスポンスのパースに失敗しました');
  }
}

// ─── パイプライン関数 ──────────────────────────────────────────────────────

async function fetchArticle(url) {
  const jinaUrl = `https://r.jina.ai/${url}`;
  const res = await fetch(jinaUrl, {
    headers: { 'Accept': 'text/plain' },
    signal: AbortSignal.timeout(20000)
  });
  if (!res.ok) throw new Error(`記事の取得に失敗しました（${res.status}）`);
  const text = await res.text();
  if (text.length < 200) throw new Error('記事の内容が取得できませんでした');
  return text;
}

async function extractKeyPoints(article) {
  const res = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: BOOK_CONTEXT + `
以下の記事から、SNSポストに適した核を抽出してください。
JSON形式で返してください：
{
  "mainThesis": "記事の主張を20字以内で",
  "points": ["核心的な主張・気づきを3〜5点"],
  "targetEmotion": "読者に感じさせたいこと（驚き・納得・共感など）",
  "bestQuote": "記事中の最も印象的な一節（そのまま引用）",
  "contentType": "発見系 or 思想系",
  "socialHook": "社会トピックや固有名詞があれば記載、なければnull"
}`
      },
      { role: 'user', content: article.slice(0, 6000) }
    ],
    response_format: { type: 'json_object' }
  });
  return JSON.parse(res.choices[0].message.content);
}

async function generateDrafts(keyPoints, article) {
  const res = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: BOOK_CONTEXT + '\n\n' + THREADS_POLICY + `

ポスト作成ルール：
- Threads：500字以内、改行でリズム、強いフック必須
- X：140字以内（日本語140文字厳守）、インパクト最優先
- 3案はそれぞれ異なるアプローチで（発見系・通説否定系・問いかけ系）
- かわうちさんの声で書く（ですます調・断定的・知的・経営者目線）`
      },
      {
        role: 'user',
        content: `記事の核心：
${JSON.stringify(keyPoints, null, 2)}

記事本文（抜粋）：
${article.slice(0, 3000)}

3つのポスト案を作成してください。
JSON形式：
{
  "threads": [
    {"content": "投稿本文", "type": "発見系/思想系/問いかけ系", "hook": "1行目の文章", "approach": "アプローチの説明"},
    {"content": "...", "type": "...", "hook": "...", "approach": "..."},
    {"content": "...", "type": "...", "hook": "...", "approach": "..."}
  ],
  "x": [
    {"content": "投稿本文（140字以内）", "type": "...", "approach": "..."},
    {"content": "...", "type": "...", "approach": "..."},
    {"content": "...", "type": "...", "approach": "..."}
  ]
}`
      }
    ],
    response_format: { type: 'json_object' }
  });
  return JSON.parse(res.choices[0].message.content);
}

async function evaluateAndRevise(drafts, keyPoints) {
  const model = gemini.getGenerativeModel({
    model: 'gemini-2.5-flash-preview-04-17',
    generationConfig: { responseMimeType: 'application/json' }
  });

  const prompt = `
あなたはSNSポストの専門編集者です。以下の基準でポスト案を評価し、最良案を改善してください。

${THREADS_POLICY}

【評価基準（各10点）】
1. フック強度：1行目でスクロールを止められるか
2. 即理解性：0.5秒で意味が取れるか
3. 感情トリガー：共感・驚き・納得のどれかを呼ぶか
4. 思想の深さ：表面的でなく洞察があるか
5. 編集ポリシー準拠：NGパターンがないか

【記事の核心】
${JSON.stringify(keyPoints, null, 2)}

【Threadsポスト案（3案）】
${drafts.threads.map((d, i) => `案${i + 1}（${d.type}）:\n${d.content}`).join('\n\n---\n\n')}

【Xポスト案（3案）】
${drafts.x.map((d, i) => `案${i + 1}（${d.type}）:\n${d.content}`).join('\n\n---\n\n')}

最高得点の案を選び、さらに改善した版を作成してください。

JSON形式：
{
  "threadsScores": [
    {"index": 1, "total": 0, "breakdown": {"hook": 0, "clarity": 0, "emotion": 0, "depth": 0, "policy": 0}, "weakness": "弱点"},
    {"index": 2, "total": 0, "breakdown": {...}, "weakness": "..."},
    {"index": 3, "total": 0, "breakdown": {...}, "weakness": "..."}
  ],
  "xScores": [
    {"index": 1, "total": 0, "breakdown": {...}, "weakness": "..."},
    {"index": 2, "total": 0, "breakdown": {...}, "weakness": "..."},
    {"index": 3, "total": 0, "breakdown": {...}, "weakness": "..."}
  ],
  "bestThreads": {
    "selectedIndex": 1,
    "original": "選んだ案の原文",
    "improved": "改善版",
    "improvements": "改善のポイント"
  },
  "bestX": {
    "selectedIndex": 1,
    "original": "選んだ案の原文",
    "improved": "改善版（140字以内）",
    "improvements": "改善のポイント"
  }
}`;

  const result = await model.generateContent(prompt);
  return parseAIJson(result.response.text());
}

async function finalPolish(revised, keyPoints) {
  // TODO: Claude APIキー取得後、Anthropicに切り替え
  const res = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: BOOK_CONTEXT + '\n\n' + THREADS_POLICY + `

あなたはかわうちさんの専任エディターです。
Geminiが選んだ最良案を、かわうちさんの「声」として最終精緻化してください。

最終チェック：
・『行動ブランディング』の思想と一致しているか
・BtoB経営者の心に刺さるか
・TCDブランドアーキテクトとしての権威性があるか
・最初の一文は本当に強いか（必要なら大幅修正可）
・X案は140字を絶対に超えないこと`
      },
      {
        role: 'user',
        content: `【Geminiが選んだ最良案】

Threads改善版：
${revised.bestThreads.improved}

Geminiの改善ポイント：${revised.bestThreads.improvements}

---

X改善版：
${revised.bestX.improved}

Geminiの改善ポイント：${revised.bestX.improvements}

---

記事の核心：
${JSON.stringify(keyPoints, null, 2)}

最終版を作成してください。
JSON形式：
{
  "threads": {
    "final": "最終版テキスト",
    "characterCount": 0,
    "changes": "変更したポイント"
  },
  "x": {
    "final": "最終版テキスト（140字以内厳守）",
    "characterCount": 0,
    "changes": "変更したポイント"
  }
}`
      }
    ],
    response_format: { type: 'json_object' }
  });

  const result = JSON.parse(res.choices[0].message.content);
  if (result.threads?.final) result.threads.characterCount = result.threads.final.length;
  if (result.x?.final) result.x.characterCount = result.x.final.length;
  return result;
}

// ─── ジョブキュー ──────────────────────────────────────────────────────────

const jobs = new Map();

async function runPipeline(jobId, noteUrl) {
  const update = (data) => {
    jobs.set(jobId, { ...jobs.get(jobId), ...data, updatedAt: Date.now() });
  };

  try {
    update({ step: 'fetch', stepLabel: '📰 記事を取得中...' });
    const article = await fetchArticle(noteUrl);

    update({ step: 'extract', stepLabel: '🔍 核心を抽出中（GPT）...' });
    const keyPoints = await extractKeyPoints(article);

    update({ step: 'drafts', stepLabel: '✏️ ポスト案を生成中（GPT）...' });
    const drafts = await generateDrafts(keyPoints, article);

    update({ step: 'gemini', stepLabel: '🔄 評価・改訂中（Gemini）...' });
    const revised = await evaluateAndRevise(drafts, keyPoints);

    update({ step: 'polish', stepLabel: '✨ 最終精緻化中（Claude）...' });
    const final = await finalPolish(revised, keyPoints);

    update({ status: 'done', step: 'complete', stepLabel: '完了', keyPoints, drafts, revised, final });
  } catch (err) {
    console.error(`[PostGenerator] Job ${jobId} failed:`, err.message);
    jobs.set(jobId, { ...jobs.get(jobId), status: 'error', error: err.message });
  }
}

// ─── ルート ────────────────────────────────────────────────────────────────

router.post('/generate', (req, res) => {
  const { noteUrl } = req.body;
  if (!noteUrl?.trim()) return res.status(400).json({ error: 'noteのURLを入力してください' });
  if (!noteUrl.includes('note.com')) return res.status(400).json({ error: 'note.comのURLを入力してください' });

  const jobId = Date.now().toString(36) + Math.random().toString(36).slice(2);
  jobs.set(jobId, { status: 'processing', step: 'start', stepLabel: '開始中...', startedAt: Date.now() });

  res.json({ jobId });
  runPipeline(jobId, noteUrl.trim());
});

router.get('/result/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'ジョブが見つかりません' });
  res.json(job);
});

module.exports = router;
