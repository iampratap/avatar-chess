import {
  PLAYERS,
  PLAYER_COLOR,
  POWER_LABEL,
  POWERS,
  POWER_SYMBOL,
  currentPlayer,
  getPower,
  getActivePower,
  upcomingPowers,
  hasMovedThisRound,
  powersForRound,
  powerHintText,
  livingPlayers,
  isAiPlayer,
} from './game.js';
import { BOARD_THEMES, PIECE_THEMES, UI_THEMES } from './themes.js';
import { createThemePreview3D } from './themePreview3d.js';
import { initHelpDiagrams } from './helpDiagrams.js';

let settingsPreview = null;

function hexCss(n) {
  return `#${(n >>> 0).toString(16).padStart(6, '0')}`;
}

/** Replay a short CSS animation class whenever UI content changes. */
export function bumpAnim(el, className = 'ui-bump') {
  if (!el) return;
  el.classList.remove(className);
  // Force reflow so the animation can restart
  void el.offsetWidth;
  el.classList.add(className);
}

export function setTextIfChanged(el, text, animClass = 'ui-fade') {
  if (!el) return false;
  if (el.textContent === text) return false;
  el.textContent = text;
  bumpAnim(el, animClass);
  return true;
}

const PIECE_SVG = {
  classic: `<svg viewBox="0 0 40 56" aria-hidden="true"><ellipse cx="20" cy="50" rx="14" ry="4" fill="currentColor" opacity=".35"/><path fill="currentColor" d="M12 48h16l-2-10H14zm2-12h12l-1-14h-10zm4-16a6 6 0 1 1 4 0l-2 2h-2z"/></svg>`,
  lowpoly: `<svg viewBox="0 0 40 56" aria-hidden="true"><polygon fill="currentColor" points="8,50 32,50 28,34 12,34"/><polygon fill="currentColor" points="12,34 28,34 24,16 16,16"/><polygon fill="currentColor" points="16,16 24,16 20,6"/></svg>`,
  crystal: `<svg viewBox="0 0 40 56" aria-hidden="true"><path fill="currentColor" opacity=".85" d="M20 6l10 16-4 26H14L10 22z"/><path fill="#fff" opacity=".35" d="M20 6l4 16-2 26h-4L16 22z"/></svg>`,
  totem: `<svg viewBox="0 0 40 56" aria-hidden="true"><rect x="11" y="40" width="18" height="10" rx="2" fill="currentColor"/><rect x="13" y="24" width="14" height="16" rx="2" fill="currentColor"/><rect x="15" y="10" width="10" height="14" rx="2" fill="currentColor"/><circle cx="20" cy="8" r="4" fill="currentColor"/></svg>`,
  metal: `<svg viewBox="0 0 40 56" aria-hidden="true"><ellipse cx="20" cy="50" rx="14" ry="4" fill="currentColor" opacity=".35"/><path fill="currentColor" d="M12 48h16l-2-10H14zm2-12h12l-1-14h-10zm4-16a6 6 0 1 1 4 0l-2 2h-2z"/><path fill="#fff" opacity=".25" d="M18 10h4v30h-4z"/></svg>`,
};

const UI_SWATCH = {
  dark: { a: '#0c0e14', b: '#161a24' },
  light: { a: '#eef1f6', b: '#ffffff' },
};

export function $(id) {
  return document.getElementById(id);
}

export function showScreen(name) {
  const welcome = name === 'welcome';
  $('welcome-screen').hidden = !welcome;
  $('game-shell').hidden = welcome;
  $('replay-bar').hidden = name !== 'replay';
  document.body.dataset.screen = name;
  if (welcome) {
    closeSidebarMenu();
    setSidebarCollapsed(false);
  }
}

export function setSidebarCollapsed(collapsed) {
  const shell = $('game-shell');
  if (!shell) return;
  shell.classList.toggle('sidebar-collapsed', collapsed);
  const expand = $('btn-sidebar-expand');
  if (expand) expand.hidden = !collapsed;
  closeSidebarMenu();
}

export function isSidebarCollapsed() {
  return $('game-shell')?.classList.contains('sidebar-collapsed') ?? false;
}

function setBodyDrawerLock(locked) {
  const welcomeOpen = $('welcome-options') && !$('welcome-options').hidden;
  const gameOpen = $('sidebar-menu') && !$('sidebar-menu').hidden;
  document.body.classList.toggle('drawer-open', locked || welcomeOpen || gameOpen);
}

