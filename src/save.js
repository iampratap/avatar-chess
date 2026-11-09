import {
  STARTING_POSITIONS,
  hydrateFromStatus,
  createInitialState,
  applyMove,
  clearPendingPowerSwitch,
  PLAYERS,
} from './game.js';

const VERSION = 1;

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function buildReplayPayload(state) {
  return {
    version: VERSION,
    kind: 'replay',
    title: 'Avatar Chess',
    savedAt: new Date().toISOString(),
    startingPositions: { ...STARTING_POSITIONS },
    moves: state.history,
    result: state.winner ? { winner: state.winner } : null,
    shrinkRings: !!state.shrinkRings,
  };
}

export function exportReplay(state) {
  const payload = buildReplayPayload(state);
  downloadJson('avatar-chess-replay.json', payload);
  return payload;
}

/** Compact URL-hash share (base64 JSON). */
export function encodeReplayHash(payload) {
  const json = JSON.stringify({
    version: payload.version,
    kind: 'replay',
    moves: payload.moves,
    result: payload.result ?? null,
    shrinkRings: !!payload.shrinkRings,
  });
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return `r=${btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

export function decodeReplayHash(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  const m = raw.match(/(?:^|&)r=([^&]+)/);
  if (!m) return null;
  const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const json = new TextDecoder().decode(bytes);
  return parseJsonFile(json);
}

export async function copyReplayLink(state) {
  const payload = buildReplayPayload(state);
  const hash = encodeReplayHash(payload);
  const url = `${location.origin}${location.pathname}${location.search}#${hash}`;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
  } else {
    const ta = document.createElement('textarea');
    ta.value = url;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  return url;
}

export function parseJsonFile(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON.');
  }
  if (!data || data.version !== VERSION) {
    throw new Error('Unsupported or missing save version.');
  }
  if (data.kind !== 'status' && data.kind !== 'replay') {
    throw new Error('Unknown save kind (expected status or replay).');
  }
  return data;
}

function validateBoard(board) {
  if (!Array.isArray(board) || board.length !== 8) return false;
  for (const row of board) {
    if (!Array.isArray(row) || row.length !== 8) return false;
    for (const cell of row) {
      if (cell == null) continue;
      if (!cell.player || !cell.id || !PLAYERS.includes(cell.player)) return false;
    }
  }
  return true;
}

export function applyStatusPayload(data) {
  if (data.kind !== 'status') throw new Error('Not a status save.');
  const s = data.state;
  if (!s || !validateBoard(s.board)) throw new Error('Invalid board in status save.');
  if (typeof s.turnIndex !== 'number' || s.turnIndex < 0 || s.turnIndex > 3) {
    throw new Error('Invalid turnIndex.');
  }
  if (typeof s.round !== 'number' || s.round < 1) throw new Error('Invalid round.');
  return hydrateFromStatus(s);
}

export function applyReplayPayload(data) {
  if (data.kind !== 'replay') throw new Error('Not a replay save.');
  if (!Array.isArray(data.moves)) throw new Error('Replay missing moves.');

  const shrinkRings = !!data.shrinkRings;
  let state = createInitialState({ shrinkRings });
  for (let i = 0; i < data.moves.length; i++) {
    const m = data.moves[i];
    if (!m?.from || !m?.to || !m?.player) {
      throw new Error(`Replay move ${i} is malformed.`);
    }
    state.turnIndex = PLAYERS.indexOf(m.player);
    if (state.turnIndex < 0) throw new Error(`Replay move ${i} has invalid player.`);
    state.round = m.round || state.round;
    const before = state.history.length;
    state = applyMove(state, m.from, m.to);
    state = clearPendingPowerSwitch(state);
    if (state.history.length !== before + 1) {
      throw new Error(`Replay move ${i} (${m.from}→${m.to}) is illegal.`);
    }
  }

  return {
    moves: data.moves,
    result: data.result ?? null,
    shrinkRings,
  };
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsText(file);
  });
}

const AUTOSAVE_KEY = 'avatar-chess-autosave-v1';

function buildStatusPayload(state) {
  return {
    version: VERSION,
    kind: 'status',
    title: 'Avatar Chess',
    savedAt: new Date().toISOString(),
    state: {
      board: state.board.map((row) =>
        row.map((cell) => (cell ? { player: cell.player, id: cell.id } : null))
      ),
      turnIndex: state.turnIndex,
      round: state.round,
      piecesLeft: { ...state.piecesLeft },
      winner: state.winner,
      history: state.history,
      movesThisRound: state.movesThisRound,
      livingAtRoundStart: state.livingAtRoundStart,
      controllers: state.controllers ? { ...state.controllers } : undefined,
      shrinkRings: !!state.shrinkRings,
      boardZone: state.boardZone
        ? { ...state.boardZone }
        : { minFile: 0, maxFile: 7, minRank: 0, maxRank: 7 },
      boardMargin: state.boardMargin || 0,
    },
  };
}

/** Persist in-progress game to localStorage (local database). */
export function autosaveGame(state) {
  if (!state || state.winner) {
    clearAutosave();
    return null;
  }
  // Only keep a resume slot once play has started
  if (!(state.history?.length > 0) && state.round === 1 && state.movesThisRound === 0) {
    return null;
  }
  const payload = buildStatusPayload(state);
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(payload));
  } catch {
    // Quota / private mode — ignore
  }
  return payload;
}

export function loadAutosave() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const data = parseJsonFile(raw);
    if (data.kind !== 'status') return null;
    if (data.state?.winner) {
      clearAutosave();
      return null;
    }
    return data;
  } catch {
    clearAutosave();
    return null;
  }
}

export function clearAutosave() {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    /* ignore */
  }
}

export function autosaveSummary(data) {
  if (!data?.state) return '';
  const s = data.state;
  const moves = s.history?.length ?? 0;
  const when = data.savedAt ? new Date(data.savedAt) : null;
  const time =
    when && !Number.isNaN(when.getTime())
      ? when.toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : 'Unknown time';
  return `Round ${s.round} · ${moves} move${moves === 1 ? '' : 's'} · saved ${time}`;
}

// Keep exportStatus payload shape in sync
export function exportStatus(state) {
  const payload = buildStatusPayload(state);
  downloadJson('avatar-chess-save.json', payload);
  return payload;
}
