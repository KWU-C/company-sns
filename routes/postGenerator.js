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

【1行目は命】スクロールを0.5秒以内に止める：
・否定型：「〜では勝てない」「〜は勘違い」
・疑問型：「なぜ〜なのか」
・通説否定：「〜と思われがちだが、実は違う」
・具体的違和感：状況をいきなり描写して問題を示す
・NG絶対禁止：抽象語スタート（企業文化、戦略、構造）・正論スタート・定義文

文章ルール：
・1文1メッセージ、1文20文字前後
・改行でリズムを作る（重要：1文ごとに改行を入れる）
・ですます調、断定ベース
・要素は最大3つ
・映像が浮かぶ言葉を使う

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

const jobs = new Map();
function newJobId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
function updateJob(jobId, data) {
  jobs.set(jobId, { ...jobs.get(jobId), ...data, updatedAt: Date.now() });
}

// ─── フェーズ1：核心10点の抽出 ────────────────────────────────────────────

async function runExtract(jobId, noteUrl) {
  try {
    updateJob(jobId, { step: 'fetch', stepLabel: '📰 記事を取得中...' });

    const jinaRes = await fetch(`https://r.jina.ai/${noteUrl}`, {
      headers: { 'Accept': 'text/plain' },
      signal: AbortSignal.timeout(20000)
    });
    if (!jinaRes.ok) throw new Error(`記事の取得に失敗しました（${jinaRes.status}）`);
    const articleText = await jinaRes.text();
    if (articleText.length < 200) throw new Error('記事の内容が取得できませんでした');

    updateJob(jobId, { step: 'extract', stepLabel: '🔍 核心10点を抽出中（GPT）...' });

    const res = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: BOOK_CONTEXT + '\n\n' + THREADS_POLICY + `

この記事から、SNSポストに切り出せる核心を正確に10点抽出してください。

各核心は以下の条件を満たすこと：
・それ単体で1つのポストになれる独立した洞察
・かわうちさんの思想・経験・知見に基づくもの
・異なるタイプ（発見系・思想系・通説否定・問いかけ・対比）をバランスよく

JSON形式で返してください：
{
  "points": [
    {
      "id": 1,
      "title": "核心の短いタイトル（15字以内）",
      "insight": "核心となるメッセージ（50字以内）",
      "type": "発見系 / 思想系 / 通説否定 / 問いかけ / 対比",
      "hook": "Threadsの1行目として使える強い一文",
      "expectedViews": "100+ / 500+ / 1000+",
      "rawText": "記事中の関連する原文（100字以内）"
    }
  ]
}`
        },
        { role: 'user', content: articleText.slice(0, 8000) }
      ],
      response_format: { type: 'json_object' }
    });

    const { points } = JSON.parse(res.choices[0].message.content);
    updateJob(jobId, {
      status: 'done',
      step: 'complete',
      stepLabel: '完了',
      points,
      articleText: articleText.slice(0, 6000)
    });
  } catch (err) {
    console.error(`[Extract] Job ${jobId} failed:`, err.message);
    updateJob(jobId, { status: 'error', error: err.message });
  }
}

// ─── フェーズ2：選択した核心からポスト生成 ────────────────────────────────

