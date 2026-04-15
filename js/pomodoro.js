/* ============================================================
   pomodoro.js — ポモドーロタイマー
   ============================================================ */

const Pomodoro = (() => {
  let _settings = { workMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, cyclesBeforeLongBreak: 3 };
  let _state    = { phase: 'idle', cycleCount: 0, startedAt: null, pausedAt: null, totalPausedMs: 0 };
  let _tickInterval = null;

  const PHASE_LABELS = { idle: 'アイドル', work: '集中', short_break: '短休憩', long_break: '長休憩' };
  const PHASE_COLORS = { idle: 'var(--pomo-idle)', work: 'var(--pomo-work)', short_break: 'var(--pomo-short-break)', long_break: 'var(--pomo-long-break)' };

  // ---- 初期化 ----
  async function init() {
    try {
      _settings = await Api.getPomodoroSettings();
      _state    = await Api.getPomodoroState();
      if (!_settings || !_settings.workMinutes) {
        _settings = { workMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, cyclesBeforeLongBreak: 3 };
      }
      if (!_state || !_state.phase) {
        _state = { phase: 'idle', cycleCount: 0, startedAt: null, pausedAt: null, totalPausedMs: 0 };
      }
    } catch (e) {
      // サーバー未起動時はデフォルト値を使用
    }
    startTick();
    renderWidget();
  }

  // ---- ティック ----
  function startTick() {
    if (_tickInterval) clearInterval(_tickInterval);
    _tickInterval = setInterval(tick, 1000);
  }

  function tick() {
    if (_state.phase === 'idle' || _state.pausedAt) {
      renderWidget();
      return;
    }

    const remaining = getRemainingMs();
    if (remaining <= 0) {
      _phaseComplete();
    } else {
      renderWidget();
      // ポモドーロページが開いていれば更新
      const { base } = Router.getCurrentRoute();
      if (base === '/pomodoro') updateTimerDisplay();
    }
  }

  function getRemainingMs() {
    if (_state.phase === 'idle' || !_state.startedAt) return 0;
    const phaseDuration = getPhaseDurationMs();
    const now = Date.now();
    const startedAt = new Date(_state.startedAt).getTime();
    const totalPausedMs = _state.totalPausedMs || 0;
    const elapsed = now - startedAt - totalPausedMs;
    return Math.max(0, phaseDuration - elapsed);
  }

  function getPhaseDurationMs() {
    switch (_state.phase) {
      case 'work':        return (_settings.workMinutes || 25) * 60000;
      case 'short_break': return (_settings.shortBreakMinutes || 5) * 60000;
      case 'long_break':  return (_settings.longBreakMinutes || 15) * 60000;
      default: return 0;
    }
  }

  function formatTime(ms) {
    const totalSec = Math.ceil(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // ---- フェーズ完了 ----
  async function _phaseComplete() {
    const { cycleCount = 0, phase } = _state;
    const cyclesBeforeLong = _settings.cyclesBeforeLongBreak || 3;

    let nextPhase, nextCycleCount, msg;

    if (phase === 'work') {
      const newCount = cycleCount + 1;
      if (newCount >= cyclesBeforeLong) {
        nextPhase = 'long_break';
        nextCycleCount = 0;
        msg = `長い休憩を取りましょう (${_settings.longBreakMinutes}分)`;
      } else {
        nextPhase = 'short_break';
        nextCycleCount = newCount;
        msg = `短い休憩を取りましょう (${_settings.shortBreakMinutes}分)`;
      }
      Toast.show('ポモドーロ完了！ ' + msg, 'success', 5000);
    } else {
      nextPhase = 'work';
      nextCycleCount = cycleCount;
      msg = `集中タイムを始めましょう (${_settings.workMinutes}分)`;
      Toast.show('休憩終了！ ' + msg, 'info', 5000);
    }

    // 次フェーズへ遷移
    _state = {
      phase: nextPhase,
      cycleCount: nextCycleCount,
      startedAt: new Date().toISOString(),
      pausedAt: null,
      totalPausedMs: 0
    };

    try { await Api.setPomodoroState(_state); } catch (e) {}

    renderWidget();
    const { base } = Router.getCurrentRoute();
    if (base === '/pomodoro') render();
  }

  // ---- 操作 ----
  async function start() {
    _state = {
      phase: 'work',
      cycleCount: 0,
      startedAt: new Date().toISOString(),
      pausedAt: null,
      totalPausedMs: 0
    };
    try { await Api.setPomodoroState(_state); } catch (e) {}
    renderWidget();
    render();
  }

  async function pause() {
    if (_state.phase === 'idle' || _state.pausedAt) return;
    _state.pausedAt = new Date().toISOString();
    try { await Api.setPomodoroState(_state); } catch (e) {}
    renderWidget();
    const { base } = Router.getCurrentRoute();
    if (base === '/pomodoro') render();
  }

  async function resume() {
    if (!_state.pausedAt) return;
    const pausedMs = Date.now() - new Date(_state.pausedAt).getTime();
    _state.totalPausedMs = (_state.totalPausedMs || 0) + pausedMs;
    _state.pausedAt = null;
    try { await Api.setPomodoroState(_state); } catch (e) {}
    renderWidget();
    const { base } = Router.getCurrentRoute();
    if (base === '/pomodoro') render();
  }

  async function stop() {
    _state = { phase: 'idle', cycleCount: 0, startedAt: null, pausedAt: null, totalPausedMs: 0 };
    try { await Api.setPomodoroState(_state); } catch (e) {}
    renderWidget();
    const { base } = Router.getCurrentRoute();
    if (base === '/pomodoro') render();
  }

  async function togglePause() {
    if (_state.pausedAt) await resume();
    else await pause();
  }

  // ---- サイドバーウィジェット ----
  function renderWidget() {
    const el = document.getElementById('pomodoro-widget');
    if (!el) return;

    const phase   = _state.phase;
    const isPaused = !!_state.pausedAt;
    const isIdle  = phase === 'idle';
    const remaining = isIdle ? getPhaseDurationMs() : getRemainingMs();
    const color   = PHASE_COLORS[phase] || PHASE_COLORS.idle;

    // 最初の表示時間をデフォルト表示（アイドル時）
    const displayTime = isIdle ? formatTime((_settings.workMinutes || 25) * 60000) : formatTime(remaining);

    el.innerHTML = `
      <div class="widget-label">ポモドーロ</div>
      <div class="widget-body">
        <div>
          <div class="pomo-phase" style="color:${color}">${PHASE_LABELS[phase] || '—'}</div>
          <div class="pomo-time" id="pomo-widget-time">${displayTime}</div>
        </div>
        <div style="display:flex;gap:4px">
          ${!isIdle ? `
            <button class="pomo-toggle" onclick="Pomodoro.togglePause()" title="${isPaused ? '再開' : '一時停止'}">
              ${isPaused ? Utils.icon('play', 14) : Utils.icon('pause', 14)}
            </button>
            <button class="pomo-toggle" onclick="Pomodoro.stop()" title="停止">${Utils.icon('square', 14)}</button>
          ` : `
            <button class="pomo-toggle" onclick="Pomodoro.start()" title="開始">${Utils.icon('play', 14)}</button>
          `}
        </div>
      </div>
      ${!isIdle ? `
        <div style="margin-top:6px;font-size:0.7rem;opacity:0.5">
          サイクル ${_state.cycleCount || 0}/${_settings.cyclesBeforeLongBreak || 3}
        </div>
      ` : ''}
    `;
    Utils.refreshIcons(el);
  }

  // ---- ウィジェットの時間表示だけ更新 ----
  function updateTimerDisplay() {
    const timeEl = document.getElementById('pomo-main-time');
    if (timeEl) {
      timeEl.textContent = formatTime(getRemainingMs());
    }
    const widgetTime = document.getElementById('pomo-widget-time');
    if (widgetTime && _state.phase !== 'idle') {
      widgetTime.textContent = formatTime(getRemainingMs());
    }
  }

  // ---- ポモドーロページ ----
  async function render() {
    const page = document.getElementById('page');
    const isPaused = !!_state.pausedAt;
    const isIdle = _state.phase === 'idle';
    const phase = _state.phase;
    const color = PHASE_COLORS[phase] || PHASE_COLORS.idle;
    const remaining = isIdle ? getPhaseDurationMs() : getRemainingMs();

    page.innerHTML = `
      <div class="page-header">
        <h2 class="page-title">${Utils.icon('timer', 20)} ポモドーロタイマー</h2>
      </div>

      <div style="display:grid;grid-template-columns:1fr 280px;gap:20px">
        <!-- タイマー -->
        <div class="card card-body" style="text-align:center;padding:40px 24px">
          <div style="font-size:0.9rem;font-weight:600;color:${color};margin-bottom:12px;letter-spacing:0.05em">
            ${PHASE_LABELS[phase] || '—'}
            ${!isIdle ? `• サイクル ${_state.cycleCount || 0}/${_settings.cyclesBeforeLongBreak || 3}` : ''}
          </div>

          <!-- 円形タイマー -->
          <div style="position:relative;width:220px;height:220px;margin:0 auto 24px">
            ${renderTimerCircle(remaining, getPhaseDurationMs(), color)}
            <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column">
              <div id="pomo-main-time" style="font-size:3rem;font-weight:700;font-variant-numeric:tabular-nums;color:var(--color-text)">
                ${formatTime(remaining)}
              </div>
              ${isPaused ? `<div style="font-size:0.8rem;color:var(--color-warning);margin-top:4px">一時停止中</div>` : ''}
            </div>
          </div>

          <!-- 操作ボタン -->
          <div style="display:flex;gap:12px;justify-content:center">
            ${isIdle ? `
              <button class="btn btn-primary" style="padding:10px 28px;font-size:1rem" onclick="Pomodoro.start()">${Utils.icon('play')} 開始</button>
            ` : `
              <button class="btn btn-secondary" style="padding:10px 20px" onclick="Pomodoro.togglePause()">
                ${isPaused ? Utils.icon('play') + ' 再開' : Utils.icon('pause') + ' 一時停止'}
              </button>
              <button class="btn btn-danger" style="padding:10px 20px" onclick="Pomodoro.stop()">${Utils.icon('square')} 停止</button>
            `}
          </div>

          <!-- フェーズ説明 -->
          <div style="margin-top:20px;font-size:0.8rem;color:var(--color-text-muted)">
            ${isIdle ? '「開始」を押してポモドーロを始めましょう' : getPhaseHint()}
          </div>
        </div>

        <!-- 設定 -->
        <div>
          <div class="card card-body" style="margin-bottom:12px">
            <div style="font-weight:600;margin-bottom:14px">${Utils.icon('settings')} 設定</div>
            <div class="form-group">
              <label class="form-label">集中時間（分）</label>
              <input type="number" id="pomo-work" class="form-control" value="${_settings.workMinutes}" min="1" max="120">
            </div>
            <div class="form-group">
              <label class="form-label">短休憩（分）</label>
              <input type="number" id="pomo-short" class="form-control" value="${_settings.shortBreakMinutes}" min="1" max="60">
            </div>
            <div class="form-group">
              <label class="form-label">長休憩（分）</label>
              <input type="number" id="pomo-long" class="form-control" value="${_settings.longBreakMinutes}" min="1" max="120">
            </div>
            <div class="form-group">
              <label class="form-label">長休憩までのサイクル数</label>
              <input type="number" id="pomo-cycles" class="form-control" value="${_settings.cyclesBeforeLongBreak}" min="1" max="10">
            </div>
            <button class="btn btn-primary btn-sm" onclick="Pomodoro._saveSettings()" style="width:100%">設定を保存</button>
          </div>

          <!-- サイクル進捗 -->
          <div class="card card-body">
            <div style="font-weight:600;margin-bottom:10px">${Utils.icon('refresh-cw')} サイクル進捗</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${Array.from({length: _settings.cyclesBeforeLongBreak}, (_, i) => `
                <div style="width:28px;height:28px;border-radius:50%;border:2px solid ${i < (_state.cycleCount || 0) ? 'var(--pomo-work)' : 'var(--color-border)'};background:${i < (_state.cycleCount || 0) ? 'var(--pomo-work)' : 'transparent'};display:flex;align-items:center;justify-content:center">
                  ${i < (_state.cycleCount || 0) ? '<span style="color:#fff;font-size:0.7rem">✓</span>' : ''}
                </div>
              `).join('')}
            </div>
            <div style="font-size:0.75rem;color:var(--color-text-muted);margin-top:8px">
              ${_state.cycleCount || 0} / ${_settings.cyclesBeforeLongBreak} 完了
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderTimerCircle(remaining, total, color) {
    const R = 100;
    const cx = 110, cy = 110;
    const circumference = 2 * Math.PI * R;
    const progress = total > 0 ? remaining / total : 1;
    const dashOffset = circumference * (1 - progress);

    return `
      <svg width="220" height="220" viewBox="0 0 220 220" style="transform:rotate(-90deg)">
        <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="var(--color-border)" stroke-width="10"/>
        <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${color}" stroke-width="10"
                stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}"
                stroke-linecap="round" style="transition:stroke-dashoffset 1s linear"/>
      </svg>
    `;
  }

  function getPhaseHint() {
    switch (_state.phase) {
      case 'work':        return `集中して作業しましょう！あと ${Math.ceil(getRemainingMs() / 60000)} 分`;
      case 'short_break': return `少し休憩しましょう`;
      case 'long_break':  return `しっかり休憩しましょう`;
      default: return '';
    }
  }

  async function _saveSettings() {
    const work   = parseInt(document.getElementById('pomo-work').value, 10);
    const short  = parseInt(document.getElementById('pomo-short').value, 10);
    const lng    = parseInt(document.getElementById('pomo-long').value, 10);
    const cycles = parseInt(document.getElementById('pomo-cycles').value, 10);

    if ([work, short, lng, cycles].some(n => isNaN(n) || n <= 0)) {
      Toast.show('正しい値を入力してください', 'error');
      return;
    }

    _settings = { workMinutes: work, shortBreakMinutes: short, longBreakMinutes: lng, cyclesBeforeLongBreak: cycles };
    try {
      await Api.setPomodoroSettings(_settings);
      Toast.show('設定を保存しました', 'success');
      renderWidget();
      render();
    } catch (e) {
      Toast.show('保存に失敗しました: ' + e.message, 'error');
    }
  }

  return {
    init, render, renderWidget,
    start, pause, resume, stop, togglePause,
    _saveSettings
  };
})();