export function openSidebarMenu() {
  const menu = $('sidebar-menu');
  const backdrop = $('sidebar-menu-backdrop');
  const btn = $('btn-menu');
  if (!menu || !btn) return;
  menu.hidden = false;
  if (backdrop) {
    backdrop.hidden = false;
    backdrop.setAttribute('aria-hidden', 'false');
  }
  menu.setAttribute('aria-hidden', 'false');
  bumpAnim(menu, 'ui-enter');
  btn.setAttribute('aria-expanded', 'true');
  setBodyDrawerLock(true);
}

export function closeSidebarMenu() {
  const menu = $('sidebar-menu');
  const backdrop = $('sidebar-menu-backdrop');
  const btn = $('btn-menu');
  if (!menu || !btn) return;
  menu.hidden = true;
  if (backdrop) {
    backdrop.hidden = true;
    backdrop.setAttribute('aria-hidden', 'true');
  }
  menu.setAttribute('aria-hidden', 'true');
  btn.setAttribute('aria-expanded', 'false');
  setBodyDrawerLock(false);
}

export function toggleSidebarMenu() {
  const menu = $('sidebar-menu');
  if (!menu) return;
  if (menu.hidden) openSidebarMenu();
  else closeSidebarMenu();
}

export function setWelcomeDrawerOpen(open) {
  const drawer = $('welcome-options');
  const backdrop = $('welcome-options-backdrop');
  const btn = $('btn-welcome-options');
  if (!drawer || !backdrop || !btn) return;
  drawer.hidden = !open;
  backdrop.hidden = !open;
  drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
  backdrop.setAttribute('aria-hidden', open ? 'false' : 'true');
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  setBodyDrawerLock(open);
}

export function openHelp() {
  initHelpDiagrams();
  const modal = $('help-modal');
  if (modal) modal.hidden = false;
}

export function closeHelp() {
  const modal = $('help-modal');
  if (modal) modal.hidden = true;
}

export function isHelpOpen() {
  return !$('help-modal')?.hidden;
}

export function showCoachPopup(payload) {
  const root = $('coach-popup');
  if (!root || !payload) return;
  const wasHidden = root.hidden;
  root.hidden = false;
  const kicker = $('coach-kicker');
  const title = $('coach-title');
  const body = $('coach-body');
  const action = $('coach-action');
  const nudge = $('coach-nudge');
  const cont = $('btn-coach-continue');
  const progress = $('coach-progress');
  const progressBar = $('coach-progress-bar');
  const card = root.querySelector('.coach-card') || root;

  const step = Number(payload.step) || 1;
  const total = Math.max(1, Number(payload.total) || 1);
  const kickerText = payload.completed
    ? 'Training complete'
    : `Lesson ${step} of ${total}`;
  let changed = false;
  changed = setTextIfChanged(kicker, kickerText, 'ui-fade') || changed;
  changed = setTextIfChanged(title, payload.title || '', 'ui-fade') || changed;
  changed = setTextIfChanged(body, payload.body || '', 'ui-fade') || changed;

  if (progress && progressBar) {
    const pct = payload.completed ? 100 : Math.max(4, Math.min(100, (step / total) * 100));
    progress.hidden = false;
    progress.setAttribute('aria-valuenow', String(payload.completed ? total : step));
    progress.setAttribute('aria-valuemax', String(total));
    progressBar.style.width = `${pct}%`;
    progress.classList.toggle('is-complete', !!payload.completed);
  }

  if (title) {
    if (payload.color) title.style.color = payload.color;
    else title.style.color = '';
  }
  if (action) {
    setTextIfChanged(action, payload.action || '', 'ui-fade');
    action.hidden = !payload.action;
  }
  if (nudge) {
    setTextIfChanged(nudge, payload.nudge || '', 'ui-fade');
    nudge.hidden = !payload.nudge;
  }
  if (cont) cont.hidden = !payload.completed;
  card?.classList.toggle('is-complete', !!payload.completed);
  if (wasHidden || changed) bumpAnim(card, 'ui-enter');
  document.body.dataset.training = payload.active || payload.completed ? '1' : '';
}

