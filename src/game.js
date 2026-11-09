/** Avatar Chess — pure game rules (no Three.js). */

export const PLAYERS = ['A', 'B', 'C', 'D'];
export const POWERS = ['rook', 'knight', 'bishop'];
export const POWER_OFFSET = { A: 0, B: 1, C: 2, D: 0 };
export const POWER_SYMBOL = { rook: '♖', knight: '♘', bishop: '♗' };
export const POWER_LABEL = { rook: 'Rook', knight: 'Knight', bishop: 'Bishop' };
export const PLAYER_COLOR = {
  A: '#3b82f6',
  B: '#ef4444',
  C: '#22c55e',
  D: '#f59e0b',
};

/**
 * Symmetric home-row opening (round-1 capture-safe).
 * Clockwise on screen (A at bottom): A bottom → B left → C top → D right.
 * (With the default camera, file h reads left and file a reads right.)
 */
export const STARTING_POSITIONS = {
  A1: 'b8',
  A2: 'c8',
  B1: 'h6',
  B2: 'h7',
  C1: 'f1',
  C2: 'g1',
  D1: 'a2',
  D2: 'a3',
};

const FILES = 'abcdefgh';

export function algebraicToCoords(sq) {
  const file = FILES.indexOf(sq[0]);
  const rank = Number(sq[1]) - 1;
  return { file, rank };
}

export function coordsToAlgebraic(file, rank) {
  return FILES[file] + (rank + 1);
}

export function inBounds(file, rank) {
  return file >= 0 && file < 8 && rank >= 0 && rank < 8;
}

/** Full-board playable rectangle. */
export function defaultBoardZone() {
  return { minFile: 0, maxFile: 7, minRank: 0, maxRank: 7 };
}

/** Normalize zone; also accepts legacy numeric boardMargin. */
export function normalizeZone(zoneOrMargin) {
  if (typeof zoneOrMargin === 'number') {
    const m = Math.max(0, Math.min(3, zoneOrMargin | 0));
    return { minFile: m, maxFile: 7 - m, minRank: m, maxRank: 7 - m };
  }
  const d = defaultBoardZone();
  const z = zoneOrMargin || d;
  return {
    minFile: Math.max(0, Math.min(7, z.minFile ?? d.minFile)),
    maxFile: Math.max(0, Math.min(7, z.maxFile ?? d.maxFile)),
    minRank: Math.max(0, Math.min(7, z.minRank ?? d.minRank)),
    maxRank: Math.max(0, Math.min(7, z.maxRank ?? d.maxRank)),
  };
}

export function zoneWidth(zone) {
  const z = normalizeZone(zone);
  return z.maxFile - z.minFile + 1;
}

export function zoneHeight(zone) {
  const z = normalizeZone(zone);
  return z.maxRank - z.minRank + 1;
}

export function isPlayableSquare(file, rank, zoneOrMargin = 0) {
  const z = normalizeZone(zoneOrMargin);
  return (
    file >= z.minFile &&
    file <= z.maxFile &&
    rank >= z.minRank &&
    rank <= z.maxRank
  );
}

export function zoneLabel(zoneOrMargin = 0) {
  const z = normalizeZone(zoneOrMargin);
  return `${zoneWidth(z)}×${zoneHeight(z)}`;
}

/** True when no pieces sit on one side of the current playable rectangle. */
export function edgeEmpty(board, zone, edge) {
  const z = normalizeZone(zone);
  if (edge === 'minRank') {
    for (let file = z.minFile; file <= z.maxFile; file++) {
      if (board[z.minRank]?.[file]) return false;
    }
    return true;
  }
  if (edge === 'maxRank') {
    for (let file = z.minFile; file <= z.maxFile; file++) {
      if (board[z.maxRank]?.[file]) return false;
    }
    return true;
  }
  if (edge === 'minFile') {
    for (let rank = z.minRank; rank <= z.maxRank; rank++) {
      if (board[rank]?.[z.minFile]) return false;
    }
    return true;
  }
  if (edge === 'maxFile') {
    for (let rank = z.minRank; rank <= z.maxRank; rank++) {
      if (board[rank]?.[z.maxFile]) return false;
    }
    return true;
  }
  return false;
}

