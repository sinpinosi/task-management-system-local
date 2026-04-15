/* ============================================================
   memo.js — メモ管理 + Markdownパーサー + エディタUI
   ============================================================ */

/* ---- Markdownパーサー（外部ライブラリ不使用） ---- */
const MarkdownParser = (() => {
  let _placeholders = {};
  let _phIdx = 0;

  function placeholder(content) {
    const key = `\x00PH${_phIdx++}\x00`;
    _placeholders[key] = content;
    return key;
  }

  function restorePlaceholders(str) {
    return str.replace(/\x00PH\d+\x00/g, m => _placeholders[m] || m);
  }

  function parse(raw) {
    if (!raw) return '';
    _placeholders = {};
    _phIdx = 0;

    let text = raw;

    // 1. コードブロック（``` ）を保護
    text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      const escaped = Utils.escapeHtml(code.replace(/^\n|\n$/g, ''));
      const cls = lang ? ` class="language-${Utils.escapeHtml(lang)}"` : '';
      return placeholder(`<pre><code${cls}>${escaped}</code></pre>`);
    });

    // 2. インラインコード（` `）を保護
    text = text.replace(/`([^`]+)`/g, (_, code) =>
      placeholder(`<code style="background:var(--color-bg);padding:1px 5px;border-radius:3px;font-family:var(--font-mono,monospace);font-size:0.9em">${Utils.escapeHtml(code)}</code>`)
    );

    // 3. HTMLエスケープ（コードブロック以外）
    // すでにプレースホルダーに変換済みなので残りの文字をエスケープ
    text = text.split(/(\x00PH\d+\x00)/).map((part, i) => {
      if (i % 2 === 0) return Utils.escapeHtml(part);
      return part; // プレースホルダーはそのまま
    }).join('');

    // 4. ヘッダー
    text = text.replace(/^#{6}\s+(.+)$/gm, '<h6>$1</h6>');
    text = text.replace(/^#{5}\s+(.+)$/gm, '<h5>$1</h5>');
    text = text.replace(/^#{4}\s+(.+)$/gm, '<h4>$1</h4>');
    text = text.replace(/^###\s+(.+)$/gm, '<h3 style="font-size:1.1rem;font-weight:700;margin:14px 0 6px">$1</h3>');
    text = text.replace(/^##\s+(.+)$/gm,  '<h2 style="font-size:1.2rem;font-weight:700;margin:16px 0 8px">$1</h2>');
    text = text.replace(/^#\s+(.+)$/gm,   '<h1 style="font-size:1.4rem;font-weight:700;margin:18px 0 10px">$1</h1>');

    // 5. 太字
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__(.+?)__/g,     '<strong>$1</strong>');

    // 6. 斜体
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    text = text.replace(/_([^_]+)_/g,   '<em>$1</em>');

    // 7. 打ち消し線
    text = text.replace(/~~(.+?)~~/g, '<del>$1</del>');

    // 8. リンク
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener" style="color:var(--color-primary)">$1</a>');

    // 9. 水平線
    text = text.replace(/^---+$/gm, '<hr style="border:none;border-top:1px solid var(--color-border);margin:16px 0">');

    // 10. 引用
    text = text.replace(/(^&gt;.+\n?)+/gm, match => {
      const inner = match.replace(/^&gt;\s?/gm, '').trim();
      return `<blockquote style="border-left:4px solid var(--color-primary);padding:8px 12px;margin:8px 0;background:var(--color-primary-light);border-radius:0 4px 4px 0;color:var(--color-text)">${inner}</blockquote>\n`;
    });

    // 11. 順序なしリスト
    text = processLists(text, /^[*\-]\s+(.+)$/gm, 'ul');

    // 12. 順序ありリスト
    text = processOrderedLists(text);

    // 13. チェックボックス（GFM風）
    text = text.replace(/^<li>\[x\]\s+/gm, '<li style="list-style:none"><span style="color:var(--color-success)"><i data-lucide="check-square" style="width:14px;height:14px"></i></span> ');
    text = text.replace(/^<li>\[ \]\s+/gm, '<li style="list-style:none"><span style="opacity:0.4"><i data-lucide="square" style="width:14px;height:14px"></i></span> ');

    // 14. 段落・改行
    // ブロック要素で分割して残りを段落化
    text = text.split(/\n{2,}/).map(block => {
      block = block.trim();
      if (!block) return '';
      // すでにブロックHTMLタグで始まっている場合はそのまま
      if (/^<(h[1-6]|ul|ol|li|blockquote|pre|hr)/.test(block)) return block;
      // プレースホルダーのみの行はそのまま
      if (/^\x00PH\d+\x00$/.test(block)) return block;
      // 改行を<br>に
      const inner = block.replace(/\n/g, '<br>');
      return `<p style="margin:0 0 10px;line-height:1.7">${inner}</p>`;
    }).join('\n');

    // 15. プレースホルダーを復元
    text = restorePlaceholders(text);

    return text;
  }

  function processLists(text, pattern, tag) {
    // 連続するリストアイテムをulでラップ
    return text.replace(/(^[*\-]\s+.+\n?)+/gm, match => {
      const items = match.trim().split('\n').map(line => {
        const m = line.match(/^[*\-]\s+(.+)$/);
        return m ? `<li>${m[1]}</li>` : '';
      }).filter(Boolean).join('');
      return `<ul style="padding-left:1.5em;margin:8px 0">${items}</ul>\n`;
    });
  }

  function processOrderedLists(text) {
    return text.replace(/(^\d+\.\s+.+\n?)+/gm, match => {
      const items = match.trim().split('\n').map(line => {
        const m = line.match(/^\d+\.\s+(.+)$/);
        return m ? `<li>${m[1]}</li>` : '';
      }).filter(Boolean).join('');
      return `<ol style="padding-left:1.5em;margin:8px 0">${items}</ol>\n`;
    });
  }

  return { parse };
})();


/* ---- メモモジュール ---- */
const Memo = (() => {
  let _autoSaveTimer = null;
  let _currentMemoId = null;

  // ---- メモ一覧ページ ----
  async function renderList() {
    const page = document.getElementById('page');
    if (Store.isMemosStale()) await Store.refreshMemos();
    const memos = Store.getMemos().sort((a, b) =>
      new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
    );

    page.innerHTML = `
      <div class="page-header">
        <h2 class="page-title">${Utils.icon('file-text', 20)} メモ</h2>
        <div class="page-actions">
          <button class="btn btn-primary" onclick="Memo._createNew()">+ 新規メモ</button>
        </div>
      </div>
      ${memos.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">${Utils.icon('file-text', 40)}</div>
          <div class="empty-title">メモがありません</div>
          <div class="empty-desc">「新規メモ」から作成してください</div>
        </div>
      ` : `
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">
          ${memos.map(m => renderMemoCard(m)).join('')}
        </div>
      `}
    `;
  }

  function renderMemoCard(m) {
    const preview = (m.content || '').replace(/[#*`>\-_~\[\]()]/g, '').slice(0, 120);
    return `
      <div class="card" style="cursor:pointer;transition:box-shadow 0.15s"
           onclick="Router.navigate('/memos/${m.id}')"
           onmouseenter="this.style.boxShadow='var(--shadow-md)'"
           onmouseleave="this.style.boxShadow=''">
        <div class="card-body">
          <div style="font-weight:600;margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${Utils.escapeHtml(m.title || '無題')}
          </div>
          <div style="font-size:0.8rem;color:var(--color-text-muted);height:3.6em;overflow:hidden;line-height:1.5">
            ${Utils.escapeHtml(preview) || '<em style="opacity:0.5">内容なし</em>'}
          </div>
        </div>
        <div class="card-header" style="padding:8px 14px;border-top:1px solid var(--color-border);border-bottom:none;background:rgba(255,255,255,0.02)">
          <span style="font-size:0.72rem;color:var(--color-text-muted)">
            ${Utils.formatDate(m.updatedAt || m.createdAt)}
          </span>
          <button class="btn btn-ghost btn-sm btn-icon" onclick="event.stopPropagation();Memo._delete('${m.id}')" title="削除">${Utils.icon('trash-2')}</button>
        </div>
      </div>
    `;
  }

  // ---- メモエディタ ----
  async function renderDetail(segments) {
    const id = segments[0];
    if (!id) { renderList(); return; }

    let memo = Store.getMemoById(id);
    if (!memo) {
      // APIから再取得
      await Store.refreshMemos();
      memo = Store.getMemoById(id);
    }
    if (!memo) { Router.navigate('/memos'); return; }

    _currentMemoId = id;
    const page = document.getElementById('page');

    page.innerHTML = `
      <div class="page-header">
        <div style="display:flex;align-items:center;gap:8px;flex:1">
          <button class="btn btn-ghost btn-sm" onclick="Router.navigate('/memos')">← メモ一覧</button>
          <input type="text" id="memo-title" class="form-control"
                 value="${Utils.escapeHtml(memo.title || '')}"
                 placeholder="タイトル"
                 style="font-size:1rem;font-weight:600;border:none;background:transparent;box-shadow:none;flex:1"
                 oninput="Memo._scheduleAutoSave()">
        </div>
        <div class="page-actions">
          <span id="memo-save-status" style="font-size:0.75rem;color:var(--color-text-light)"></span>
          <button class="btn btn-danger btn-sm" onclick="Memo._delete('${id}')">${Utils.icon('trash-2')} 削除</button>
        </div>
      </div>

      <!-- ツールバー -->
      <div class="card" style="margin-bottom:0;border-radius:var(--radius-md) var(--radius-md) 0 0;border-bottom:none">
        <div style="padding:8px 12px;display:flex;flex-wrap:wrap;gap:4px;align-items:center">
          ${renderToolbar()}
        </div>
      </div>

      <!-- エディタ本体（分割ビュー） -->
      <div style="display:grid;grid-template-columns:1fr 1fr;height:calc(100vh - 200px);border:1px solid var(--color-border);border-radius:0 0 var(--radius-md) var(--radius-md);overflow:hidden">
        <div style="display:flex;flex-direction:column;border-right:1px solid var(--color-border)">
          <div style="padding:6px 12px;font-size:0.72rem;font-weight:600;color:var(--color-text-muted);background:var(--color-bg);border-bottom:1px solid var(--color-border)">
            Markdown 編集
          </div>
          <textarea id="memo-content" style="flex:1;padding:16px;border:none;outline:none;resize:none;font-family:var(--font-mono,'Courier New',monospace);font-size:0.875rem;line-height:1.7;color:var(--color-text);background:var(--color-card-bg)"
                    placeholder="Markdownで記述してください..."
                    oninput="Memo._onInput()">${Utils.escapeHtml(memo.content || '')}</textarea>
        </div>
        <div style="display:flex;flex-direction:column">
          <div style="padding:6px 12px;font-size:0.72rem;font-weight:600;color:var(--color-text-muted);background:var(--color-bg);border-bottom:1px solid var(--color-border)">
            プレビュー
          </div>
          <div id="memo-preview" style="flex:1;padding:16px;overflow-y:auto;font-size:0.9rem;line-height:1.7;color:var(--color-text);word-break:break-word">
            ${MarkdownParser.parse(memo.content || '')}
          </div>
        </div>
      </div>
    `;

    // テキストエリアのHTMLエンティティを元に戻す
    document.getElementById('memo-content').value = memo.content || '';
    _updatePreview();
  }

  function renderToolbar() {
    const tools = [
      { label: '<strong>B</strong>', before: '**', after: '**', title: '太字' },
      { label: '<em>I</em>',         before: '*',  after: '*',  title: '斜体' },
      { label: '<del>S</del>',       before: '~~', after: '~~', title: '打ち消し' },
      null,
      { label: 'H1', before: '# ',  after: '',    title: '見出し1', block: true },
      { label: 'H2', before: '## ', after: '',    title: '見出し2', block: true },
      { label: 'H3', before: '### ',after: '',    title: '見出し3', block: true },
      null,
      { label: '≡', before: '- ',   after: '',    title: 'リスト', block: true },
      { label: '1.', before: '1. ', after: '',    title: '番号リスト', block: true },
      null,
      { label: '&ldquo;', before: '> ', after: '', title: '引用', block: true },
      { label: '`', before: '`',    after: '`',   title: 'コード' },
      { label: '```', before: '```\n', after: '\n```', title: 'コードブロック', block: true },
      null,
      { label: '—', before: '\n---\n', after: '', title: '水平線', block: true },
      { label: '<i data-lucide="link" style="width:14px;height:14px"></i>', before: '[', after: '](url)', title: 'リンク' },
    ];

    return tools.map((t, i) => {
      if (!t) return `<span style="width:1px;height:20px;background:var(--color-border);margin:0 2px"></span>`;
      const dataAttrs = `data-before="${Utils.escapeHtml(t.before)}" data-after="${Utils.escapeHtml(t.after)}" ${t.block ? 'data-block="1"' : ''}`;
      return `<button class="btn btn-ghost btn-sm" title="${Utils.escapeHtml(t.title)}" ${dataAttrs}
                      onclick="Memo._insertMarkdown(this)">${t.label}</button>`;
    }).join('');
  }

  function _insertMarkdown(btn) {
    const textarea = document.getElementById('memo-content');
    if (!textarea) return;

    const before = btn.dataset.before || '';
    const after  = btn.dataset.after  || '';
    const isBlock = !!btn.dataset.block;

    const start = textarea.selectionStart;
    const end   = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end);
    const val = textarea.value;

    let newText, newStart, newEnd;

    if (isBlock) {
      // ブロック要素: 行頭に挿入
      const lineStart = val.lastIndexOf('\n', start - 1) + 1;
      const lineEnd   = val.indexOf('\n', end);
      const line = lineEnd < 0 ? val.slice(lineStart) : val.slice(lineStart, lineEnd);
      const replaced = before + (selected || line);
      newText = val.slice(0, lineStart) + replaced + (lineEnd < 0 ? '' : val.slice(lineEnd));
      newStart = lineStart + before.length;
      newEnd   = newStart + (selected || line).length;
    } else {
      newText = val.slice(0, start) + before + selected + after + val.slice(end);
      newStart = start + before.length;
      newEnd   = newStart + selected.length;
    }

    textarea.value = newText;
    textarea.setSelectionRange(newStart, newEnd);
    textarea.focus();
    _onInput();
  }

  function _onInput() {
    _updatePreview();
    _scheduleAutoSave();
  }

  function _updatePreview() {
    const textarea = document.getElementById('memo-content');
    const preview  = document.getElementById('memo-preview');
    if (!textarea || !preview) return;
    preview.innerHTML = MarkdownParser.parse(textarea.value);
  }

  const _autoSave = Utils.debounce(async () => {
    if (!_currentMemoId) return;
    const title   = document.getElementById('memo-title')?.value?.trim() || '無題';
    const content = document.getElementById('memo-content')?.value || '';
    const status  = document.getElementById('memo-save-status');

    try {
      if (status) status.textContent = '保存中…';
      await Store.updateMemo(_currentMemoId, { title, content });
      if (status) status.textContent = '保存済み ✓';
      setTimeout(() => { if (status) status.textContent = ''; }, 2000);
    } catch (e) {
      if (status) status.textContent = '保存失敗 ✗';
    }
  }, 800);

  function _scheduleAutoSave() { _autoSave(); }

  async function _createNew() {
    try {
      const memo = await Store.createMemo({ title: '無題', content: '' });
      Router.navigate(`/memos/${memo.id}`);
    } catch (e) {
      Toast.show('作成に失敗しました: ' + e.message, 'error');
    }
  }

  async function _delete(id) {
    const ok = await Modal.confirm('このメモを削除しますか？');
    if (!ok) return;
    try {
      await Store.deleteMemo(id);
      Toast.show('メモを削除しました', 'success');
      Router.navigate('/memos');
    } catch (e) {
      Toast.show('削除に失敗しました: ' + e.message, 'error');
    }
  }

  return {
    renderList, renderDetail,
    _createNew, _delete,
    _insertMarkdown, _onInput, _scheduleAutoSave
  };
})();