export function hideCoachPopup() {
  const root = $('coach-popup');
  if (root) root.hidden = true;
  delete document.body.dataset.training;
  const cont = $('btn-coach-continue');
  if (cont) cont.hidden = true;
}

export function showWinner(player, historyLength = 0, extra = {}) {
  const el = $('winner-modal');
  el.hidden = false;
  setTextIfChanged(
    $('winner-text'),
    player
      ? `Player ${player} wins — last avatar standing!`
      : 'Draw — no avatars remain.',
    'ui-fade'
  );
  const meta = $('winner-history-meta');
  if (meta) {
    const parts = [];
    if (historyLength > 0) {
      parts.push(
        `${historyLength} move${historyLength === 1 ? '' : 's'} recorded — watch the replay.`
      );
    } else {
      parts.push('No moves to replay.');
    }
    if (extra.streak != null && extra.humanWon) {
      parts.push(`Win streak: ${extra.streak}`);
    }
    if (extra.daily) parts.push('Daily challenge cleared!');
    setTextIfChanged(meta, parts.join(' '), 'ui-fade');
  }
  const streakEl = $('winner-streak');
  if (streakEl) {
    if (extra.humanWon && extra.streak > 0) {
      streakEl.hidden = false;
      streakEl.textContent = extra.streak === 1 ? 'First win of the streak' : `${extra.streak} wins in a row`;
    } else {
      streakEl.hidden = true;
    }
  }
  const replayBtn = $('btn-winner-replay');
  if (replayBtn) replayBtn.disabled = historyLength <= 0;
  const shareBtn = $('btn-winner-share');
  if (shareBtn) shareBtn.disabled = historyLength <= 0;
  const card = el.querySelector('.modal-card');
  if (card) bumpAnim(card, 'ui-enter');
}

export function showToast(message, { ms = 2600 } = {}) {
  let host = $('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    host.className = 'toast-host';
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = 'toast ui-enter';
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => {
    el.classList.add('toast-out');
    setTimeout(() => el.remove(), 280);
  }, ms);
}

/** Career panel removed from welcome; helpers kept as no-ops. */
export function updateCareerPanel() {}
export function renderCareerPanel() {}

export function updateBlitzHud(secondsLeft, totalSeconds) {
  const wrap = $('blitz-hud');
  if (!wrap) return;
  if (!totalSeconds || totalSeconds <= 0) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  const label = $('blitz-label');
  const bar = $('blitz-bar');
  const sec = Math.max(0, Math.ceil(secondsLeft));
  if (label) label.textContent = `${sec}s`;
  if (bar) {
    const pct = Math.max(0, Math.min(1, secondsLeft / totalSeconds));
    bar.style.width = `${pct * 100}%`;
    wrap.classList.toggle('blitz-urgent', sec <= 5);
  }
}

export function hideWinner() {
  $('winner-modal').hidden = true;
}

export function setSaveError(msg) {
  const els = document.querySelectorAll('[data-save-error]');
  for (const el of els) {
    const next = msg || '';
    if (el.textContent !== next) {
      el.textContent = next;
      if (next) bumpAnim(el, 'ui-fade');
    }
    el.hidden = !msg;
  }
}

