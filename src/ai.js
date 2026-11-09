import {
  PLAYERS,
  getPower,
  getLegalMoves,
  listPlayerMoves,
  livingPlayers,
  currentPlayer,
  algebraicToCoords,
} from './game.js';

function squareAttackedBy(board, file, rank, attacker, power) {
  // Can attacker capture (file,rank) with their power from any of their pieces?
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const cell = board[r][f];
      if (!cell || cell.player !== attacker) continue;
      const legal = getLegalMoves(board, f, r, power, attacker);
      if (legal.some((m) => m.file === file && m.rank === rank && m.capture)) return true;
    }
  }
  // Also check if empty destination would be attackable as a landing (capture flag false but same geometry)
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const cell = board[r][f];
      if (!cell || cell.player !== attacker) continue;
      const legal = getLegalMoves(board, f, r, power, attacker);
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

function scoreMove(state, move) {
  let score = Math.random() * 0.4;
  const to = algebraicToCoords(move.to);
  const player = currentPlayer(state);

  if (move.capture) {
    const victim = state.board[to.rank][to.file];
    score += 12;
    if (victim && state.piecesLeft[victim.player] === 1) score += 20; // eliminate
  }

  score += centrality(to.file, to.rank) * 0.35;

  // Simulate occupancy for safety check
  const board = state.board.map((row) => row.map((c) => (c ? { ...c } : null)));
  const from = algebraicToCoords(move.from);
  const piece = board[from.rank][from.file];
  board[to.rank][to.file] = piece;
  board[from.rank][from.file] = null;

  const opp = nextLivingOpponent(state, player);
  if (opp) {
    // Opponent uses THEIR power for the current round (same round until they move)
    const oppPower = getPower(opp, state.round);
    if (squareAttackedBy(board, to.file, to.rank, opp, oppPower)) {
      score -= move.capture ? 6 : 8;
    }
  }

  // Prefer moves that increase options slightly
  const power = getPower(player, state.round);
  const mobility = getLegalMoves(board, to.file, to.rank, power, player).length;
  score += mobility * 0.08;

  return score;
}

/**
 * Choose the best AI move for the current player, or null if none.
 */
export function chooseAiMove(state) {
  const player = currentPlayer(state);
  const moves = listPlayerMoves(state, player);
  if (!moves.length) return null;

  let best = -Infinity;
  const top = [];
  for (const m of moves) {
    const s = scoreMove(state, m);
    if (s > best + 0.15) {
      best = s;
      top.length = 0;
      top.push(m);
    } else if (Math.abs(s - best) <= 0.15) {
      top.push(m);
    }
  }
  return top[Math.floor(Math.random() * top.length)];
}

export function aiThinkDelayMs({ fast = false } = {}) {
  // Beat before each PC move so turns are readable (slightly faster when AI chains)
  if (fast) return 320 + Math.floor(Math.random() * 180);
  return 520 + Math.floor(Math.random() * 280);
}
