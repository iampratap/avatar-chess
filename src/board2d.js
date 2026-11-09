/**
 * Lightweight HTML Canvas board — same public API surface as createBoard3D.
 */
import {
  PLAYER_COLOR,
  POWER_SYMBOL,
  getPower,
  getActivePower,
  coordsToAlgebraic,
  algebraicToCoords,
  currentPlayer,
  PLAYERS,
} from './game.js';
import { BOARD_THEMES, loadThemePrefs } from './themes.js';

function hexCss(n) {
  return `#${(n >>> 0).toString(16).padStart(6, '0')}`;
}

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

function randFace() {
  return 1 + Math.floor(Math.random() * 6);
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function createBoard2D(container) {
  const canvas = document.createElement('canvas');
  canvas.className = 'board-canvas-2d';
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.touchAction = 'none';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  let themePrefs = loadThemePrefs();
  let uiSceneId = themePrefs.ui || 'dark';
  let gameState = null;
  let animateMove = null;
  let holdForms = false;
  let coachFocus = null;
  let layout = { pad: 0, size: 0, cell: 0, ox: 0, oy: 0 };
  let dpr = 1;
  let running = true;
  let lastTs = performance.now();
  let flash = 0;
  let flashColor = 'rgba(232,195,106,0.35)';
  const tweens = [];
  let pieceScreen = new Map(); // id -> {x,y}
  let pointerMoved = false;
  let pointerStart = null;
  let dice = null; // { t, duration, face, resolve, x, y, rot }

  const powerFx = {
    playShort() {
      flash = 0.45;
      flashColor = 'rgba(251, 113, 133, 0.28)';
      return new Promise((r) => setTimeout(r, 280));
    },
    update() {},
  };

  function boardTheme() {
    return BOARD_THEMES[themePrefs.board] || BOARD_THEMES.wooden;
  }

  function cellCenter(file, rank) {
    // A at bottom: rank 0 bottom → screen y increases downward, so invert rank
    const x = layout.ox + (file + 0.5) * layout.cell;
    const y = layout.oy + (7 - rank + 0.5) * layout.cell;
    return { x, y };
  }

  function projectSeatOverlays() {
    const root = document.getElementById('board-seats');
    if (!root || !layout.cell) return;
    const hostRect = container.getBoundingClientRect();
    const midX = hostRect.width / 2;
    const midY = hostRect.height / 2;
    const half = layout.size / 2;
    const outset = Math.max(28, layout.cell * 0.55);
    const anchors = {
      A: { x: midX, y: midY + half + outset * 0.15 },
      B: { x: midX - half - outset * 0.1, y: midY },
      C: { x: midX, y: midY - half - outset * 0.15 },
      D: { x: midX + half + outset * 0.1, y: midY },
    };
    for (const el of root.querySelectorAll('.board-seat')) {
      const p = el.dataset.seat;
      const a = anchors[p];
      if (!a) continue;
      el.style.transform = `translate(-50%, -50%) translate(${a.x}px, ${a.y}px)`;
      el.classList.add('is-visible');
    }
  }

  function onResize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pad = Math.max(10, Math.min(w, h) * 0.03);
    const size = Math.max(40, Math.min(w, h) - pad * 2);
    // Top-align in tall portrait hosts so the board sits under the HUD (no gray gap)
    const topBias = h > w * 1.05;
    layout = {
      pad,
      size,
      cell: size / 8,
      ox: (w - size) / 2,
      oy: topBias ? pad : (h - size) / 2,
    };
    // Snap pieces without active tweens
    if (gameState?.board) {
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const cell = gameState.board[r][f];
          if (!cell) continue;
          if (tweens.some((t) => t.id === cell.id)) continue;
          pieceScreen.set(cell.id, cellCenter(f, r));
        }
      }
    }
    projectSeatOverlays();
  }

  function pickSquare(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const file = Math.floor((x - layout.ox) / layout.cell);
    const rankFromTop = Math.floor((y - layout.oy) / layout.cell);
    const rank = 7 - rankFromTop;
    if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
    return coordsToAlgebraic(file, rank);
  }

  function waitForTweens() {
    if (!tweens.length) return Promise.resolve();
    return new Promise((resolve) => {
      const check = () => {
        if (!tweens.length) resolve();
        else requestAnimationFrame(check);
      };
      check();
    });
  }

  function tweenPiece(id, to, duration = 0.38) {
    const from = pieceScreen.get(id) || to;
    tweens.push({
      id,
      from: { ...from },
      to: { ...to },
      t: 0,
      duration,
    });
  }

  function syncFromState(state, opts = {}) {
    gameState = state;
    animateMove = opts.animateMove || null;
    holdForms = !!opts.holdForms;
    const seen = new Set();
    if (state?.board) {
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const cell = state.board[r][f];
          if (!cell) continue;
          seen.add(cell.id);
          const dest = cellCenter(f, r);
          if (animateMove && animateMove.pieceId === cell.id) {
            if (!pieceScreen.has(cell.id)) pieceScreen.set(cell.id, dest);
            else tweenPiece(cell.id, dest);
          } else if (!tweens.some((t) => t.id === cell.id)) {
            pieceScreen.set(cell.id, dest);
          }
        }
      }
    }
    for (const id of [...pieceScreen.keys()]) {
      if (!seen.has(id)) pieceScreen.delete(id);
    }
  }

  function formForPiece(cell) {
    if (!gameState) return 'pawn';
    const active = currentPlayer(gameState);
    const isActive = cell.player === active;
    const isMoving = animateMove && animateMove.pieceId === cell.id;
    let power = 'pawn';
    if (gameState.diceMode) {
      power = gameState.diceRolledThisTurn ? getActivePower(gameState, cell.player) : 'pawn';
    } else {
      power = getPower(cell.player, gameState.round);
    }
    if (isMoving) return animateMove.power || power || 'pawn';
    if (holdForms) return 'pawn';
    if (isActive && power && power !== 'pass') return power;
    return 'pawn';
  }

  function drawBoard() {
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const theme = boardTheme();
    const bg =
      uiSceneId === 'light' ? '#e8edf5' : hexCss(theme.bg || 0x1a1410);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Rim
    ctx.fillStyle = hexCss(theme.rim);
    const rim = layout.cell * 0.12;
    roundRect(
      ctx,
      layout.ox - rim,
      layout.oy - rim,
      layout.size + rim * 2,
      layout.size + rim * 2,
      8
    );
    ctx.fill();

    const zone = gameState?.shrinkRings
      ? gameState.boardZone || { minFile: 0, maxFile: 7, minRank: 0, maxRank: 7 }
      : null;

    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const light = (file + rank) % 2 === 0;
        const x = layout.ox + file * layout.cell;
        const y = layout.oy + (7 - rank) * layout.cell;
        const playable =
          !zone ||
          (file >= zone.minFile &&
            file <= zone.maxFile &&
            rank >= zone.minRank &&
            rank <= zone.maxRank);
        ctx.globalAlpha = playable ? 1 : 0.28;
        ctx.fillStyle = hexCss(light ? theme.light : theme.dark);
        ctx.fillRect(x, y, layout.cell + 0.5, layout.cell + 0.5);
        ctx.globalAlpha = 1;
      }
    }

    // Selection
    if (gameState?.selected) {
      const { file, rank } = algebraicToCoords(gameState.selected);
      const x = layout.ox + file * layout.cell;
      const y = layout.oy + (7 - rank) * layout.cell;
      ctx.fillStyle = 'rgba(29, 78, 216, 0.42)';
      ctx.fillRect(x, y, layout.cell, layout.cell);
    }

    // Legal moves
    for (const m of gameState?.legalMoves || []) {
      const { file, rank } = algebraicToCoords(m.to || m);
      const c = cellCenter(file, rank);
      const capture = !!(m.capture || m.captured);
      ctx.beginPath();
      ctx.arc(c.x, c.y, layout.cell * (capture ? 0.38 : 0.18), 0, Math.PI * 2);
      ctx.fillStyle = capture ? 'rgba(239, 68, 68, 0.7)' : 'rgba(34, 197, 94, 0.65)';
      ctx.fill();
    }
  }

  function drawPieces() {
    if (!gameState?.board) return;
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 220);
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const cell = gameState.board[r][f];
        if (!cell) continue;
        const pos = pieceScreen.get(cell.id) || cellCenter(f, r);
        const form = formForPiece(cell);
        const color = PLAYER_COLOR[cell.player] || '#94a3b8';
        const dim =
          coachFocus && cell.player !== coachFocus ? 0.28 : 1;
        const focusPulse = coachFocus && cell.player === coachFocus ? pulse : 1;
        ctx.save();
        ctx.globalAlpha = dim;
        const radius = layout.cell * 0.34;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        if (focusPulse < 1 || (coachFocus && cell.player === coachFocus)) {
          ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.35 * pulse})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.fillStyle = '#fff';
        ctx.font = `600 ${Math.floor(layout.cell * 0.42)}px "Segoe UI Symbol","Apple Symbols",serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(POWER_SYMBOL[form] || POWER_SYMBOL.pawn || '♟', pos.x, pos.y + 1);
        ctx.restore();
      }
    }
  }

  function drawDice() {
    if (!dice) return;
    const size = layout.cell * 1.15;
    ctx.save();
    ctx.translate(dice.x, dice.y);
    ctx.rotate(dice.rot);
    ctx.fillStyle = '#f1f5f9';
    ctx.strokeStyle = 'rgba(15,23,42,0.25)';
    ctx.lineWidth = 2;
    const r = size * 0.18;
    roundRect(ctx, -size / 2, -size / 2, size, size, r);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#0f172a';
    ctx.font = `700 ${Math.floor(size * 0.45)}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const show = dice.t > dice.duration * 0.72 ? String(dice.face) : String(1 + Math.floor(Math.random() * 6));
    ctx.fillText(show, 0, 0);
    ctx.restore();
  }

  function drawFlash() {
    if (flash <= 0) return;
    ctx.fillStyle = flashColor;
    ctx.globalAlpha = Math.min(1, flash * 2);
    ctx.fillRect(layout.ox, layout.oy, layout.size, layout.size);
    ctx.globalAlpha = 1;
  }

  function tick(ts) {
    if (!running) return;
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;

    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      tw.t += dt / tw.duration;
      const u = easeOutCubic(Math.min(1, tw.t));
      pieceScreen.set(tw.id, {
        x: tw.from.x + (tw.to.x - tw.from.x) * u,
        y: tw.from.y + (tw.to.y - tw.from.y) * u,
      });
      if (tw.t >= 1) tweens.splice(i, 1);
    }

    if (flash > 0) flash = Math.max(0, flash - dt);

    if (dice) {
      dice.t += dt;
      dice.rot += dt * 14;
      dice.y += Math.sin(dice.t * 18) * 0.4;
      if (dice.t >= dice.duration) {
        const done = dice.resolve;
        const face = dice.face;
        dice = null;
        done?.(face);
      }
    }

    drawBoard();
    drawPieces();
    drawDice();
    drawFlash();
    requestAnimationFrame(tick);
  }

  function playDiceRoll() {
    return new Promise((resolve) => {
      const face = randFace();
      dice = {
        t: 0,
        duration: 1.15,
        face,
        resolve,
        x: layout.ox + layout.size / 2,
        y: layout.oy + layout.size / 2,
        rot: 0,
      };
      flash = 0.2;
      flashColor = 'rgba(125, 211, 252, 0.25)';
    });
  }

  function setThemes(partial = {}) {
    themePrefs = {
      ...themePrefs,
      board: partial.board || themePrefs.board,
      piece: partial.piece || themePrefs.piece,
    };
    if (partial.ui) uiSceneId = partial.ui;
  }

  function getThemes() {
    return { board: themePrefs.board, piece: themePrefs.piece, ui: uiSceneId };
  }

  function setCoachFocus(player) {
    coachFocus = player || null;
  }

  canvas.addEventListener('pointerdown', (e) => {
    pointerMoved = false;
    pointerStart = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointerStart) return;
    const dx = e.clientX - pointerStart.x;
    const dy = e.clientY - pointerStart.y;
    if (dx * dx + dy * dy > 36) pointerMoved = true;
  });
  canvas.addEventListener('pointerup', () => {
    pointerStart = null;
  });

  // Expose drag flag for pick (main uses pointerup always; we no-op orbit)
  const origPick = pickSquare;
  function pickSquareSafe(clientX, clientY) {
    if (pointerMoved) return null;
    return origPick(clientX, clientY);
  }

  const ro = new ResizeObserver(() => onResize());
  ro.observe(container);
  window.addEventListener('resize', onResize);
  onResize();
  requestAnimationFrame(tick);

  return {
    syncFromState,
    pickSquare: pickSquareSafe,
    waitForTweens,
    powerFx,
    playDiceRoll,
    controls: null,
    setThemes,
    getThemes,
    setUiTheme(id) {
      uiSceneId = id || 'dark';
    },
    setCoachFocus,
    resetCameraForPlayerA() {},
    nudgeCamera() {
      flash = 0.22;
      flashColor = 'rgba(255,255,255,0.18)';
    },
    projectSeatOverlays,
    resize: onResize,
    domElement: canvas,
    viewMode: '2d',
    dispose() {
      running = false;
      ro.disconnect();
      window.removeEventListener('resize', onResize);
      if (canvas.parentNode === container) container.removeChild(canvas);
    },
  };
}
