import { stateAfterMoves, clearPendingPowerSwitch } from './game.js';

/**
 * Replay controller — rebuilds game state at a move index and drives autoplay.
 * onFrame may return a Promise (e.g. wait for move tween / FX).
 */
export function createReplayController({ moves, onFrame, onIndexChange, stepGapMs = 420 }) {
  let index = 0; // number of moves applied (0 = opening)
  let playing = false;
  let timer = null;
  let generation = 0;

  async function emit() {
    const state = clearPendingPowerSwitch(stateAfterMoves(moves, index));
    await onFrame(state, index, moves.length);
    onIndexChange?.(index, moves.length, { playing });
  }

  function stopTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function scheduleNext() {
    stopTimer();
    if (!playing) return;
    if (index >= moves.length) {
      playing = false;
      onIndexChange?.(index, moves.length, { playing: false });
      return;
    }
    const gen = generation;
    timer = setTimeout(async () => {
      timer = null;
      if (gen !== generation || !playing) return;
      index = Math.min(moves.length, index + 1);
      await emit();
      if (gen !== generation || !playing) return;
      scheduleNext();
    }, stepGapMs);
  }

  return {
    get index() {
      return index;
    },
    get length() {
      return moves.length;
    },
    get playing() {
      return playing;
    },
    reset() {
      generation += 1;
      stopTimer();
      playing = false;
      index = 0;
      void emit();
    },
    setIndex(i) {
      generation += 1;
      stopTimer();
      playing = false;
      index = Math.max(0, Math.min(moves.length, i | 0));
      void emit();
    },
    stepForward() {
      generation += 1;
      stopTimer();
      playing = false;
      if (index < moves.length) {
        index += 1;
        void emit();
      }
    },
    stepBack() {
      generation += 1;
      stopTimer();
      playing = false;
      if (index > 0) {
        index -= 1;
        void emit();
      }
    },
    play() {
      generation += 1;
      if (index >= moves.length) index = 0;
      playing = true;
      void emit().then(() => {
        if (playing) scheduleNext();
      });
    },
    pause() {
      generation += 1;
      playing = false;
      stopTimer();
      onIndexChange?.(index, moves.length, { playing: false });
    },
    toggle() {
      if (playing) this.pause();
      else this.play();
    },
    destroy() {
      generation += 1;
      stopTimer();
      playing = false;
    },
  };
}
