/* ============================================================
   filters.js — フィルターバー状態管理
   ============================================================ */

const Filters = (() => {
  let _state = {
    projectId:   null,
    status:      [],
    priority:    [],
    tags:        [],
    assignee:    '',
    dueBefore:   '',
    dueAfter:    '',
    searchText:  '',
    sortKey:     'createdAt',
    sortDir:     'desc'
  };

  let _collapsed = false;
  let _onChangeCallback = null;

  function getState() { return { ..._state }; }

  function setState(partial) {
    _state = { ..._state, ...partial };
    if (_onChangeCallback) _onChangeCallback();
  }

  function reset() {
    _state = {
      projectId: null, status: [], priority: [], tags: [],
      assignee: '', dueBefore: '', dueAfter: '', searchText: '',
      sortKey: 'createdAt', sortDir: 'desc'
    };
    if (_onChangeCallback) _onChangeCallback();
  }

  function onFilterChange(cb) { _onChangeCallback = cb; }

  function countActive() {
    let n = 0;
    if (_state.projectId) n++;
    if (_state.status.length) n++;
    if (_state.priority.length) n++;
    if (_state.tags.length) n++;
    if (_state.assignee) n++;
    if (_state.dueBefore) n++;
    if (_state.dueAfter) n++;
    if (_state.searchText) n++;
    return n;
  }

  // ---- フィルター適用 ----
  function apply(tasks) {
    let result = [...tasks];

    if (_state.projectId === '__none__') {
      result = result.filter(t => !t.projectId);
    } else if (_state.projectId) {
      result = result.filter(t => t.projectId === _state.projectId);
    }
    if (_state.status.length) {
      result = result.filter(t => _state.status.includes(t.status));
    }
    if (_state.priority.length) {
      result = result.filter(t => _state.priority.includes(t.priority));
    }
    if (_state.tags.length) {
      result = result.filter(t =>
        _state.tags.every(tag => (t.tags || []).includes(tag))
      );
    }
    if (_state.assignee === '__none__') {
      result = result.filter(t => !t.assignee);
    } else if (_state.assignee) {
      result = result.filter(t => t.assignee === _state.assignee);
    }
    if (_state.dueAfter) {
      result = result.filter(t => t.dueDate && t.dueDate >= _state.dueAfter);
    }
    if (_state.dueBefore) {
      result = result.filter(t => t.dueDate && t.dueDate <= _state.dueBefore);
    }
    if (_state.searchText) {
      const q = _state.searchText.toLowerCase();
      result = result.filter(t =>
        (t.title || '').toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q)
      );
    }

    // ソート
    result = sortTasks(result, _state.sortKey, _state.sortDir);
    return result;
  }

  function sortTasks(tasks, key, dir) {
    return [...tasks].sort((a, b) => {
      let av = a[key] ?? '';
      let bv = b[key] ?? '';

      if (key === 'priority') {
        av = Utils.PRIORITY_ORDER[av] ?? 99;
        bv = Utils.PRIORITY_ORDER[bv] ?? 99;
      }

      let cmp = 0;
      if (typeof av === 'string') cmp = av.localeCompare(bv, 'ja');
      else cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return dir === 'asc' ? cmp : -cmp;
    });
  }

  // ---- マルチセレクトドロップダウン描画 ----
  function renderMultiSelect(id, label, options, selected) {
    const count = selected.length;
    const displayLabel = count > 0 ? `${label} (${count})` : label;
    const items = options.map(([v, l]) =>
      `<label class="filter-dropdown-item">
        <input type="checkbox" value="${Utils.escapeHtml(v)}" data-filter-group="${id}"
               ${selected.includes(v) ? 'checked' : ''}
               onchange="Filters._onChange()">
        <span>${Utils.escapeHtml(l)}</span>
      </label>`
    ).join('');

    return `
      <div class="filter-group">
        <label class="filter-label">${label}</label>
        <div class="filter-dropdown" id="${id}-dropdown">
          <button type="button" class="form-control filter-dropdown-btn" onclick="Filters._toggleDropdown('${id}-dropdown')">
            <span>${displayLabel}</span>
            ${Utils.icon('chevron-down', 14)}
          </button>
          <div class="filter-dropdown-menu">
            ${items}
          </div>
        </div>
      </div>
    `;
  }

  function _toggleDropdown(dropdownId) {
    const el = document.getElementById(dropdownId);
    if (!el) return;
    const wasOpen = el.classList.contains('open');
    // 他のドロップダウンを閉じる
    document.querySelectorAll('.filter-dropdown.open').forEach(d => d.classList.remove('open'));
    if (!wasOpen) el.classList.add('open');
  }

  // ドロップダウン外クリックで閉じる
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.filter-dropdown')) {
      document.querySelectorAll('.filter-dropdown.open').forEach(d => d.classList.remove('open'));
    }
  });

  // ---- フィルターバー描画 ----
  function renderBar(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const projects = Store.getProjects();
    const allTags  = collectTags();
    const active   = countActive();

    el.innerHTML = `
      <div class="filter-bar">
        <div class="filter-bar-header" onclick="Filters._toggle()">
          <span class="filter-bar-title">
            ${Utils.icon('search')} フィルター
            ${active > 0 ? `<span class="filter-active-count">${active}</span>` : ''}
          </span>
          <span id="filter-toggle-icon">${_collapsed ? Utils.icon('chevron-down') : Utils.icon('chevron-up')}</span>
        </div>
        <div class="filter-body${_collapsed ? ' collapsed' : ''}" id="filter-body">
          <div class="filter-group">
            <label class="filter-label">キーワード</label>
            <input type="text" class="form-control" id="f-search" value="${Utils.escapeHtml(_state.searchText)}"
                   placeholder="タイトル・説明で検索"
                   oninput="Filters._onSearch(this.value)">
          </div>

          <div class="filter-group">
            <label class="filter-label">プロジェクト</label>
            <select class="form-control" id="f-project" onchange="Filters._onChange()">
              <option value="">すべて</option>
              <option value="__none__" ${_state.projectId === '__none__' ? 'selected' : ''}>未指定</option>
              ${projects.map(p => `<option value="${p.id}" ${_state.projectId === p.id ? 'selected' : ''}>${Utils.escapeHtml(p.name)}</option>`).join('')}
            </select>
          </div>

          ${renderMultiSelect('f-status', '状態', Object.entries(Utils.STATUS_LABELS), _state.status)}

          ${renderMultiSelect('f-priority', '優先度', Object.entries(Utils.PRIORITY_LABELS), _state.priority)}

          <div class="filter-group">
            <label class="filter-label">担当者</label>
            <select class="form-control" id="f-assignee" onchange="Filters._onChange()">
              <option value="">すべて</option>
              <option value="__none__" ${_state.assignee === '__none__' ? 'selected' : ''}>未指定</option>
              ${Store.getMembers().map(m => `<option value="${Utils.escapeHtml(m)}" ${_state.assignee === m ? 'selected' : ''}>${Utils.escapeHtml(m)}</option>`).join('')}
            </select>
          </div>

          <div class="filter-group">
            <label class="filter-label">期限（開始）</label>
            <input type="date" class="form-control" id="f-due-after" value="${_state.dueAfter}"
                   onchange="Filters._onChange()">
          </div>

          <div class="filter-group">
            <label class="filter-label">期限（終了）</label>
            <input type="date" class="form-control" id="f-due-before" value="${_state.dueBefore}"
                   onchange="Filters._onChange()">
          </div>

          ${allTags.length ? renderMultiSelect('f-tags', 'タグ', allTags.map(t => [t, t]), _state.tags) : ''}
        </div>
        ${active > 0 ? `
        <div class="filter-footer">
          <button class="btn btn-ghost btn-sm" onclick="Filters._clear()">${Utils.icon('x')} フィルターをクリア</button>
        </div>
        ` : ''}
      </div>
    `;
  }

  function collectTags() {
    const all = new Set();
    Store.getTasks().forEach(t => (t.tags || []).forEach(tag => all.add(tag)));
    return [...all].sort();
  }

  function _toggle() {
    _collapsed = !_collapsed;
    const body = document.getElementById('filter-body');
    const icon = document.getElementById('filter-toggle-icon');
    if (body) body.classList.toggle('collapsed', _collapsed);
    if (icon) {
      icon.innerHTML = _collapsed ? Utils.icon('chevron-down') : Utils.icon('chevron-up');
      Utils.refreshIcons(icon);
    }
  }

  const _debouncedSearch = Utils.debounce(v => {
    setState({ searchText: v });
  }, 300);

  function _onSearch(v) { _debouncedSearch(v); }

  function _onChange() {
    const project  = document.getElementById('f-project');
    const assignee = document.getElementById('f-assignee');
    const dueAfter  = document.getElementById('f-due-after');
    const dueBefore = document.getElementById('f-due-before');

    const getChecked = (group) =>
      [...document.querySelectorAll(`input[data-filter-group="${group}"]:checked`)].map(cb => cb.value);

    setState({
      projectId:  project?.value || null,
      status:     getChecked('f-status'),
      priority:   getChecked('f-priority'),
      assignee:   assignee?.value || '',
      dueAfter:   dueAfter?.value || '',
      dueBefore:  dueBefore?.value || '',
      tags:       getChecked('f-tags')
    });
  }

  function _clear() {
    reset();
    if (_onChangeCallback) _onChangeCallback();
  }

  return {
    getState, setState, reset, onFilterChange,
    countActive, apply,
    renderBar, collectTags,
    _toggle, _toggleDropdown, _onSearch, _onChange, _clear
  };
})();