export function updateHUD(state, mode = 'playing') {
  const roundEl = $('hud-round');
  const turnEl = $('hud-turn');
  const powersEl = $('hud-powers');
  const piecesEl = $('hud-pieces');
  const hintEl = $('hint-bar');
  const detailEl = $('hint-detail');

  if (!state) return;

  const undoBtn = $('btn-undo');
  if (undoBtn) {
    const canUndo =
      mode === 'playing' &&
      !state.fxLocked &&
      !state.pendingPowerSwitch &&
      !state.aiThinking &&
      (state.history?.length ?? 0) > 0;
    undoBtn.disabled = !canUndo;
  }

  setTextIfChanged(roundEl, `Round ${state.round}`, 'ui-fade');

  const zoneEl = $('hud-zone');
  if (zoneEl) {
    if (state.shrinkRings) {
      zoneEl.hidden = false;
      const z = state.boardZone || {
        minFile: 0,
        maxFile: 7,
        minRank: 0,
        maxRank: 7,
      };
      const w = z.maxFile - z.minFile + 1;
      const h = z.maxRank - z.minRank + 1;
      setTextIfChanged(zoneEl, `Zone ${w}×${h}`, 'ui-fade');
    } else {
      zoneEl.hidden = true;
    }
  }

  const powers = powersForRound(state.round);
  const canToggle = mode === 'playing' && !state.winner;
  const diceMode = !!state.diceMode;
  const diceReady = !!(diceMode && state.diceRolledThisTurn && state.dicePower);
  const powersKey = PLAYERS.map((p) => {
    const alive = state.piecesLeft[p] > 0;
    const active = mode !== 'replay' && !state.winner && currentPlayer(state) === p;
    const ai = isAiPlayer(state, p);
    const shown = diceMode
      ? active
        ? diceReady
          ? state.dicePower
          : 'rolling'
        : '—'
      : powers[p];
    return `${p}:${shown}:${alive ? 1 : 0}:${active ? 1 : 0}:${ai ? 1 : 0}:${state.piecesLeft[p]}`;
  }).join('|');

  if (powersEl.dataset.uiKey !== powersKey) {
    powersEl.dataset.uiKey = powersKey;
    powersEl.innerHTML = PLAYERS.map((p, i) => {
      const alive = state.piecesLeft[p] > 0;
      const active = mode !== 'replay' && !state.winner && currentPlayer(state) === p;
      const ai = isAiPlayer(state, p);
      const role = ai ? '<span class="pc-tag">PC</span>' : '<span class="pc-tag human-tag">You</span>';
      let nowPower = powers[p];
      let nextHtml = '';
      let title = canToggle
        ? `Click to switch Player ${p} to ${ai ? 'human' : 'PC'}. Next: ${upcomingPowers(p, state.round, 3).map((pw) => POWER_LABEL[pw]).join(' → ')}`
        : `Player ${p}. Next: ${upcomingPowers(p, state.round, 3).map((pw) => POWER_LABEL[pw]).join(' → ')}`;
      if (diceMode) {
        nowPower = active && diceReady ? state.dicePower : null;
        title = canToggle
          ? `Click to switch Player ${p} to ${ai ? 'human' : 'PC'} (dice mode)`
          : `Player ${p} · dice mode`;
      } else {
        const nextLabel = upcomingPowers(p, state.round, 3)
          .map((pw) => POWER_SYMBOL[pw])
          .join(' → ');
        nextHtml = `<span class="power-badge-next">next ${nextLabel}</span>`;
      }
      const nowText = nowPower
        ? `${POWER_SYMBOL[nowPower] || ''} ${POWER_LABEL[nowPower] || nowPower}`
        : diceMode
          ? active
            ? '🎲 …'
            : ''
          : '';
      return `<button type="button" class="power-badge ui-enter ${alive ? '' : 'dead'} ${active ? 'active' : ''} ${canToggle ? 'toggleable' : ''} ${diceMode ? 'dice-mode' : ''}" style="--pc:${PLAYER_COLOR[p]};--enter-delay:${i * 45}ms" data-player="${p}" title="${title}" ${canToggle ? '' : 'disabled'}>
      <span class="power-badge-icon" aria-hidden="true">${p}</span>
      <span class="power-badge-text">
        <span class="power-badge-now"><b>${p}</b>${role} ${nowText}</span>
        ${nextHtml}
        <small>×${state.piecesLeft[p]}</small>
      </span>
    </button>`;
    }).join('');
  }

  setTextIfChanged(
    piecesEl,
    livingPlayers(state)
      .map((p) => `${p}:${state.piecesLeft[p]}`)
      .join(' · '),
    'ui-fade'
  );

  updateBoardSeats(state, mode, powers);
  updateHistoryList(state.history || []);

  if (mode === 'replay') {
    setTextIfChanged(turnEl, 'Replay', 'ui-fade');
    return;
  }

  if (state.winner) {
    setTextIfChanged(turnEl, `Winner: ${state.winner}`, 'ui-fade');
    setTextIfChanged(hintEl, `Player ${state.winner} wins — last avatar standing`, 'ui-fade');
    setTextIfChanged(detailEl, '', 'ui-fade');
    return;
  }

  if (state.fxLocked || state.pendingPowerSwitch) {
    setTextIfChanged(turnEl, 'Power shift…', 'ui-fade');
    setTextIfChanged(hintEl, 'Round complete — powers are shifting…', 'ui-fade');
    setTextIfChanged(detailEl, '', 'ui-fade');
    return;
  }

  const player = currentPlayer(state);
  const ai = isAiPlayer(state, player);
  const waitingDice = !!(state.diceMode && !(state.diceRolledThisTurn && state.dicePower));
  const power = waitingDice ? null : getActivePower(state, player);
  const powerName = power ? POWER_LABEL[power] || power : '';
  const powerSym = power ? POWER_SYMBOL[power] || '' : '';
  const turnPowerBit = waitingDice ? 'rolling…' : `${powerName}${powerSym ? ` ${powerSym}` : ''}`;

  if (state.aiThinking || (ai && mode === 'playing')) {
    setTextIfChanged(turnEl, `Player ${player} · PC · ${turnPowerBit}`, 'ui-fade');
    if (state.aiThinking) {
      setTextIfChanged(hintEl, `PC thinking… (Player ${player})`, 'ui-fade');
      setTextIfChanged(detailEl, power ? powerHintText(power) : '', 'ui-fade');
      return;
    }
  } else {
    setTextIfChanged(turnEl, `Player ${player} · ${turnPowerBit}`, 'ui-fade');
  }

  if (waitingDice) {
    setTextIfChanged(hintEl, 'Dice rolling…', 'ui-fade');
    setTextIfChanged(detailEl, '', 'ui-fade');
    return;
  }

  if (power === 'pass') {
    setTextIfChanged(hintEl, 'Dice said Pass — skipping turn…', 'ui-fade');
  } else if (ai) {
    setTextIfChanged(hintEl, `Waiting for PC (Player ${player} · ${powerName})`, 'ui-fade');
  } else if (state.selected) {
    setTextIfChanged(
      hintEl,
      state.diceMode
        ? 'Unmoved pieces are safe from capture · click a highlighted square'
        : 'Click a highlighted square to move or capture · drag board to rotate',
      'ui-fade'
    );
  } else {
    setTextIfChanged(
      hintEl,
      `Select a piece (Player ${player} · ${powerName}) · drag board to rotate`,
      'ui-fade'
    );
  }
  setTextIfChanged(detailEl, power ? powerHintText(power) : '', 'ui-fade');
}

