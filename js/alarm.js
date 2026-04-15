/* ============================================================
   alarm.js — アラーム管理
   ============================================================ */

const Alarm = (() => {
  let _countdownInterval = null;

  async function render() {
    const page = document.getElementById('page');
    if (Store.isAlarmsStale()) await Store.refreshAlarms();
    const alarms = Store.getAlarms();

    // 未通知のもの（未来のアラーム）と通知済みを分ける
    const now = new Date();
    const upcoming = alarms.filter(a => !a.notified).sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
    const past     = alarms.filter(a =>  a.notified).sort((a, b) => new Date(b.datetime) - new Date(a.datetime));

    page.innerHTML = `
      <div class="page-header">
        <h2 class="page-title">${Utils.icon('bell-ring', 20)} アラーム</h2>
      </div>

      <!-- 新規アラーム作成フォーム -->
      <div class="card" style="margin-bottom:20px">
        <div class="card-header">
          <span style="font-weight:600">新しいアラームを登録</span>
        </div>
        <div class="card-body">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">タイトル *</label>
              <input type="text" id="alarm-title" class="form-control" placeholder="例: チームミーティング" maxlength="100">
            </div>
            <div class="form-group">
              <label class="form-label">日時 *</label>
              <input type="datetime-local" id="alarm-datetime" class="form-control">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">繰り返し</label>
            <select id="alarm-recurrence" class="form-control">
              <option value="none">なし（1回のみ）</option>
              <option value="daily">毎日</option>
              <option value="weekly">毎週</option>
              <option value="monthly">毎月</option>
            </select>
          </div>
          <div style="display:flex;justify-content:flex-end">
            <button class="btn btn-primary" onclick="Alarm._create()">+ 登録</button>
          </div>
        </div>
      </div>

      <!-- 予定アラーム -->
      <div style="margin-bottom:16px">
        <div class="section-header">
          <span class="section-title">予定 (${upcoming.length}件)</span>
        </div>
        ${upcoming.length === 0 ? `
          <div class="empty-state" style="padding:24px">
            <div class="empty-icon">${Utils.icon('bell-ring', 40)}</div>
            <div class="empty-desc">予定されたアラームはありません</div>
          </div>
        ` : `
          <div id="alarm-upcoming" style="display:flex;flex-direction:column;gap:8px">
            ${upcoming.map(a => renderAlarmCard(a, false)).join('')}
          </div>
        `}
      </div>

      <!-- 通知済み -->
      ${past.length > 0 ? `
        <div>
          <div class="section-header">
            <span class="section-title" style="color:var(--color-text-muted)">通知済み (${past.length}件)</span>
            <button class="btn btn-ghost btn-sm" onclick="Alarm._clearPast()">クリア</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;opacity:0.6">
            ${past.map(a => renderAlarmCard(a, true)).join('')}
          </div>
        </div>
      ` : ''}
    `;

    // カウントダウン更新
    if (_countdownInterval) clearInterval(_countdownInterval);
    _countdownInterval = setInterval(() => {
      document.querySelectorAll('.alarm-countdown').forEach(el => {
        const dt = el.dataset.datetime;
        if (dt) el.textContent = Utils.formatRelative(dt);
      });
    }, 30000);

    // datetime-local のデフォルト値を今から1時間後に
    const d = new Date(Date.now() + 3600000);
    const pad = n => String(n).padStart(2, '0');
    document.getElementById('alarm-datetime').value =
      `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const RECURRENCE_LABELS = { daily: '毎日', weekly: '毎週', monthly: '毎月' };

  function renderAlarmCard(a, isPast) {
    const dt = new Date(a.datetime);
    const relative = Utils.formatRelative(a.datetime);
    const recLabel = a.recurrence && a.recurrence !== 'none' ? RECURRENCE_LABELS[a.recurrence] : null;
    return `
      <div class="card" style="display:flex;align-items:center;padding:12px 16px;gap:12px">
        <div style="font-size:1.5rem">${isPast ? Utils.icon('check-circle', 24) : Utils.icon('bell', 24)}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;margin-bottom:2px">
            ${Utils.escapeHtml(a.title)}
            ${recLabel ? `<span class="badge badge-info" style="margin-left:6px;font-size:0.7rem">${Utils.icon('repeat', 12)} ${recLabel}</span>` : ''}
          </div>
          <div style="font-size:0.8rem;color:var(--color-text-muted)">
            ${Utils.formatDatetime(a.datetime)}
            &nbsp;·&nbsp;
            <span class="alarm-countdown" data-datetime="${a.datetime}">${relative}</span>
          </div>
        </div>
        <button class="btn btn-ghost btn-sm btn-icon" onclick="Alarm._openEdit('${a.id}')" title="編集">${Utils.icon('pencil')}</button>
        <button class="btn btn-ghost btn-sm btn-icon" onclick="Alarm._delete('${a.id}')" title="削除">${Utils.icon('trash-2')}</button>
      </div>
    `;
  }

  async function _create() {
    const title    = document.getElementById('alarm-title').value.trim();
    const datetime = document.getElementById('alarm-datetime').value;

    if (!title)    { Toast.show('タイトルを入力してください', 'error'); return; }
    if (!datetime) { Toast.show('日時を設定してください', 'error'); return; }

    const recurrence = document.getElementById('alarm-recurrence').value;

    const dtObj = new Date(datetime);
    if (dtObj <= new Date()) {
      Toast.show('過去の日時は設定できません', 'error'); return;
    }

    try {
      await Store.createAlarm({ title, datetime: dtObj.toISOString(), notified: false, recurrence });
      Toast.show('アラームを登録しました', 'success');
      render();
    } catch (e) {
      Toast.show('登録に失敗しました: ' + e.message, 'error');
    }
  }

  async function _delete(id) {
    try {
      await Store.deleteAlarm(id);
      Toast.show('アラームを削除しました', 'success');
      render();
    } catch (e) {
      Toast.show('削除に失敗しました: ' + e.message, 'error');
    }
  }

  async function _clearPast() {
    const alarms = Store.getAlarms();
    const pastIds = alarms.filter(a => a.notified).map(a => a.id);
    try {
      for (const id of pastIds) {
        await Store.deleteAlarm(id);
      }
      Toast.show('通知済みをクリアしました', 'success');
      render();
    } catch (e) {
      Toast.show('失敗: ' + e.message, 'error');
    }
  }

  function _openEdit(id) {
    const alarm = Store.getAlarms().find(a => a.id === id);
    if (!alarm) return;

    const dt = new Date(alarm.datetime);
    const pad = n => String(n).padStart(2, '0');
    const dtLocal = `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    const rec = alarm.recurrence || 'none';

    const body = `
      <div class="form-group">
        <label class="form-label">タイトル *</label>
        <input type="text" id="edit-alarm-title" class="form-control" value="${Utils.escapeHtml(alarm.title)}" maxlength="100">
      </div>
      <div class="form-group">
        <label class="form-label">日時 *</label>
        <input type="datetime-local" id="edit-alarm-datetime" class="form-control" value="${dtLocal}">
      </div>
      <div class="form-group">
        <label class="form-label">繰り返し</label>
        <select id="edit-alarm-recurrence" class="form-control">
          <option value="none"${rec==='none'?' selected':''}>なし（1回のみ）</option>
          <option value="daily"${rec==='daily'?' selected':''}>毎日</option>
          <option value="weekly"${rec==='weekly'?' selected':''}>毎週</option>
          <option value="monthly"${rec==='monthly'?' selected':''}>毎月</option>
        </select>
      </div>
    `;
    const footer = `
      <button class="btn btn-secondary" onclick="Modal.close()">キャンセル</button>
      <button class="btn btn-primary" onclick="Alarm._saveEdit('${id}')">保存</button>
    `;
    Modal.open('アラームを編集', body, footer);
  }

  async function _saveEdit(id) {
    const title    = document.getElementById('edit-alarm-title').value.trim();
    const datetime = document.getElementById('edit-alarm-datetime').value;
    const recurrence = document.getElementById('edit-alarm-recurrence').value;

    if (!title)    { Toast.show('タイトルを入力してください', 'error'); return; }
    if (!datetime) { Toast.show('日時を設定してください', 'error'); return; }

    const dtObj = new Date(datetime);

    try {
      await Store.updateAlarm(id, { title, datetime: dtObj.toISOString(), recurrence, notified: false });
      Modal.close();
      Toast.show('アラームを更新しました', 'success');
      render();
    } catch (e) {
      Toast.show('更新に失敗しました: ' + e.message, 'error');
    }
  }

  return { render, _create, _delete, _clearPast, _openEdit, _saveEdit };
})();