async function runGeneratePosts(jobId, selectedPoints, articleText) {
  try {
    // Step 1: GPTで全ポスト案を一括生成
    updateJob(jobId, { step: 'drafts', stepLabel: '✏️ ポスト案を生成中（GPT）...' });

    const pointsList = selectedPoints.map((p, i) =>
      `【核心${i + 1}】タイプ：${p.type}\n洞察：${p.insight}\n推奨フック：${p.hook}`
    ).join('\n\n');

    const draftRes = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: BOOK_CONTEXT + '\n\n' + THREADS_POLICY + `

各核心に対してThreads投稿とX投稿を作成してください。

【重要】
・Threadsの1行目は「スクロールが止まる」強さが絶対条件
・Threadsは300字程度（最大330字）、改行を多用してリズムを作る（1文ごとに改行）
・X（140字以内）は1行目だけで完結する強さを持たせる
・かわうちさんの声で書く（ですます調・断定的・知的）
・JSONのstring内の改行は必ず\\nを使うこと`
        },
        {
          role: 'user',
          content: `以下の${selectedPoints.length}つの核心について、それぞれThreads投稿とX投稿を作成してください。
【Threads文字数の目安：300字程度（最大330字）。冗長な説明は削る。1メッセージに絞る。】

${pointsList}

---
記事本文（参考）：
${articleText.slice(0, 3000)}

JSON形式：
{
  "posts": [
    {
      "pointId": 1,
      "threads": {
        "line1": "1行目（フック）",
        "content": "投稿全文（\\nで改行）",
        "type": "発見系など"
      },
      "x": {
        "content": "140字以内の投稿文",
        "type": "..."
      }
    }
  ]
}`
        }
      ],
      response_format: { type: 'json_object' }
    });

    const { posts: draftPosts } = JSON.parse(draftRes.choices[0].message.content);

    // Step 2: Geminiで1行目を評価・改善
    updateJob(jobId, { step: 'gemini', stepLabel: '🔄 1行目を強化中（Gemini）...' });

    const geminiModel = gemini.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: 'application/json' }
    });

    const firstLines = draftPosts.map((p, i) =>
      `投稿${i + 1}（${p.threads.type}）: ${p.threads.line1}`
    ).join('\n');

    const geminiRes = await geminiModel.generateContent(`
あなたはThreadsの1行目専門の編集者です。

${THREADS_POLICY}

以下の${draftPosts.length}つの1行目を評価し、改善してください。

${firstLines}

評価基準（各10点）：
1. スクロール停止力（0.5秒で止まるか）
2. 即理解性（一瞬で意味が取れるか）
3. 感情トリガー（驚き・違和感・納得）
4. NGパターン回避（抽象語・正論・定義文でないか）

各1行目を採点し、スコアが8点未満なら改善版を作成してください。

JSON形式：
{
  "evaluations": [
    {
      "index": 1,
      "score": 0,
      "issues": "問題点",
      "improved": "改善版（改善不要なら元の文をそのまま）"
    }
  ]
}`);

    const { evaluations } = parseAIJson(geminiRes.response.text());

    // Geminiの改善を反映
    const improvedPosts = draftPosts.map((post, i) => {
      const eval_ = evaluations.find(e => e.index === i + 1);
      if (eval_ && eval_.improved) {
        const improvedContent = post.threads.content.replace(
          post.threads.line1,
          eval_.improved
        );
        return {
          ...post,
          threads: {
            ...post.threads,
            line1: eval_.improved,
            content: improvedContent,
            geminiScore: eval_.score,
            geminiIssues: eval_.issues
          }
        };
      }
      return { ...post, threads: { ...post.threads, geminiScore: eval_?.score } };
    });

    // Step 3: GPTで最終精緻化
    updateJob(jobId, { step: 'polish', stepLabel: '✨ 最終精緻化中（Claude）...' });

    const polishRes = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: BOOK_CONTEXT + '\n\n' + THREADS_POLICY + `
かわうちさんの専任エディターとして最終チェックと精緻化を行います。

確認事項：
・1行目は本当に強いか（弱ければ書き直す）
・ですます調が徹底されているか
・改行が適切か（1文ごとの改行）
・X投稿は140字を超えていないか（超えていたら削る）
・TCD/行動ブランディングの思想と一致しているか
・JSONのstring内の改行は必ず\\nを使うこと`
        },
        {
          role: 'user',
          content: `以下の${improvedPosts.length}つのポスト案を最終確認・精緻化してください。

${improvedPosts.map((p, i) => `
【投稿${i + 1}】
Threads1行目：${p.threads.line1}
Threads全文：
${p.threads.content}
X：${p.x.content}
`).join('\n---\n')}

JSON形式：
{
  "posts": [
    {
      "pointId": 1,
      "threads": {
        "final": "最終版全文（\\nで改行）",
        "line1": "1行目",
        "changes": "修正点"
      },
      "x": {
        "final": "最終版（140字以内）",
        "changes": "修正点"
      }
    }
  ]
}`
        }
      ],
      response_format: { type: 'json_object' }
    });

    const { posts: finalPosts } = JSON.parse(polishRes.choices[0].message.content);

    // 文字数カウントを追加
    const result = finalPosts.map((p, i) => ({
      ...p,
      pointTitle: selectedPoints[i]?.title,
      pointType: selectedPoints[i]?.type,
      threads: {
        ...p.threads,
        charCount: (p.threads.final || '').length
      },
      x: {
        ...p.x,
        charCount: (p.x.final || '').length
      }
    }));

    updateJob(jobId, {
      status: 'done',
      step: 'complete',
      stepLabel: '完了',
      posts: result,
      drafts: improvedPosts
    });
  } catch (err) {
    console.error(`[GeneratePosts] Job ${jobId} failed:`, err.message);
    updateJob(jobId, { status: 'error', error: err.message });
  }
}