/**
 * If any edge of the playable zone is empty, remove that edge (repeat).
 * Keeps at least a 2×2 inner area. Sets `justCollapsed` when the zone shrinks.
 */
export function maybeCollapseRings(state) {
  if (!state?.shrinkRings) {
    return state.justCollapsed ? { ...state, justCollapsed: false } : state;
  }
  let zone = normalizeZone(state.boardZone ?? state.boardMargin ?? 0);
  const before = { ...zone };
  let guard = 16;
  while (guard-- > 0) {
    const w = zoneWidth(zone);
    const h = zoneHeight(zone);
    if (h > 2 && edgeEmpty(state.board, zone, 'minRank')) {
      zone = { ...zone, minRank: zone.minRank + 1 };
      continue;
    }
    if (h > 2 && edgeEmpty(state.board, zone, 'maxRank')) {
      zone = { ...zone, maxRank: zone.maxRank - 1 };
      continue;
    }
    if (w > 2 && edgeEmpty(state.board, zone, 'minFile')) {
      zone = { ...zone, minFile: zone.minFile + 1 };
      continue;
    }
    if (w > 2 && edgeEmpty(state.board, zone, 'maxFile')) {
      zone = { ...zone, maxFile: zone.maxFile - 1 };
      continue;
    }
    break;
  }
  const changed =
    zone.minFile !== before.minFile ||
    zone.maxFile !== before.maxFile ||
    zone.minRank !== before.minRank ||
    zone.maxRank !== before.maxRank;
  if (!changed) {
    return state.justCollapsed ? { ...state, justCollapsed: false } : state;
  }
  return {
    ...state,
    boardZone: zone,
    boardMargin: Math.min(zone.minFile, 7 - zone.maxFile, zone.minRank, 7 - zone.maxRank),
    justCollapsed: true,
  };
}

export function getPower(player, round) {
  const offset = POWER_OFFSET[player];
  return POWERS[(round - 1 + offset) % 3];
}

/** Next `count` powers after the current round (upcoming rotations). */
export function upcomingPowers(player, round, count = 3) {
  const out = [];
  for (let i = 1; i <= count; i++) out.push(getPower(player, round + i));
  return out;
}

export function powersForRound(round) {
  const out = {};
  for (const p of PLAYERS) out[p] = getPower(p, round);
  return out;
}

function emptyBoard() {
  return Array.from({ length: 8 }, () => Array(8).fill(null));
}

