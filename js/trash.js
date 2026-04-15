/* ============================================================
   trash.js — ゴミ箱
   ============================================================ */

const Trash = (() => {
  let _tab = 'tasks';

  async function render() {
    const page = document.getElementById('page');
    if (Store.isTasksStale()) await Store.refreshTasks();
    const deletedTasks    = Store.getDeletedTasks();
    const deletedProjects = Store.getDeletedProjects();

    page.innerHTML = `
      <div class="page-header">
        <h2 class="page-title">${Utils.icon('trash-2', 20)} ゴミ箱</h2>
        <div class="page-actions">
          ${(deletedTasks.length > 0 || deletedProjects.length > 0)
            ? `<button class="btn btn-danger btn-sm" onclick="Trash.emptyTrash()">ゴミ箱を空にする</button>`
            : ''}
        </div>
      </div>
      <div class="tabs">
        <button class="tab-btn${_tab==='tasks'?' active':''}" onclick="Trash._setTab('tasks')">タスク (${deletedTasks.length})</button>
        <button class="tab-btn${_tab==='projects'?' active':''}" onclick="Trash._setTab('projects')">プロジェクト (${deletedProjects.length})</button>
      </div>
      <div id="trash-content">
        ${_tab === 'tasks' ? renderTasks(deletedTasks) : renderProjects(deletedProjects)}
      </div>
    `;
  }

  function renderTasks(tasks) {
    if (!tasks.length) {
      return `<div class="empty-state"><div class="empty-icon">${Utils.icon('sparkles', 40)}</div><div class="empty-title">削除されたタスクはありません</div></div>`;
    }
    return `
      <div class="task-table">
        <table>
          <thead><tr>
            <th>タイトル</th>
            <th>プロジェクト</th>
            <th>削除日時</th>
            <th style="width:160px"></th>
          </tr></thead>
          <tbody>
            ${tasks.map(t => {
              const project = Store.getProjectById(t.projectId);
              return `
                <tr>
                  <td>
                    <span style="color:var(--color-text)">${Utils.escapeHtml(t.title)}</span>
                    ${t.parentId ? `<span style="font-size:0.75rem;color:var(--color-text-muted);margin-left:6px">（子タスク）</span>` : ''}
                  </td>
                  <td style="font-size:0.8rem;color:var(--color-text-muted)">
                    ${project ? Utils.escapeHtml(project.name) : '—'}
                  </td>
                  <td style="font-size:0.8rem;color:var(--color-text-muted)">
                    ${t.deletedAt ? Utils.formatDatetime(t.deletedAt) : '—'}
                  </td>
                  <td>
                    <div style="display:flex;gap:6px">
                      <button class="btn btn-secondary btn-sm" onclick="Trash.restoreTask('${t.id}')">${Utils.icon('undo-2')} 復元</button>
                      <button class="btn btn-danger btn-sm" onclick="Trash.permanentDeleteTask('${t.id}')">完全削除</button>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderProjects(projects) {
    if (!projects.length) {
      return `<div class="empty-state"><div class="empty-icon">${Utils.icon('sparkles', 40)}</div><div class="empty-title">削除されたプロジェクトはありません</div></div>`;
    }
    return `
      <div class="task-table">
        <table>
          <thead><tr>
            <th>プロジェクト名</th>
            <th>説明</th>
            <th>削除日時</th>
            <th style="width:160px"></th>
          </tr></thead>
          <tbody>
            ${projects.map(p => `
              <tr>
                <td>
                  <span style="display:flex;align-items:center;gap:6px">
                    <span class="project-color-dot" style="background:${p.color||'#94a3b8'}"></span>
                    ${Utils.escapeHtml(p.name)}
                  </span>
                </td>
                <td style="font-size:0.8rem;color:var(--color-text-muted)">${Utils.escapeHtml(p.description||'—')}</td>
                <td style="font-size:0.8rem;color:var(--color-text-muted)">${p.deletedAt ? Utils.formatDatetime(p.deletedAt) : '—'}</td>
                <td>
                  <div style="display:flex;gap:6px">
                    <button class="btn btn-secondary btn-sm" onclick="Trash.restoreProject('${p.id}')">${Utils.icon('undo-2')} 復元</button>
                    <button class="btn btn-danger btn-sm" onclick="Trash.permanentDeleteProject('${p.id}')">完全削除</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  async function restoreTask(id) {
    try {
      await Store.restoreTask(id);
      Toast.show('タスクを復元しました', 'success');
      render();
    } catch (e) {
      Toast.show('復元に失敗しました: ' + e.message, 'error');
    }
  }

  async function restoreProject(id) {
    try {
      await Store.restoreProject(id);
      Toast.show('プロジェクトを復元しました', 'success');
      Projects.renderSidebar();
      render();
    } catch (e) {
      Toast.show('復元に失敗しました: ' + e.message, 'error');
    }
  }

  async function permanentDeleteTask(id) {
    const task = Store.getTaskById(id);
    if (!task) return;
    const ok = await Modal.confirm(`「${task.title}」を完全に削除しますか？この操作は取り消せません。`);
    if (!ok) return;
    try {
      await Store.permanentDeleteTask(id);
      Toast.show('完全に削除しました', 'success');
      render();
    } catch (e) {
      Toast.show('削除に失敗しました: ' + e.message, 'error');
    }
  }

  async function permanentDeleteProject(id) {
    const p = Store.getDeletedProjects().find(x => x.id === id);
    if (!p) return;
    const ok = await Modal.confirm(`「${p.name}」を完全に削除しますか？この操作は取り消せません。`);
    if (!ok) return;
    try {
      await Store.permanentDeleteProject(id);
      Toast.show('完全に削除しました', 'success');
      render();
    } catch (e) {
      Toast.show('削除に失敗しました: ' + e.message, 'error');
    }
  }

  async function emptyTrash() {
    const deletedTasks    = Store.getDeletedTasks();
    const deletedProjects = Store.getDeletedProjects();
    const total = deletedTasks.length + deletedProjects.length;
    const ok = await Modal.confirm(`ゴミ箱内の ${total} 件をすべて完全削除しますか？この操作は取り消せません。`);
    if (!ok) return;
    try {
      const roots = deletedTasks.filter(t => !t.parentId || !deletedTasks.some(p => p.id === t.parentId));
      for (const t of roots) {
        await Store.permanentDeleteTask(t.id);
      }
      for (const p of deletedProjects) {
        await Store.permanentDeleteProject(p.id);
      }
      Toast.show('ゴミ箱を空にしました', 'success');
      Projects.renderSidebar();
      render();
    } catch (e) {
      Toast.show('失敗: ' + e.message, 'error');
    }
  }

  function _setTab(tab) {
    _tab = tab;
    render();
  }

  return { render, restoreTask, restoreProject, permanentDeleteTask, permanentDeleteProject, emptyTrash, _setTab };
})();