// ─── ルート ────────────────────────────────────────────────────────────────

// フェーズ1：核心抽出
router.post('/extract', (req, res) => {
  const { noteUrl } = req.body;
  if (!noteUrl?.trim()) return res.status(400).json({ error: 'noteのURLを入力してください' });
  if (!noteUrl.includes('note.com')) return res.status(400).json({ error: 'note.comのURLを入力してください' });

  const jobId = newJobId();
  jobs.set(jobId, { status: 'processing', step: 'start', stepLabel: '開始中...', startedAt: Date.now() });
  res.json({ jobId });
  runExtract(jobId, noteUrl.trim());
});

// フェーズ2：ポスト生成
router.post('/generate-posts', (req, res) => {
  const { selectedPoints, articleText } = req.body;
  if (!selectedPoints?.length) return res.status(400).json({ error: '核心を1つ以上選択してください' });
  if (selectedPoints.length > 5) return res.status(400).json({ error: '最大5つまで選択できます' });

  const jobId = newJobId();
  jobs.set(jobId, { status: 'processing', step: 'start', stepLabel: '開始中...', startedAt: Date.now() });
  res.json({ jobId });
  runGeneratePosts(jobId, selectedPoints, articleText);
});

// 書き直し（同期・単発）
router.post('/rewrite', async (req, res) => {
  const { threadsText, xText, instruction } = req.body;
  if (!threadsText) return res.status(400).json({ error: '本文が必要です' });

  try {
    const result = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: BOOK_CONTEXT + '\n\n' + THREADS_POLICY + `
かわうちさんの専任エディターとして、以下のポストを書き直してください。

書き直しの基本方針：
・Threads：300字程度（最大330字）に圧縮。冗長な説明を削り、1メッセージに絞る
・1行目は必ずスクロールが止まる強さにする
・X：140字以内厳守
・JSONのstring内の改行は必ず\\nを使うこと`
        },
        {
          role: 'user',
          content: `【現在のThreads投稿】
${threadsText}

【現在のX投稿】
${xText || '（なし）'}

${instruction ? `【書き直し指示】${instruction}` : ''}

より短く・より強い投稿に書き直してください。
JSON形式：
{
  "threads": { "final": "書き直し後（\\nで改行）", "charCount": 0 },
  "x": { "final": "書き直し後（140字以内）", "charCount": 0 }
}`
        }
      ],
      response_format: { type: 'json_object' }
    });

    const data = JSON.parse(result.choices[0].message.content);
    if (data.threads?.final) data.threads.charCount = data.threads.final.length;
    if (data.x?.final) data.x.charCount = data.x.final.length;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ジョブ状態取得
router.get('/result/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'ジョブが見つかりません' });
  res.json(job);
});

module.exports = router;