function cloneBoard(board) {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

export function createControllers(humans = 4) {
  const n = Math.max(1, Math.min(4, Number(humans) || 4));
  const controllers = {};
  PLAYERS.forEach((p, i) => {
    controllers[p] = i < n ? 'human' : 'ai';
  });
  return controllers;
}

export function createInitialState({ humans = 4, controllers, shrinkRings = false } = {}) {
  const board = emptyBoard();
  const piecesLeft = { A: 0, B: 0, C: 0, D: 0 };

  for (const [id, sq] of Object.entries(STARTING_POSITIONS)) {
    const player = id[0];
    const { file, rank } = algebraicToCoords(sq);
    board[rank][file] = { player, id };
    piecesLeft[player] += 1;
  }

  return {
    board,
    players: [...PLAYERS],
    piecesLeft,
    turnIndex: 0,
    round: 1,
    selected: null,
    legalMoves: [],
    winner: null,
    history: [],
    movesThisRound: 0,
    livingAtRoundStart: 4,
    controllers: controllers ? { ...controllers } : createControllers(humans),
    shrinkRings: !!shrinkRings,
    boardZone: defaultBoardZone(),
    boardMargin: 0, // legacy mirror of symmetric inset
    justCollapsed: false,
  };
}

export function isAiPlayer(state, player = currentPlayer(state)) {
  return state.controllers?.[player] === 'ai';
}

/** Toggle a seat between human and AI. */
export function togglePlayerController(state, player) {
  if (!PLAYERS.includes(player)) return state;
  const controllers = { ...(state.controllers || createControllers(4)) };
  controllers[player] = controllers[player] === 'ai' ? 'human' : 'ai';
  return { ...state, controllers };
}

export function livingPlayers(state) {
  return PLAYERS.filter((p) => state.piecesLeft[p] > 0);
}

export function currentPlayer(state) {
  return state.players[state.turnIndex];
}

/** True if this seat already took their turn in the current round. */
export function hasMovedThisRound(state, player) {
  const movedCount = state.movesThisRound || 0;
  if (movedCount <= 0) return false;
  let idx = state.turnIndex;
  for (let i = 0; i < movedCount; i++) {
    do {
      idx = (idx + PLAYERS.length - 1) % PLAYERS.length;
    } while ((state.piecesLeft?.[PLAYERS[idx]] ?? 0) === 0);
    if (PLAYERS[idx] === player) return true;
  }
  return false;
}

export function findPieceSquare(board, pieceId) {
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const cell = board[rank][file];
      if (cell && cell.id === pieceId) return coordsToAlgebraic(file, rank);
    }
  }
  return null;
}

function pathClear(board, fromFile, fromRank, toFile, toRank) {
  const df = Math.sign(toFile - fromFile);
  const dr = Math.sign(toRank - fromRank);
  let f = fromFile + df;
  let r = fromRank + dr;
  while (f !== toFile || r !== toRank) {
    if (board[r][f]) return false;
    f += df;
    r += dr;
  }
  return true;
}

function slideMoves(board, file, rank, player, directions, margin = 0) {
  const moves = [];
  for (const [df, dr] of directions) {
    let f = file + df;
    let r = rank + dr;
    while (isPlayableSquare(f, r, margin)) {
      const cell = board[r][f];
      if (!cell) {
        moves.push({ file: f, rank: r, capture: false });
      } else {
        if (cell.player !== player) {
          moves.push({ file: f, rank: r, capture: true });
        }
        break;
      }
      f += df;
      r += dr;
    }
  }
  return moves;
}

export function getLegalMoves(board, file, rank, power, player, zoneOrMargin = 0) {
  const cell = board[rank]?.[file];
  if (!cell || cell.player !== player) return [];
  if (!isPlayableSquare(file, rank, zoneOrMargin)) return [];

  if (power === 'rook') {
    return slideMoves(board, file, rank, player, [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ], zoneOrMargin);
  }

  if (power === 'bishop') {
    return slideMoves(board, file, rank, player, [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ], zoneOrMargin);
  }

  // knight — may jump over removed squares, but must land in the playable zone
  const moves = [];
  const deltas = [
    [1, 2],
    [1, -2],
    [-1, 2],
    [-1, -2],
    [2, 1],
    [2, -1],
    [-2, 1],
    [-2, -1],
  ];
  for (const [df, dr] of deltas) {
    const f = file + df;
    const r = rank + dr;
    if (!isPlayableSquare(f, r, zoneOrMargin)) continue;
    const target = board[r][f];
    if (!target) moves.push({ file: f, rank: r, capture: false });
    else if (target.player !== player) moves.push({ file: f, rank: r, capture: true });
  }
  return moves;
}

