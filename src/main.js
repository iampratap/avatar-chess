import {
  createInitialState,
  selectSquare,
  clearPendingPowerSwitch,
  undoLastMove,
  applyMove,
  passTurn,
  isAiPlayer,
  togglePlayerController,
  getPower,
  listPlayerMoves,
  currentPlayer,
  zoneLabel,
} from './game.js';
import { chooseAiMove, aiThinkDelayMs } from './ai.js';
import { createBoard3D } from './board3d.js';
import {
  applyStatusPayload,
  applyReplayPayload,
  autosaveGame,
  loadAutosave,
  clearAutosave,
  autosaveSummary,
  exportReplay,
  copyReplayLink,
  decodeReplayHash,
  parseJsonFile,
  readFileAsText,
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
  showToast,
  renderCareerPanel,
  updateBlitzHud,
} from './ui.js';
import {
  saveThemePrefs,
  applyUiTheme,
  loadAndApplyUiTheme,
} from './themes.js';
import { unlockAudio, isMuted, toggleMute, sfx } from './sound.js';
import { createTrainingSession } from './training.js';
import {
  loadPrefs,
  savePrefs,
  getDifficulty,
  getBlitzSeconds,
  recordMatchEnd,
  markTrainingComplete,
  careerSummary,
  achievementProgress,
  shuffleControllers,
  isDailyDoneToday,
  todayKey,
} from './meta.js';

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
let matchFlags = { daily: false, recorded: false, elimThisMatch: 0 };
let blitzTimer = null;
let blitzDeadline = 0;
let blitzTotal = 0;

function isTraining() {
  return !!training;
}


function selectedRadio(name, fallback) {
  const checked = document.querySelector(`input[name="${name}"]:checked`);
  return checked ? checked.value : fallback;
}

function syncPrefsFromUi() {
  return savePrefs({
    difficulty: selectedRadio('difficulty', 'normal'),
    blitz: selectedRadio('blitz', 'off'),
    shrinkRings: selectedRadio('shrinkRings', 'off') === 'on',
  });
}

function applyPrefsToUi() {
  const prefs = loadPrefs();
  for (const el of document.querySelectorAll('input[name="difficulty"]')) {
    el.checked = el.value === prefs.difficulty;
  }
  for (const el of document.querySelectorAll('input[name="blitz"]')) {
    el.checked = el.value === prefs.blitz;
  }
  const shrinkVal = prefs.shrinkRings ? 'on' : 'off';
  for (const el of document.querySelectorAll('input[name="shrinkRings"]')) {
    el.checked = el.value === shrinkVal;
  }
}

function matchOptionsFromPrefs() {
  const prefs = loadPrefs();
  return { shrinkRings: !!prefs.shrinkRings };
}

function refreshCareerUi() {
  renderCareerPanel(careerSummary(), achievementProgress());
  const hint = $('daily-hint');
  if (hint) {
    if (isDailyDoneToday()) {
      const s = careerSummary();
      hint.hidden = false;
      hint.textContent = s.dailyBestMoves
        ? `Daily cleared today · best ${s.dailyBestMoves} moves`
        : 'Daily challenge cleared today';
    } else {
      hint.hidden = false;
      hint.textContent = `Daily challenge · ${todayKey()} · 1 human vs Hard PC`;
    }
  }
}

function clearBlitzTimer() {
  if (blitzTimer) {
    clearInterval(blitzTimer);
    blitzTimer = null;
  }
  blitzDeadline = 0;
  updateBlitzHud(0, 0);
}

function startBlitzClock() {
  clearBlitzTimer();
  if (mode !== 'playing' || isTraining() || state.winner) return;
  const total = getBlitzSeconds();
  blitzTotal = total;
  if (!total || isAiPlayer(state)) {
    updateBlitzHud(0, 0);
    return;
  }
  blitzDeadline = performance.now() + total * 1000;
  updateBlitzHud(total, total);
  blitzTimer = setInterval(() => {
    if (mode !== 'playing' || state.winner || isAiPlayer(state)) {
      clearBlitzTimer();
      return;
    }
    const left = (blitzDeadline - performance.now()) / 1000;
    updateBlitzHud(left, blitzTotal);
    if (left <= 5.05 && left > 4.7) sfx.tick();
    if (left <= 0) {
      clearBlitzTimer();
      onBlitzTimeout();
    }
  }, 100);
}

async function onBlitzTimeout() {
  if (mode !== 'playing' || state.winner || isTraining() || isAiPlayer(state)) return;
  showToast('Time! Turn passed.');
  sfx.ui();
  const moves = listPlayerMoves(state, currentPlayer(state));
  clearAiTimer();
  aiGeneration += 1;
  inputLocked = false;
  if (moves.length) {
    const pick = moves[Math.floor(Math.random() * moves.length)];
    const next = applyMove(state, pick.from, pick.to);
    state = next;
    const last = state.history[state.history.length - 1];
    await afterMoveEffects(last);
  } else {
    state = passTurn(state);
    await afterMoveEffects(null);
  }
}

