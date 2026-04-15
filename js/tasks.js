/* ============================================================
   tasks.js — タスク管理（最大モジュール）
   ============================================================ */

const Tasks = (() => {

  // ---- タスク一覧ページ ----
  async function renderList() {
    const page = document.getElementById('page');

    const render = () => {
      const allTasks = Store.getTasks();
      const filtered = Filters.apply(allTasks);
      // ルートタスクのみ（parentId が null または存在しないもの）
      const roots = filtered.filter(t => !t.parentId);

      page.innerHTML = `
        <div class="page-header">
          <h2 class="page-title">タスク一覧</h2>
          <div class="page-actions">
            <button class="btn btn-primary" onclick="Tasks.openModal()">+ 新規タスク</button>
          </div>
        </div>
        <div id="filter-container"></div>
        <div class="task-table" id="task-table-wrap">
          ${renderTable(filtered, roots)}
        </div>
      `;

      Filters.renderBar('filter-container');
      Filters.onFilterChange(() => {
        const wrap = document.getElementById('task-table-wrap');
        if (!wrap) return;
        const all2 = Store.getTasks();
        const filt2 = Filters.apply(all2);
        const roots2 = filt2.filter(t => !t.parentId);
        wrap.innerHTML = renderTable(filt2, roots2);
        Filters.renderBar('filter-container');
        Utils.refreshIcons();
      });
    };

    render();
  }

  function renderTable(filtered, roots) {
    if (!filtered.length) {
      return `<div class="empty-state"><div class="empty-icon">${Utils.icon('clipboard-list', 40)}</div><div class="empty-title">タスクがありません</div><div class="empty-desc">「新規タスク」から作成してください</div></div>`;
    }

    const rows = renderRows(roots, filtered, 0);

    return `
      <table>
        <thead>
          <tr>
            <th style="width:40%">タイトル</th>
            <th>状態</th>
            <th>優先度</th>
            <th>担当者</th>
            <th>期限</th>
            <th>タグ</th>
            <th>プロジェクト</th>
            <th style="width:80px"></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function renderRows(tasks, allFiltered, depth) {
    return tasks.map(t => {
      const children = allFiltered.filter(c => c.parentId === t.id);
      const row = renderRow(t, depth, children.length > 0);
      const childRows = renderRows(children, allFiltered, depth + 1);
      return row + childRows;
    }).join('');
  }

  function renderRow(t, depth = 0, hasChildren = false) {
    const project  = Store.getProjectById(t.projectId);
    const overdue  = Utils.isOverdue(t.dueDate);
    const soon     = !overdue && Utils.isDueSoon(t.dueDate);
    const indent   = depth * 20;

    const dueCls = overdue ? ' overdue' : (soon ? ' soon' : '');
    const rowCls = overdue ? ' class="task-overdue"' : '';

    const tags = (t.tags || []).map(tag =>
      `<span class="tag-chip">${Utils.escapeHtml(tag)}</span>`
    ).join('');

    const dotColor = project?.color || '#94a3b8';

    return `
      <tr${rowCls} id="task-row-${t.id}">
        <td>
          <div class="task-name-cell" style="padding-left:${indent}px">
            ${depth > 0 ? `<span class="task-indent-line"></span>` : ''}
            <span class="task-title-link" onclick="Router.navigate('/tasks/${t.id}')">${Utils.escapeHtml(t.title)}</span>
          </div>
        </td>
        <td><span class="badge badge-${t.status}">${Utils.statusLabel(t.status)}</span></td>
        <td><span class="badge badge-${t.priority}">${Utils.priorityLabel(t.priority)}</span></td>
        <td style="font-size:0.8rem;color:var(--color-text-muted)">${Utils.escapeHtml(t.assignee || '—')}</td>
        <td><span class="due-date${dueCls}">${t.dueDate ? Utils.formatDate(t.dueDate) : '—'}</span></td>
        <td><div class="tags-cell">${tags || '—'}</div></td>
        <td>
          ${project ? `<span style="display:flex;align-items:center;gap:5px;font-size:0.8rem">
            <span class="project-color-dot" style="background:${dotColor}"></span>
            ${Utils.escapeHtml(project.name)}
          </span>` : '<span style="color:var(--color-text-light)">—</span>'}
        </td>
        <td>
          <div class="actions-cell">
            <button class="btn btn-ghost btn-sm btn-icon" onclick="Tasks.openModal(null,'${t.id}')" title="子タスク追加">＋</button>
            <button class="btn btn-ghost btn-sm btn-icon" onclick="Tasks.openModal('${t.id}')" title="編集">${Utils.icon('pencil')}</button>
            <button class="btn btn-ghost btn-sm btn-icon" onclick="Tasks.confirmDelete('${t.id}')" title="削除">${Utils.icon('trash-2')}</button>
          </div>
        </td>
      </tr>
    `;
  }

  // ---- タスク詳細ページ ----
  async function renderDetail(segments) {
    const id = segments[0];
    if (!id) { Router.navigate('/tasks'); return; }

    const task = Store.getTaskById(id);
    const page = document.getElementById('page');

    if (!task) {
      page.innerHTML = `<div class="empty-state"><div class="empty-icon">${Utils.icon('help-circle', 40)}</div><div class="empty-title">タスクが見つかりません</div><a class="btn btn-secondary" onclick="Router.navigate('/tasks')">一覧に戻る</a></div>`;
      return;
    }

    const project  = Store.getProjectById(task.projectId);
    const parent   = task.parentId ? Store.getTaskById(task.parentId) : null;
    const children = Store.getChildren(id);
    const overdue  = Utils.isOverdue(task.dueDate);

    page.innerHTML = `
      <div class="page-header">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" onclick="Router.navigate('/tasks')">← 一覧</button>
          ${parent ? `<span style="color:var(--color-text-muted);font-size:0.8rem">/</span>
            <span class="task-title-link" style="font-size:0.875rem" onclick="Router.navigate('/tasks/${parent.id}')">${Utils.escapeHtml(parent.title)}</span>
          ` : ''}
          <span style="color:var(--color-text-muted);font-size:0.8rem">/</span>
          <span style="font-size:0.875rem;font-weight:600">${Utils.escapeHtml(task.title)}</span>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary btn-sm" onclick="Tasks.openModal('${id}')">${Utils.icon('pencil')} 編集</button>
          <button class="btn btn-secondary btn-sm" onclick="Tasks.openModal(null,'${id}')">＋ 子タスク</button>
          <button class="btn btn-secondary btn-sm" onclick="Tasks._archiveTask('${id}')">${Utils.icon('archive')} アーカイブ</button>
          <button class="btn btn-danger btn-sm"    onclick="Tasks.confirmDelete('${id}')">${Utils.icon('trash-2')} 削除</button>
        </div>
      </div>

      <div class="task-detail-layout">
        <div class="task-detail-main card card-body">
          <h1 class="task-detail-title${overdue ? '" style="color:var(--color-danger)' : ''}">${Utils.escapeHtml(task.title)}</h1>

          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
            <span class="badge badge-${task.status}">${Utils.statusLabel(task.status)}</span>
            <span class="badge badge-${task.priority}">${Utils.priorityLabel(task.priority)}</span>
            ${(task.tags || []).map(t => `<span class="tag-chip">${Utils.escapeHtml(t)}</span>`).join('')}
          </div>

          ${task.description ? `
            <div style="margin-bottom:16px">
              <div class="form-label" style="margin-bottom:6px">説明</div>
              <div class="task-description">${Utils.escapeHtml(task.description)}</div>
            </div>
          ` : ''}

          ${children.length > 0 ? `
            <div class="subtask-section">
              <div class="section-header">
                <span class="section-title">子タスク (${children.length}件)</span>
                <button class="btn btn-primary btn-sm" onclick="Tasks.openModal(null,'${id}')">+ 追加</button>
              </div>
              <div class="task-table">
                <table>
                  <thead><tr>
                    <th>タイトル</th><th>状態</th><th>優先度</th><th>担当者</th><th>期限</th><th></th>
                  </tr></thead>
                  <tbody>
                    ${children.map(c => renderRow(c, 0)).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          ` : `
            <div style="margin-top:16px">
              <button class="btn btn-secondary btn-sm" onclick="Tasks.openModal(null,'${id}')">+ 子タスクを追加</button>
            </div>
          `}
        </div>

        <div class="task-detail-side">
          <div class="card card-body">
            <div class="task-meta-grid">
              <div class="task-meta-item">
                <span class="task-meta-label">プロジェクト</span>
                <span class="task-meta-value" style="display:flex;align-items:center;gap:5px">
                  ${project ? `<span class="project-color-dot" style="background:${project.color}"></span>${Utils.escapeHtml(project.name)}` : '—'}
                </span>
              </div>
              <div class="task-meta-item">
                <span class="task-meta-label">担当者</span>
                <span class="task-meta-value">${Utils.escapeHtml(task.assignee || '—')}</span>
              </div>
              <div class="task-meta-item">
                <span class="task-meta-label">期限</span>
                <span class="task-meta-value${overdue ? '" style="color:var(--color-danger)' : ''}">${task.dueDate ? Utils.formatDate(task.dueDate) : '—'}</span>
              </div>
              <div class="task-meta-item">
                <span class="task-meta-label">親タスク</span>
                <span class="task-meta-value">
                  ${parent ? `<span class="task-title-link" onclick="Router.navigate('/tasks/${parent.id}')">${Utils.escapeHtml(parent.title)}</span>` : '—'}
                </span>
              </div>
              <div class="task-meta-item">
                <span class="task-meta-label">作成日</span>
                <span class="task-meta-value">${Utils.formatDate(task.createdAt)}</span>
              </div>
              <div class="task-meta-item">
                <span class="task-meta-label">更新日</span>
                <span class="task-meta-value">${Utils.formatDate(task.updatedAt)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ---- モーダル（作成/編集） ----
  function openModal(id = null, parentId = null) {
    const task   = id ? Store.getTaskById(id) : null;
    const title  = task ? 'タスクを編集' : '新規タスク';
    const projects = Store.getProjects();

    // 親候補：自分自身と子孫を除く
    const excludeIds = task ? [id, ...Store.getDescendants(id)] : [];
    const parentCandidates = Store.getTasks()
      .filter(t => !excludeIds.includes(t.id) && !t.deleted && !t.archived);

    const tagsStr = (task?.tags || []).join(', ');
    const pid = task?.parentId || parentId || '';

    // 親タスクからプロジェクトを引き継ぐ
    let defaultProjectId = task?.projectId || '';
    if (!task && parentId) {
      const parentTask = Store.getTaskById(parentId);
      if (parentTask?.projectId) defaultProjectId = parentTask.projectId;
    }

    const body = `
      <div class="form-group">
        <label class="form-label">タイトル *</label>
        <input type="text" id="task-title" class="form-control" value="${Utils.escapeHtml(task?.title || '')}" placeholder="タスク名" maxlength="200">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">状態</label>
          <select id="task-status" class="form-control">
            ${Object.entries(Utils.STATUS_LABELS).map(([v,l]) =>
              `<option value="${v}" ${(task?.status||'open')===v?'selected':''}>${l}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">優先度</label>
          <select id="task-priority" class="form-control">
            ${Object.entries(Utils.PRIORITY_LABELS).map(([v,l]) =>
              `<option value="${v}" ${(task?.priority||'normal')===v?'selected':''}>${l}</option>`
            ).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">プロジェクト</label>
          <select id="task-project" class="form-control">
            <option value="">なし</option>
            ${projects.map(p => `<option value="${p.id}" ${defaultProjectId===p.id?'selected':''}>${Utils.escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">担当者</label>
          <select id="task-assignee" class="form-control">
            <option value="">未指定</option>
            ${Store.getMembers().map(m => `<option value="${Utils.escapeHtml(m)}" ${task?.assignee === m ? 'selected' : ''}>${Utils.escapeHtml(m)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">期限</label>
          <input type="date" id="task-due" class="form-control" value="${task?.dueDate||''}">
        </div>
        <div class="form-group">
          <label class="form-label">親タスク</label>
          <select id="task-parent" class="form-control">
            <option value="">なし</option>
            ${parentCandidates.map(t => `<option value="${t.id}" ${pid===t.id?'selected':''}>${Utils.escapeHtml(t.title)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">タグ（カンマ区切り）</label>
        <input type="text" id="task-tags" class="form-control" value="${Utils.escapeHtml(tagsStr)}" placeholder="例: バグ, フロントエンド">
      </div>
      <div class="form-group">
        <label class="form-label">説明</label>
        <textarea id="task-desc" class="form-control" rows="4" placeholder="タスクの詳細説明">${Utils.escapeHtml(task?.description||'')}</textarea>
      </div>
    `;

    const footer = `
      <button class="btn btn-secondary" onclick="Modal.close()">キャンセル</button>
      <button class="btn btn-primary" onclick="Tasks._save('${id||''}')">保存</button>
    `;

    Modal.open(title, body, footer);
  }

  async function _save(id) {
    const title    = document.getElementById('task-title').value.trim();
    const status   = document.getElementById('task-status').value;
    const priority = document.getElementById('task-priority').value;
    const projectId= document.getElementById('task-project').value || null;
    const assignee = document.getElementById('task-assignee').value.trim();
    const dueDate  = document.getElementById('task-due').value || null;
    const parentId = document.getElementById('task-parent').value || null;
    const tagsStr  = document.getElementById('task-tags').value;
    const desc     = document.getElementById('task-desc').value.trim();
    const tags     = Utils.parseTags(tagsStr);

    if (!title) { Toast.show('タイトルを入力してください', 'error'); return; }

    try {
      if (id) {
        await Store.updateTask(id, { title, status, priority, projectId, assignee, dueDate, parentId, tags, description: desc });
        Toast.show('タスクを更新しました', 'success');
      } else {
        await Store.createTask({ title, status, priority, projectId, assignee, dueDate, parentId, tags, description: desc, deleted: false, archived: false, childIds: [] });
        Toast.show('タスクを作成しました', 'success');
      }
      Modal.close();
      const { base, segments } = Router.getCurrentRoute();
      if (base === '/tasks' && segments.length) {
        renderDetail(segments);
      } else {
        renderList();
      }
    } catch (e) {
      Toast.show('保存に失敗しました: ' + e.message, 'error');
    }
  }

  async function confirmDelete(id) {
    const task = Store.getTaskById(id);
    if (!task) return;
    const desc = Store.getDescendants(id).length > 0 ? '\n\n子タスクもすべてゴミ箱に移動されます。' : '';
    const ok = await Modal.confirm(`「${task.title}」をゴミ箱に移動しますか？${desc}`, { confirmLabel: 'ゴミ箱に移動' });
    if (!ok) return;
    try {
      await Store.softDeleteTask(id);
      Toast.show('ゴミ箱に移動しました', 'success');
      const { base } = Router.getCurrentRoute();
      if (base === '/tasks') Router.navigate('/tasks');
      else Router.navigate('/tasks');
    } catch (e) {
      Toast.show('失敗: ' + e.message, 'error');
    }
  }

  async function _archiveTask(id) {
    const ok = await Modal.confirm('このタスクをアーカイブしますか？', { confirmLabel: 'アーカイブする', confirmClass: 'btn-primary' });
    if (!ok) return;
    try {
      await Store.archiveTask(id);
      Toast.show('アーカイブしました', 'success');
      Router.navigate('/tasks');
    } catch (e) {
      Toast.show('失敗: ' + e.message, 'error');
    }
  }

  return {
    renderList, renderDetail,
    openModal, _save,
    confirmDelete, _archiveTask
  };
})();