export function selectSquare(state, square) {
  if (state.winner) return state;
  const player = currentPlayer(state);
  const { file, rank } = algebraicToCoords(square);
  const cell = state.board[rank][file];
  const zone = state.boardZone ?? state.boardMargin ?? 0;

  if (state.selected) {
    const legal = state.legalMoves.find((m) => m.file === file && m.rank === rank);
    if (legal) return applyMove(state, state.selected, square);

    // re-select own piece
    if (cell && cell.player === player) {
      const power = getPower(player, state.round);
      const legalMoves = getLegalMoves(state.board, file, rank, power, player, zone);
      return { ...state, selected: square, legalMoves };
    }

    return { ...state, selected: null, legalMoves: [] };
  }

  if (cell && cell.player === player) {
    const power = getPower(player, state.round);
    const legalMoves = getLegalMoves(state.board, file, rank, power, player, zone);
    return { ...state, selected: square, legalMoves };
  }

  return state;
}

function advanceTurn(state) {
  const living = livingPlayers(state);
  if (living.length <= 1) {
    return {
      ...state,
      winner: living[0] || null,
      selected: null,
      legalMoves: [],
      pendingPowerSwitch: false,
    };
  }

  let nextIndex = state.turnIndex;
  do {
    nextIndex = (nextIndex + 1) % 4;
  } while (state.piecesLeft[PLAYERS[nextIndex]] === 0);

  let movesThisRound = state.movesThisRound + 1;
  let round = state.round;
  let pendingPowerSwitch = false;
  let turnIndex = nextIndex;

  // A full round ends when every player who was alive at round start has moved once.
  // Use count of living players *after* this move for remaining, but track how many
  // moves expected at round start.
  if (movesThisRound >= state.livingAtRoundStart) {
    round += 1;
    movesThisRound = 0;
    pendingPowerSwitch = true;
    // After round bump, turn continues with next living player already computed.
    // Reset living count for the new round.
    return {
      ...state,
      turnIndex,
      round,
      movesThisRound,
      livingAtRoundStart: livingPlayers({ ...state, turnIndex }).length,
      selected: null,
      legalMoves: [],
      pendingPowerSwitch,
    };
  }

  return {
    ...state,
    turnIndex,
    round,
    movesThisRound,
    selected: null,
    legalMoves: [],
    pendingPowerSwitch: false,
  };
}

export function applyMove(state, fromSq, toSq) {
  const player = currentPlayer(state);
  const power = getPower(player, state.round);
  const from = algebraicToCoords(fromSq);
  const to = algebraicToCoords(toSq);
  const piece = state.board[from.rank][from.file];
  if (!piece || piece.player !== player) return state;

  const zone = state.boardZone ?? state.boardMargin ?? 0;
  const legal = getLegalMoves(state.board, from.file, from.rank, power, player, zone);
  const ok = legal.find((m) => m.file === to.file && m.rank === to.rank);
  if (!ok) return state;

  const board = cloneBoard(state.board);
  const piecesLeft = { ...state.piecesLeft };
  const target = board[to.rank][to.file];
  let captured = null;

  if (target) {
    captured = { player: target.player, id: target.id, at: toSq };
    piecesLeft[target.player] -= 1;
  }

  board[to.rank][to.file] = piece;
  board[from.rank][from.file] = null;

  const historyEntry = {
    i: state.history.length,
    player,
    power,
    round: state.round,
    from: fromSq,
    to: toSq,
    pieceId: piece.id,
    captured,
    boardZone: normalizeZone(zone),
  };

  let next = {
    ...state,
    board,
    piecesLeft,
    history: [...state.history, historyEntry],
    selected: null,
    legalMoves: [],
    lastMove: historyEntry,
    justCollapsed: false,
  };

  next = advanceTurn(next);
  next = maybeCollapseRings(next);
  if (next.justCollapsed && next.history?.length) {
    const hist = [...next.history];
    const last = {
      ...hist[hist.length - 1],
      boardZoneAfter: next.boardZone,
      boardMarginAfter: next.boardMargin,
    };
    hist[hist.length - 1] = last;
    next = { ...next, history: hist, lastMove: last };
  }
  return next;
}

export function clearPendingPowerSwitch(state) {
  return { ...state, pendingPowerSwitch: false };
}

