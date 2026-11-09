/**
 * Live-board training coach — scripted lessons on a real game.
 */
import {
  PLAYERS,
  POWER_LABEL,
  POWER_SYMBOL,
  PLAYER_COLOR,
  currentPlayer,
  algebraicToCoords,
} from './game.js';

/** Lessons play in order; each waits for that player to complete one legal move. */
export const TRAINING_LESSONS = [
  {
    id: 'a-rook',
    player: 'A',
    power: 'rook',
    title: 'Lesson 1 — Your Rook',
    body: 'You are Player A (blue). Your pawns have morphed into Rooks.',
    action: 'Tap a glowing blue piece, then tap a green square along its row or column.',
  },
  {
    id: 'b-knight',
    player: 'B',
    power: 'knight',
    title: 'Lesson 2 — Knight',
    body: 'Now play as Player B (red). These pieces move as Knights.',
    action: 'Tap a glowing red Knight, then jump in an L: 2 squares one way and 1 sideways.',
  },
  {
    id: 'c-bishop',
    player: 'C',
    power: 'bishop',
    title: 'Lesson 3 — Bishop',
    body: 'Player C (green) uses the Bishop — diagonals only.',
    action: 'Tap a glowing green piece, then slide it diagonally onto a highlighted square.',
  },
  {
    id: 'd-rook',
    player: 'D',
    power: 'rook',
    title: 'Lesson 4 — Rook again',
    body: 'Player D (orange) is a Rook this round.',
    action: 'Move a glowing orange Rook along a row or column to finish Round 1.',
  },
  {
    id: 'a-knight',
    player: 'A',
    power: 'knight',
    title: 'Lesson 5 — Powers rotate',
    body: 'New round! Player A is now a Knight. Powers change every round.',
    action: 'Move a glowing blue Knight with an L-shaped jump.',
  },
];

export function createTrainingSession() {
  let index = 0;
  let active = true;
  let completed = false;
  let nudge = '';

  function lesson() {
    if (!active || completed) return null;
    return TRAINING_LESSONS[index] || null;
  }

  function coachPayload() {
    const L = lesson();
    if (!L) {
      return {
        active: false,
        completed,
        title: completed ? 'Training complete' : '',
        body: completed
          ? 'Nice work. You moved each power on the live board.'
          : '',
        action: completed ? 'Exit training, or keep playing freely.' : '',
        player: null,
        power: null,
        step: index,
        total: TRAINING_LESSONS.length,
        nudge,
      };
    }
    return {
      active: true,
      completed: false,
      title: L.title,
      body: L.body,
      action: L.action,
      player: L.player,
      power: L.power,
      symbol: POWER_SYMBOL[L.power],
      powerLabel: POWER_LABEL[L.power],
      color: PLAYER_COLOR[L.player],
      step: index + 1,
      total: TRAINING_LESSONS.length,
      nudge,
    };
  }

  function clearNudge() {
    nudge = '';
  }

  function setNudge(msg) {
    nudge = msg || '';
  }

  /**
   * Validate a board click during training.
   * @returns {{ ok: boolean, reason?: string }}
   */
  function allowClick(state, square) {
    const L = lesson();
    if (!L) return { ok: true };
    if (currentPlayer(state) !== L.player) {
      return { ok: false, reason: `Wait — it is Player ${L.player}'s turn in this lesson.` };
    }

    const { file, rank } = algebraicToCoords(square);
    const cell = state.board[rank][file];

    if (state.selected) {
      const legal = state.legalMoves.some((m) => m.file === file && m.rank === rank);
      if (legal) return { ok: true };
      if (cell && cell.player === L.player) return { ok: true }; // re-select
      return {
        ok: false,
        reason: `Move the ${L.power} onto a glowing green (or red capture) square.`,
      };
    }

    if (cell && cell.player === L.player) return { ok: true };
    return {
      ok: false,
      reason: `Only tap Player ${L.player}'s highlighted ${POWER_LABEL[L.power].toLowerCase()} pieces.`,
    };
  }

  /** Call after a successful move by the lesson player. */
  function onMoveCommitted(move) {
    const L = lesson();
    if (!L || !move) return coachPayload();
    if (move.player !== L.player) return coachPayload();
    clearNudge();
    index += 1;
    if (index >= TRAINING_LESSONS.length) {
      completed = true;
      active = false;
    }
    return coachPayload();
  }

  function focusPlayer() {
    return lesson()?.player ?? null;
  }

  function isActive() {
    return active && !completed;
  }

  function isCompleted() {
    return completed;
  }

  function stop() {
    active = false;
  }

  return {
    lesson,
    coachPayload,
    allowClick,
    onMoveCommitted,
    focusPlayer,
    isActive,
    isCompleted,
    clearNudge,
    setNudge,
    stop,
    PLAYERS,
  };
}