function celebrateAchievements(list) {
  for (const a of list || []) {
    sfx.achieve();
    showToast(`Badge unlocked: ${a.label}`);
  }
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
  state = clearPendingPowerSwitch({ ...state, fxLocked: false, aiThinking: false });
  inputLocked = false;
  sfx.morph();
  refresh();
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
  banner.classList.remove('ui-enter');
  void banner.offsetWidth;
  banner.classList.add('ui-enter');
  return true;
}

async function afterMoveEffects(move) {
  clearBlitzTimer();
  if (move) {
    if (move.captured) sfx.capture();
    else sfx.move();
  }

  // 1) Glide the piece (keep its attack form during the flight)
  refresh({
    animateMove: move
      ? { pieceId: move.pieceId, power: move.power }
      : null,
  });
  await board.waitForTweens();

  // 2) Capture spark / elimination drama
  if (move?.captured) {
    const victim = move.captured.player || move.captured;
    const eliminated =
      typeof victim === 'string' && (state.piecesLeft?.[victim] ?? 1) === 0;
    try {
      navigator.vibrate?.(eliminated ? [30, 40, 55] : 18);
    } catch {
      /* ignore */
    }
    if (eliminated) {
      matchFlags.elimThisMatch += 1;
      sfx.eliminate();
      board.nudgeCamera(1.6);
      showToast(`Player ${victim} eliminated!`);
      await board.powerFx.playShort();
    } else {
      board.nudgeCamera(0.9);
      await board.powerFx.playShort();
    }
  }

  // 2b) Board ring collapse
  if (state.justCollapsed) {
    const label = zoneLabel(state.boardZone ?? state.boardMargin);
    showToast(`Empty edge removed — play zone is now ${label}`);
    sfx.morph();
    try {
      navigator.vibrate?.([20, 30, 20]);
    } catch {
      /* ignore */
    }
    await board.powerFx.playShort();
    state = { ...state, justCollapsed: false };
  }

  // 3) Round change — morph into new powers (no round-finish FX)
  await runPowerSwitchIfNeeded();

  persistProgress();
  if (isTraining()) {
    if (state.winner) {
      training?.stop();
      syncCoach();
      celebrateAchievements(markTrainingComplete());
      refreshCareerUi();
    }
    return;
  }
  if (state.winner) {
    clearAutosave();
    clearBlitzTimer();
    sfx.win();
    finishMatchMeta();
    return;
  }
  scheduleAiIfNeeded();
  startBlitzClock();
}

function finishMatchMeta() {
  if (matchFlags.recorded) {
    showWinner(state.winner, state.history.length);
    return;
  }
  matchFlags.recorded = true;
  const winner = state.winner;
  const humanWon = !!(winner && state.controllers?.[winner] === 'human');
  const prefs = loadPrefs();
  const result = recordMatchEnd({
    winner,
    humanWon,
    eliminations: matchFlags.elimThisMatch,
    winPower: winner ? getPower(winner, state.round) : null,
    difficulty: prefs.difficulty,
    blitzSeconds: getBlitzSeconds(),
    isDaily: matchFlags.daily,
    moveCount: state.history.length,
  });
  showWinner(winner, state.history.length, {
    humanWon,
    streak: result.stats.currentStreak,
    daily: matchFlags.daily && humanWon,
  });
  celebrateAchievements(result.unlockedNow);
  refreshCareerUi();
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
  }, aiThinkDelayMs({ fast: chainAi, difficulty: getDifficulty() }));
}

async function runAiTurn(gen) {
  if (gen !== aiGeneration || mode !== 'playing' || state.winner) return;

  const move = chooseAiMove(state, { difficulty: getDifficulty() });
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

function enterPlaying(nextState, { asTraining = false, daily = false, keepMatchFlags = false } = {}) {
  clearAiTimer();
  clearBlitzTimer();
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
  if (!keepMatchFlags) {
    matchFlags = {
      daily: !!daily,
      recorded: false,
      elimThisMatch: 0,
    };
  }
  hideWinner();
  setSaveError('');
  showScreen('playing');
  board.resetCameraForPlayerA();
  requestAnimationFrame(() => {
    board.resize();
    refresh();
    if (asTraining) syncCoach();
    else {
      scheduleAiIfNeeded();
      startBlitzClock();
    }
  });
  if (!asTraining && state.winner) finishMatchMeta();
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
  clearBlitzTimer();
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
  matchFlags = { daily: false, recorded: false, elimThisMatch: 0 };
  hideWinner();
  setSaveError('');
  showScreen('welcome');
  showResumeBannerIfAny();
  applyPrefsToUi();
  refreshCareerUi();
}

function enterReplay(moves, { shrinkRings = false } = {}) {
  clearAiTimer();
  clearBlitzTimer();
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
    shrinkRings,
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
  syncPrefsFromUi();
  if (loadAutosave()) {
    const ok = confirm('Start a new game? Your saved progress will be discarded.');
    if (!ok) return;
    clearAutosave();
    hideResumeBanner();
  }
  sfx.ui();
  enterPlaying(createInitialState({ humans: selectedHumans(), ...matchOptionsFromPrefs() }), { daily: false });
});

