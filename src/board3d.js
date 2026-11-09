import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  PLAYER_COLOR,
  getPower,
  getActivePower,
  coordsToAlgebraic,
  algebraicToCoords,
  currentPlayer,
  STARTING_POSITIONS,
  PLAYERS,
} from './game.js';
import { createPowerFx } from './powerFx.js';
import { createDice3D } from './dice3d.js';
import { BOARD_THEMES, PIECE_THEMES, UI_SCENE, loadThemePrefs } from './themes.js';

const TILE = 1;
const ORIGIN = -3.5;
const SEAT_OUTSET = 1.15;

function sqToWorld(file, rank) {
  return {
    x: ORIGIN + file * TILE,
    z: ORIGIN + (7 - rank) * TILE,
  };
}

/**
 * World anchors on the midpoint of each player's home edge (outside the rim).
 * Uses the dominant axis of their starting squares so badges stay on that side
 * when the camera rotates.
 */
function buildSeatWorldAnchors() {
  const half = 3.5;
  const anchors = {};
  for (const player of PLAYERS) {
    const squares = Object.entries(STARTING_POSITIONS)
      .filter(([id]) => id.startsWith(player))
      .map(([, sq]) => algebraicToCoords(sq));
    if (!squares.length) continue;
    let x = 0;
    let z = 0;
    for (const s of squares) {
      const w = sqToWorld(s.file, s.rank);
      x += w.x;
      z += w.z;
    }
    x /= squares.length;
    z /= squares.length;
    if (Math.abs(x) >= Math.abs(z)) {
      // File-edge seat (B left / D right)
      anchors[player] = new THREE.Vector3(
        Math.sign(x || 1) * (half + SEAT_OUTSET),
        0.45,
        0
      );
    } else {
      // Rank-edge seat (A bottom / C top)
      anchors[player] = new THREE.Vector3(
        0,
        0.45,
        Math.sign(z || 1) * (half + SEAT_OUTSET)
      );
    }
  }
  return anchors;
}

const SEAT_WORLD = buildSeatWorldAnchors();

function worldToSq(x, z) {
  const file = Math.round((x - ORIGIN) / TILE);
  const rank = 7 - Math.round((z - ORIGIN) / TILE);
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return coordsToAlgebraic(file, rank);
}

function makePieceMat(color, theme) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: theme.metalness ?? 0.22,
    roughness: theme.roughness ?? 0.45,
    emissive: 0x000000,
    emissiveIntensity: 0,
  });
}

