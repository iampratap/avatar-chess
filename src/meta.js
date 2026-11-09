/**
 * Local retention meta: prefs, career stats, streaks, achievements, daily challenge.
 * No backend — everything in localStorage.
 */

import { PLAYERS } from './game.js';

const PREFS_KEY = 'avatar-chess-prefs-v1';
const STATS_KEY = 'avatar-chess-stats-v1';
const ACHIEVE_KEY = 'avatar-chess-achievements-v1';

export const DIFFICULTIES = {
  easy: {
    id: 'easy',
    label: 'Easy',
    captureWeight: 0.55,
    eliminateWeight: 0.4,
    dangerWeight: 1.35,
    mobilityWeight: 0.04,
    centralityWeight: 0.2,
    noise: 2.2,
    topBand: 1.8,
    thinkScale: 0.75,
  },
  normal: {
    id: 'normal',
    label: 'Normal',
    captureWeight: 1,
    eliminateWeight: 1,
    dangerWeight: 1,
    mobilityWeight: 0.08,
    centralityWeight: 0.35,
    noise: 0.4,
    topBand: 0.15,
    thinkScale: 1,
  },
  hard: {
    id: 'hard',
    label: 'Hard',
    captureWeight: 1.25,
    eliminateWeight: 1.35,
    dangerWeight: 1.15,
    mobilityWeight: 0.12,
    centralityWeight: 0.45,
    noise: 0.08,
    topBand: 0.05,
    thinkScale: 1.2,
  },
};

export const BLITZ_OPTIONS = {
  off: { id: 'off', label: 'Off', seconds: 0 },
  '20': { id: '20', label: '20s', seconds: 20 },
  '45': { id: '45', label: '45s', seconds: 45 },
};

const ACHIEVEMENTS = {
  first_win: { id: 'first_win', label: 'First Victory', desc: 'Win any match' },
  streak_3: { id: 'streak_3', label: 'On Fire', desc: 'Win 3 matches in a row' },
  hard_win: { id: 'hard_win', label: 'Hard Mode', desc: 'Beat Hard PC' },
  eliminator: { id: 'eliminator', label: 'Clean Sweep', desc: 'Eliminate 3 rivals in one match' },
  daily: { id: 'daily', label: 'Daily Hero', desc: 'Clear a Daily Challenge' },
  blitz_win: { id: 'blitz_win', label: 'Speed Demon', desc: 'Win a blitz match' },
  training: { id: 'training', label: 'Graduate', desc: 'Finish live training' },
};

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ...fallback };
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return { ...fallback };
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

const defaultPrefs = () => ({
  difficulty: 'normal',
  blitz: 'off',
});

const defaultStats = () => ({
  gamesPlayed: 0,
  wins: 0,
  losses: 0,
  eliminations: 0,
  currentStreak: 0,
  bestStreak: 0,
  lastWinner: null,
  lastHumanWin: false,
  powerWins: { rook: 0, knight: 0, bishop: 0 },
  dailyBest: null,
  dailyDone: null,
});

export function loadPrefs() {
  const p = readJson(PREFS_KEY, defaultPrefs());
  if (!DIFFICULTIES[p.difficulty]) p.difficulty = 'normal';
  if (!BLITZ_OPTIONS[p.blitz]) p.blitz = 'off';
  return p;
}

export function savePrefs(partial) {
  const next = { ...loadPrefs(), ...partial };
  writeJson(PREFS_KEY, next);
  return next;
}

export function getDifficulty() {
  return DIFFICULTIES[loadPrefs().difficulty] || DIFFICULTIES.normal;
}

export function getBlitzSeconds() {
  return BLITZ_OPTIONS[loadPrefs().blitz]?.seconds || 0;
}

export function loadStats() {
  const s = readJson(STATS_KEY, defaultStats());
  s.powerWins = { rook: 0, knight: 0, bishop: 0, ...(s.powerWins || {}) };
  return s;
}

