/* ============================================================
   api.js — localhost:7890 APIクライアント
   ============================================================ */

const Api = (() => {
  const BASE = `http://localhost:${AppConfig.port}/api`;

  async function request(method, path, data) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (data !== undefined) opts.body = JSON.stringify(data);

    try {
      const res = await fetch(`${BASE}${path}`, opts);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      return await res.json();
    } catch (e) {
      if (e instanceof TypeError) {
        // ネットワークエラー（サーバー未起動）
        throw new Error('SERVER_DOWN');
      }
      throw e;
    }
  }

  return {
    ping()              { return request('GET',    '/ping'); },

    // Projects
    getProjects()       { return request('GET',    '/projects'); },
    createProject(d)    { return request('POST',   '/projects', d); },
    updateProject(id,d) { return request('PUT',    `/projects/${id}`, d); },
    deleteProject(id)   { return request('DELETE', `/projects/${id}`); },
    reorderProjects(items) { return request('PUT', '/projects/reorder', items); },

    // Tasks
    getTasks()          { return request('GET',    '/tasks'); },
    createTask(d)       { return request('POST',   '/tasks', d); },
    updateTask(id, d)   { return request('PUT',    `/tasks/${id}`, d); },
    deleteTask(id)      { return request('DELETE', `/tasks/${id}`); },
    reorderTasks(items) { return request('PUT',    '/tasks/reorder', items); },

    // Alarms
    getAlarms()         { return request('GET',    '/alarms'); },
    createAlarm(d)      { return request('POST',   '/alarms', d); },
    updateAlarm(id, d)  { return request('PUT',    `/alarms/${id}`, d); },
    deleteAlarm(id)     { return request('DELETE', `/alarms/${id}`); },

    // Files (メモファイルブラウザ)
    getFileTree()       { return request('GET',    '/files/tree'); },
    readFile(path)      { return request('GET',    `/files/read?path=${encodeURIComponent(path)}`); },
    searchFiles(q)      { return request('GET',    `/files/search?q=${encodeURIComponent(q)}`); },
    createFile(d)       { return request('POST',   '/files/create', d); },
    saveFile(d)         { return request('PUT',    '/files/save', d); },
    deleteFile(d)       { return request('DELETE', '/files/delete', d); },
    openFile(d)         { return request('POST',   '/files/open', d); },

    // Templates
    getTemplates()       { return request('GET',    '/templates'); },
    createTemplate(d)    { return request('POST',   '/templates', d); },
    updateTemplate(id,d) { return request('PUT',    `/templates/${id}`, d); },
    deleteTemplate(id)   { return request('DELETE', `/templates/${id}`); },
    reorderTemplates(items) { return request('PUT', '/templates/reorder', items); },

    // Members
    getMembers()        { return request('GET',    '/members'); },

    // Pomodoro
    getPomodoroSettings()   { return request('GET', '/pomodoro/settings'); },
    setPomodoroSettings(d)  { return request('PUT', '/pomodoro/settings', d); },
    getPomodoroState()      { return request('GET', '/pomodoro/state'); },
    setPomodoroState(d)     { return request('PUT', '/pomodoro/state', d); },
  };
})();
