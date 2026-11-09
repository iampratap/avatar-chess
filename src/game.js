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

export function getPower(player, round) {
  const offset = POWER_OFFSET[player];
  return POWERS[(round - 1 + offset) % 3];
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

export function createInitialState({ humans = 4, controllers } = {}) {
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

function slideMoves(board, file, rank, player, directions) {
  const moves = [];
  for (const [df, dr] of directions) {
    let f = file + df;
    let r = rank + dr;
    while (inBounds(f, r)) {
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

export function getLegalMoves(board, file, rank, power, player) {
  const cell = board[rank][file];
  if (!cell || cell.player !== player) return [];

  if (power === 'rook') {
    return slideMoves(board, file, rank, player, [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]);
  }

  if (power === 'bishop') {
    return slideMoves(board, file, rank, player, [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]);
  }

  // knight
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
    if (!inBounds(f, r)) continue;
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

  if (state.selected) {
    const legal = state.legalMoves.find((m) => m.file === file && m.rank === rank);
    if (legal) return applyMove(state, state.selected, square);

    // re-select own piece
    if (cell && cell.player === player) {
      const power = getPower(player, state.round);
      const legalMoves = getLegalMoves(state.board, file, rank, power, player);
      return { ...state, selected: square, legalMoves };
    }

    return { ...state, selected: null, legalMoves: [] };
  }

  if (cell && cell.player === player) {
    const power = getPower(player, state.round);
    const legalMoves = getLegalMoves(state.board, file, rank, power, player);
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

  const legal = getLegalMoves(state.board, from.file, from.rank, power, player);
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
  };

  let next = {
    ...state,
    board,
    piecesLeft,
    history: [...state.history, historyEntry],
    selected: null,
    legalMoves: [],
    lastMove: historyEntry,
  };

  next = advanceTurn(next);
  return next;
}

export function clearPendingPowerSwitch(state) {
  return { ...state, pendingPowerSwitch: false };
}

/** Advance turn without moving (AI with zero legal moves). */
export function passTurn(state) {
  if (state.winner) return state;
  return advanceTurn({ ...state, selected: null, legalMoves: [] });
}

/** All legal moves for a player this turn. */
export function listPlayerMoves(state, player) {
  const power = getPower(player, state.round);
  const moves = [];
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const cell = state.board[rank][file];
      if (!cell || cell.player !== player) continue;
      const from = coordsToAlgebraic(file, rank);
      for (const m of getLegalMoves(state.board, file, rank, power, player)) {
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
  };
}

/** Replay helper: rebuild state after applying first `upTo` history moves from opening. */
export function stateAfterMoves(moves, upTo, controllers) {
  let state = createInitialState({
    controllers: controllers || createControllers(4),
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
    controllers: controllers ? { ...controllers } : state.controllers,
  };
}

/** Undo the last move by replaying history without it. */
export function undoLastMove(state) {
  if (!state.history?.length) return state;
  const moves = state.history.slice(0, -1);
  return stateAfterMoves(moves, moves.length, state.controllers);
}

export function powerHintText(power) {
  if (power === 'rook') return 'Rook: any distance along a row or column (path clear).';
  if (power === 'knight') return 'Knight: L-shape (2×1), can jump.';
  return 'Bishop: any distance diagonally (path clear).';
}