export function updateReplayBar(index, total, playing) {
  setTextIfChanged($('replay-label'), `Replay · move ${index}/${total}`, 'ui-fade');
  $('replay-scrub').max = String(total);
  $('replay-scrub').value = String(index);
  setTextIfChanged($('btn-replay-toggle'), playing ? 'Pause' : 'Play', 'ui-fade');
}

/** Board-edge badges (screen position tracked in board3d as the camera rotates). */
function updateBoardSeats(state, mode, powers) {
  const root = $('board-seats');
  if (!root) return;
  const active =
    mode !== 'welcome' && !state.winner && !state.fxLocked && !state.pendingPowerSwitch
      ? currentPlayer(state)
      : null;
  const diceMode = !!state.diceMode;
  const diceReady = !!(diceMode && state.diceRolledThisTurn && state.dicePower);

  for (const el of root.querySelectorAll('.board-seat')) {
    const p = el.dataset.seat;
    const alive = (state.piecesLeft?.[p] ?? 0) > 0;
    const ai = isAiPlayer(state, p);
    const isActive = active === p;
    const moved = hasMovedThisRound(state, p);
    // After this seat moves, LEDs advance to their next-round power
    const ledRound = moved ? state.round + 1 : state.round;
    const ledNow = getPower(p, ledRound);
    const ledNext = getPower(p, ledRound + 1);
    const ledFor = (pw) => {
      if (pw === ledNow) return 'now';
      if (pw === ledNext) return 'next';
      return 'later';
    };

    let power = powers[p];
    let powerLine = `<span class="sym">${POWER_SYMBOL[power]}</span>${POWER_LABEL[power]}`;
    let title = `Player ${p} · now ${POWER_LABEL[power]} · next ${POWER_LABEL[upcomingPowers(p, state.round, 1)[0]]}`;
    if (diceMode) {
      if (isActive && diceReady) {
        power = state.dicePower;
        powerLine = `<span class="sym">${POWER_SYMBOL[power] || ''}</span>${POWER_LABEL[power] || power}`;
        title = `Player ${p} · dice ${POWER_LABEL[power] || power}`;
      } else if (isActive) {
        power = 'rolling';
        powerLine = 'Rolling…';
        title = `Player ${p} · dice rolling`;
      } else {
        power = 'waiting';
        powerLine = 'Dice';
        title = `Player ${p} · dice mode`;
      }
    }

    const structKey = `${alive ? 1 : 0}|${ai ? 1 : 0}|${power}|${state.piecesLeft[p]}|${diceMode ? 1 : 0}`;
    const ledKey = diceMode
      ? `dice|${isActive ? 1 : 0}|${diceReady ? state.dicePower : 'rolling'}`
      : `${ledNow}|${ledNext}|${isActive ? 1 : 0}`;
    const card = el.querySelector('.board-seat-card');

    // Fast path: only LEDs / active state changed — animate lights in place
    if (!diceMode && card && el.dataset.structKey === structKey && el.dataset.ledKey !== ledKey) {
      card.classList.toggle('dead', !alive);
      card.classList.toggle('active', isActive);
      card.querySelectorAll('.edge-piece').forEach((piece) => {
        const slot = ledFor(piece.dataset.power);
        if (piece.dataset.led !== slot) {
          piece.dataset.led = slot;
          bumpAnim(piece, 'led-flash');
        }
      });
      if (isActive) bumpAnim(card, 'ui-bump');
      el.dataset.ledKey = ledKey;
      continue;
    }

    if (el.dataset.structKey === structKey && el.dataset.ledKey === ledKey) continue;

    el.dataset.structKey = structKey;
    el.dataset.ledKey = ledKey;
    const upcomingHtml = diceMode
      ? ''
      : `<div class="board-seat-upcoming" aria-label="Powers Rook, Knight, Bishop">
        ${POWERS.map((pw) => {
          const slot = ledFor(pw);
          const label =
            slot === 'now'
              ? `${moved ? 'Next turn' : 'Now'}: ${POWER_LABEL[pw]}`
              : slot === 'next'
                ? `Then: ${POWER_LABEL[pw]}`
                : POWER_LABEL[pw];
          return `<span class="edge-piece" data-power="${pw}" data-led="${slot}" title="${label}">
              <span class="edge-piece-glyph">${POWER_SYMBOL[pw]}</span>
              <span class="edge-piece-led" aria-hidden="true"></span>
            </span>`;
        }).join('<span class="edge-piece-gap" aria-hidden="true"></span>')}
      </div>`;
    el.innerHTML = `<div class="board-seat-card ui-enter ${alive ? '' : 'dead'} ${isActive ? 'active' : ''} ${diceMode ? 'dice-mode' : ''}" style="--pc:${PLAYER_COLOR[p]}" title="${title}">
      <div class="board-seat-main">
        <span class="board-seat-avatar" aria-hidden="true">${p}</span>
        <span class="board-seat-meta">
          <span class="board-seat-name">Player ${p}</span>
          <span class="board-seat-power">${powerLine}</span>
          <span class="board-seat-role">${ai ? 'PC' : 'Human'} · ×${state.piecesLeft[p]}</span>
        </span>
      </div>
      ${upcomingHtml}
    </div>`;
  }
}