function addCast(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Open stylized mesh kits (procedural, redistributable). */
function buildForm(kind, color, pieceTheme) {
  const g = new THREE.Group();
  g.name = kind;
  const kit = pieceTheme.kit || 'classic';
  const m = () => makePieceMat(color, pieceTheme);

  if (kit === 'lowpoly') {
    if (kind === 'pawn') {
      g.add(addCast(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.42), m())));
      g.children[0].position.y = 0.1;
      const body = addCast(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.45, 0.28), m()));
      body.position.y = 0.4;
      g.add(body);
      const head = addCast(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), m()));
      head.position.y = 0.72;
      g.add(head);
    } else if (kind === 'rook') {
      const tower = addCast(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.75, 0.46), m()));
      tower.position.y = 0.4;
      g.add(tower);
      for (const x of [-0.18, 0.18]) {
        for (const z of [-0.18, 0.18]) {
          const batt = addCast(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.16), m()));
          batt.position.set(x, 0.85, z);
          g.add(batt);
        }
      }
    } else if (kind === 'knight') {
      const body = addCast(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.5, 0.3), m()));
      body.position.y = 0.35;
      g.add(body);
      const head = addCast(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.4), m()));
      head.position.set(0.06, 0.72, 0.08);
      g.add(head);
    } else {
      const body = addCast(new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.85, 5), m()));
      body.position.y = 0.45;
      g.add(body);
    }
    return g;
  }

  if (kit === 'crystal') {
    const geo =
      kind === 'pawn'
        ? new THREE.OctahedronGeometry(0.32, 0)
        : kind === 'rook'
          ? new THREE.BoxGeometry(0.4, 0.7, 0.4)
          : kind === 'knight'
            ? new THREE.DodecahedronGeometry(0.34, 0)
            : new THREE.ConeGeometry(0.28, 0.85, 6);
    const mesh = addCast(new THREE.Mesh(geo, m()));
    mesh.position.y = kind === 'pawn' ? 0.4 : 0.42;
    mesh.material.transparent = true;
    mesh.material.opacity = 0.88;
    g.add(mesh);
    const base = addCast(new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.1, 6), m()));
    base.position.y = 0.05;
    g.add(base);
    return g;
  }

  if (kit === 'totem') {
    const stack = kind === 'pawn' ? 3 : kind === 'knight' ? 4 : 5;
    for (let i = 0; i < stack; i++) {
      const disk = addCast(
        new THREE.Mesh(new THREE.CylinderGeometry(0.28 - i * 0.03, 0.3 - i * 0.03, 0.16, 10), m())
      );
      disk.position.y = 0.1 + i * 0.17;
      g.add(disk);
    }
    if (kind === 'rook') {
      const top = addCast(new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.38), m()));
      top.position.y = 0.1 + stack * 0.17;
      g.add(top);
    } else if (kind === 'bishop') {
      const tip = addCast(new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), m()));
      tip.position.y = 0.12 + stack * 0.17;
      g.add(tip);
    } else if (kind === 'knight') {
      const beak = addCast(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.28), m()));
      beak.position.set(0.1, 0.1 + stack * 0.17, 0.12);
      g.add(beak);
    }
    return g;
  }

  // classic kit
  if (kind === 'pawn') {
    g.add(addCast(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.16, 20), m())));
    g.children[0].position.y = 0.08;
    const body = addCast(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.4, 20), m()));
    body.position.y = 0.36;
    g.add(body);
    const head = addCast(new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 16), m()));
    head.position.y = 0.64;
    g.add(head);
  } else if (kind === 'rook') {
    const base = addCast(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.14, 8), m()));
    base.position.y = 0.07;
    g.add(base);
    const tower = addCast(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.42), m()));
    tower.position.y = 0.4;
    g.add(tower);
    for (const [x, z] of [
      [-0.16, -0.16],
      [0.16, -0.16],
      [-0.16, 0.16],
      [0.16, 0.16],
    ]) {
      const batt = addCast(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.14), m()));
      batt.position.set(x, 0.75, z);
      g.add(batt);
    }
  } else if (kind === 'knight') {
    const base = addCast(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.14, 16), m()));
    base.position.y = 0.07;
    g.add(base);
    const body = addCast(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.38, 0.28), m()));
    body.position.set(0, 0.34, 0.02);
    g.add(body);
    const neck = addCast(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.34), m()));
    neck.position.set(0.02, 0.58, 0.08);
    neck.rotation.z = -0.35;
    g.add(neck);
    const head = addCast(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.28), m()));
    head.position.set(0.08, 0.78, 0.12);
    g.add(head);
    const snout = addCast(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.18), m()));
    snout.position.set(0.14, 0.72, 0.26);
    g.add(snout);
  } else if (kind === 'bishop') {
    const base = addCast(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.14, 16), m()));
    base.position.y = 0.07;
    g.add(base);
    const body = addCast(new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.7, 16), m()));
    body.position.y = 0.48;
    g.add(body);
    const mitre = addCast(new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), m()));
    mitre.position.y = 0.88;
    g.add(mitre);
    const slit = addCast(
      new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.22, 0.28),
        new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.1, roughness: 0.6 })
      )
    );
    slit.position.y = 0.55;
    g.add(slit);
  } else if (kind === 'queen') {
    const base = addCast(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.14, 16), m()));
    base.position.y = 0.07;
    g.add(base);
    const body = addCast(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.5, 16), m()));
    body.position.y = 0.4;
    g.add(body);
    const crown = addCast(new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.28, 8), m()));
    crown.position.y = 0.78;
    g.add(crown);
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      const tip = addCast(new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), m()));
      tip.position.set(Math.cos(ang) * 0.16, 0.92, Math.sin(ang) * 0.16);
      g.add(tip);
    }
  }

  return g;
}

export function createPieceMesh(player, id, pieceTheme) {
  const color = new THREE.Color(PLAYER_COLOR[player]);
  const group = new THREE.Group();
  group.userData = { pieceId: id, player, kind: 'piece', form: 'pawn', themeId: pieceTheme.id };

  const forms = {
    pawn: buildForm('pawn', color, pieceTheme),
    rook: buildForm('rook', color, pieceTheme),
    knight: buildForm('knight', color, pieceTheme),
    bishop: buildForm('bishop', color, pieceTheme),
    queen: buildForm('queen', color, pieceTheme),
  };

  for (const [name, form] of Object.entries(forms)) {
    form.visible = name === 'pawn';
    group.add(form);
  }

  group.userData.forms = forms;
  return group;
}

