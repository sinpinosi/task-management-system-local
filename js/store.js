/* ============================================================
   store.js — データキャッシュ管理
   ============================================================ */

const Store = (() => {
  let _projects  = [];
  let _tasks     = [];
  let _alarms    = [];
  let _fileTree  = [];
  let _templates = [];
  let _members   = [];
  let _tasksLoadedAt  = 0;
  let _alarmsLoadedAt = 0;
  let _fileTreeLoadedAt = 0;

  async function loadAll() {
    try {
      [_projects, _tasks, _alarms, _fileTree, _templates, _members] = await Promise.all([
        Api.getProjects(),
        Api.getTasks(),
        Api.getAlarms(),
        Api.getFileTree(),
        Api.getTemplates(),
        Api.getMembers()
      ]);
      // ��列として保証
      _projects  = Array.isArray(_projects)  ? _projects  : [];
      _tasks     = Array.isArray(_tasks)     ? _tasks     : [];
      _tasksLoadedAt = Date.now();
      _alarms    = Array.isArray(_alarms)    ? _alarms    : [];
      _alarmsLoadedAt = Date.now();
      _fileTree  = Array.isArray(_fileTree)  ? _fileTree  : [];
      _fileTreeLoadedAt = Date.now();
      _templates = Array.isArray(_templates) ? _templates : [];
      _members   = Array.isArray(_members)   ? _members   : [];
    } catch (e) {
      console.error('Store.loadAll failed:', e.message);
      throw e;
    }
  }

  // ---- Projects ----
  function getProjects(includeArchived = false) {
    return _projects.filter(p => !p.deleted && (includeArchived || !p.archived));
  }

  function getDeletedProjects() {
    return _projects.filter(p => p.deleted);
  }

  async function createProject(data) {
    const p = await Api.createProject(data);
    _projects.push(p);
    return p;
  }

  async function updateProject(id, data) {
    const p = await Api.updateProject(id, data);
    const idx = _projects.findIndex(x => x.id === id);
    if (idx >= 0) _projects[idx] = p;
    return p;
  }

  async function softDeleteProject(id) {
    const p = await Api.updateProject(id, { deleted: true, deletedAt: new Date().toISOString() });
    const idx = _projects.findIndex(x => x.id === id);
    if (idx >= 0) _projects[idx] = p;
    return p;
  }

  async function restoreProject(id) {
    const p = await Api.updateProject(id, { deleted: false, deletedAt: null });
    const idx = _projects.findIndex(x => x.id === id);
    if (idx >= 0) _projects[idx] = p;
    return p;
  }

  async function permanentDeleteProject(id) {
    await Api.deleteProject(id);
    _projects = _projects.filter(x => x.id !== id);
  }

  async function reorderProjects(items) {
    await Api.reorderProjects(items);
    for (const {id, sortOrder} of items) {
      const p = _projects.find(x => x.id === id);
      if (p) p.sortOrder = sortOrder;
    }
  }

  function getProjectById(id) {
    return _projects.find(p => p.id === id) || null;
  }

  // ---- Tasks ----
  function getTasks({ includeDeleted = false, includeArchived = false } = {}) {
    return _tasks.filter(t =>
      (includeDeleted  || !t.deleted)  &&
      (includeArchived || !t.archived)
    );
  }

  function getTaskById(id) {
    return _tasks.find(t => t.id === id) || null;
  }

  function getChildren(parentId) {
    return _tasks.filter(t => t.parentId === parentId && !t.deleted);
  }

  function getDescendants(id) {
    const result = [];
    const queue = [id];
    while (queue.length) {
      const cur = queue.shift();
      const children = _tasks.filter(t => t.parentId === cur);
      children.forEach(c => {
        result.push(c.id);
        queue.push(c.id);
      });
    }
    return result;
  }

  async function createTask(data) {
    const t = await Api.createTask(data);
    _tasks.push(t);
    // 親の childIds をキャッシュ上でも更新
    if (data.parentId) {
      const parent = _tasks.find(x => x.id === data.parentId);
      if (parent) {
        parent.childIds = [...(parent.childIds || []), t.id];
      }
    }
    return t;
  }

  async function updateTask(id, data) {
    const t = await Api.updateTask(id, data);
    const idx = _tasks.findIndex(x => x.id === id);
    if (idx >= 0) _tasks[idx] = t;
    return t;
  }

  async function softDeleteTask(id) {
    const descendants = getDescendants(id);
    const allIds = [id, ...descendants];
    for (const tid of allIds) {
      const t = await Api.updateTask(tid, { deleted: true, deletedAt: new Date().toISOString() });
      const idx = _tasks.findIndex(x => x.id === tid);
      if (idx >= 0) _tasks[idx] = t;
    }
  }

  async function restoreTask(id) {
    const t = await Api.updateTask(id, { deleted: false, deletedAt: null });
    const idx = _tasks.findIndex(x => x.id === id);
    if (idx >= 0) _tasks[idx] = t;
    return t;
  }

  async function archiveTask(id) {
    const descendants = getDescendants(id);
    const allIds = [id, ...descendants];
    for (const tid of allIds) {
      const t = await Api.updateTask(tid, { archived: true, archivedAt: new Date().toISOString() });
      const idx = _tasks.findIndex(x => x.id === tid);
      if (idx >= 0) _tasks[idx] = t;
    }
  }

  async function unarchiveTask(id) {
    const t = await Api.updateTask(id, { archived: false, archivedAt: null });
    const idx = _tasks.findIndex(x => x.id === id);
    if (idx >= 0) _tasks[idx] = t;
    return t;
  }

  async function permanentDeleteTask(id) {
    const descendants = getDescendants(id);
    const allIds = [id, ...descendants];
    for (const tid of allIds) {
      await Api.deleteTask(tid);
      _tasks = _tasks.filter(x => x.id !== tid);
    }
  }

  async function reorderTasks(items) {
    await Api.reorderTasks(items);
    for (const {id, sortOrder} of items) {
      const t = _tasks.find(x => x.id === id);
      if (t) t.sortOrder = sortOrder;
    }
  }

  function getDeletedTasks() {
    return _tasks.filter(t => t.deleted);
  }

  function getArchivedTasks() {
    return _tasks.filter(t => t.archived && !t.deleted);
  }

  // ---- Templates ----
  function getTemplates() { return [..._templates]; }
  function getTemplateById(id) { return _templates.find(t => t.id === id) || null; }

  async function reorderTemplates(items) {
    await Api.reorderTemplates(items);
    for (const {id, sortOrder} of items) {
      const t = _templates.find(x => x.id === id);
      if (t) t.sortOrder = sortOrder;
    }
  }

  async function createTemplate(data) {
    const t = await Api.createTemplate(data);
    _templates.push(t);
    return t;
  }

  async function updateTemplate(id, data) {
    const t = await Api.updateTemplate(id, data);
    const idx = _templates.findIndex(x => x.id === id);
    if (idx >= 0) _templates[idx] = t;
    return t;
  }

  async function deleteTemplate(id) {
    await Api.deleteTemplate(id);
    _templates = _templates.filter(x => x.id !== id);
  }

  // ---- Alarms ----
  function getAlarms() { return [..._alarms]; }

  async function createAlarm(data) {
    const a = await Api.createAlarm(data);
    _alarms.push(a);
    return a;
  }

  async function updateAlarm(id, data) {
    const a = await Api.updateAlarm(id, data);
    const idx = _alarms.findIndex(x => x.id === id);
    if (idx >= 0) _alarms[idx] = a;
    return a;
  }

  async function deleteAlarm(id) {
    await Api.deleteAlarm(id);
    _alarms = _alarms.filter(x => x.id !== id);
  }

  // ---- Files (メモファイルブラウザ) ----
  function getFileTree() { return [..._fileTree]; }

  async function readFile(path) { return Api.readFile(path); }

  async function createFile(path, content) {
    const result = await Api.createFile({ path, content });
    _fileTreeLoadedAt = 0;
    return result;
  }

  async function saveFile(path, content) {
    const result = await Api.saveFile({ path, content });
    _fileTreeLoadedAt = 0;
    return result;
  }

  async function deleteFile(path) {
    const result = await Api.deleteFile({ path });
    _fileTree = _fileTree.filter(f => f.path !== path);
    _fileTreeLoadedAt = 0;
    return result;
  }

  async function openFile(path) { return Api.openFile({ path }); }

  // ---- キャッシュ再読み込み ----
  async function refreshTasks() {
    _tasks = await Api.getTasks();
    _tasks = Array.isArray(_tasks) ? _tasks : [];
    _tasksLoadedAt = Date.now();
  }

  async function refreshAlarms() {
    _alarms = await Api.getAlarms();
    _alarms = Array.isArray(_alarms) ? _alarms : [];
    _alarmsLoadedAt = Date.now();
  }

  function getMembers() { return [..._members]; }

  function isTasksStale(maxAgeMs = 30000) { return Date.now() - _tasksLoadedAt > maxAgeMs; }
  function isAlarmsStale(maxAgeMs = 30000) { return Date.now() - _alarmsLoadedAt > maxAgeMs; }
  function isFileTreeStale(maxAgeMs = 30000) { return Date.now() - _fileTreeLoadedAt > maxAgeMs; }

  async function refreshFileTree() {
    _fileTree = await Api.getFileTree();
    _fileTree = Array.isArray(_fileTree) ? _fileTree : [];
    _fileTreeLoadedAt = Date.now();
  }

  return {
    loadAll,
    // projects
    getProjects, getDeletedProjects, createProject, updateProject,
    softDeleteProject, restoreProject, permanentDeleteProject, reorderProjects, getProjectById,
    // tasks
    getTasks, getTaskById, getChildren, getDescendants,
    createTask, updateTask, softDeleteTask, restoreTask,
    archiveTask, unarchiveTask, permanentDeleteTask,
    reorderTasks, getDeletedTasks, getArchivedTasks,
    // templates
    getTemplates, getTemplateById, createTemplate, updateTemplate, deleteTemplate, reorderTemplates,
    // alarms
    getAlarms, createAlarm, updateAlarm, deleteAlarm,
    // files (メモファイルブラウザ)
    getFileTree, readFile, createFile, saveFile, deleteFile, openFile,
    // members
    getMembers,
    // refresh
    refreshTasks, refreshAlarms, refreshFileTree,
    isTasksStale, isAlarmsStale, isFileTreeStale
  };
})();