function updateHistoryList(history) {
  const list = $('history-list');
  const empty = $('history-empty');
  const count = $('history-count');
  if (!list) return;

  const n = history.length;
  if (count) setTextIfChanged(count, n === 1 ? '1 move' : `${n} moves`, 'ui-fade');

  if (!n) {
    list.innerHTML = '';
    if (empty) empty.hidden = false;
    list.dataset.uiKey = '0';
    return;
  }

  if (empty) empty.hidden = true;
  const histKey = String(n);
  if (list.dataset.uiKey === histKey) return;
  const grew = Number(list.dataset.uiKey || 0) < n;
  list.dataset.uiKey = histKey;
  list.innerHTML = history
    .map((m, idx) => {
      const symbol = POWER_SYMBOL[m.power] || '';
      const label = POWER_LABEL[m.power] || m.power;
      const cap = m.captured
        ? `<span class="hist-cap">×${m.captured.id}</span>`
        : '';
      const enter = grew && idx === n - 1 ? ' ui-enter' : '';
      return `<li class="hist-item${enter}" style="--pc:${PLAYER_COLOR[m.player]}">
        <span class="hist-num">${idx + 1}</span>
        <span class="hist-body">
          <b>${m.player}</b> ${symbol}
          <span class="hist-move">${m.from}→${m.to}</span>
          <small>R${m.round} · ${label}</small>
          ${cap}
        </span>
      </li>`;
    })
    .join('');

  // Keep latest move visible
  list.scrollTop = list.scrollHeight;
}

