/* ============================================================
   router.js — ハッシュベース SPAルーター
   ============================================================ */

const Router = (() => {
  const routes = {};
  let _current = null;

  function register(path, handler) {
    routes[path] = handler;
  }

  function navigate(path) {
    window.location.hash = path;
  }

  function getCurrentRoute() {
    const hash = window.location.hash.replace(/^#/, '') || '/tasks';
    const [path, ...rest] = hash.split('/').filter(Boolean);
    const base = path ? `/${path}` : '/tasks';
    const segments = rest;
    return { base, segments, full: `/${[path, ...rest].join('/')}` };
  }

  async function render() {
    const { base, segments } = getCurrentRoute();

    // アクティブなナビアイテムを更新
    document.querySelectorAll('.sidebar-nav-item[data-route]').forEach(el => {
      const r = el.dataset.route;
      let active = false;
      if (el.dataset.project) {
        // サイドバーのプロジェクト個別アイテム: IDまで一致する場合のみ
        active = base === r && segments[0] === el.dataset.project;
      } else {
        active = base === r;
      }
      el.classList.toggle('active', active);
    });

    const pageEl = document.getElementById('page');
    if (!pageEl) return;

    pageEl.innerHTML = '<div class="loading"><div class="spinner"></div> 読み込み中…</div>';

    try {
      // サブルートを含むルートマッチング
      let handler = routes[base];

      if (handler) {
        await handler(segments);
      } else {
        pageEl.innerHTML = `<div class="empty-state"><div class="empty-icon">${Utils.icon('search', 40)}</div><div class="empty-title">ページが見つかりません</div></div>`;
      }
    } catch (e) {
      console.error('Router render error:', e);
      pageEl.innerHTML = `<div class="empty-state"><div class="empty-icon">${Utils.icon('alert-triangle', 40)}</div><div class="empty-title">エラーが発生しました</div><div class="empty-desc">${Utils.escapeHtml(e.message)}</div></div>`;
    }

    // Lucide アイコンを描画
    Utils.refreshIcons();
  }

  function init() {
    window.addEventListener('hashchange', render);
    render();
  }

  return { register, navigate, render, getCurrentRoute, init };
})();