export function loadAchievements() {
  return readJson(ACHIEVE_KEY, { unlocked: {} });
}

export function listAchievementDefs() {
  return Object.values(ACHIEVEMENTS);
}

function unlockAchievement(id, unlockedNow) {
  const bag = loadAchievements();
  if (!bag.unlocked) bag.unlocked = {};
  if (bag.unlocked[id]) return;
  bag.unlocked[id] = new Date().toISOString();
  writeJson(ACHIEVE_KEY, bag);
  if (ACHIEVEMENTS[id]) unlockedNow.push(ACHIEVEMENTS[id]);
}

export function recordMatchEnd({
  winner,
  humanWon,
  eliminations = 0,
  winPower = null,
  difficulty = 'normal',
  blitzSeconds = 0,
  isDaily = false,
  moveCount = 0,
}) {
  const stats = loadStats();
  stats.gamesPlayed += 1;
  stats.eliminations += eliminations;
  stats.lastWinner = winner || null;
  stats.lastHumanWin = !!humanWon;

  const unlockedNow = [];

  if (humanWon) {
    stats.wins += 1;
    stats.currentStreak += 1;
    stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
    if (winPower && stats.powerWins[winPower] != null) {
      stats.powerWins[winPower] += 1;
    }
    unlockAchievement('first_win', unlockedNow);
    if (stats.currentStreak >= 3) unlockAchievement('streak_3', unlockedNow);
    if (difficulty === 'hard') unlockAchievement('hard_win', unlockedNow);
    if (eliminations >= 3) unlockAchievement('eliminator', unlockedNow);
    if (blitzSeconds > 0) unlockAchievement('blitz_win', unlockedNow);
    if (isDaily) {
      const today = todayKey();
      stats.dailyDone = today;
      if (!stats.dailyBest || stats.dailyBest.date !== today || moveCount < stats.dailyBest.moves) {
        stats.dailyBest = { date: today, moves: moveCount };
      }
      unlockAchievement('daily', unlockedNow);
    }
  } else {
    stats.losses += 1;
    stats.currentStreak = 0;
  }

  writeJson(STATS_KEY, stats);
  return { stats, unlockedNow };
}

export function markTrainingComplete() {
  const unlockedNow = [];
  unlockAchievement('training', unlockedNow);
  return unlockedNow;
}

export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isDailyDoneToday() {
  return loadStats().dailyDone === todayKey();
}

export function careerSummary(stats = loadStats()) {
  const fav = Object.entries(stats.powerWins || {}).sort((a, b) => b[1] - a[1])[0];
  const favLabel = fav && fav[1] > 0 ? fav[0] : '—';
  return {
    gamesPlayed: stats.gamesPlayed || 0,
    wins: stats.wins || 0,
    streak: stats.currentStreak || 0,
    bestStreak: stats.bestStreak || 0,
    eliminations: stats.eliminations || 0,
    favoritePower: favLabel,
    dailyDone: stats.dailyDone === todayKey(),
    dailyBestMoves: stats.dailyBest?.date === todayKey() ? stats.dailyBest.moves : null,
  };
}

/** Keep human count; randomly assign which seats are human. */
export function shuffleControllers(controllers) {
  const entries = PLAYERS.map((p) => controllers?.[p] || 'human');
  const humanCount = entries.filter((c) => c === 'human').length;
  const seats = [...PLAYERS];
  for (let i = seats.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [seats[i], seats[j]] = [seats[j], seats[i]];
  }
  const next = {};
  seats.forEach((p, i) => {
    next[p] = i < humanCount ? 'human' : 'ai';
  });
  return next;
}

export function achievementProgress() {
  const unlocked = loadAchievements().unlocked || {};
  return listAchievementDefs().map((a) => ({
    ...a,
    unlocked: !!unlocked[a.id],
    at: unlocked[a.id] || null,
  }));
}
