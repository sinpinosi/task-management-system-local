/* ============================================================
   templates.js — プロジェクトテンプレート管理
   ============================================================ */

const Templates = (() => {

  // ---- テンプレート一覧ページ ----
  function renderList() {
    const page = document.getElementById('page');
    const templates = Store.getTemplates();

    page.innerHTML = `
      <div class="page-header">
        <h2 class="page-title">テンプレート</h2>
        <div class="page-actions">
          <button class="btn btn-primary" onclick="Templates.openModal()">+ 新規テンプレート</button>
        </div>
      </div>
      ${templates.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">${Utils.icon('layout-template', 40)}</div>
          <div class="empty-title">テンプレートがありません</div>
          <div class="empty-desc">「新規テンプレート」から作成してください。<br>テンプレートを使うとプロジェクト作成時にタスクを自動生成できます。</div>
        </div>
      ` : `
        <div class="template-list">
          ${templates.map(t => _renderCard(t)).join('')}
        </div>
      `}
    `;
    Utils.refreshIcons();
  }

  function _renderCard(tmpl) {
    const tasks = tmpl.tasks || [];
    return `
      <div class="template-card">
        <div class="template-card-header">
          <div class="template-card-name">${Utils.icon('layout-template')} ${Utils.escapeHtml(tmpl.name)}</div>
          <div style="display:flex;gap:4px">
            <button class="btn btn-ghost btn-sm btn-icon" onclick="Templates.openModal('${tmpl.id}')" title="編集">${Utils.icon('pencil')}</button>
            <button class="btn btn-ghost btn-sm btn-icon" onclick="Templates.confirmDelete('${tmpl.id}')" title="削除">${Utils.icon('trash-2')}</button>
          </div>
        </div>
        ${tmpl.description ? `<div class="template-card-desc">${Utils.escapeHtml(tmpl.description)}</div>` : ''}
        <div class="template-card-tasks">
          <div class="template-task-label">${Utils.icon('list-checks')} タスク（${tasks.length}件）</div>
          ${tasks.length > 0 ? `
            <div class="template-task-list">
              ${tasks.map((t, i) => `
                <div class="template-task-item">
                  <span class="template-task-dot priority-${t.priority || 'normal'}"></span>
                  <span>${Utils.escapeHtml(t.title)}</span>
                  ${t.assignee ? `<span class="template-task-meta">${Utils.escapeHtml(t.assignee)}</span>` : ''}
                </div>
              `).join('')}
            </div>
          ` : '<div style="font-size:0.8rem;opacity:0.5;padding:4px 0">タスクなし</div>'}
        </div>
      </div>
    `;
  }

  // ---- テンプレート作成/編集モーダル ----
  function openModal(id = null) {
    const tmpl = id ? Store.getTemplateById(id) : null;
    const title = tmpl ? 'テンプレートを編集' : '新規テンプレート';
    const tasks = tmpl?.tasks || [];

    const body = `
      <div class="form-group">
        <label class="form-label">テンプレート名 *</label>
        <input type="text" id="tmpl-name" class="form-control" value="${Utils.escapeHtml(tmpl?.name || '')}" placeholder="例: Web開発プロジェクト" maxlength="100">
      </div>
      <div class="form-group">
        <label class="form-label">説明</label>
        <textarea id="tmpl-desc" class="form-control" rows="2" placeholder="テンプレートの概要">${Utils.escapeHtml(tmpl?.description || '')}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">デフォルトカラー</label>
        <input type="color" id="tmpl-color" value="${tmpl?.color || '#3b82f6'}" style="width:36px;height:36px;border:none;padding:0;cursor:pointer;border-radius:50%">
      </div>
      <div class="form-group">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <label class="form-label" style="margin:0">タスク一覧</label>
          <button class="btn btn-secondary btn-sm" onclick="Templates._addTaskRow()">+ タスク追加</button>
        </div>
        <div id="tmpl-tasks">
          ${tasks.map((t, i) => _taskRowHtml(i, t)).join('')}
        </div>
      </div>
    `;

    const footer = `
      <button class="btn btn-secondary" onclick="Modal.close()">キャンセル</button>
      <button class="btn btn-primary" onclick="Templates._save('${id || ''}')">保存</button>
    `;

    Modal.open(title, body, footer);
    _taskCounter = tasks.length;
  }

  let _taskCounter = 0;

  function _taskRowHtml(idx, task = {}) {
    return `
      <div class="tmpl-task-row" data-idx="${idx}">
        <input type="text" class="form-control tmpl-task-title" value="${Utils.escapeHtml(task.title || '')}" placeholder="タスク名" style="flex:1">
        <select class="form-control tmpl-task-priority" style="width:80px">
          ${Object.entries(Utils.PRIORITY_LABELS).map(([v, l]) =>
            `<option value="${v}" ${(task.priority || 'normal') === v ? 'selected' : ''}>${l}</option>`
          ).join('')}
        </select>
        <select class="form-control tmpl-task-assignee" style="width:100px">
          <option value="">未指定</option>
          ${Store.getMembers().map(m => `<option value="${Utils.escapeHtml(m)}" ${task.assignee === m ? 'selected' : ''}>${Utils.escapeHtml(m)}</option>`).join('')}
        </select>
        <button class="btn btn-ghost btn-sm btn-icon" onclick="this.closest('.tmpl-task-row').remove()" title="削除">${Utils.icon('x')}</button>
      </div>
    `;
  }

  function _addTaskRow() {
    const container = document.getElementById('tmpl-tasks');
    const div = document.createElement('div');
    div.innerHTML = _taskRowHtml(_taskCounter++);
    const row = div.firstElementChild;
    container.appendChild(row);
    Utils.refreshIcons(row);
    row.querySelector('.tmpl-task-title').focus();
  }

  async function _save(id) {
    const name = document.getElementById('tmpl-name').value.trim();
    const desc = document.getElementById('tmpl-desc').value.trim();
    const color = document.getElementById('tmpl-color').value;

    if (!name) { Toast.show('テンプレート名を入力してください', 'error'); return; }

    // タスク行を収集
    const rows = document.querySelectorAll('#tmpl-tasks .tmpl-task-row');
    const tasks = [];
    rows.forEach(row => {
      const title = row.querySelector('.tmpl-task-title').value.trim();
      if (!title) return;
      tasks.push({
        title,
        priority: row.querySelector('.tmpl-task-priority').value,
        assignee: row.querySelector('.tmpl-task-assignee').value.trim()
      });
    });

    try {
      if (id) {
        await Store.updateTemplate(id, { name, description: desc, color, tasks });
        Toast.show('テンプレートを更新しました', 'success');
      } else {
        await Store.createTemplate({ name, description: desc, color, tasks });
        Toast.show('テンプレートを作成しました', 'success');
      }
      Modal.close();
      renderList();
    } catch (e) {
      Toast.show('保存に失敗しました: ' + e.message, 'error');
    }
  }

  async function confirmDelete(id) {
    const tmpl = Store.getTemplateById(id);
    if (!tmpl) return;
    const ok = await Modal.confirm(`テンプレート「${tmpl.name}」を削除しますか？`);
    if (!ok) return;
    try {
      await Store.deleteTemplate(id);
      Toast.show('削除しました', 'success');
      renderList();
    } catch (e) {
      Toast.show('削除に失敗しました: ' + e.message, 'error');
    }
  }

  // ---- プロジェクト作成時にテンプレートからタスクを自動生成 ----
  async function applyTemplate(templateId, projectId) {
    const tmpl = Store.getTemplateById(templateId);
    if (!tmpl || !tmpl.tasks || !tmpl.tasks.length) return;

    for (const t of tmpl.tasks) {
      await Store.createTask({
        title: t.title,
        status: 'open',
        priority: t.priority || 'normal',
        projectId,
        assignee: t.assignee || '',
        dueDate: null,
        parentId: null,
        tags: [],
        description: '',
        deleted: false,
        archived: false,
        childIds: []
      });
    }
  }

  return {
    renderList, openModal, confirmDelete, applyTemplate,
    _addTaskRow, _save
  };
})();
