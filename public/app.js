/* ============================================================
   Base paths
   ============================================================ */
const API_BASE = (() => {
  if (typeof location === 'undefined') return '/api';
  return location.pathname.startsWith('/company-sns/public') ? '/company-sns/public/api' : '/api';
})();

/* ============================================================
   State
   ============================================================ */
let _token = localStorage.getItem('token') || null;
let _me = (() => { try { return JSON.parse(localStorage.getItem('user')); } catch { return null; } })();

/* ============================================================
   Auth helpers
   ============================================================ */
function setAuth(token, user) {
  _token = token;
  _me = user;
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

function logout() {
  _token = null;
  _me = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  go('/');
}

/* ============================================================
   API helper
   ============================================================ */
async function api(method, path, body) {
  const res = await fetch(API_BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(_token ? { Authorization: `Bearer ${_token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'エラーが発生しました');
  return data;
}

/* ============================================================
   Utils
   ============================================================ */
function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function timeAgo(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString.endsWith('Z') ? isoString : isoString + 'Z');
  const now = Date.now();
  const diff = Math.floor((now - date.getTime()) / 1000);
  if (diff < 10) return 'たった今';
  if (diff < 60) return `${diff}秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}日前`;
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const now2 = new Date();
  if (y === now2.getFullYear()) return `${m}月${d}日`;
  return `${y}年${m}月${d}日`;
}

const AVATAR_COLORS = [
  '#4f46e5', '#7c3aed', '#db2777', '#dc2626', '#d97706',
  '#059669', '#0891b2', '#0284c7', '#9333ea', '#c2410c',
];

function avatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function avatarHtml(name, size = 'sm') {
  const letter = name ? (name.charAt(0)).toUpperCase() : '?';
  const color = avatarColor(name);
  return `<div class="avatar avatar-${size}" style="background:${color}">${esc(letter)}</div>`;
}

/* ============================================================
   Toast
   ============================================================ */
let _toastTimer = null;
function toast(msg, type = 'info') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `toast ${type} show`;
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    el.classList.remove('show');
  }, 2500);
}

/* ============================================================
   Router
   ============================================================ */
function go(path, replace = false) {
  if (replace) {
    history.replaceState(null, '', path);
  } else {
    history.pushState(null, '', path);
  }
  renderRoute();
}

function renderRoute() {
  const path = location.pathname;

  if (!_token) {
    renderLoginPage();
    return;
  }

  if (path === '/' || path === '/timeline') {
    renderTimelinePage();
  } else if (path.startsWith('/posts/')) {
    const id = path.split('/')[2];
    renderPostDetailPage(id);
  } else if (path.startsWith('/profile/')) {
    const id = path.split('/')[2];
    renderProfilePage(id);
  } else {
    renderTimelinePage();
  }
}

window.addEventListener('popstate', renderRoute);

/* ============================================================
   Bottom Nav HTML
   ============================================================ */
function bottomNavHtml(active = 'timeline') {
  return `
    <nav class="bottom-nav">
      <button class="nav-item ${active === 'timeline' ? 'active' : ''}" onclick="go('/timeline')">
        <span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3fa9d0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></span>
        <span>ホーム</span>
      </button>
      <button class="nav-item ${active === 'profile' ? 'active' : ''}" onclick="go('/profile/${_me?.id}')">
        <span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3fa9d0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span>
        <span>プロフィール</span>
      </button>
    </nav>
  `;
}

/* ============================================================
   Post Card Component
   ============================================================ */
function postCard(post, options = {}) {
  const { showDetail = true, isDetail = false } = options;
  const isOwn = _me && post.user_id === _me.id;
  const likedClass = post.liked ? 'liked' : '';
  const likeIcon = post.liked
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#3fa9d0" stroke="#3fa9d0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3fa9d0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;

  const menuHtml = isOwn ? `
    <div class="post-menu-wrap" data-post-id="${post.id}">
      <button class="post-menu-btn" onclick="togglePostMenu(event, ${post.id})" title="メニュー">⋮</button>
      <div class="post-menu-dropdown" id="menu-${post.id}" style="display:none">
        <button class="post-menu-item" onclick="openEditPost(${post.id})">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3fa9d0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>編集
        </button>
        <button class="post-menu-item danger" onclick="deletePost(${post.id})">
          🗑️ 削除
        </button>
      </div>
    </div>
  ` : '';

  const cardClickAttr = showDetail && !isDetail
    ? `onclick="handlePostClick(event, ${post.id})"`
    : '';

  return `
    <article class="post-card ${isDetail ? 'detail' : ''}" ${cardClickAttr} data-post-id="${post.id}">
      <div class="post-left">
        <span onclick="event.stopPropagation(); go('/profile/${post.user_id}')" style="cursor:pointer">
          ${avatarHtml(post.user_name, 'sm')}
        </span>
        ${!isDetail ? '<div class="post-thread-line"></div>' : ''}
      </div>
      <div class="post-right">
        <div class="post-meta">
          <div class="post-author" onclick="event.stopPropagation(); go('/profile/${post.user_id}')">
            <span class="post-author-name">${esc(post.user_name)}</span>
            <span class="post-time">${timeAgo(post.created_at)}</span>
          </div>
          ${menuHtml}
        </div>
        <div class="post-content">${esc(post.content)}</div>
        <div class="post-actions">
          <button class="action-btn like-btn ${likedClass}"
            onclick="event.stopPropagation(); toggleLike(${post.id}, this)"
            data-liked="${post.liked ? '1' : '0'}"
            data-count="${post.like_count}"
            title="${post.liked ? 'いいねを取り消す' : 'いいね'}">
            <span class="btn-icon btn-icon-svg">${likeIcon}</span>
            <span class="btn-count">${post.like_count > 0 ? post.like_count : ''}</span>
          </button>
          <button class="action-btn comment-btn"
            onclick="event.stopPropagation(); go('/posts/${post.id}')"
            title="コメント">
            <span class="btn-icon btn-icon-svg"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3fa9d0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span>
            <span class="btn-count">${post.comment_count > 0 ? post.comment_count : ''}</span>
          </button>
        </div>
      </div>
    </article>
  `;
}

function handlePostClick(event, postId) {
  // Don't navigate if clicking on a button or interactive element
  if (event.target.closest('button') || event.target.closest('.post-menu-wrap')) return;
  go('/posts/' + postId);
}

/* ============================================================
   Post Menu
   ============================================================ */
function togglePostMenu(event, postId) {
  event.stopPropagation();
  const menu = document.getElementById('menu-' + postId);
  if (!menu) return;
  const isOpen = menu.style.display !== 'none';
  // Close all menus first
  document.querySelectorAll('.post-menu-dropdown').forEach(m => m.style.display = 'none');
  if (!isOpen) {
    menu.style.display = 'block';
    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', function closeMenu(e) {
        if (!menu.contains(e.target)) {
          menu.style.display = 'none';
          document.removeEventListener('click', closeMenu);
        }
      });
    }, 0);
  }
}

/* ============================================================
   Like Toggle
   ============================================================ */
async function toggleLike(postId, btn) {
  const isLiked = btn.dataset.liked === '1';
  const currentCount = parseInt(btn.dataset.count, 10) || 0;

  // Optimistic update
  const newLiked = !isLiked;
  const newCount = newLiked ? currentCount + 1 : Math.max(0, currentCount - 1);
  updateLikeBtn(btn, newLiked, newCount);

  try {
    const method = newLiked ? 'POST' : 'DELETE';
    const result = await api(method, `/posts/${postId}/like`);
    // Sync with server response
    updateLikeBtn(btn, result.liked, result.like_count);
    // Update all like buttons for this post (in case multiple views)
    document.querySelectorAll(`.like-btn[data-post-id="${postId}"]`).forEach(b => {
      if (b !== btn) updateLikeBtn(b, result.liked, result.like_count);
    });
  } catch (err) {
    // Revert
    updateLikeBtn(btn, isLiked, currentCount);
    toast(err.message, 'error');
  }
}

function updateLikeBtn(btn, liked, count) {
  btn.dataset.liked = liked ? '1' : '0';
  btn.dataset.count = count;
  btn.classList.toggle('liked', liked);
  const iconEl = btn.querySelector('.btn-icon');
  const countEl = btn.querySelector('.btn-count');
  if (iconEl) iconEl.innerHTML = liked
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#3fa9d0" stroke="#3fa9d0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3fa9d0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
  if (countEl) countEl.textContent = count > 0 ? count : '';
}

/* ============================================================
   Delete Post
   ============================================================ */
async function deletePost(postId) {
  // Close menu
  const menu = document.getElementById('menu-' + postId);
  if (menu) menu.style.display = 'none';

  if (!confirm('この投稿を削除しますか？')) return;
  try {
    await api('DELETE', '/posts/' + postId);
    toast('投稿を削除しました', 'success');
    // If on detail page, go back
    if (location.pathname.startsWith('/posts/')) {
      go('/timeline');
    } else {
      // Remove card from DOM
      const card = document.querySelector(`[data-post-id="${postId}"]`);
      if (card) {
        card.style.opacity = '0';
        card.style.transition = 'opacity 0.2s ease';
        setTimeout(() => card.remove(), 200);
      }
    }
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ============================================================
   Edit Post (opens modal pre-filled)
   ============================================================ */
function openEditPost(postId) {
  const menu = document.getElementById('menu-' + postId);
  if (menu) menu.style.display = 'none';
  renderCreatePostModal(postId);
}

/* ============================================================
   Create/Edit Post Modal
   ============================================================ */
function renderCreatePostModal(editPostId = null) {
  // Remove any existing modal
  const existing = document.getElementById('post-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'post-modal';

  const editPost = editPostId
    ? document.querySelector(`[data-post-id="${editPostId}"] .post-content`)
    : null;
  const existingContent = editPost ? editPost.textContent : '';
  const title = editPostId ? '投稿を編集' : '新しい投稿';
  const submitLabel = editPostId ? '更新する' : '投稿する';

  overlay.innerHTML = `
    <div class="modal-sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <button class="btn btn-ghost" onclick="closePostModal()">キャンセル</button>
        <span class="sheet-title">${esc(title)}</span>
        <button class="btn btn-primary" id="submit-post-btn" onclick="submitPost(${editPostId || 'null'})">${esc(submitLabel)}</button>
      </div>
      <div class="sheet-body">
        <div style="display:flex; gap:10px; align-items:flex-start;">
          ${avatarHtml(_me?.name, 'sm')}
          <div style="flex:1; min-width:0;">
            <textarea
              class="form-input"
              id="post-textarea"
              placeholder="何を考えていますか？"
              maxlength="500"
              rows="5"
              oninput="updateCharCount(this)"
              autofocus
            >${esc(existingContent)}</textarea>
            <div class="char-counter" id="char-counter">0 / 500</div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Close on overlay background click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePostModal();
  });

  document.body.appendChild(overlay);

  // Focus textarea and update counter
  const ta = document.getElementById('post-textarea');
  if (ta) {
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    updateCharCount(ta);
  }
}

function updateCharCount(ta) {
  const len = ta.value.length;
  const el = document.getElementById('char-counter');
  if (!el) return;
  el.textContent = `${len} / 500`;
  el.className = 'char-counter' + (len > 450 ? (len > 490 ? ' danger' : ' warn') : '');
  const btn = document.getElementById('submit-post-btn');
  if (btn) btn.disabled = len === 0 || len > 500;
}

function closePostModal() {
  const modal = document.getElementById('post-modal');
  if (!modal) return;
  modal.style.opacity = '0';
  modal.style.transition = 'opacity 0.15s ease';
  setTimeout(() => modal.remove(), 150);
}

async function submitPost(editPostId) {
  const ta = document.getElementById('post-textarea');
  const btn = document.getElementById('submit-post-btn');
  if (!ta || !btn) return;

  const content = ta.value.trim();
  if (!content) { toast('本文を入力してください', 'error'); return; }
  if (content.length > 500) { toast('500文字以内で入力してください', 'error'); return; }

  btn.disabled = true;
  btn.textContent = '送信中…';

  try {
    if (editPostId) {
      const updated = await api('PUT', '/posts/' + editPostId, { content });
      // Update content in DOM
      const contentEl = document.querySelector(`[data-post-id="${editPostId}"] .post-content`);
      if (contentEl) contentEl.textContent = updated.content;
      toast('投稿を更新しました', 'success');
    } else {
      const post = await api('POST', '/posts', { content });
      // Prepend to timeline if on timeline page
      const list = document.querySelector('.posts-list');
      if (list) {
        const emptyState = list.querySelector('.empty-state');
        if (emptyState) emptyState.remove();
        const newCard = document.createElement('div');
        newCard.innerHTML = postCard(post);
        const cardEl = newCard.firstElementChild;
        cardEl.style.opacity = '0';
        list.prepend(cardEl);
        requestAnimationFrame(() => {
          cardEl.style.transition = 'opacity 0.3s ease';
          cardEl.style.opacity = '1';
        });
      }
      toast('投稿しました！', 'success');
    }
    closePostModal();
  } catch (err) {
    toast(err.message, 'error');
    btn.disabled = false;
    btn.textContent = editPostId ? '更新する' : '投稿する';
  }
}

/* ============================================================
   Page: Login
   ============================================================ */
function renderLoginPage() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-logo">
          <div class="auth-logo-icon">💬</div>
          <div class="auth-logo-text">SNS proto</div>
          <div class="auth-logo-sub">チームのコミュニケーション</div>
        </div>

        <div class="auth-tabs">
          <button class="auth-tab active" id="tab-login" onclick="switchAuthTab('login')">ログイン</button>
          <button class="auth-tab" id="tab-register" onclick="switchAuthTab('register')">新規登録</button>
        </div>

        <div id="auth-form-wrap">
          ${loginFormHtml()}
        </div>
      </div>
    </div>
  `;
}

function loginFormHtml() {
  return `
    <form id="login-form" onsubmit="handleLogin(event)">
      <div class="form-group">
        <label class="form-label" for="login-email">メールアドレス</label>
        <input class="form-input" type="email" id="login-email" placeholder="you@company.com" required autocomplete="email" />
      </div>
      <div class="form-group">
        <label class="form-label" for="login-password">パスワード</label>
        <input class="form-input" type="password" id="login-password" placeholder="••••••••" required autocomplete="current-password" />
      </div>
      <button class="btn btn-primary btn-full mt-3" type="submit" id="login-btn">ログイン</button>
    </form>
  `;
}

function registerFormHtml() {
  return `
    <form id="register-form" onsubmit="handleRegister(event)">
      <div class="form-group">
        <label class="form-label" for="reg-name">名前</label>
        <input class="form-input" type="text" id="reg-name" placeholder="山田 太郎" required autocomplete="name" />
      </div>
      <div class="form-group">
        <label class="form-label" for="reg-email">メールアドレス</label>
        <input class="form-input" type="email" id="reg-email" placeholder="you@company.com" required autocomplete="email" />
      </div>
      <div class="form-group">
        <label class="form-label" for="reg-password">パスワード（6文字以上）</label>
        <input class="form-input" type="password" id="reg-password" placeholder="••••••••" required autocomplete="new-password" minlength="6" />
      </div>
      <button class="btn btn-primary btn-full mt-3" type="submit" id="reg-btn">アカウント作成</button>
    </form>
  `;
}

function switchAuthTab(tab) {
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  const wrap = document.getElementById('auth-form-wrap');
  if (wrap) wrap.innerHTML = tab === 'login' ? loginFormHtml() : registerFormHtml();
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email')?.value.trim();
  const password = document.getElementById('login-password')?.value;
  const btn = document.getElementById('login-btn');
  if (!email || !password) return;

  btn.disabled = true;
  btn.textContent = 'ログイン中…';

  try {
    const data = await api('POST', '/auth/login', { email, password });
    setAuth(data.token, data.user);
    go('/timeline', true);
  } catch (err) {
    toast(err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'ログイン';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('reg-name')?.value.trim();
  const email = document.getElementById('reg-email')?.value.trim();
  const password = document.getElementById('reg-password')?.value;
  const btn = document.getElementById('reg-btn');
  if (!name || !email || !password) return;

  btn.disabled = true;
  btn.textContent = '登録中…';

  try {
    const data = await api('POST', '/auth/register', { name, email, password });
    setAuth(data.token, data.user);
    toast('アカウントを作成しました！', 'success');
    go('/timeline', true);
  } catch (err) {
    toast(err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'アカウント作成';
  }
}

/* ============================================================
   Page: Timeline
   ============================================================ */
async function renderTimelinePage() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="page">
      <header class="app-header">
        <div class="header-inner">
          <div></div>
          <h1 class="header-title">タイムライン</h1>
          <button class="header-action" onclick="logout()" title="ログアウト"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3fa9d0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></button>
        </div>
      </header>
      <main class="content-area">
        <div class="posts-list" id="posts-list">
          <div class="loading-wrap"><div class="spinner"></div></div>
        </div>
      </main>
      ${bottomNavHtml('timeline')}
      <button class="fab" onclick="renderCreatePostModal()" title="新しい投稿"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
    </div>
  `;

  try {
    const posts = await api('GET', '/posts');
    const list = document.getElementById('posts-list');
    if (!list) return;
    if (posts.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📝</div>
          <div class="empty-title">まだ投稿がありません</div>
          <div class="empty-sub">最初の投稿をしてみましょう！<br>右下の ✏️ ボタンから投稿できます。</div>
        </div>
      `;
    } else {
      list.innerHTML = posts.map(p => postCard(p)).join('');
    }
  } catch (err) {
    toast(err.message, 'error');
    const list = document.getElementById('posts-list');
    if (list) list.innerHTML = `<div class="empty-state"><div class="empty-title text-danger">読み込みに失敗しました</div><div class="empty-sub">${esc(err.message)}</div></div>`;
  }
}

/* ============================================================
   Page: Post Detail
   ============================================================ */
async function renderPostDetailPage(postId) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="page">
      <header class="app-header">
        <div class="header-inner">
          <button class="header-back" onclick="history.back()">← 戻る</button>
          <h1 class="header-title">投稿詳細</h1>
          <div style="width:60px"></div>
        </div>
      </header>
      <main class="content-area no-nav" id="detail-main">
        <div class="loading-wrap"><div class="spinner"></div></div>
      </main>
    </div>
  `;

  try {
    const data = await api('GET', '/posts/' + postId);
    const main = document.getElementById('detail-main');
    if (!main) return;

    const commentsHtml = data.comments && data.comments.length > 0
      ? data.comments.map(c => commentItemHtml(c)).join('')
      : `<div class="empty-state" style="padding:30px 16px"><div class="empty-sub">まだコメントがありません。最初のコメントをどうぞ！</div></div>`;

    main.innerHTML = `
      <div class="posts-list">
        ${postCard(data, { isDetail: true, showDetail: false })}
      </div>
      <div class="comments-section">
        <div class="comments-header">コメント ${data.comments?.length > 0 ? `(${data.comments.length})` : ''}</div>
        <div id="comments-list">
          ${commentsHtml}
        </div>
      </div>
      <div class="comment-input-bar">
        ${avatarHtml(_me?.name, 'sm')}
        <textarea
          class="form-input"
          id="comment-input"
          placeholder="コメントを追加…"
          rows="1"
          oninput="autoResizeTextarea(this)"
          onkeydown="handleCommentKeydown(event, ${postId})"
        ></textarea>
        <button class="comment-send-btn" id="comment-send-btn" onclick="submitComment(${postId})" disabled title="送信">➤</button>
      </div>
    `;

    // Enable send button when input has text
    const commentInput = document.getElementById('comment-input');
    const sendBtn = document.getElementById('comment-send-btn');
    if (commentInput && sendBtn) {
      commentInput.addEventListener('input', () => {
        sendBtn.disabled = commentInput.value.trim().length === 0;
      });
    }
  } catch (err) {
    toast(err.message, 'error');
    const main = document.getElementById('detail-main');
    if (main) main.innerHTML = `<div class="empty-state"><div class="empty-title text-danger">読み込みに失敗しました</div><div class="empty-sub">${esc(err.message)}</div></div>`;
  }
}

function commentItemHtml(comment) {
  const isOwn = _me && comment.user_id === _me.id;
  return `
    <div class="comment-item" data-comment-id="${comment.id}">
      ${avatarHtml(comment.user_name, 'sm')}
      <div class="comment-body">
        <div class="comment-meta">
          <span class="comment-author">${esc(comment.user_name)}</span>
          <span class="comment-time">${timeAgo(comment.created_at)}</span>
          ${isOwn ? `<button class="comment-delete" onclick="deleteComment(${comment.post_id}, ${comment.id})">削除</button>` : ''}
        </div>
        <div class="comment-text">${esc(comment.content)}</div>
      </div>
    </div>
  `;
}

function autoResizeTextarea(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
}

function handleCommentKeydown(e, postId) {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    submitComment(postId);
  }
}

async function submitComment(postId) {
  const input = document.getElementById('comment-input');
  const btn = document.getElementById('comment-send-btn');
  if (!input || !btn) return;

  const content = input.value.trim();
  if (!content) return;

  btn.disabled = true;
  const originalIcon = btn.textContent;
  btn.textContent = '…';

  try {
    const comment = await api('POST', `/posts/${postId}/comments`, { content });
    const list = document.getElementById('comments-list');
    if (list) {
      // Remove empty state if present
      const empty = list.querySelector('.empty-state');
      if (empty) empty.remove();
      // Append new comment
      const el = document.createElement('div');
      el.innerHTML = commentItemHtml(comment);
      list.appendChild(el.firstElementChild);
      // Scroll to new comment
      list.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    input.value = '';
    input.style.height = 'auto';
    btn.textContent = originalIcon;
    // Update comment count on post card
    const countEl = document.querySelector('.comment-btn .btn-count');
    if (countEl) {
      const cur = parseInt(countEl.textContent, 10) || 0;
      countEl.textContent = cur + 1;
    }
  } catch (err) {
    toast(err.message, 'error');
    btn.disabled = false;
    btn.textContent = originalIcon;
  }
}

async function deleteComment(postId, commentId) {
  if (!confirm('このコメントを削除しますか？')) return;
  try {
    await api('DELETE', `/posts/${postId}/comments/${commentId}`);
    const el = document.querySelector(`[data-comment-id="${commentId}"]`);
    if (el) {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.2s ease';
      setTimeout(() => el.remove(), 200);
    }
    toast('コメントを削除しました', 'success');
    // Update comment count
    const countEl = document.querySelector('.comment-btn .btn-count');
    if (countEl) {
      const cur = parseInt(countEl.textContent, 10) || 0;
      countEl.textContent = Math.max(0, cur - 1) || '';
    }
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ============================================================
   Page: Profile
   ============================================================ */
async function renderProfilePage(userId) {
  const app = document.getElementById('app');
  const isOwn = _me && String(userId) === String(_me.id);

  app.innerHTML = `
    <div class="page">
      <header class="app-header">
        <div class="header-inner">
          <button class="header-back" onclick="history.back()">← 戻る</button>
          <h1 class="header-title">プロフィール</h1>
          <div style="width:60px"></div>
        </div>
      </header>
      <main class="content-area" id="profile-main">
        <div class="loading-wrap"><div class="spinner"></div></div>
      </main>
      ${bottomNavHtml(isOwn ? 'profile' : '')}
    </div>
  `;

  try {
    const [user, posts] = await Promise.all([
      api('GET', '/users/' + userId),
      api('GET', '/users/' + userId + '/posts'),
    ]);

    const main = document.getElementById('profile-main');
    if (!main) return;

    main.innerHTML = `
      <div id="profile-header-wrap">
        ${profileHeaderHtml(user, isOwn)}
      </div>
      <div class="posts-list" id="profile-posts">
        ${posts.length === 0
          ? `<div class="empty-state"><div class="empty-icon">📝</div><div class="empty-title">投稿がありません</div></div>`
          : posts.map(p => postCard(p)).join('')
        }
      </div>
    `;
  } catch (err) {
    toast(err.message, 'error');
    const main = document.getElementById('profile-main');
    if (main) main.innerHTML = `<div class="empty-state"><div class="empty-title text-danger">読み込みに失敗しました</div></div>`;
  }
}

function profileHeaderHtml(user, isOwn) {
  return `
    <div class="profile-header">
      ${avatarHtml(user.name, 'lg')}
      <div class="profile-info">
        <div class="profile-name">${esc(user.name)}</div>
        <div class="profile-email">${esc(user.email)}</div>
        ${user.profile ? `<div class="profile-bio">${esc(user.profile)}</div>` : ''}
        <div class="profile-stats">
          <div class="profile-stat"><strong>${user.post_count}</strong> 投稿</div>
        </div>
        ${isOwn ? `
          <div class="profile-edit-btn">
            <button class="btn btn-outline" onclick="showProfileEditForm()">
              プロフィール編集
            </button>
            <button class="btn btn-ghost" onclick="logout()" style="margin-left:8px">ログアウト</button>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function showProfileEditForm() {
  const wrap = document.getElementById('profile-header-wrap');
  if (!wrap) return;

  const rawName = (_me && _me.name) || '';
  const rawProfile = (_me && _me.profile) || '';

  wrap.innerHTML += `
    <div class="profile-edit-form" id="profile-edit-form">
      <div class="form-group">
        <label class="form-label" for="edit-name">名前</label>
        <input class="form-input" type="text" id="edit-name" value="${esc(rawName)}" required />
      </div>
      <div class="form-group">
        <label class="form-label" for="edit-bio">自己紹介</label>
        <textarea class="form-input" id="edit-bio" rows="3" placeholder="自己紹介を入力…">${esc(rawProfile)}</textarea>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-primary" onclick="saveProfile()">保存する</button>
        <button class="btn btn-outline" onclick="cancelProfileEdit()">キャンセル</button>
      </div>
    </div>
  `;

  document.getElementById('edit-name')?.focus();
}

function cancelProfileEdit() {
  const form = document.getElementById('profile-edit-form');
  if (form) form.remove();
}

async function saveProfile() {
  const nameEl = document.getElementById('edit-name');
  const bioEl = document.getElementById('edit-bio');
  if (!nameEl) return;

  const name = nameEl.value.trim();
  const profile = bioEl ? bioEl.value.trim() : '';

  if (!name) { toast('名前を入力してください', 'error'); return; }

  const btn = document.querySelector('#profile-edit-form .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = '保存中…'; }

  try {
    const updated = await api('PUT', '/users/me/profile', { name, profile });
    // Update local state
    _me = { ..._me, name: updated.name, profile: updated.profile };
    localStorage.setItem('user', JSON.stringify(_me));
    toast('プロフィールを更新しました', 'success');
    // Re-render profile header
    const wrap = document.getElementById('profile-header-wrap');
    if (wrap) wrap.innerHTML = profileHeaderHtml(updated, true);
  } catch (err) {
    toast(err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '保存する'; }
  }
}

/* ============================================================
   Init
   ============================================================ */
window.addEventListener('popstate', renderRoute);

document.addEventListener('DOMContentLoaded', () => {
  if (_token) {
    api('GET', '/auth/me').then(user => {
      _me = user;
      localStorage.setItem('user', JSON.stringify(user));
    }).catch(() => logout());
  }
  renderRoute();
});
