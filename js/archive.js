/* ============================================================
   archive.js — アーカイブ
   ============================================================ */

const Archive = (() => {
  let _tab = 'tasks';

  async function render() {
    const page = document.getElementById('page');
    if (Store.isTasksStale()) await Store.refreshTasks();
    const archivedTasks    = Store.getArchivedTasks();
    const archivedProjects = Store.getProjects(true).filter(p => p.archived);

    page.innerHTML = `
      <div class="page-header">
        <h2 class="page-title">${Utils.icon('archive', 20)} アーカイブ</h2>
      </div>
      <div class="tabs">
        <button class="tab-btn${_tab==='tasks'?' active':''}" onclick="Archive._setTab('tasks')">タスク (${archivedTasks.length})</button>
        <button class="tab-btn${_tab==='projects'?' active':''}" onclick="Archive._setTab('projects')">プロジェクト (${archivedProjects.length})</button>
      </div>
      <div id="archive-content">
        ${_tab === 'tasks' ? renderTasks(archivedTasks) : renderProjects(archivedProjects)}
      </div>
    `;
  }

  function renderTasks(tasks) {
    if (!tasks.length) {
      return `<div class="empty-state"><div class="empty-icon">${Utils.icon('archive', 40)}</div><div class="empty-title">アーカイブされたタスクはありません</div></div>`;
    }
    return `
      <div class="task-table">
        <table>
          <thead><tr>
            <th>タイトル</th>
            <th>状態</th>
            <th>プロジェクト</th>
            <th>アーカイブ日</th>
            <th style="width:120px"></th>
          </tr></thead>
          <tbody>
            ${tasks.map(t => {
              const project = Store.getProjectById(t.projectId);
              return `
                <tr>
                  <td>${Utils.escapeHtml(t.title)}</td>
                  <td><span class="badge badge-${t.status}">${Utils.statusLabel(t.status)}</span></td>
                  <td style="font-size:0.8rem;color:var(--color-text-muted)">${project ? Utils.escapeHtml(project.name) : '—'}</td>
                  <td style="font-size:0.8rem;color:var(--color-text-muted)">${t.archivedAt ? Utils.formatDate(t.archivedAt) : '—'}</td>
                  <td>
                    <button class="btn btn-secondary btn-sm" onclick="Archive.unarchiveTask('${t.id}')">${Utils.icon('undo-2')} 戻す</button>
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
      return `<div class="empty-state"><div class="empty-icon">${Utils.icon('archive', 40)}</div><div class="empty-title">アーカイブされたプロジェクトはありません</div></div>`;
    }
    return `
      <div class="task-table">
        <table>
          <thead><tr>
            <th>プロジェクト名</th>
            <th>説明</th>
            <th style="width:120px"></th>
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
                <td>
                  <button class="btn btn-secondary btn-sm" onclick="Archive.unarchiveProject('${p.id}')">${Utils.icon('undo-2')} 戻す</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  async function unarchiveTask(id) {
    try {
      await Store.unarchiveTask(id);
      Toast.show('タスクをアーカイブから戻しました', 'success');
      render();
    } catch (e) {
      Toast.show('失敗: ' + e.message, 'error');
    }
  }

  async function unarchiveProject(id) {
    try {
      await Store.updateProject(id, { archived: false });
      Toast.show('プロジェクトをアーカイブから戻しました', 'success');
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

  return { render, unarchiveTask, unarchiveProject, _setTab };
})();