function setPieceForm(mesh, form) {
  if (mesh.userData.form === form) return;
  mesh.userData.form = form;
  for (const [name, g] of Object.entries(mesh.userData.forms)) {
    g.visible = name === form;
  }
  // Wizard shimmer when morphing (no bounce)
  mesh.userData.morphPulse = 1;
}

export function createBoard3D(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x12141c);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth || 1, container.clientHeight || 1);
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(
    42,
    Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1),
    0.1,
    100
  );
  // Start with Player A (rank 8 / north) at the bottom of the screen
  camera.position.set(0, 11.5, -9.5);
  camera.lookAt(0, 0, 0);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 8;
  controls.maxDistance = 22;
  controls.minPolarAngle = 0.35;
  controls.maxPolarAngle = Math.PI / 2.15;
  controls.rotateSpeed = 0.7;
  // Distinguish click (select piece) from drag (rotate)
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.DOLLY,
  };
  controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_PAN,
  };
  controls.update();

  let pointerDown = null;
  const CLICK_PX = 6;

  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    pointerDown = { x: e.clientX, y: e.clientY };
  });

  let themePrefs = loadThemePrefs();
  let boardTheme = BOARD_THEMES[themePrefs.board] || BOARD_THEMES.wooden;
  let pieceTheme = PIECE_THEMES[themePrefs.piece] || PIECE_THEMES.classic;
  let uiSceneId = themePrefs.ui === 'light' ? 'light' : 'dark';
  /** @type {string|null} player id to pulse during training; others dim */
  let coachFocusPlayer = null;

  const seatRoot = container.querySelector('#board-seats');
  const seatEls = seatRoot
    ? Object.fromEntries(
        [...seatRoot.querySelectorAll('.board-seat[data-seat]')].map((el) => [el.dataset.seat, el])
      )
    : {};
  const _seatNdc = new THREE.Vector3();

  function projectSeatOverlays() {
    if (!seatRoot) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const w = rect.width || 1;
    const h = rect.height || 1;

    for (const [player, el] of Object.entries(seatEls)) {
      const world = SEAT_WORLD[player];
      if (!world) continue;
      _seatNdc.copy(world).project(camera);
      const behind = _seatNdc.z > 1;
      const sx = (_seatNdc.x * 0.5 + 0.5) * w;
      const sy = (-_seatNdc.y * 0.5 + 0.5) * h;
      const margin = 28;
      const onScreen =
        !behind && sx > -margin && sx < w + margin && sy > -margin && sy < h + margin;
      el.style.left = `${sx}px`;
      el.style.top = `${sy}px`;
      el.classList.toggle('is-visible', onScreen);
    }
  }

  const ambient = new THREE.AmbientLight(0xb0b8d0, 0.55);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xfff2e0, 1.05);
  key.position.set(5, 12, 4);
  key.castShadow = true;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x88aaff, 0.35);
  fill.position.set(-6, 6, -4);
  scene.add(fill);
  const hemi = new THREE.HemisphereLight(0x9bb4ff, 0x1a1410, 0.22);
  scene.add(hemi);

  function refreshSceneBackdrop() {
    const preset = UI_SCENE[uiSceneId] || UI_SCENE.dark;
    const bg = preset.background != null ? preset.background : boardTheme.bg;
    scene.background = new THREE.Color(bg);
  }

  function applyUiScene(uiId) {
    uiSceneId = UI_SCENE[uiId] ? uiId : 'dark';
    const preset = UI_SCENE[uiSceneId];
    ambient.color.setHex(preset.ambient.color);
    ambient.intensity = preset.ambient.intensity;
    key.color.setHex(preset.key.color);
    key.intensity = preset.key.intensity;
    key.position.set(preset.key.x, preset.key.y, preset.key.z);
    fill.color.setHex(preset.fill.color);
    fill.intensity = preset.fill.intensity;
    fill.position.set(preset.fill.x, preset.fill.y, preset.fill.z);
    hemi.color.setHex(preset.hemi.sky);
    hemi.groundColor.setHex(preset.hemi.ground);
    hemi.intensity = preset.hemi.intensity;
    refreshSceneBackdrop();
  }

  applyUiScene(uiSceneId);

  const rim = new THREE.Mesh(
    new THREE.BoxGeometry(8.6, 0.35, 8.6),
    new THREE.MeshStandardMaterial({
      color: boardTheme.rim,
      roughness: 0.8,
      metalness: boardTheme.metalness,
    })
  );
  rim.position.y = -0.2;
  rim.receiveShadow = true;
  scene.add(rim);

  const tiles = [];
  const tileGroup = new THREE.Group();

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const isLight = (file + rank) % 2 === 1;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(TILE * 0.98, 0.12, TILE * 0.98),
        new THREE.MeshStandardMaterial({
          color: isLight ? boardTheme.light : boardTheme.dark,
          roughness: boardTheme.roughness,
          metalness: boardTheme.metalness,
        })
      );
      const { x, z } = sqToWorld(file, rank);
      mesh.position.set(x, 0, z);
      mesh.receiveShadow = true;
      mesh.userData = {
        kind: 'tile',
        file,
        rank,
        square: coordsToAlgebraic(file, rank),
        isLight,
      };
      tileGroup.add(mesh);
      tiles.push(mesh);
    }
  }
  scene.add(tileGroup);

  const markers = new THREE.Group();
  scene.add(markers);

  const pieces = new Map();
  const pieceRoot = new THREE.Group();
  scene.add(pieceRoot);

  const powerFx = createPowerFx(scene);
  const dice3d = createDice3D(scene);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const tweens = [];

  function tweenTo(obj, target, duration, onDone) {
    tweens.push({
      obj,
      start: obj.position.clone(),
      end: target.clone(),
      t: 0,
      duration: duration ?? 0.38,
      onDone,
    });
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

  function clearMarkers() {
    while (markers.children.length) {
      const c = markers.children.pop();
      c.geometry?.dispose();
      c.material?.dispose();
    }
  }

  function syncFromState(state, { animateMove = null, holdForms = false } = {}) {
    for (const [id, mesh] of [...pieces.entries()]) {
      let found = false;
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          if (state.board[r][f]?.id === id) found = true;
        }
      }
      if (!found) {
        pieceRoot.remove(mesh);
        pieces.delete(id);
      }
    }

    const active =
      state.winner || state.fxLocked || state.pendingPowerSwitch ? null : currentPlayer(state);

    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const cell = state.board[rank][file];
        if (!cell) continue;
        let mesh = pieces.get(cell.id);
        const { x, z } = sqToWorld(file, rank);
        if (!mesh) {
          mesh = createPieceMesh(cell.player, cell.id, pieceTheme);
          pieces.set(cell.id, mesh);
          pieceRoot.add(mesh);
          mesh.position.set(x, 0, z);
        } else if (animateMove && animateMove.pieceId === cell.id) {
          tweenTo(mesh, new THREE.Vector3(x, 0, z), 0.38);
        } else if (!tweens.some((t) => t.obj === mesh)) {
          mesh.position.set(x, 0, z);
        }

        // Active player's pieces morph into their power; everyone else stays a pawn.
        // Moving piece keeps the power used for that move until the tween finishes.
        const isActive = cell.player === active;
        const isMoving = animateMove && animateMove.pieceId === cell.id;
        // Dice mode: morph only after the die lands (pieces stay pawns while rolling)
        const power = state.diceMode
          ? state.diceRolledThisTurn
            ? getActivePower(state, cell.player)
            : 'pawn'
          : getPower(cell.player, state.round);
        let form = 'pawn';
        if (isMoving) form = animateMove.power || power;
        else if (isActive && !holdForms && power && power !== 'pass') form = power;
        if (!mesh.userData.forms?.[form]) form = 'pawn';
        setPieceForm(mesh, form);
      }
    }

    const zone = state.shrinkRings
      ? state.boardZone || {
          minFile: state.boardMargin || 0,
          maxFile: 7 - (state.boardMargin || 0),
          minRank: state.boardMargin || 0,
          maxRank: 7 - (state.boardMargin || 0),
        }
      : null;
    for (const tile of tiles) {
      const { file, rank, isLight, square } = tile.userData;
      const playable =
        !zone ||
        (file >= zone.minFile &&
          file <= zone.maxFile &&
          rank >= zone.minRank &&
          rank <= zone.maxRank);
      const selected = state.selected === square;
      tile.visible = true;
      // Removed rings sink and dim; playable tiles stay normal
      const targetY = playable ? 0 : -0.12;
      if (Math.abs(tile.position.y - targetY) > 0.001) {
        tile.position.y = targetY;
      }
      const base = isLight ? boardTheme.light : boardTheme.dark;
      if (playable) {
        tile.material.color.setHex(base);
        tile.material.opacity = 1;
        tile.material.transparent = false;
        tile.material.emissive = new THREE.Color(selected ? 0x1d4ed8 : 0x000000);
        tile.material.emissiveIntensity = selected ? 0.4 : 0;
      } else {
        tile.material.color.setHex(0x0a0c12);
        tile.material.transparent = true;
        tile.material.opacity = 0.28;
        tile.material.emissive = new THREE.Color(0x000000);
        tile.material.emissiveIntensity = 0;
      }
      tile.material.needsUpdate = true;
    }

    clearMarkers();
    for (const m of state.legalMoves || []) {
      const { x, z } = sqToWorld(m.file, m.rank);
      const geo = new THREE.CircleGeometry(m.capture ? 0.28 : 0.16, 24);
      const matBasic = new THREE.MeshBasicMaterial({
        color: m.capture ? 0xf43f5e : 0x4ade80,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      });
      const disc = new THREE.Mesh(geo, matBasic);
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(x, 0.09, z);
      markers.add(disc);
    }
  }

  function pickSquare(clientX, clientY) {
    // Ignore if this pointer gesture was a drag-rotate
    if (pointerDown) {
      const dx = clientX - pointerDown.x;
      const dy = clientY - pointerDown.y;
      pointerDown = null;
      if (dx * dx + dy * dy > CLICK_PX * CLICK_PX) return null;
    }

    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    const pieceHits = raycaster.intersectObjects([...pieces.values()], true);
    if (pieceHits.length) {
      let obj = pieceHits[0].object;
      while (obj && obj.userData?.kind !== 'piece') obj = obj.parent;
      if (obj) return worldToSq(obj.position.x, obj.position.z);
    }

    const tileHits = raycaster.intersectObjects(tiles, false);
    if (tileHits.length) return tileHits[0].object.userData.square;
    return null;
  }

  function onResize() {
    const w = Math.max(container.clientWidth, 1);
    const h = Math.max(container.clientHeight, 1);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    projectSeatOverlays();
  }

  window.addEventListener('resize', onResize);

  // Observe container size (sidebar layout changes)
  const ro = new ResizeObserver(() => onResize());
  ro.observe(container);

  let last = performance.now();
  let running = true;

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      tw.t += dt / tw.duration;
      const k = Math.min(1, tw.t);
      const e = 1 - Math.pow(1 - k, 3);
      tw.obj.position.lerpVectors(tw.start, tw.end, e);
      // Low arc glide (not a bounce hop)
      tw.obj.position.y = Math.sin(e * Math.PI) * 0.16;
      if (k >= 1) {
        tw.obj.position.copy(tw.end);
        tweens.splice(i, 1);
        tw.onDone?.();
      }
    }

    const coachPulse = 0.45 + Math.sin(now * 0.006) * 0.35;

    for (const mesh of pieces.values()) {
      const focused = coachFocusPlayer && mesh.userData.player === coachFocusPlayer;
      const dimOthers = !!coachFocusPlayer && !focused;

      if (mesh.userData.morphPulse > 0) {
        mesh.userData.morphPulse = Math.max(0, mesh.userData.morphPulse - dt * 2.8);
        const p = mesh.userData.morphPulse;
        // Soft arcane swirl — no bounce
        mesh.rotation.y = (1 - p) * Math.PI * 2 * 0.28;
        if (!tweens.some((t) => t.obj === mesh)) {
          mesh.position.y = Math.sin((1 - p) * Math.PI) * 0.1;
        }
        const glow = mesh.userData.forms?.[mesh.userData.form];
        if (glow) {
          glow.traverse((child) => {
            if (child.isMesh && child.material?.emissive) {
              child.material.emissive.setHex(0x7c3aed);
              child.material.emissiveIntensity = Math.sin(p * Math.PI) * 0.55;
            }
          });
        }
      } else {
        mesh.rotation.y *= 0.85;
        if (Math.abs(mesh.rotation.y) < 0.01) mesh.rotation.y = 0;
        if (!tweens.some((t) => t.obj === mesh)) {
          mesh.position.y = focused ? Math.sin(now * 0.005) * 0.06 : 0;
        }
        const glow = mesh.userData.forms?.[mesh.userData.form];
        if (glow) {
          glow.traverse((child) => {
            if (!child.isMesh || !child.material) return;
            if (child.material.emissive) {
              if (focused) {
                child.material.emissive.setHex(0xfbbf24);
                child.material.emissiveIntensity = coachPulse;
              } else {
                child.material.emissiveIntensity = 0;
              }
            }
            child.material.transparent = dimOthers;
            child.material.opacity = dimOthers ? 0.28 : 1;
            if ('depthWrite' in child.material) child.material.depthWrite = !dimOthers;
          });
        }
      }

      mesh.scale.setScalar(focused ? 1.08 : 1);
    }

    controls.update();
    powerFx.update(dt);
    dice3d.update(dt);
    projectSeatOverlays();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function applyBoardTheme(themeId) {
    boardTheme = BOARD_THEMES[themeId] || BOARD_THEMES.wooden;
    themePrefs = { ...themePrefs, board: boardTheme.id };
    refreshSceneBackdrop();
    rim.material.color.setHex(boardTheme.rim);
    rim.material.metalness = boardTheme.metalness;
    for (const tile of tiles) {
      tile.material.color.setHex(tile.userData.isLight ? boardTheme.light : boardTheme.dark);
      tile.material.roughness = boardTheme.roughness;
      tile.material.metalness = boardTheme.metalness;
    }
  }

  function applyPieceTheme(themeId) {
    pieceTheme = PIECE_THEMES[themeId] || PIECE_THEMES.classic;
    themePrefs = { ...themePrefs, piece: pieceTheme.id };
    // Rebuild all piece meshes with the new kit
    for (const [id, old] of [...pieces.entries()]) {
      const player = old.userData.player;
      const form = old.userData.form;
      const pos = old.position.clone();
      pieceRoot.remove(old);
      const mesh = createPieceMesh(player, id, pieceTheme);
      mesh.position.copy(pos);
      setPieceForm(mesh, form);
      pieces.set(id, mesh);
      pieceRoot.add(mesh);
    }
  }

  function setThemes({ board, piece, ui } = {}) {
    if (ui) applyUiScene(ui);
    if (board) applyBoardTheme(board);
    if (piece) applyPieceTheme(piece);
    return { ...themePrefs, ui: uiSceneId };
  }

  function getThemes() {
    return { ...themePrefs, ui: uiSceneId };
  }

  function resetCameraForPlayerA() {
    camera.position.set(0, 11.5, -9.5);
    controls.target.set(0, 0, 0);
    controls.update();
  }

  /** Short dramatic camera punch (capture / elimination). */
  function nudgeCamera(strength = 1) {
    const s = 0.22 * strength;
    const ox = camera.position.x;
    const oy = camera.position.y;
    const oz = camera.position.z;
    const nx = ox + (Math.random() - 0.5) * s;
    const ny = oy + s * 0.4;
    const nz = oz + (Math.random() - 0.5) * s;
    const start = performance.now();
    const dur = 240;
    function step(now) {
      const t = Math.min(1, (now - start) / dur);
      // Out then ease back
      const punch = Math.sin(t * Math.PI);
      camera.position.set(
        ox + (nx - ox) * punch,
        oy + (ny - oy) * punch,
        oz + (nz - oz) * punch
      );
      controls.update();
      if (t < 1) requestAnimationFrame(step);
      else {
        camera.position.set(ox, oy, oz);
        controls.update();
      }
    }
    requestAnimationFrame(step);
  }

  function setCoachFocus(player) {
    coachFocusPlayer = player || null;
  }

  function playDiceRoll(face) {
    return dice3d.playRoll(face);
  }

  return {
    syncFromState,
    pickSquare,
    waitForTweens,
    powerFx,
    playDiceRoll,
    controls,
    setThemes,
    getThemes,
    setUiTheme: applyUiScene,
    setCoachFocus,
    resetCameraForPlayerA,
    nudgeCamera,
    projectSeatOverlays,
    resize: onResize,
    domElement: renderer.domElement,
    viewMode: '3d',
    dispose() {
      running = false;
      dice3d.hide();
      ro.disconnect();
      controls.dispose();
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    },
  };
}
