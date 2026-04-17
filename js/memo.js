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


/* ---- メモモジュール（ファイルブラウザ版） ---- */
const Memo = (() => {
  let _currentFilePath = null;
  let _expandedDirs = new Set(['']);  // ルートは常に展開
  let _selectedDir = null;           // 選択中のディレクトリ（nullで全表示）
  let _searchResults = null;         // 検索結果（nullで通常表示）

  const _debouncedSearch = Utils.debounce(async (q) => {
    if (!q) { _searchResults = null; _rerenderContent(); return; }
    try {
      _searchResults = await Api.searchFiles(q);
      _rerenderContent();
    } catch (e) {
      Toast.show('検索に失敗しました: ' + e.message, 'error');
    }
  }, 300);

  // ---- ファイルアイコン ----
  function fileIcon(ext) {
    const map = {
      '.md': 'file-text', '.txt': 'file-text',
      '.xlsx': 'table', '.xls': 'table', '.csv': 'table',
      '.pdf': 'file-text', '.doc': 'file', '.docx': 'file',
      '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image',
      '.zip': 'archive', '.rar': 'archive', '.7z': 'archive',
    };
    return map[ext] || 'file';
  }

  function isTextFile(ext) {
    return ext === '.md' || ext === '.txt';
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  // ---- ツリー構築 ----
  function buildTree(treeData) {
    const dirs = {};   // path -> { name, children: {}, files: [] }
    const root = { name: 'ルート', children: {}, files: [] };

    // ディレクトリを先に登録
    treeData.filter(e => e.isDir).forEach(e => {
      const parts = e.path.split('/');
      let cur = root;
      parts.forEach((p, i) => {
        if (!cur.children[p]) cur.children[p] = { name: p, children: {}, files: [], path: parts.slice(0, i + 1).join('/') };
        cur = cur.children[p];
      });
    });

    // ファイルを配置
    treeData.filter(e => !e.isDir).forEach(e => {
      const dir = e.dir || '';
      if (!dir) { root.files.push(e); return; }
      const parts = dir.split('/');
      let cur = root;
      parts.forEach((p, i) => {
        if (!cur.children[p]) cur.children[p] = { name: p, children: {}, files: [], path: parts.slice(0, i + 1).join('/') };
        cur = cur.children[p];
      });
      cur.files.push(e);
    });

    return root;
  }

  function renderTreeNode(node, depth, parentPath) {
    let html = '';
    const sortedDirs = Object.keys(node.children).sort();

    for (const key of sortedDirs) {
      const child = node.children[key];
      const dirPath = child.path || key;
      const isExpanded = _expandedDirs.has(dirPath);
      const isSelected = _selectedDir === dirPath;
      const indent = (depth + 1) * 16;
      const chevron = isExpanded ? 'chevron-down' : 'chevron-right';

      html += `
        <div class="memo-tree-item ${isSelected ? 'active' : ''}" style="padding-left:${indent}px"
             onclick="Memo._toggleDir('${Utils.escapeHtml(dirPath)}')"
             ondblclick="Memo._selectDir('${Utils.escapeHtml(dirPath)}')">
          <span style="display:inline-flex;align-items:center;gap:4px">
            ${Utils.icon(chevron, 14)} ${Utils.icon('folder', 14)}
            <span>${Utils.escapeHtml(child.name)}</span>
          </span>
        </div>
      `;

      if (isExpanded) {
        // 再帰的に子ディレクトリ描画
        html += renderTreeNode(child, depth + 1, dirPath);

        // ファイル描画
        for (const f of child.files.sort((a, b) => a.name.localeCompare(b.name))) {
          const fileIndent = (depth + 2) * 16;
          html += `
            <div class="memo-tree-item memo-tree-file" style="padding-left:${fileIndent}px"
                 onclick="Memo._openFile('${Utils.escapeHtml(f.path)}')" title="${Utils.escapeHtml(f.path)}">
              <span style="display:inline-flex;align-items:center;gap:4px">
                ${Utils.icon(fileIcon(f.ext), 14)}
                <span>${Utils.escapeHtml(f.name)}</span>
              </span>
            </div>
          `;
        }
      }
    }

    // ルート直下のファイル
    if (depth === 0) {
      for (const f of node.files.sort((a, b) => a.name.localeCompare(b.name))) {
        const fileIndent = 16;
        html += `
          <div class="memo-tree-item memo-tree-file" style="padding-left:${fileIndent}px"
               onclick="Memo._openFile('${Utils.escapeHtml(f.path)}')" title="${Utils.escapeHtml(f.path)}">
            <span style="display:inline-flex;align-items:center;gap:4px">
              ${Utils.icon(fileIcon(f.ext), 14)}
              <span>${Utils.escapeHtml(f.name)}</span>
            </span>
          </div>
        `;
      }
    }

    return html;
  }

  // ---- ファイルカード ----
  function renderFileCard(f) {
    const isText = isTextFile(f.ext);
    const clickAction = isText
      ? `Memo._openFile('${Utils.escapeHtml(f.path)}')`
      : `Memo._openExternal('${Utils.escapeHtml(f.path)}')`;

    const preview = isText && f.preview
      ? Utils.escapeHtml(f.preview.replace(/[#*`>\-_~\[\]()]/g, '').slice(0, 120))
      : '';

    return `
      <div class="card" style="cursor:pointer;transition:box-shadow 0.15s"
           onclick="${clickAction}"
           onmouseenter="this.style.boxShadow='var(--shadow-md)'"
           onmouseleave="this.style.boxShadow=''">
        <div class="card-body">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
            ${Utils.icon(fileIcon(f.ext), 16)}
            <span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">
              ${Utils.escapeHtml(f.name)}
            </span>
            ${!isText ? `<span class="badge" style="font-size:0.65rem">${Utils.escapeHtml(f.ext)}</span>` : ''}
          </div>
          ${isText && preview ? `
            <div style="font-size:0.8rem;color:var(--color-text-muted);height:3.6em;overflow:hidden;line-height:1.5">
              ${preview}
            </div>
          ` : !isText ? `
            <div style="font-size:0.8rem;color:var(--color-text-muted)">
              ${formatSize(f.size)} — クリックで開く
            </div>
          ` : `
            <div style="font-size:0.8rem;color:var(--color-text-muted);opacity:0.5;height:3.6em">
              <em>内容なし</em>
            </div>
          `}
        </div>
        ${f.modifiedAt ? `
          <div class="card-header" style="padding:6px 14px;border-top:1px solid var(--color-border);border-bottom:none;background:rgba(255,255,255,0.02)">
            <span style="font-size:0.72rem;color:var(--color-text-muted)">
              ${f.dir ? Utils.escapeHtml(f.dir) + '/' : ''}
            </span>
            <span style="font-size:0.72rem;color:var(--color-text-muted)">
              ${Utils.formatDate(f.modifiedAt)}
            </span>
          </div>
        ` : ''}
      </div>
    `;
  }

  // ---- 検索結果カード ----
  function renderSearchCard(r) {
    const isText = isTextFile(r.ext);
    const clickAction = isText
      ? `Memo._openFile('${Utils.escapeHtml(r.path)}')`
      : `Memo._openExternal('${Utils.escapeHtml(r.path)}')`;

    return `
      <div class="card" style="cursor:pointer;transition:box-shadow 0.15s"
           onclick="${clickAction}"
           onmouseenter="this.style.boxShadow='var(--shadow-md)'"
           onmouseleave="this.style.boxShadow=''">
        <div class="card-body">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
            ${Utils.icon(fileIcon(r.ext), 16)}
            <span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">
              ${Utils.escapeHtml(r.name)}
            </span>
            <span class="badge badge-${r.matchType === 'filename' ? 'info' : 'warning'}" style="font-size:0.65rem">
              ${r.matchType === 'filename' ? 'ファイル名' : '内容'}
            </span>
          </div>
          <div style="font-size:0.75rem;color:var(--color-text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${Utils.escapeHtml(r.path)}
          </div>
          ${r.matchLine ? `
            <div style="font-size:0.78rem;color:var(--color-text);margin-top:4px;padding:4px 8px;background:var(--color-bg);border-radius:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              ${Utils.escapeHtml(r.matchLine)}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  // ---- コンテンツエリア再描画 ----
  function _rerenderContent() {
    const container = document.getElementById('memo-content-area');
    if (!container) return;

    if (_searchResults !== null) {
      // 検索結果表示
      if (_searchResults.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">${Utils.icon('search', 40)}</div>
            <div class="empty-title">検索結果がありません</div>
          </div>
        `;
      } else {
        container.innerHTML = `
          <div style="margin-bottom:8px;font-size:0.8rem;color:var(--color-text-muted)">${_searchResults.length} 件の結果</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">
            ${_searchResults.map(r => renderSearchCard(r)).join('')}
          </div>
        `;
      }
      Utils.refreshIcons();
      return;
    }

    const treeData = Store.getFileTree();
    const files = treeData.filter(e => !e.isDir);

    // ディレクトリフィルタ
    let filtered = files;
    if (_selectedDir !== null) {
      filtered = files.filter(f => (f.dir || '') === _selectedDir);
    }

    // 更新日時でソート
    filtered.sort((a, b) => new Date(b.modifiedAt || 0) - new Date(a.modifiedAt || 0));

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">${Utils.icon('folder-open', 40)}</div>
          <div class="empty-title">${_selectedDir !== null ? 'このフォルダは空です' : 'ファイルがありません'}</div>
          <div class="empty-desc">「+ 新規メモ」からMarkdownファイルを作成できます</div>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">
          ${filtered.map(f => renderFileCard(f)).join('')}
        </div>
      `;
    }
    Utils.refreshIcons();
  }

  // ---- メモ一覧ページ ----
  async function renderList() {
    const page = document.getElementById('page');
    if (Store.isFileTreeStale()) await Store.refreshFileTree();
    const treeData = Store.getFileTree();
    const tree = buildTree(treeData);

    _searchResults = null;
    _selectedDir = null;

    page.innerHTML = `
      <style>
        .memo-tree-item { padding:4px 8px;cursor:pointer;font-size:0.82rem;border-radius:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis }
        .memo-tree-item:hover { background:var(--color-bg-hover,rgba(255,255,255,0.06)) }
        .memo-tree-item.active { background:var(--color-primary-light,rgba(99,102,241,0.15));color:var(--color-primary) }
        .memo-tree-file { opacity:0.85 }
        .memo-tree-file:hover { opacity:1 }
      </style>
      <div class="page-header">
        <h2 class="page-title">${Utils.icon('folder-open', 20)} メモ</h2>
        <div class="page-actions" style="display:flex;align-items:center;gap:8px">
          <div style="position:relative">
            <input type="text" id="memo-search" class="form-control" placeholder="検索..."
                   style="width:220px;padding-left:32px;font-size:0.85rem"
                   oninput="Memo._onSearch(this.value)">
            <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);opacity:0.4">${Utils.icon('search', 14)}</span>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="Memo._refresh()" title="更新">${Utils.icon('refresh-cw', 16)}</button>
          <button class="btn btn-primary" onclick="Memo._showCreateModal()">+ 新規メモ</button>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:240px 1fr;gap:16px;min-height:calc(100vh - 140px)">
        <!-- ツリービュー -->
        <div class="card" style="overflow-y:auto;max-height:calc(100vh - 140px)">
          <div style="padding:8px">
            <div class="memo-tree-item ${_selectedDir === null ? 'active' : ''}" style="padding-left:8px;font-weight:600"
                 onclick="Memo._selectDir(null)">
              <span style="display:inline-flex;align-items:center;gap:4px">
                ${Utils.icon('home', 14)} すべてのファイル
              </span>
            </div>
            ${renderTreeNode(tree, 0, '')}
          </div>
        </div>
        <!-- ファイルカード -->
        <div id="memo-content-area"></div>
      </div>
    `;

    _rerenderContent();
    Utils.refreshIcons();
  }

  // ---- ファイルエディタ ----
  async function renderDetail(segments) {
    const filePath = decodeURIComponent(segments.join('/'));
    if (!filePath) { renderList(); return; }

    _currentFilePath = filePath;
    const page = document.getElementById('page');

    // ファイルを読み込み
    let fileData;
    try {
      fileData = await Store.readFile(filePath);
    } catch (e) {
      page.innerHTML = `
        <div class="page-header">
          <button class="btn btn-ghost btn-sm" onclick="Router.navigate('/memos')">← メモ一覧</button>
        </div>
        <div class="empty-state">
          <div class="empty-icon">${Utils.icon('alert-triangle', 40)}</div>
          <div class="empty-title">ファイルを開けません</div>
          <div class="empty-desc">${Utils.escapeHtml(e.message)}</div>
        </div>
      `;
      return;
    }

    const ext = fileData.ext || '';
    const isEditable = isTextFile(ext);
    const isMd = ext === '.md';

    if (!isEditable) {
      // 非テキストファイル
      page.innerHTML = `
        <div class="page-header">
          <button class="btn btn-ghost btn-sm" onclick="Router.navigate('/memos')">← メモ一覧</button>
          <h2 class="page-title" style="margin-left:8px">${Utils.icon(fileIcon(ext), 20)} ${Utils.escapeHtml(fileData.name)}</h2>
        </div>
        <div class="empty-state">
          <div class="empty-icon">${Utils.icon(fileIcon(ext), 48)}</div>
          <div class="empty-title">このファイルはブラウザで編集できません</div>
          <div class="empty-desc">${Utils.escapeHtml(fileData.name)} (${formatSize(fileData.size)})</div>
          <button class="btn btn-primary" onclick="Memo._openExternal('${Utils.escapeHtml(filePath)}')" style="margin-top:12px">
            ${Utils.icon('external-link', 16)} デフォルトアプリで開く
          </button>
        </div>
      `;
      return;
    }

    // テキストファイルエディタ
    page.innerHTML = `
      <div class="page-header">
        <div style="display:flex;align-items:center;gap:8px;flex:1">
          <button class="btn btn-ghost btn-sm" onclick="Router.navigate('/memos')">← メモ一覧</button>
          <span style="font-size:1rem;font-weight:600;color:var(--color-text)">
            ${Utils.icon(fileIcon(ext), 18)} ${Utils.escapeHtml(fileData.name)}
          </span>
          <span style="font-size:0.75rem;color:var(--color-text-muted)">${Utils.escapeHtml(filePath)}</span>
        </div>
        <div class="page-actions">
          <span id="memo-save-status" style="font-size:0.75rem;color:var(--color-text-light)"></span>
          <button class="btn btn-danger btn-sm" onclick="Memo._deleteFile('${Utils.escapeHtml(filePath)}')">${Utils.icon('trash-2')} 削除</button>
        </div>
      </div>

      ${isMd ? `
        <!-- Markdownツールバー -->
        <div class="card" style="margin-bottom:0;border-radius:var(--radius-md) var(--radius-md) 0 0;border-bottom:none">
          <div style="padding:8px 12px;display:flex;flex-wrap:wrap;gap:4px;align-items:center">
            ${renderToolbar()}
          </div>
        </div>
      ` : ''}

      <!-- エディタ本体 -->
      <div style="display:grid;grid-template-columns:${isMd ? '1fr 1fr' : '1fr'};height:calc(100vh - ${isMd ? '200' : '160'}px);border:1px solid var(--color-border);border-radius:${isMd ? '0 0 var(--radius-md) var(--radius-md)' : 'var(--radius-md)'};overflow:hidden">
        <div style="display:flex;flex-direction:column;${isMd ? 'border-right:1px solid var(--color-border)' : ''}">
          <div style="padding:6px 12px;font-size:0.72rem;font-weight:600;color:var(--color-text-muted);background:var(--color-bg);border-bottom:1px solid var(--color-border)">
            ${isMd ? 'Markdown 編集' : 'テキスト編集'}
          </div>
          <textarea id="memo-content" style="flex:1;padding:16px;border:none;outline:none;resize:none;font-family:var(--font-mono,'Courier New',monospace);font-size:0.875rem;line-height:1.7;color:var(--color-text);background:var(--color-card-bg)"
                    placeholder="${isMd ? 'Markdownで記述してください...' : 'テキストを入力...'}"
                    oninput="Memo._onInput()"></textarea>
        </div>
        ${isMd ? `
          <div style="display:flex;flex-direction:column">
            <div style="padding:6px 12px;font-size:0.72rem;font-weight:600;color:var(--color-text-muted);background:var(--color-bg);border-bottom:1px solid var(--color-border)">
              プレビュー
            </div>
            <div id="memo-preview" style="flex:1;padding:16px;overflow-y:auto;font-size:0.9rem;line-height:1.7;color:var(--color-text);word-break:break-word"></div>
          </div>
        ` : ''}
      </div>
    `;

    // テキストエリアに内容をセット
    const textarea = document.getElementById('memo-content');
    if (textarea) {
      textarea.value = fileData.content || '';
    }
    if (isMd) _updatePreview();
    Utils.refreshIcons();
  }

  // ---- ツールバー ----
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

  // ---- エディタ操作 ----
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
    Utils.refreshIcons();
  }

  const _autoSave = Utils.debounce(async () => {
    if (!_currentFilePath) return;
    const content = document.getElementById('memo-content')?.value || '';
    const status  = document.getElementById('memo-save-status');

    try {
      if (status) status.textContent = '保存中…';
      await Store.saveFile(_currentFilePath, content);
      if (status) status.textContent = '保存済み ✓';
      setTimeout(() => { if (status) status.textContent = ''; }, 2000);
    } catch (e) {
      if (status) status.textContent = '保存失敗 ✗';
    }
  }, 800);

  function _scheduleAutoSave() { _autoSave(); }

  // ---- アクション ----
  function _openFile(path) {
    const ext = (path.match(/\.[^.]+$/) || [''])[0].toLowerCase();
    if (isTextFile(ext)) {
      Router.navigate('/memos/' + encodeURIComponent(path));
    } else {
      _openExternal(path);
    }
  }

  async function _openExternal(path) {
    try {
      await Store.openFile(path);
    } catch (e) {
      Toast.show('ファイルを開けませんでした: ' + e.message, 'error');
    }
  }

  function _toggleDir(dirPath) {
    if (_expandedDirs.has(dirPath)) {
      _expandedDirs.delete(dirPath);
    } else {
      _expandedDirs.add(dirPath);
    }
    _selectedDir = dirPath;
    // ツリーとカードを再描画
    renderList();
  }

  function _selectDir(dirPath) {
    _selectedDir = dirPath;
    _rerenderContent();
    // ツリーのアクティブ状態更新
    document.querySelectorAll('.memo-tree-item').forEach(el => el.classList.remove('active'));
    if (dirPath === null) {
      const homeItem = document.querySelector('.memo-tree-item[onclick*="null"]');
      if (homeItem) homeItem.classList.add('active');
    }
  }

  function _onSearch(value) {
    const q = value.trim();
    _debouncedSearch(q);
  }

  async function _refresh() {
    try {
      await Store.refreshFileTree();
      _searchResults = null;
      renderList();
      Toast.show('更新しました', 'success');
    } catch (e) {
      Toast.show('更新に失敗しました: ' + e.message, 'error');
    }
  }

  // ---- 新規メモ作成モーダル ----
  function _showCreateModal() {
    const treeData = Store.getFileTree();
    const dirs = treeData.filter(e => e.isDir).map(e => e.path).sort();

    const now = new Date();
    const defaultName = `memo-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}.md`;

    const dirOptions = dirs.map(d => `<option value="${Utils.escapeHtml(d)}"${_selectedDir === d ? ' selected' : ''}>${Utils.escapeHtml(d)}</option>`).join('');

    Modal.open('新規メモ作成', `
      <div style="display:flex;flex-direction:column;gap:12px">
        <div>
          <label style="font-size:0.85rem;font-weight:600;display:block;margin-bottom:4px">ファイル名</label>
          <input type="text" id="new-memo-name" class="form-control" value="${Utils.escapeHtml(defaultName)}" placeholder="ファイル名.md">
        </div>
        <div>
          <label style="font-size:0.85rem;font-weight:600;display:block;margin-bottom:4px">保存先フォルダ</label>
          <select id="new-memo-dir" class="form-control">
            <option value="">ルート</option>
            ${dirOptions}
          </select>
        </div>
      </div>
    `, `
      <button class="btn btn-ghost" onclick="Modal.close()">キャンセル</button>
      <button class="btn btn-primary" onclick="Memo._doCreate()">作成</button>
    `);
  }

  async function _doCreate() {
    const name = document.getElementById('new-memo-name')?.value?.trim();
    const dir  = document.getElementById('new-memo-dir')?.value || '';

    if (!name) { Toast.show('ファイル名を入力してください', 'warning'); return; }

    // .md 拡張子を自動付与
    const fileName = name.endsWith('.md') ? name : name + '.md';
    const path = dir ? `${dir}/${fileName}` : fileName;

    try {
      Modal.close();
      await Store.createFile(path, `# ${fileName.replace(/\.md$/, '')}\n\n`);
      await Store.refreshFileTree();
      Router.navigate('/memos/' + encodeURIComponent(path));
      Toast.show('メモを作成しました', 'success');
    } catch (e) {
      Toast.show('作成に失敗しました: ' + e.message, 'error');
    }
  }

  async function _deleteFile(path) {
    const ok = await Modal.confirm(`「${path}」を削除しますか？`);
    if (!ok) return;
    try {
      await Store.deleteFile(path);
      Toast.show('ファイルを削除しました', 'success');
      Router.navigate('/memos');
    } catch (e) {
      Toast.show('削除に失敗しました: ' + e.message, 'error');
    }
  }

  return {
    renderList, renderDetail,
    _toggleDir, _selectDir, _openFile, _openExternal,
    _onSearch, _refresh, _showCreateModal, _doCreate, _deleteFile,
    _insertMarkdown, _onInput, _scheduleAutoSave
  };
})();