$('btn-daily')?.addEventListener('click', () => {
  unlockAudio();
  savePrefs({ difficulty: 'hard', blitz: 'off' });
  applyPrefsToUi();
  if (loadAutosave()) {
    const ok = confirm('Start Daily Challenge? Your saved progress will be discarded.');
    if (!ok) return;
    clearAutosave();
    hideResumeBanner();
  }
  sfx.ui();
  // Always 1 human vs 3 Hard PC
  for (const el of document.querySelectorAll('input[name="humans"]')) {
    el.checked = el.value === '1';
  }
  enterPlaying(createInitialState({ humans: 1, ...matchOptionsFromPrefs() }), { daily: true });
  showToast(isDailyDoneToday() ? 'Daily already cleared — play for a better score!' : 'Daily Challenge: beat Hard PC');
});

for (const name of ['difficulty', 'blitz', 'shrinkRings']) {
  document.querySelectorAll(`input[name="${name}"]`).forEach((el) => {
    el.addEventListener('change', () => {
      syncPrefsFromUi();
      sfx.ui();
    });
  });
}

$('btn-import-replay')?.addEventListener('click', () => {
  $('import-replay-file')?.click();
});

$('import-replay-file')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const textFile = await readFileAsText(file);
    const data = parseJsonFile(textFile);
    const result = applyReplayPayload(data);
    enterReplay(result.moves, { shrinkRings: result.shrinkRings });
    showToast('Replay loaded');
  } catch (err) {
    setSaveError(err.message || 'Could not import replay.');
  }
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
  const controllers = state.controllers ? { ...state.controllers } : undefined;
  const daily = matchFlags.daily;
  enterPlaying(
    createInitialState({
      humans: selectedHumans(),
      controllers,
      shrinkRings: state.shrinkRings ?? matchOptionsFromPrefs().shrinkRings,
    }),
    { daily }
  );
});

$('btn-winner-shuffle')?.addEventListener('click', () => {
  clearAutosave();
  hideWinner();
  const controllers = shuffleControllers(state.controllers || {});
  enterPlaying(
    createInitialState({
      controllers,
      shrinkRings: state.shrinkRings ?? matchOptionsFromPrefs().shrinkRings,
    }),
    { daily: false }
  );
  showToast('Seats shuffled');
});

$('btn-winner-share')?.addEventListener('click', async () => {
  try {
    await copyReplayLink(state);
    showToast('Replay link copied');
    sfx.ui();
  } catch (err) {
    setSaveError(err.message || 'Could not copy link.');
  }
});

$('btn-winner-download')?.addEventListener('click', () => {
  exportReplay(state);
  showToast('Replay downloaded');
  sfx.ui();
});

$('btn-winner-restart').addEventListener('click', () => {
  clearAutosave();
  enterWelcome();
});
$('btn-winner-replay').addEventListener('click', () => {
  if (!state.history?.length) return;
  const moves = state.history.map((m) => ({ ...m }));
  hideWinner();
  enterReplay(moves, { shrinkRings: !!state.shrinkRings });
});
$('btn-replay-toggle').addEventListener('click', () => replay?.toggle());
$('btn-replay-back').addEventListener('click', () => replay?.stepBack());
$('btn-replay-fwd').addEventListener('click', () => replay?.stepForward());
$('btn-replay-exit').addEventListener('click', enterWelcome);
$('replay-scrub').addEventListener('input', (e) => {
  replay?.setIndex(Number(e.target.value));
});

applyPrefsToUi();
refreshCareerUi();
showScreen('welcome');
showResumeBannerIfAny();

// Deep-link shared replay (#r=...)
try {
  const shared = decodeReplayHash(location.hash);
  if (shared?.kind === 'replay') {
    const result = applyReplayPayload(shared);
    history.replaceState(null, '', location.pathname + location.search);
    enterReplay(result.moves, { shrinkRings: result.shrinkRings });
    showToast('Opened shared replay');
  }
} catch (err) {
  setSaveError(err.message || 'Shared replay link is invalid.');
}

window.addEventListener('beforeunload', () => {
  if (mode === 'playing' && !isTraining() && !state.winner) autosaveGame(state);
});

window.AvatarChess = {
  getState: () => state,
  getMode: () => mode,
  board,
  training: () => training,
  play: (humans = 4) => enterPlaying(createInitialState({ humans, ...matchOptionsFromPrefs() })),
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