/** Advance turn without moving (AI with zero legal moves). */
export function passTurn(state) {
  if (state.winner) return state;
  let next = advanceTurn({ ...state, selected: null, legalMoves: [], justCollapsed: false });
  return maybeCollapseRings(next);
}

/** All legal moves for a player this turn. */
export function listPlayerMoves(state, player) {
  const power = getPower(player, state.round);
  const zone = state.boardZone ?? state.boardMargin ?? 0;
  const moves = [];
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const cell = state.board[rank][file];
      if (!cell || cell.player !== player) continue;
      const from = coordsToAlgebraic(file, rank);
      for (const m of getLegalMoves(state.board, file, rank, power, player, zone)) {
        moves.push({
          from,
          to: coordsToAlgebraic(m.file, m.rank),
          capture: m.capture,
          pieceId: cell.id,
          file: m.file,
          rank: m.rank,
        });
      }
    }
  }
  return moves;
}

export function serializeBoard(board) {
  return board.map((row) => row.map((cell) => (cell ? { player: cell.player, id: cell.id } : null)));
}

export function hydrateFromStatus(statusState) {
  const board = statusState.board.map((row) =>
    row.map((cell) => (cell ? { player: cell.player, id: cell.id } : null))
  );
  const piecesLeft = { A: 0, B: 0, C: 0, D: 0 };
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const cell = board[r][f];
      if (cell) piecesLeft[cell.player] += 1;
    }
  }

  const living = PLAYERS.filter((p) => piecesLeft[p] > 0).length;
  return {
    board,
    players: [...PLAYERS],
    piecesLeft: statusState.piecesLeft || piecesLeft,
    turnIndex: statusState.turnIndex,
    round: statusState.round,
    selected: null,
    legalMoves: [],
    winner: statusState.winner ?? null,
    history: statusState.history ? [...statusState.history] : [],
    movesThisRound: statusState.movesThisRound ?? 0,
    livingAtRoundStart: statusState.livingAtRoundStart ?? Math.max(living, 1),
    pendingPowerSwitch: false,
    controllers: statusState.controllers
      ? { ...statusState.controllers }
      : createControllers(4),
    shrinkRings: !!statusState.shrinkRings,
    boardZone: statusState.boardZone
      ? normalizeZone(statusState.boardZone)
      : normalizeZone(statusState.boardMargin ?? 0),
    boardMargin: statusState.boardMargin ?? 0,
    justCollapsed: false,
  };
}

/** Replay helper: rebuild state after applying first `upTo` history moves from opening. */
export function stateAfterMoves(moves, upTo, controllers, opts = {}) {
  let state = createInitialState({
    controllers: controllers || createControllers(4),
    shrinkRings: !!opts.shrinkRings,
  });
  const n = Math.max(0, Math.min(upTo, moves.length));
  for (let i = 0; i < n; i++) {
    const m = moves[i];
    // Force turn to the move's player (history is authoritative for replay)
    state.turnIndex = PLAYERS.indexOf(m.player);
    state.round = m.round;
    state = applyMove(state, m.from, m.to);
    state = clearPendingPowerSwitch(state);
  }
  return {
    ...state,
    selected: null,
    legalMoves: [],
    pendingPowerSwitch: false,
    justCollapsed: false,
    controllers: controllers ? { ...controllers } : state.controllers,
  };
}

/** Undo the last move by replaying history without it. */
export function undoLastMove(state) {
  if (!state.history?.length) return state;
  const moves = state.history.slice(0, -1);
  return stateAfterMoves(moves, moves.length, state.controllers, {
    shrinkRings: state.shrinkRings,
  });
}

export function powerHintText(power) {
  if (power === 'rook') return 'Rook: any distance along a row or column (path clear).';
  if (power === 'knight') return 'Knight: L-shape (2×1), can jump.';
  return 'Bishop: any distance diagonally (path clear).';
}
