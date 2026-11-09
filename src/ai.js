import {
  PLAYERS,
  getPower,
  getLegalMoves,
  listPlayerMoves,
  livingPlayers,
  currentPlayer,
  algebraicToCoords,
} from './game.js';
import { DIFFICULTIES, getDifficulty } from './meta.js';

function squareAttackedBy(board, file, rank, attacker, power, margin = 0) {
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const cell = board[r][f];
      if (!cell || cell.player !== attacker) continue;
      const legal = getLegalMoves(board, f, r, power, attacker, margin);
      if (legal.some((m) => m.file === file && m.rank === rank && m.capture)) return true;
    }
  }
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const cell = board[r][f];
      if (!cell || cell.player !== attacker) continue;
      const legal = getLegalMoves(board, f, r, power, attacker, margin);
      if (legal.some((m) => m.file === file && m.rank === rank)) return true;
    }
  }
  return false;
}

function nextLivingOpponent(state, player) {
  const living = livingPlayers(state).filter((p) => p !== player);
  if (!living.length) return null;
  let idx = PLAYERS.indexOf(player);
  for (let i = 0; i < 4; i++) {
    idx = (idx + 1) % 4;
    if (living.includes(PLAYERS[idx])) return PLAYERS[idx];
  }
  return living[0];
}

function centrality(file, rank) {
  return 3.5 - Math.abs(file - 3.5) + (3.5 - Math.abs(rank - 3.5));
}

function resolveProfile(difficulty) {
  if (difficulty && DIFFICULTIES[difficulty]) return DIFFICULTIES[difficulty];
  if (difficulty && typeof difficulty === 'object') return difficulty;
  return getDifficulty();
}

function scoreMove(state, move, profile) {
  let score = Math.random() * profile.noise;
  const to = algebraicToCoords(move.to);
  const player = currentPlayer(state);
  const margin = state.boardZone ?? state.boardMargin ?? 0;

  if (move.capture) {
    const victim = state.board[to.rank][to.file];
    score += 12 * profile.captureWeight;
    if (victim && state.piecesLeft[victim.player] === 1) {
      score += 20 * profile.eliminateWeight;
    }
  }

  score += centrality(to.file, to.rank) * profile.centralityWeight;

  const board = state.board.map((row) => row.map((c) => (c ? { ...c } : null)));
  const from = algebraicToCoords(move.from);
  const piece = board[from.rank][from.file];
  board[to.rank][to.file] = piece;
  board[from.rank][from.file] = null;

  const opp = nextLivingOpponent(state, player);
  if (opp) {
    const oppPower = getPower(opp, state.round);
    if (squareAttackedBy(board, to.file, to.rank, opp, oppPower, margin)) {
      score -= (move.capture ? 6 : 8) * profile.dangerWeight;
    }
  }

  const power = getPower(player, state.round);
  const mobility = getLegalMoves(board, to.file, to.rank, power, player, margin).length;
  score += mobility * profile.mobilityWeight;

  // Hard: look one ply ahead for hanging captures against us after move
  if (profile.id === 'hard' && opp) {
    const oppMoves = [];
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const cell = board[r][f];
        if (!cell || cell.player !== opp) continue;
        for (const m of getLegalMoves(board, f, r, getPower(opp, state.round), opp, margin)) {
          if (m.capture) oppMoves.push(m);
        }
      }
    }
    if (oppMoves.some((m) => m.file === to.file && m.rank === to.rank)) {
      score -= 4;
    }
  }

  return score;
}

/**
 * Choose the best AI move for the current player, or null if none.
 * @param {object} state
 * @param {{ difficulty?: string|object }} [opts]
 */
export function chooseAiMove(state, opts = {}) {
  const player = currentPlayer(state);
  const moves = listPlayerMoves(state, player);
  if (!moves.length) return null;

  const profile = resolveProfile(opts.difficulty);
  let best = -Infinity;
  const top = [];
  for (const m of moves) {
    const s = scoreMove(state, m, profile);
    if (s > best + profile.topBand) {
      best = s;
      top.length = 0;
      top.push(m);
    } else if (Math.abs(s - best) <= profile.topBand) {
      top.push(m);
    }
  }
  return top[Math.floor(Math.random() * top.length)];
}

export function aiThinkDelayMs({ fast = false, difficulty } = {}) {
  const profile = resolveProfile(difficulty);
  const scale = profile.thinkScale || 1;
  if (fast) return Math.round((320 + Math.floor(Math.random() * 180)) * scale);
  return Math.round((520 + Math.floor(Math.random() * 280)) * scale);
}
