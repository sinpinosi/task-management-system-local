/* ============================================================
   utils.js — 汎用ユーティリティ
   ============================================================ */

const Utils = (() => {

  // ---- 日付フォーマット ----
  function formatDate(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d)) return isoStr;
    return d.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  function formatDatetime(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d)) return isoStr;
    return d.toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function formatRelative(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    const now = new Date();
    const diff = d - now; // ms
    const absDiff = Math.abs(diff);
    const mins = Math.floor(absDiff / 60000);
    const hours = Math.floor(absDiff / 3600000);
    const days = Math.floor(absDiff / 86400000);

    if (diff < 0) {
      if (mins < 60) return `${mins}分前`;
      if (hours < 24) return `${hours}時間前`;
      return `${days}日前`;
    } else {
      if (mins < 60) return `${mins}分後`;
      if (hours < 24) return `${hours}時間後`;
      return `${days}日後`;
    }
  }

  function isOverdue(dueDateStr) {
    if (!dueDateStr) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDateStr);
    return due < today;
  }

  function isDueSoon(dueDateStr, days = 3) {
    if (!dueDateStr) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDateStr);
    const diff = (due - today) / 86400000;
    return diff >= 0 && diff <= days;
  }

  function toDatetimeLocal(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d)) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // ---- XSS防止 ----
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ---- debounce ----
  function debounce(fn, ms) {
    let timer;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  // ---- 配列ソート ----
  function sortBy(arr, key, dir = 'asc') {
    return [...arr].sort((a, b) => {
      const av = a[key] ?? '';
      const bv = b[key] ?? '';
      let cmp = 0;
      if (typeof av === 'string') cmp = av.localeCompare(bv, 'ja');
      else cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return dir === 'asc' ? cmp : -cmp;
    });
  }

  // ---- ステータス・優先度ラベル ----
  const STATUS_LABELS = {
    open: '未着手',
    in_progress: '進行中',
    resolved: '解決済',
    closed: 'クローズ'
  };

  const PRIORITY_LABELS = {
    low: '低',
    normal: '普通',
    high: '高',
    urgent: '緊急'
  };

  const PRIORITY_ORDER = { urgent: 0, high: 1, normal: 2, low: 3 };

  function statusLabel(s) { return STATUS_LABELS[s] || s; }
  function priorityLabel(p) { return PRIORITY_LABELS[p] || p; }

  // ---- タグ文字列 → 配列 ----
  function parseTags(str) {
    if (!str) return [];
    return str.split(/[,、，\s]+/).map(t => t.trim()).filter(Boolean);
  }

  // ---- Lucide アイコンヘルパー ----
  function icon(name, size = 16) {
    return `<i data-lucide="${name}" style="width:${size}px;height:${size}px"></i>`;
  }

  // ---- Lucide アイコン再描画 ----
  function refreshIcons(root) {
    if (typeof lucide !== 'undefined') {
      lucide.createIcons(root ? { nameAttr: 'data-lucide', root } : undefined);
    }
  }

  return {
    formatDate, formatDatetime, formatRelative,
    isOverdue, isDueSoon, toDatetimeLocal,
    escapeHtml, debounce, sortBy,
    statusLabel, priorityLabel, parseTags,
    STATUS_LABELS, PRIORITY_LABELS, PRIORITY_ORDER,
    icon, refreshIcons
  };
})();

/* ============================================================
   Modal — モーダルダイアログ
   ============================================================ */
const Modal = (() => {
  let _overlay, _box;

  function _init() {
    if (_overlay) return;
    _overlay = document.getElementById('modal-overlay');
    _box     = document.getElementById('modal-box');
    _overlay.addEventListener('click', e => {
      if (e.target === _overlay) close();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !_overlay.classList.contains('hidden')) close();
    });
  }

  function open(title, bodyHtml, footerHtml = '') {
    _init();
    _box.innerHTML = `
      <div class="modal-header">
        <span class="modal-title">${Utils.escapeHtml(title)}</span>
        <button class="modal-close" onclick="Modal.close()"><i data-lucide="x" style="width:18px;height:18px"></i></button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
      ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
    `;
    _overlay.classList.remove('hidden');
    Utils.refreshIcons(_box);
    const first = _box.querySelector('input, select, textarea');
    if (first) setTimeout(() => first.focus(), 50);
  }

  function close() {
    _init();
    _overlay.classList.add('hidden');
    _box.innerHTML = '';
  }

  function confirm(message, { confirmLabel = '削除する', confirmClass = 'btn-danger' } = {}) {
    return new Promise(resolve => {
      _init();
      _box.innerHTML = `
        <div class="modal-header">
          <span class="modal-title">確認</span>
          <button class="modal-close" onclick="Modal.close()"><i data-lucide="x" style="width:18px;height:18px"></i></button>
        </div>
        <div class="modal-body">
          <p class="confirm-message">${Utils.escapeHtml(message)}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="confirm-no">キャンセル</button>
          <button class="btn ${confirmClass}" id="confirm-yes">${Utils.escapeHtml(confirmLabel)}</button>
        </div>
      `;
      _overlay.classList.remove('hidden');
      document.getElementById('confirm-yes').onclick = () => { close(); resolve(true); };
      document.getElementById('confirm-no').onclick  = () => { close(); resolve(false); };
    });
  }

  return { open, close, confirm };
})();

/* ============================================================
   Toast — トースト通知
   ============================================================ */
const Toast = (() => {
  function show(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity 0.3s, transform 0.3s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      setTimeout(() => el.remove(), 300);
    }, duration);
  }

  return { show };
})();
