import {
  createInitialState,
  selectSquare,
  clearPendingPowerSwitch,
  undoLastMove,
  applyMove,
  passTurn,
  isAiPlayer,
  togglePlayerController,
} from './game.js';
import { chooseAiMove, aiThinkDelayMs } from './ai.js';
import { createBoard3D } from './board3d.js';
import {
  applyStatusPayload,
  autosaveGame,
  loadAutosave,
  clearAutosave,
  autosaveSummary,
} from './save.js';
import { createReplayController } from './replay.js';
import {
  $,
  showScreen,
  openHelp,
  closeHelp,
  openSettings,
  closeSettings,
  isSettingsOpen,
  renderSettingsPanel,
  updateThemeSummary,
  showWinner,
  hideWinner,
  setSaveError,
  updateHUD,
  updateReplayBar,
  setSidebarCollapsed,
  toggleSidebarMenu,
  closeSidebarMenu,
  showCoachPopup,
  hideCoachPopup,
} from './ui.js';
import {
  saveThemePrefs,
  applyUiTheme,
  loadAndApplyUiTheme,
} from './themes.js';
import { unlockAudio, isMuted, toggleMute, sfx } from './sound.js';
import { createTrainingSession } from './training.js';

const host = $('canvas-host');
const board = createBoard3D(host);

let uiTheme = loadAndApplyUiTheme();
document.body.dataset.uiTheme = uiTheme;

function syncMuteButtons() {
  const muted = isMuted();
  const label = muted ? 'Sound off' : 'Sound on';
  const title = muted ? 'Unmute sound' : 'Mute sound';
  for (const id of ['btn-mute', 'btn-welcome-mute']) {
    const btn = $(id);
    if (!btn) continue;
    btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
    btn.setAttribute('aria-label', title);
    btn.title = title;
    if (id === 'btn-welcome-mute') btn.textContent = label;
    else btn.textContent = muted ? '✕♪' : '♪';
  }
}

function onMuteClick() {
  unlockAudio();
  toggleMute();
  syncMuteButtons();
  if (!isMuted()) sfx.ui();
}

syncMuteButtons();
document.addEventListener(
  'pointerdown',
  () => {
    unlockAudio();
  },
  { once: true, capture: true }
);

function currentThemePrefs() {
  const boardPrefs = board.getThemes();
  return {
    ui: uiTheme,
    board: boardPrefs.board,
    piece: boardPrefs.piece,
  };
}

function persistAllThemes(partial = {}) {
  const prefs = currentThemePrefs();
  saveThemePrefs({
    board: partial.board ?? prefs.board,
    piece: partial.piece ?? prefs.piece,
    ui: partial.ui ?? prefs.ui,
  });
}

function syncSettingsUi() {
  const prefs = currentThemePrefs();
  updateThemeSummary(prefs);
  if (isSettingsOpen()) {
    renderSettingsPanel(prefs, applyThemeFromUi);
  }
}

function applyThemeFromUi(partial) {
  if (partial.ui) {
    uiTheme = applyUiTheme(partial.ui);
    document.body.dataset.uiTheme = uiTheme;
  }
  board.setThemes(partial);
  persistAllThemes(partial);
  syncSettingsUi();
  // Live 3D preview while playing / replaying
  if (mode === 'playing' || mode === 'replay') refresh();
  // On welcome, still resize so the hidden board reflects theme when Play starts
  else requestAnimationFrame(() => board.resize());
  if (partial.ui) sfx.ui();
}

function showSettings() {
  openSettings();
  renderSettingsPanel(currentThemePrefs(), applyThemeFromUi);
}

// Match 3D lighting to the restored UI theme on boot
board.setUiTheme(uiTheme);
syncSettingsUi();

let state = createInitialState();
let mode = 'welcome'; // welcome | playing | replay
let replay = null;
let inputLocked = false;
let aiTimer = null;
let aiGeneration = 0;
/** @type {ReturnType<typeof createTrainingSession>|null} */
let training = null;

function isTraining() {
  return !!training;
}

function syncCoach() {
  if (!training) {
    board.setCoachFocus(null);
    hideCoachPopup();
    return;
  }
  const payload = training.coachPayload();
  showCoachPopup(payload);
  board.setCoachFocus(training.isActive() ? training.focusPlayer() : null);
}

function selectedHumans() {
  const checked = document.querySelector('input[name="humans"]:checked');
  return checked ? Number(checked.value) : 4;
}