function ensureSettingsPreview() {
  const host = $('settings-preview-host');
  if (!host) return null;
  if (!settingsPreview) settingsPreview = createThemePreview3D(host);
  return settingsPreview;
}

export function openSettings() {
  closeSidebarMenu();
  const modal = $('settings-modal');
  if (modal) modal.hidden = false;
  requestAnimationFrame(() => {
    const preview = ensureSettingsPreview();
    preview?.start();
    preview?.resize();
  });
}

export function closeSettings() {
  const modal = $('settings-modal');
  if (modal) modal.hidden = true;
  settingsPreview?.stop();
}

export function isSettingsOpen() {
  return !$('settings-modal')?.hidden;
}

export function updateThemeSummary({ ui, board, piece }) {
  const el = $('welcome-theme-summary');
  if (!el) return;
  const uiLabel = UI_THEMES[ui]?.label || ui;
  const boardLabel = BOARD_THEMES[board]?.label || board;
  const pieceLabel = PIECE_THEMES[piece]?.label || piece;
  setTextIfChanged(el, `${uiLabel} · ${boardLabel} · ${pieceLabel}`, 'ui-fade');
}

export function renderSettingsPanel({ ui, board, piece }, onChange) {
  const uiRoot = $('settings-ui-options');
  const boardRoot = $('settings-board-options');
  const pieceRoot = $('settings-piece-options');
  if (!uiRoot || !boardRoot || !pieceRoot) return;

  uiRoot.innerHTML = Object.values(UI_THEMES)
    .map((t, i) => {
      const sw = UI_SWATCH[t.id] || UI_SWATCH.dark;
      return `<button type="button" class="settings-chip ui-enter" role="option" data-kind="ui" data-id="${t.id}" aria-selected="${t.id === ui}" style="--enter-delay:${i * 35}ms">
        <span class="settings-ui-swatch" style="--swatch-a:${sw.a};--swatch-b:${sw.b}"></span>
        <span>${t.label}</span>
      </button>`;
    })
    .join('');

  boardRoot.innerHTML = Object.values(BOARD_THEMES)
    .map((t, i) => {
      return `<button type="button" class="settings-chip ui-enter" role="option" data-kind="board" data-id="${t.id}" aria-selected="${t.id === board}" style="--enter-delay:${i * 35}ms">
        <span class="settings-swatch" style="--swatch-a:${hexCss(t.light)};--swatch-b:${hexCss(t.dark)};--swatch-rim:${hexCss(t.rim)}"></span>
        <span>${t.label}</span>
      </button>`;
    })
    .join('');

  pieceRoot.innerHTML = Object.values(PIECE_THEMES)
    .map((t, i) => {
      const svg = PIECE_SVG[t.id] || PIECE_SVG.classic;
      return `<button type="button" class="settings-chip ui-enter" role="option" data-kind="piece" data-id="${t.id}" aria-selected="${t.id === piece}" style="--enter-delay:${i * 35}ms">
        <span class="settings-piece-swatch" style="color:#3b82f6">${svg}</span>
        <span>${t.label}</span>
      </button>`;
    })
    .join('');

  const bind = (root) => {
    root.onclick = (e) => {
      const btn = e.target.closest?.('.settings-chip');
      if (!btn) return;
      onChange?.({ [btn.dataset.kind]: btn.dataset.id });
    };
  };
  bind(uiRoot);
  bind(boardRoot);
  bind(pieceRoot);

  updateSettingsPreview({ ui, board, piece });
  updateThemeSummary({ ui, board, piece });
}

export function updateSettingsPreview({ ui, board, piece }) {
  const boardTheme = BOARD_THEMES[board] || BOARD_THEMES.wooden;
  const pieceTheme = PIECE_THEMES[piece] || PIECE_THEMES.classic;
  const caption = $('settings-preview-caption');
  const preview = ensureSettingsPreview();
  preview?.setThemes({ ui, board, piece });
  if (isSettingsOpen()) preview?.start();
  if (caption) {
    setTextIfChanged(
      caption,
      `${UI_THEMES[ui]?.label || ui} · ${boardTheme.label} · ${pieceTheme.label}`,
      'ui-fade'
    );
  }
}
