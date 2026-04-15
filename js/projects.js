/* ============================================================
   projects.js — プロジェクト管理
   ============================================================ */

const Projects = (() => {
  const PRESET_COLORS = [
    '#3b82f6','#ef4444','#22c55e','#f59e0b','#8b5cf6',
    '#ec4899','#06b6d4','#f97316','#10b981','#6366f1'
  ];

  // ---- サイドバー描画 ----
  function renderSidebar() {
    const el = document.getElementById('sidebar-projects');
    if (!el) return;
    const projects = Store.getProjects();
    if (!projects.length) {
      el.innerHTML = `<div style="padding:4px 16px;font-size:0.75rem;opacity:0.4;">プロジェクトなし</div>`;
      return;
    }
    el.innerHTML = projects.map(p => `
      <div class="sidebar-nav-item" data-route="/projects" data-project="${p.id}"
           onclick="Router.navigate('/projects/${p.id}')">
        <span class="project-dot" style="background:${Utils.escapeHtml(p.color || '#3b82f6')}"></span>
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${Utils.escapeHtml(p.name)}</span>
      </div>
    `).join('');
  }

  function _filterByProject(projectId) {
    Filters.setState({ projectId });
    Router.navigate('/tasks');
  }

  // ---- プロジェクト一覧ページ ----
  async function renderList() {
    const page = document.getElementById('page');
    const projects = Store.getProjects();

    page.innerHTML = `
      <div class="page-header">
        <h2 class="page-title">プロジェクト</h2>
        <div class="page-actions">
          <button class="btn btn-primary" onclick="Projects.openModal()">+ 新規プロジェクト</button>
        </div>
      </div>
      ${projects.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">${Utils.icon('folder-open', 40)}</div>
          <div class="empty-title">プロジェクトがありません</div>
          <div class="empty-desc">「新規プロジェクト」から作成してください</div>
        </div>
      ` : `
        <div class="project-grid" id="project-grid">
          ${projects.map(p => renderCard(p)).join('')}
        </div>
      `}
    `;
  }

  function renderCard(p) {
    const taskCount = Store.getTasks().filter(t => t.projectId === p.id).length;
    return `
      <div class="project-card" onclick="Router.navigate('/projects/${p.id}')">
        <div class="project-card-top" style="background:${Utils.escapeHtml(p.color || '#3b82f6')}"></div>
        <div class="project-card-body">
          <div class="project-card-name">${Utils.escapeHtml(p.name)}</div>
          ${p.description ? `<div class="project-card-desc">${Utils.escapeHtml(p.description)}</div>` : ''}
        </div>
        <div class="project-card-footer">
          <span>タスク ${taskCount}件</span>
          <div onclick="event.stopPropagation()" style="display:flex;gap:4px">
            <button class="btn btn-ghost btn-sm btn-icon" onclick="Projects.openModal('${p.id}')" title="編集">${Utils.icon('pencil')}</button>
            <button class="btn btn-ghost btn-sm btn-icon" onclick="Projects.archive('${p.id}')" title="アーカイブ">${Utils.icon('archive')}</button>
            <button class="btn btn-ghost btn-sm btn-icon" onclick="Projects.confirmDelete('${p.id}')" title="削除">${Utils.icon('trash-2')}</button>
          </div>
        </div>
      </div>
    `;
  }

  // ---- モーダル（作成/編集） ----
  function openModal(id = null) {
    const project = id ? Store.getProjectById(id) : null;
    const title = project ? 'プロジェクトを編集' : '新規プロジェクト';
    const color = project?.color || PRESET_COLORS[0];
    const templates = Store.getTemplates();

    const swatches = PRESET_COLORS.map(c => `
      <div class="color-swatch${c === color ? ' selected' : ''}"
           style="background:${c}"
           data-color="${c}"
           onclick="Projects._selectColor('${c}', this)"></div>
    `).join('');

    // テンプレート選択（新規作成時のみ表示）
    const templateSelect = !id && templates.length > 0 ? `
      <div class="form-group">
        <label class="form-label">テンプレート</label>
        <select id="proj-template" class="form-control" onchange="Projects._onTemplateChange()">
          <option value="">なし（空のプロジェクト）</option>
          ${templates.map(t => `<option value="${t.id}" data-color="${Utils.escapeHtml(t.color || '')}">${Utils.escapeHtml(t.name)}（タスク${(t.tasks||[]).length}件）</option>`).join('')}
        </select>
      </div>
    ` : '';

    const body = `
      ${templateSelect}
      <div class="form-group">
        <label class="form-label">プロジェクト名 *</label>
        <input type="text" id="proj-name" class="form-control" value="${Utils.escapeHtml(project?.name || '')}" placeholder="例: 開発プロジェクト" maxlength="100">
      </div>
      <div class="form-group">
        <label class="form-label">説明</label>
        <textarea id="proj-desc" class="form-control" rows="3" placeholder="プロジェクトの概要">${Utils.escapeHtml(project?.description || '')}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">フォルダパス / URL</label>
        <input type="text" id="proj-folder" class="form-control" value="${Utils.escapeHtml(project?.folderPath || '')}" placeholder="例: \\\\server\\share\\project  または  https://...">
      </div>
      <div class="form-group">
        <label class="form-label">カラー</label>
        <div class="color-swatches" id="color-swatches">
          ${swatches}
          <input type="color" id="proj-color-custom" value="${color}" style="width:28px;height:28px;border:none;padding:0;cursor:pointer;border-radius:50%"
                 onchange="Projects._selectColorCustom(this.value)">
        </div>
        <input type="hidden" id="proj-color" value="${color}">
      </div>
    `;

    const footer = `
      <button class="btn btn-secondary" onclick="Modal.close()">キャンセル</button>
      <button class="btn btn-primary" onclick="Projects._save('${id || ''}')">保存</button>
    `;

    Modal.open(title, body, footer);
  }

  function _onTemplateChange() {
    const sel = document.getElementById('proj-template');
    if (!sel) return;
    const opt = sel.options[sel.selectedIndex];
    const tmplColor = opt?.dataset?.color;
    if (tmplColor) {
      _selectColorCustom(tmplColor);
      document.getElementById('proj-color-custom').value = tmplColor;
    }
  }

  function _selectColor(color, el) {
    document.getElementById('proj-color').value = color;
    document.getElementById('proj-color-custom').value = color;
    document.querySelectorAll('#color-swatches .color-swatch').forEach(s => s.classList.remove('selected'));
    el.classList.add('selected');
  }

  function _selectColorCustom(color) {
    document.getElementById('proj-color').value = color;
    document.querySelectorAll('#color-swatches .color-swatch').forEach(s => s.classList.remove('selected'));
  }

  async function _save(id) {
    const name       = document.getElementById('proj-name').value.trim();
    const desc       = document.getElementById('proj-desc').value.trim();
    const color      = document.getElementById('proj-color').value;
    const folderPath = document.getElementById('proj-folder').value.trim();

    if (!name) { Toast.show('プロジェクト名を入力してください', 'error'); return; }

    try {
      if (id) {
        await Store.updateProject(id, { name, description: desc, color, folderPath });
        Toast.show('プロジェクトを更新しました', 'success');
      } else {
        const project = await Store.createProject({ name, description: desc, color, folderPath, readme: '', archived: false });
        // テンプレートが選択されていればタスクを自動生成
        const tmplSel = document.getElementById('proj-template');
        if (tmplSel && tmplSel.value) {
          await Templates.applyTemplate(tmplSel.value, project.id);
        }
        Toast.show('プロジェクトを作成しました', 'success');
      }
      Modal.close();
      renderSidebar();
      const { base, segments } = Router.getCurrentRoute();
      if (base === '/projects') {
        if (segments.length) renderDetail(segments);
        else renderList();
      }
    } catch (e) {
      Toast.show('保存に失敗しました: ' + e.message, 'error');
    }
  }

  async function archive(id) {
    const ok = await Modal.confirm('このプロジェクトをアーカイブしますか？', { confirmLabel: 'アーカイブする', confirmClass: 'btn-primary' });
    if (!ok) return;
    try {
      await Store.updateProject(id, { archived: true });
      Toast.show('アーカイブしました', 'success');
      renderSidebar();
      const { segments } = Router.getCurrentRoute();
      if (segments.length) Router.navigate('/projects');
      else renderList();
    } catch (e) {
      Toast.show('失敗しました: ' + e.message, 'error');
    }
  }

  // ---- プロジェクト詳細ページ ----
  let _readmeAutoSave = null;

  async function renderDetail(segments) {
    const id = segments[0];
    if (!id) { Router.navigate('/projects'); return; }

    const project = Store.getProjectById(id);
    const page = document.getElementById('page');

    if (!project) {
      page.innerHTML = `<div class="empty-state"><div class="empty-icon">${Utils.icon('folder-open', 40)}</div><div class="empty-title">プロジェクトが見つかりません</div><button class="btn btn-secondary" onclick="Router.navigate('/projects')">一覧に戻る</button></div>`;
      return;
    }

    // このプロジェクトのタスク
    const tasks = Store.getTasks().filter(t => t.projectId === id);
    const statusCounts = {};
    Object.keys(Utils.STATUS_LABELS).forEach(s => statusCounts[s] = 0);
    tasks.forEach(t => { statusCounts[t.status] = (statusCounts[t.status] || 0) + 1; });

    const folderPath = project.folderPath || '';
    const readme = project.readme || '';

    page.innerHTML = `
      <div class="page-header">
        <div style="display:flex;align-items:center;gap:10px;flex:1">
          <button class="btn btn-ghost btn-sm" onclick="Router.navigate('/projects')">← プロジェクト一覧</button>
          <span class="project-dot" style="background:${Utils.escapeHtml(project.color || '#3b82f6')};width:14px;height:14px"></span>
          <h2 class="page-title" style="margin:0">${Utils.escapeHtml(project.name)}</h2>
        </div>
        <div class="page-actions">
          <span id="proj-save-status" style="font-size:0.75rem;color:var(--color-text-light)"></span>
          <button class="btn btn-secondary btn-sm" onclick="Projects.openModal('${id}')">${Utils.icon('pencil')} 編集</button>
          <button class="btn btn-secondary btn-sm" onclick="Projects.archive('${id}')">${Utils.icon('archive')} アーカイブ</button>
          <button class="btn btn-danger btn-sm" onclick="Projects.confirmDelete('${id}')">${Utils.icon('trash-2')} 削除</button>
        </div>
      </div>

      ${project.description ? `<p style="color:var(--color-text-muted);margin-bottom:16px">${Utils.escapeHtml(project.description)}</p>` : ''}

      <!-- プロジェクト情報カード -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
        <!-- フォルダリンク -->
        <div class="card">
          <div class="card-header"><span style="font-weight:600">${Utils.icon('folder', 16)} フォルダパス</span></div>
          <div class="card-body" style="padding:12px 16px">
            ${folderPath
              ? `<a href="${Utils.escapeHtml(folderPath)}" target="_blank" rel="noopener"
                    style="color:var(--color-primary);word-break:break-all;display:flex;align-items:center;gap:6px">
                    ${Utils.icon('external-link', 14)} ${Utils.escapeHtml(folderPath)}
                  </a>`
              : `<span style="color:var(--color-text-muted);font-size:0.85rem">未設定（プロジェクト編集から設定できます）</span>`
            }
          </div>
        </div>

        <!-- ステータスサマリー -->
        <div class="card">
          <div class="card-header"><span style="font-weight:600">${Utils.icon('bar-chart-2', 16)} タスク概要</span></div>
          <div class="card-body" style="padding:12px 16px">
            <div style="display:flex;gap:16px;flex-wrap:wrap">
              ${Object.entries(Utils.STATUS_LABELS).map(([s, label]) =>
                `<div style="text-align:center">
                  <div style="font-size:1.25rem;font-weight:700">${statusCounts[s] || 0}</div>
                  <div style="font-size:0.72rem;color:var(--color-text-muted)"><span class="badge badge-${s}">${label}</span></div>
                </div>`
              ).join('')}
              <div style="text-align:center">
                <div style="font-size:1.25rem;font-weight:700">${tasks.length}</div>
                <div style="font-size:0.72rem;color:var(--color-text-muted)">合計</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- README -->
      <div class="card" style="margin-bottom:20px">
        <div class="card-header" style="display:flex;align-items:center;justify-content:space-between">
          <span style="font-weight:600">${Utils.icon('file-text', 16)} README</span>
          <div style="display:flex;gap:4px">
            <button class="btn btn-ghost btn-sm proj-readme-tab active" data-tab="edit" onclick="Projects._switchReadmeTab('edit')">編集</button>
            <button class="btn btn-ghost btn-sm proj-readme-tab" data-tab="preview" onclick="Projects._switchReadmeTab('preview')">プレビュー</button>
          </div>
        </div>
        <div class="card-body" style="padding:0">
          <textarea id="proj-readme-edit" style="width:100%;min-height:200px;padding:16px;border:none;outline:none;resize:vertical;font-family:var(--font-mono,'Courier New',monospace);font-size:0.875rem;line-height:1.7;color:var(--color-text);background:transparent"
                    placeholder="Markdownで記述できます..."
                    oninput="Projects._scheduleReadmeSave('${id}')">${Utils.escapeHtml(readme)}</textarea>
          <div id="proj-readme-preview" style="display:none;padding:16px;min-height:200px;font-size:0.9rem;line-height:1.7;color:var(--color-text);word-break:break-word"></div>
        </div>
      </div>

      <!-- タスク一覧 -->
      <div class="card">
        <div class="card-header" style="display:flex;align-items:center;justify-content:space-between">
          <span style="font-weight:600">${Utils.icon('check-square', 16)} タスク一覧 (${tasks.length}件)</span>
          <button class="btn btn-primary btn-sm" onclick="Filters.setState({projectId:'${id}'});Router.navigate('/tasks')">タスクビューで開く</button>
        </div>
        <div class="card-body" style="padding:0">
          ${tasks.length === 0
            ? `<div style="padding:24px;text-align:center;color:var(--color-text-muted)">このプロジェクトにはまだタスクがありません</div>`
            : `<table class="task-table" style="border:none">
                <thead>
                  <tr>
                    <th style="width:40%">タイトル</th>
                    <th>状態</th>
                    <th>優先度</th>
                    <th>担当者</th>
                    <th>期限</th>
                  </tr>
                </thead>
                <tbody>
                  ${tasks.map(t => {
                    const overdue = Utils.isOverdue(t.dueDate);
                    const soon = !overdue && Utils.isDueSoon(t.dueDate);
                    const dueCls = overdue ? ' overdue' : (soon ? ' soon' : '');
                    return `<tr style="cursor:pointer" onclick="Router.navigate('/tasks/${t.id}')">
                      <td><span class="task-title-link">${Utils.escapeHtml(t.title)}</span></td>
                      <td><span class="badge badge-${t.status}">${Utils.statusLabel(t.status)}</span></td>
                      <td><span class="badge badge-${t.priority}">${Utils.priorityLabel(t.priority)}</span></td>
                      <td style="font-size:0.8rem;color:var(--color-text-muted)">${Utils.escapeHtml(t.assignee || '—')}</td>
                      <td><span class="due-date${dueCls}">${t.dueDate ? Utils.formatDate(t.dueDate) : '—'}</span></td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>`
          }
        </div>
      </div>
    `;

    // textareaの値を直接設定（エスケープ対策）
    document.getElementById('proj-readme-edit').value = readme;
  }

  function _switchReadmeTab(tab) {
    const editEl = document.getElementById('proj-readme-edit');
    const previewEl = document.getElementById('proj-readme-preview');
    if (!editEl || !previewEl) return;

    document.querySelectorAll('.proj-readme-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    if (tab === 'edit') {
      editEl.style.display = '';
      previewEl.style.display = 'none';
    } else {
      editEl.style.display = 'none';
      previewEl.style.display = '';
      previewEl.innerHTML = MarkdownParser.parse(editEl.value);
      Utils.refreshIcons(previewEl);
    }
  }

  const _debouncedReadmeSave = Utils.debounce(async (id) => {
    const textarea = document.getElementById('proj-readme-edit');
    const status = document.getElementById('proj-save-status');
    if (!textarea) return;
    try {
      if (status) status.textContent = '保存中…';
      await Store.updateProject(id, { readme: textarea.value });
      if (status) status.textContent = '保存済み ✓';
      setTimeout(() => { if (status) status.textContent = ''; }, 2000);
    } catch (e) {
      if (status) status.textContent = '保存失敗 ✗';
    }
  }, 800);

  function _scheduleReadmeSave(id) { _debouncedReadmeSave(id); }

  async function confirmDelete(id) {
    const p = Store.getProjectById(id);
    if (!p) return;
    const ok = await Modal.confirm(`「${p.name}」をゴミ箱に移動しますか？`, { confirmLabel: 'ゴミ箱に移動' });
    if (!ok) return;
    try {
      await Store.softDeleteProject(id);
      Toast.show('ゴミ箱に移動しました', 'success');
      renderSidebar();
      const { segments } = Router.getCurrentRoute();
      if (segments.length) Router.navigate('/projects');
      else renderList();
    } catch (e) {
      Toast.show('削除に失敗しました: ' + e.message, 'error');
    }
  }

  return {
    renderSidebar, renderList, renderDetail, openModal,
    _filterByProject, _selectColor, _selectColorCustom, _onTemplateChange, _save,
    _switchReadmeTab, _scheduleReadmeSave,
    archive, confirmDelete
  };
})();
