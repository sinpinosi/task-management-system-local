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
        <div class="template-list" id="template-list">
          ${_sortedTemplates(templates).map(t => _renderCard(t)).join('')}
        </div>
      `}
    `;
    Utils.refreshIcons();
  }

  function _sortedTemplates(templates) {
    return [...templates].sort((a, b) => (a.sortOrder ?? 999999) - (b.sortOrder ?? 999999));
  }

  function _renderCard(tmpl) {
    const tasks = tmpl.tasks || [];
    const totalCount = tasks.reduce((sum, t) => sum + 1 + (t.children?.length || 0), 0);
    return `
      <div class="template-card" data-template-id="${tmpl.id}" draggable="true"
           ondragstart="Templates._onDragStart(event, '${tmpl.id}')"
           ondragover="Templates._onDragOver(event, '${tmpl.id}')"
           ondragleave="Templates._onDragLeave(event)"
           ondrop="Templates._onDrop(event, '${tmpl.id}')"
           ondragend="Templates._onDragEnd(event)">
        <div class="template-card-header">
          <div class="template-card-name"><span class="drag-handle" title="ドラッグで並び替え">${Utils.icon('grip-vertical', 14)}</span> ${Utils.icon('layout-template')} ${Utils.escapeHtml(tmpl.name)}</div>
          <div style="display:flex;gap:4px">
            <button class="btn btn-ghost btn-sm btn-icon" onclick="Templates.openModal('${tmpl.id}')" title="編集">${Utils.icon('pencil')}</button>
            <button class="btn btn-ghost btn-sm btn-icon" onclick="Templates.confirmDelete('${tmpl.id}')" title="削除">${Utils.icon('trash-2')}</button>
          </div>
        </div>
        ${tmpl.description ? `<div class="template-card-desc">${Utils.escapeHtml(tmpl.description)}</div>` : ''}
        <div class="template-card-tasks">
          <div class="template-task-label">${Utils.icon('list-checks')} タスク（${totalCount}件）</div>
          ${totalCount > 0 ? `
            <div class="template-task-list">
              ${tasks.map(t => {
                const children = t.children || [];
                let html = `
                  <div class="template-task-item">
                    <span class="template-task-dot priority-${t.priority || 'normal'}"></span>
                    <span>${Utils.escapeHtml(t.title)}</span>
                    ${t.assignee ? `<span class="template-task-meta">${Utils.escapeHtml(t.assignee)}</span>` : ''}
                  </div>`;
                children.forEach((c, ci) => {
                  const connector = ci === children.length - 1 ? '└' : '├';
                  html += `
                    <div class="template-task-item template-task-child">
                      <span style="opacity:0.4;margin-right:2px">${connector}</span>
                      <span class="template-task-dot priority-${c.priority || 'normal'}"></span>
                      <span>${Utils.escapeHtml(c.title)}</span>
                      ${c.assignee ? `<span class="template-task-meta">${Utils.escapeHtml(c.assignee)}</span>` : ''}
                    </div>`;
                });
                return html;
              }).join('')}
            </div>
          ` : '<div style="font-size:0.8rem;opacity:0.5;padding:4px 0">タスクなし</div>'}
        </div>
        ${tmpl.readme ? `
        <div class="template-card-readme">
          <div class="template-task-label">${Utils.icon('file-text')} README</div>
          <div class="template-readme-content">${MarkdownParser.parse(tmpl.readme)}</div>
        </div>
        ` : ''}
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
          <label class="form-label" style="margin:0">README (Markdown)</label>
          <div style="display:flex;gap:4px">
            <button class="btn btn-ghost btn-sm tmpl-readme-tab active" data-tab="edit" onclick="Templates._switchReadmeTab('edit')">編集</button>
            <button class="btn btn-ghost btn-sm tmpl-readme-tab" data-tab="preview" onclick="Templates._switchReadmeTab('preview')">プレビュー</button>
          </div>
        </div>
        <textarea id="tmpl-readme-edit" class="form-control" rows="6" placeholder="プロジェクト作成時にREADMEとして反映されます"
                  style="font-family:var(--font-mono,'Courier New',monospace);font-size:0.85rem;line-height:1.6;resize:vertical"></textarea>
        <div id="tmpl-readme-preview" style="display:none;padding:12px;min-height:120px;font-size:0.9rem;line-height:1.7;color:var(--color-text);word-break:break-word;border:1px solid var(--color-border);border-radius:var(--radius);background:var(--color-surface)"></div>
      </div>
      <div class="form-group">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <label class="form-label" style="margin:0">タスク一覧</label>
          <button class="btn btn-secondary btn-sm" onclick="Templates._addTaskRow()">+ タスク追加</button>
        </div>
        <div id="tmpl-tasks">
          ${tasks.map((t, i) => _taskGroupHtml(i, t)).join('')}
        </div>
      </div>
    `;

    const footer = `
      <button class="btn btn-secondary" onclick="Modal.close()">キャンセル</button>
      <button class="btn btn-primary" onclick="Templates._save('${id || ''}')">保存</button>
    `;

    Modal.open(title, body, footer);
    // textarea値を直接設定（エスケープ対策）
    document.getElementById('tmpl-readme-edit').value = tmpl?.readme || '';
    _taskCounter = tasks.length;
  }

  function _switchReadmeTab(tab) {
    const editEl = document.getElementById('tmpl-readme-edit');
    const previewEl = document.getElementById('tmpl-readme-preview');
    if (!editEl || !previewEl) return;
    document.querySelectorAll('.tmpl-readme-tab').forEach(btn => {
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

  let _taskCounter = 0;

  function _taskRowHtml(idx, task = {}, isChild = false) {
    const subtaskDrag = isChild ? `draggable="true"
           ondragstart="Templates._onSubtaskDragStart(event)"
           ondragover="Templates._onSubtaskDragOver(event)"
           ondragleave="Templates._onSubtaskDragLeave(event)"
           ondrop="Templates._onSubtaskDrop(event)"
           ondragend="Templates._onSubtaskDragEnd(event)"` : '';
    return `
      <div class="tmpl-task-row${isChild ? ' tmpl-subtask-row' : ''}" data-idx="${idx}" ${subtaskDrag}>
        <span class="drag-handle" title="ドラッグで並び替え">${Utils.icon('grip-vertical', 14)}</span>
        <input type="text" class="form-control tmpl-task-title" value="${Utils.escapeHtml(task.title || '')}" placeholder="${isChild ? '子タスク名' : 'タスク名'}" style="flex:1">
        <select class="form-control tmpl-task-priority" style="width:80px">
          ${Object.entries(Utils.PRIORITY_LABELS).map(([v, l]) =>
            `<option value="${v}" ${(task.priority || 'normal') === v ? 'selected' : ''}>${l}</option>`
          ).join('')}
        </select>
        <select class="form-control tmpl-task-assignee" style="width:100px">
          <option value="">未指定</option>
          ${Store.getMembers().map(m => `<option value="${Utils.escapeHtml(m)}" ${task.assignee === m ? 'selected' : ''}>${Utils.escapeHtml(m)}</option>`).join('')}
        </select>
        ${!isChild ? `<button class="btn btn-ghost btn-sm btn-icon" onclick="Templates._addSubtaskRow(this)" title="子タスク追加">＋</button>` : ''}
        <button class="btn btn-ghost btn-sm btn-icon" onclick="${isChild ? `this.closest('.tmpl-task-row').remove()` : `this.closest('.tmpl-task-group').remove()`}" title="削除">${Utils.icon('x')}</button>
      </div>
    `;
  }

  function _taskGroupHtml(idx, task = {}) {
    const children = task.children || [];
    return `
      <div class="tmpl-task-group" draggable="true"
           ondragstart="Templates._onTaskDragStart(event)"
           ondragover="Templates._onTaskDragOver(event)"
           ondragleave="Templates._onTaskDragLeave(event)"
           ondrop="Templates._onTaskDrop(event)"
           ondragend="Templates._onTaskDragEnd(event)">
        ${_taskRowHtml(idx, task, false)}
        <div class="tmpl-subtask-container">
          ${children.map((c, ci) => _taskRowHtml(`${idx}-${ci}`, c, true)).join('')}
        </div>
      </div>
    `;
  }

  function _addTaskRow() {
    const container = document.getElementById('tmpl-tasks');
    const div = document.createElement('div');
    div.innerHTML = _taskGroupHtml(_taskCounter++);
    const group = div.firstElementChild;
    container.appendChild(group);
    Utils.refreshIcons(group);
    group.querySelector('.tmpl-task-title').focus();
  }

  function _addSubtaskRow(buttonEl) {
    const group = buttonEl.closest('.tmpl-task-group');
    const subtaskContainer = group.querySelector('.tmpl-subtask-container');
    const div = document.createElement('div');
    div.innerHTML = _taskRowHtml(_taskCounter++, {}, true);
    const row = div.firstElementChild;
    subtaskContainer.appendChild(row);
    Utils.refreshIcons(row);
    row.querySelector('.tmpl-task-title').focus();
  }

  async function _save(id) {
    const name = document.getElementById('tmpl-name').value.trim();
    const desc = document.getElementById('tmpl-desc').value.trim();
    const color = document.getElementById('tmpl-color').value;
    const readme = document.getElementById('tmpl-readme-edit').value;

    if (!name) { Toast.show('テンプレート名を入力してください', 'error'); return; }

    // タスクグループを収集
    const groups = document.querySelectorAll('#tmpl-tasks .tmpl-task-group');
    const tasks = [];
    groups.forEach(group => {
      const parentRow = group.querySelector(':scope > .tmpl-task-row');
      const parentTitle = parentRow.querySelector('.tmpl-task-title').value.trim();
      if (!parentTitle) return;

      const children = [];
      group.querySelectorAll('.tmpl-subtask-row').forEach(childRow => {
        const childTitle = childRow.querySelector('.tmpl-task-title').value.trim();
        if (!childTitle) return;
        children.push({
          title: childTitle,
          priority: childRow.querySelector('.tmpl-task-priority').value,
          assignee: childRow.querySelector('.tmpl-task-assignee').value.trim()
        });
      });

      tasks.push({
        title: parentTitle,
        priority: parentRow.querySelector('.tmpl-task-priority').value,
        assignee: parentRow.querySelector('.tmpl-task-assignee').value.trim(),
        children
      });
    });

    try {
      if (id) {
        await Store.updateTemplate(id, { name, description: desc, color, readme, tasks });
        Toast.show('テンプレートを更新しました', 'success');
      } else {
        await Store.createTemplate({ name, description: desc, color, readme, tasks });
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
    if (!tmpl) return;

    // テンプレートの README をプロジェクトにコピー
    if (tmpl.readme) {
      await Store.updateProject(projectId, { readme: tmpl.readme });
    }

    if (!tmpl.tasks || !tmpl.tasks.length) return;

    for (const t of tmpl.tasks) {
      const parent = await Store.createTask({
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

      const children = t.children || [];
      for (const c of children) {
        await Store.createTask({
          title: c.title,
          status: 'open',
          priority: c.priority || 'normal',
          projectId,
          assignee: c.assignee || '',
          dueDate: null,
          parentId: parent.id,
          tags: [],
          description: '',
          deleted: false,
          archived: false,
          childIds: []
        });
      }
    }
  }

  // ---- モーダル内タスク行のドラッグ&ドロップ（親タスクグループ） ----
  let _dragGroup = null;

  function _onTaskDragStart(e) {
    _dragGroup = e.currentTarget;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'task-group');
    setTimeout(() => _dragGroup.classList.add('dragging'), 0);
    e.stopPropagation();
  }

  function _onTaskDragOver(e) {
    if (!_dragGroup) return;
    const target = e.currentTarget;
    if (target === _dragGroup) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    const rect = target.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    target.classList.remove('drag-over-top', 'drag-over-bottom');
    target.classList.add(e.clientY < midY ? 'drag-over-top' : 'drag-over-bottom');
  }

  function _onTaskDragLeave(e) {
    e.currentTarget.classList.remove('drag-over-top', 'drag-over-bottom');
  }

  function _onTaskDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget;
    target.classList.remove('drag-over-top', 'drag-over-bottom');
    if (!_dragGroup || target === _dragGroup) return;

    const container = document.getElementById('tmpl-tasks');
    const rect = target.getBoundingClientRect();
    const insertBefore = e.clientY < rect.top + rect.height / 2;
    if (insertBefore) {
      container.insertBefore(_dragGroup, target);
    } else {
      container.insertBefore(_dragGroup, target.nextSibling);
    }
    _dragGroup = null;
  }

  function _onTaskDragEnd(e) {
    if (_dragGroup) _dragGroup.classList.remove('dragging');
    _dragGroup = null;
    document.querySelectorAll('.tmpl-task-group.drag-over-top, .tmpl-task-group.drag-over-bottom, .tmpl-task-group.dragging').forEach(el => {
      el.classList.remove('drag-over-top', 'drag-over-bottom', 'dragging');
    });
  }

  // ---- モーダル内サブタスク行のドラッグ&ドロップ ----
  let _dragSubtask = null;

  function _onSubtaskDragStart(e) {
    _dragSubtask = e.currentTarget;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'subtask');
    setTimeout(() => _dragSubtask.classList.add('dragging'), 0);
    e.stopPropagation();
  }

  function _onSubtaskDragOver(e) {
    if (!_dragSubtask) return;
    const target = e.currentTarget;
    if (target === _dragSubtask || !target.classList.contains('tmpl-subtask-row')) return;
    // 同じ親グループ内のみ
    if (target.closest('.tmpl-subtask-container') !== _dragSubtask.closest('.tmpl-subtask-container')) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    const rect = target.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    target.classList.remove('drag-over-top', 'drag-over-bottom');
    target.classList.add(e.clientY < midY ? 'drag-over-top' : 'drag-over-bottom');
  }

  function _onSubtaskDragLeave(e) {
    e.currentTarget.classList.remove('drag-over-top', 'drag-over-bottom');
  }

  function _onSubtaskDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget;
    target.classList.remove('drag-over-top', 'drag-over-bottom');
    if (!_dragSubtask || target === _dragSubtask) return;
    if (!target.classList.contains('tmpl-subtask-row')) return;

    const container = target.closest('.tmpl-subtask-container');
    const rect = target.getBoundingClientRect();
    const insertBefore = e.clientY < rect.top + rect.height / 2;
    if (insertBefore) {
      container.insertBefore(_dragSubtask, target);
    } else {
      container.insertBefore(_dragSubtask, target.nextSibling);
    }
    _dragSubtask = null;
  }

  function _onSubtaskDragEnd(e) {
    if (_dragSubtask) _dragSubtask.classList.remove('dragging');
    _dragSubtask = null;
    document.querySelectorAll('.tmpl-subtask-row.drag-over-top, .tmpl-subtask-row.drag-over-bottom, .tmpl-subtask-row.dragging').forEach(el => {
      el.classList.remove('drag-over-top', 'drag-over-bottom', 'dragging');
    });
  }

  // ---- テンプレートカードのドラッグ&ドロップ ----
  let _dragId = null;

  function _onDragStart(e, id) {
    _dragId = id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    const card = e.currentTarget;
    setTimeout(() => card.classList.add('dragging'), 0);
  }

  function _onDragOver(e, targetId) {
    if (!_dragId || _dragId === targetId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    card.classList.remove('drag-over-top', 'drag-over-bottom');
    card.classList.add(e.clientY < midY ? 'drag-over-top' : 'drag-over-bottom');
  }

  function _onDragLeave(e) {
    e.currentTarget.classList.remove('drag-over-top', 'drag-over-bottom');
  }

  async function _onDrop(e, targetId) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over-top', 'drag-over-bottom');
    if (!_dragId || _dragId === targetId) return;

    const templates = _sortedTemplates(Store.getTemplates());
    const withoutDrag = templates.filter(t => t.id !== _dragId);
    const dragItem = templates.find(t => t.id === _dragId);
    if (!dragItem) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const insertBefore = e.clientY < rect.top + rect.height / 2;
    let insertIdx = withoutDrag.findIndex(t => t.id === targetId);
    if (!insertBefore) insertIdx++;
    withoutDrag.splice(insertIdx, 0, dragItem);

    const updates = withoutDrag.map((t, i) => ({ id: t.id, sortOrder: i }));
    try {
      await Store.reorderTemplates(updates);
      renderList();
    } catch (err) {
      Toast.show('並び替え失敗: ' + err.message, 'error');
    }
    _dragId = null;
  }

  function _onDragEnd(e) {
    _dragId = null;
    document.querySelectorAll('.template-card.dragging').forEach(el => el.classList.remove('dragging'));
    document.querySelectorAll('.template-card.drag-over-top, .template-card.drag-over-bottom').forEach(el => {
      el.classList.remove('drag-over-top', 'drag-over-bottom');
    });
  }

  return {
    renderList, openModal, confirmDelete, applyTemplate,
    _addTaskRow, _addSubtaskRow, _save, _switchReadmeTab,
    _onTaskDragStart, _onTaskDragOver, _onTaskDragLeave, _onTaskDrop, _onTaskDragEnd,
    _onSubtaskDragStart, _onSubtaskDragOver, _onSubtaskDragLeave, _onSubtaskDrop, _onSubtaskDragEnd,
    _onDragStart, _onDragOver, _onDragLeave, _onDrop, _onDragEnd
  };
})();