function clearAiTimer() {
  if (aiTimer) {
    clearTimeout(aiTimer);
    aiTimer = null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function refresh(opts = {}) {
  board.syncFromState(state, opts);
  updateHUD(state, mode === 'replay' ? 'replay' : 'playing');
}

async function runPowerSwitchIfNeeded() {
  if (!state.pendingPowerSwitch) return;
  inputLocked = true;
  state = { ...state, fxLocked: true, aiThinking: false };
  // Hold current forms while the wizard circle plays, then morph on refresh
  board.syncFromState(state, { holdForms: true });
  updateHUD(state, 'playing');
  // Brief pause so the last move settles before the round-change FX
  await sleep(320);
  sfx.powerSwitch();
  await board.powerFx.play({ duration: 0.95 });
  state = clearPendingPowerSwitch({ ...state, fxLocked: false });
  inputLocked = false;
  sfx.morph();
  refresh(); // morph into new-round powers with shimmer
  // Let the morph read before the next turn/PC move
  await sleep(220);
}

function persistProgress() {
  if (mode !== 'playing' || isTraining()) return;
  if (state.winner) {
    clearAutosave();
    hideResumeBanner();
    return;
  }
  autosaveGame(state);
}

function hideResumeBanner() {
  const banner = $('resume-banner');
  if (banner) banner.hidden = true;
}

function showResumeBannerIfAny() {
  const banner = $('resume-banner');
  const summary = $('resume-summary');
  if (!banner) return false;
  const data = loadAutosave();
  if (!data) {
    banner.hidden = true;
    return false;
  }
  if (summary) summary.textContent = autosaveSummary(data);
  banner.hidden = false;
  return true;
}

async function afterMoveEffects(move) {
  if (move) {
    if (move.captured) sfx.capture();
    else sfx.move();
  }

  // 1) Glide the piece (keep its attack form during the flight)
  refresh({
    animateMove: move
      ? { pieceId: move.pieceId, power: move.power }
      : null,
    holdForms: !!state.pendingPowerSwitch,
  });
  await board.waitForTweens();

  // 2) Capture spark only if this is NOT also a round-end power switch
  if (move?.captured && !state.pendingPowerSwitch) {
    await board.powerFx.playShort();
  }

  // 3) Wizard power-switch (waits for completion), then morph
  await runPowerSwitchIfNeeded();

  persistProgress();
  if (isTraining()) {
    if (state.winner) {
      training?.stop();
      syncCoach();
    }
    return;
  }
  if (state.winner) {
    clearAutosave();
    sfx.win();
    showWinner(state.winner, state.history.length);
    return;
  }
  scheduleAiIfNeeded();
}

function scheduleAiIfNeeded() {
  clearAiTimer();
  if (mode !== 'playing' || isTraining() || state.winner || state.fxLocked) return;
  if (!isAiPlayer(state)) return;

  const gen = ++aiGeneration;
  state = { ...state, aiThinking: true };
  inputLocked = true;
  refresh();

  const last = state.history[state.history.length - 1];
  const chainAi = last && state.controllers?.[last.player] === 'ai';

  aiTimer = setTimeout(async () => {
    aiTimer = null;
    if (gen !== aiGeneration || mode !== 'playing') return;
    await runAiTurn(gen);
  }, aiThinkDelayMs({ fast: chainAi }));
}

async function runAiTurn(gen) {
  if (gen !== aiGeneration || mode !== 'playing' || state.winner) return;

  const move = chooseAiMove(state);
  if (!move) {
    state = { ...passTurn(state), aiThinking: false };
    inputLocked = false;
    await afterMoveEffects(null);
    return;
  }

  const next = applyMove(state, move.from, move.to);
  state = { ...next, aiThinking: false };
  inputLocked = false;
  const last = state.history[state.history.length - 1];
  await afterMoveEffects(last);
}

function enterPlaying(nextState, { asTraining = false } = {}) {
  clearAiTimer();
  if (replay) {
    replay.destroy();
    replay = null;
  }
  if (!asTraining) {
    training = null;
    board.setCoachFocus(null);
    hideCoachPopup();
  }
  mode = 'playing';
  state = { ...nextState, aiThinking: false };
  hideWinner();
  setSaveError('');
  showScreen('playing');
  board.resetCameraForPlayerA();
  requestAnimationFrame(() => {
    board.resize();
    refresh();
    if (asTraining) syncCoach();
    else scheduleAiIfNeeded();
  });
  if (!asTraining && state.winner) showWinner(state.winner, state.history.length);
}

function enterTraining() {
  // All seats human so the coach can hand you each player in turn
  training = createTrainingSession();
  enterPlaying(createInitialState({ humans: 4 }), { asTraining: true });
  sfx.ui();
}

function exitTraining({ keepPlaying = false } = {}) {
  if (!training) return;
  training.stop();
  training = null;
  board.setCoachFocus(null);
  hideCoachPopup();
  if (keepPlaying) {
    // Stay on board as a free 4-human practice game
    refresh();
    return;
  }
  enterWelcome();
}

function enterWelcome() {
  clearAiTimer();
  aiGeneration += 1;
  if (replay) {
    replay.destroy();
    replay = null;
  }
  training = null;
  board.setCoachFocus(null);
  hideCoachPopup();
  mode = 'welcome';
  state = createInitialState();
  inputLocked = false;
  hideWinner();
  setSaveError('');
  showScreen('welcome');
  showResumeBannerIfAny();
}

function enterReplay(moves) {
  clearAiTimer();
  aiGeneration += 1;
  if (replay) replay.destroy();
  mode = 'replay';
  inputLocked = false;
  hideWinner();
  setSaveError('');
  showScreen('replay');
  requestAnimationFrame(() => board.resize());

  let lastIndex = 0;
  replay = createReplayController({
    moves,
    stepGapMs: 380,
    async onFrame(s, index, total) {
      const steppedForward = index === lastIndex + 1 && index > 0;
      const applied = steppedForward ? moves[index - 1] : null;
      const roundEnded = applied && s.round > applied.round;

      state = s;
      board.syncFromState(
        state,
        applied
          ? { animateMove: { pieceId: applied.pieceId, power: applied.power } }
          : {}
      );
      updateHUD(state, 'replay');
      updateReplayBar(index, total, replay?.playing);

      if (applied) {
        if (applied.captured) sfx.capture();
        else sfx.move();
        await board.waitForTweens();

        if (roundEnded) {
          sfx.powerSwitch();
          await board.powerFx.play({ duration: 0.7 });
          sfx.morph();
          board.syncFromState(state);
        } else if (applied.captured) {
          await board.powerFx.playShort();
        }
      }

      lastIndex = index;
    },
    onIndexChange(index, total, meta) {
      updateReplayBar(index, total, meta?.playing ?? replay?.playing);
    },
  });
  replay.reset();
}

async function onBoardClick(ev) {
  if (mode !== 'playing' || inputLocked || state.winner || state.fxLocked) return;
  if (!isTraining() && isAiPlayer(state)) return;

  const sq = board.pickSquare(ev.clientX, ev.clientY);
  if (!sq) return;

  if (training?.isActive()) {
    const gate = training.allowClick(state, sq);
    if (!gate.ok) {
      training.setNudge(gate.reason);
      syncCoach();
      sfx.ui();
      return;
    }
    training.clearNudge();
    syncCoach();
  }

  const prevHistoryLen = state.history.length;
  const prevSelected = state.selected;
  const next = selectSquare(state, sq);

  if (next.history.length > prevHistoryLen) {
    const move = next.history[next.history.length - 1];
    state = next;
    // Lock focus on the moving player until animation finishes
    if (training?.isActive()) board.setCoachFocus(move.player);
    await afterMoveEffects(move);
    if (training) {
      training.onMoveCommitted(move);
      syncCoach();
    }
    return;
  }

  state = next;
  if (state.selected && state.selected !== prevSelected) sfx.select();
  if (state.selected !== prevSelected || state.legalMoves.length) refresh();
}

board.domElement.addEventListener('pointerup', onBoardClick);

$('btn-welcome-mute').addEventListener('click', onMuteClick);
$('btn-mute').addEventListener('click', onMuteClick);

$('btn-play').addEventListener('click', () => {
  unlockAudio();
  if (loadAutosave()) {
    const ok = confirm('Start a new game? Your saved progress will be discarded.');
    if (!ok) return;
    clearAutosave();
    hideResumeBanner();
  }
  sfx.ui();
  enterPlaying(createInitialState({ humans: selectedHumans() }));
});

$('btn-resume').addEventListener('click', () => {
  const data = loadAutosave();
  if (!data) {
    hideResumeBanner();
    return;
  }
  try {
    enterPlaying(applyStatusPayload(data));
  } catch (err) {
    clearAutosave();
    hideResumeBanner();
    setSaveError(err.message || 'Could not resume saved game.');
  }
});

$('btn-discard-save').addEventListener('click', () => {
  clearAutosave();
  hideResumeBanner();
});
function startTrainingFromUi() {
  unlockAudio();
  closeHelp();
  if (isTraining()) {
    syncCoach();
    sfx.ui();
    return;
  }
  if (mode === 'playing') {
    const ok = confirm('Leave this match and start live training on the board?');
    if (!ok) return;
    persistProgress();
  } else if (loadAutosave()) {
    const ok = confirm('Start training? Your saved progress stays available — training is not saved.');
    if (!ok) return;
  }
  enterTraining();
}

$('btn-welcome-train')?.addEventListener('click', startTrainingFromUi);
$('btn-welcome-help').addEventListener('click', () => {
  openHelp();
  sfx.ui();
});
$('btn-help').addEventListener('click', () => {
  closeSidebarMenu();
  openHelp();
  sfx.ui();
});
$('btn-train')?.addEventListener('click', () => {
  closeSidebarMenu();
  startTrainingFromUi();
});
$('btn-help-close')?.addEventListener('click', closeHelp);
$('btn-manual-close')?.addEventListener('click', closeHelp);
$('help-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'help-modal') closeHelp();
});
$('btn-manual-train')?.addEventListener('click', startTrainingFromUi);
$('btn-manual-train-footer')?.addEventListener('click', startTrainingFromUi);
$('btn-coach-manual')?.addEventListener('click', () => {
  openHelp();
  sfx.ui();
});
$('btn-coach-exit')?.addEventListener('click', () => {
  exitTraining({ keepPlaying: false });
  sfx.ui();
});
$('btn-coach-continue')?.addEventListener('click', () => {
  exitTraining({ keepPlaying: true });
  sfx.ui();
});

$('btn-menu').addEventListener('click', (e) => {
  e.stopPropagation();
  toggleSidebarMenu();
});

$('btn-welcome-settings').addEventListener('click', () => {
  showSettings();
  sfx.ui();
});
$('btn-settings').addEventListener('click', () => {
  closeSidebarMenu();
  showSettings();
  sfx.ui();
});
$('btn-settings-close').addEventListener('click', closeSettings);
$('btn-settings-done').addEventListener('click', closeSettings);
$('settings-modal').addEventListener('click', (e) => {
  if (e.target.id === 'settings-modal') closeSettings();
});

$('btn-sidebar-collapse').addEventListener('click', () => {
  setSidebarCollapsed(true);
  requestAnimationFrame(() => board.resize());
});

$('btn-sidebar-expand').addEventListener('click', () => {
  setSidebarCollapsed(false);
  requestAnimationFrame(() => board.resize());
});

document.addEventListener('click', (e) => {
  const wrap = e.target.closest?.('.menu-wrap');
  if (!wrap) closeSidebarMenu();
});

$('hud-powers').addEventListener('click', (e) => {
  const btn = e.target.closest?.('[data-player]');
  if (!btn || mode !== 'playing' || isTraining() || state.winner || state.fxLocked) return;
  const player = btn.getAttribute('data-player');
  if (!player) return;

  clearAiTimer();
  aiGeneration += 1;
  state = {
    ...togglePlayerController(state, player),
    aiThinking: false,
  };
  // Only lock input if the current seat is now AI
  inputLocked = isAiPlayer(state);
  refresh();
  persistProgress();
  scheduleAiIfNeeded();
});

$('btn-undo').addEventListener('click', () => {
  if (mode !== 'playing' || isTraining() || state.fxLocked) return;
  if (!state.history?.length) return;
  clearAiTimer();
  aiGeneration += 1;
  inputLocked = false;
  hideWinner();
  state = { ...undoLastMove(state), aiThinking: false };
  refresh();
  persistProgress();
  scheduleAiIfNeeded();
});

$('btn-restart').addEventListener('click', () => {
  closeSidebarMenu();
  if (mode === 'replay') {
    enterWelcome();
    return;
  }
  if (confirm('Leave this match and return to the welcome screen? Progress is saved for resume.')) {
    persistProgress();
    enterWelcome();
  }
});

$('btn-winner-again').addEventListener('click', () => {
  clearAutosave();
  hideWinner();
  // Same seat setup (humans / PC) as the finished match
  const controllers = state.controllers ? { ...state.controllers } : undefined;
  enterPlaying(createInitialState({ humans: selectedHumans(), controllers }));
});

$('btn-winner-restart').addEventListener('click', () => {
  clearAutosave();
  enterWelcome();
});
$('btn-winner-replay').addEventListener('click', () => {
  if (!state.history?.length) return;
  const moves = state.history.map((m) => ({ ...m }));
  hideWinner();
  enterReplay(moves);
});
$('btn-replay-toggle').addEventListener('click', () => replay?.toggle());
$('btn-replay-back').addEventListener('click', () => replay?.stepBack());
$('btn-replay-fwd').addEventListener('click', () => replay?.stepForward());
$('btn-replay-exit').addEventListener('click', enterWelcome);
$('replay-scrub').addEventListener('input', (e) => {
  replay?.setIndex(Number(e.target.value));
});

showScreen('welcome');
showResumeBannerIfAny();

window.addEventListener('beforeunload', () => {
  if (mode === 'playing' && !isTraining() && !state.winner) autosaveGame(state);
});

window.AvatarChess = {
  getState: () => state,
  getMode: () => mode,
  board,
  training: () => training,
  play: (humans = 4) => enterPlaying(createInitialState({ humans })),
  train: () => enterTraining(),
  async move(from, to) {
    if (mode !== 'playing') return state;
    const next = applyMove(state, from, to);
    if (next.history.length === state.history.length) return state;
    state = next;
    await afterMoveEffects(next.history[next.history.length - 1]);
    return state;
  },
};
