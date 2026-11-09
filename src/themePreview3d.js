import * as THREE from 'three';
import { BOARD_THEMES, PIECE_THEMES, UI_SCENE } from './themes.js';
import { createPieceMesh } from './board3d.js';

const FORMS = ['pawn', 'rook', 'knight', 'bishop'];
const PLAYERS_SAMPLE = ['A', 'B', 'C', 'D'];

/**
 * Tiny live 3D board + piece-kit preview for the Looks & Models popup.
 */
export function createThemePreview3D(host) {
  if (!host) return null;

  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  host.innerHTML = '';
  host.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 40);
  camera.position.set(3.6, 4.2, 4.8);
  camera.lookAt(0, 0.2, 0);

  const ambient = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xfff5e8, 0.95);
  key.position.set(3, 7, 2);
  key.castShadow = true;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xa8c4ff, 0.35);
  fill.position.set(-4, 3, -2);
  scene.add(fill);
  const hemi = new THREE.HemisphereLight(0xdbeafe, 0x1a1410, 0.3);
  scene.add(hemi);

  const boardRoot = new THREE.Group();
  scene.add(boardRoot);
  const pieceRoot = new THREE.Group();
  scene.add(pieceRoot);

  let boardTheme = BOARD_THEMES.wooden;
  let pieceTheme = PIECE_THEMES.classic;
  let uiId = 'dark';
  let tiles = [];
  let rim = null;
  let spinning = true;
  let running = false;
  let raf = 0;
  let t0 = performance.now();

  function clearGroup(group) {
    while (group.children.length) {
      const child = group.children.pop();
      child.traverse?.((obj) => {
        if (obj.geometry) obj.geometry.dispose?.();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.());
          else obj.material.dispose?.();
        }
      });
      group.remove(child);
    }
  }

  function rebuildBoard() {
    clearGroup(boardRoot);
    tiles = [];
    const size = 4;
    const tile = 0.72;
    const origin = -((size - 1) * tile) / 2;

    rim = new THREE.Mesh(
      new THREE.BoxGeometry(size * tile + 0.35, 0.16, size * tile + 0.35),
      new THREE.MeshStandardMaterial({
        color: boardTheme.rim,
        roughness: 0.8,
        metalness: boardTheme.metalness,
      })
    );
    rim.position.y = -0.1;
    rim.receiveShadow = true;
    boardRoot.add(rim);

    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        const isLight = (x + z) % 2 === 0;
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(tile * 0.96, 0.08, tile * 0.96),
          new THREE.MeshStandardMaterial({
            color: isLight ? boardTheme.light : boardTheme.dark,
            roughness: boardTheme.roughness,
            metalness: boardTheme.metalness,
          })
        );
        mesh.position.set(origin + x * tile, 0, origin + z * tile);
        mesh.receiveShadow = true;
        boardRoot.add(mesh);
        tiles.push(mesh);
      }
    }
  }

  function rebuildPieces() {
    clearGroup(pieceRoot);
    const spot = [
      [-0.9, -0.9],
      [0.9, -0.9],
      [-0.9, 0.9],
      [0.9, 0.9],
    ];
    FORMS.forEach((form, i) => {
      const player = PLAYERS_SAMPLE[i];
      const mesh = createPieceMesh(player, `preview-${form}`, pieceTheme);
      for (const [name, g] of Object.entries(mesh.userData.forms)) {
        g.visible = name === form;
      }
      mesh.userData.form = form;
      mesh.position.set(spot[i][0], 0, spot[i][1]);
      mesh.scale.setScalar(1.15);
      pieceRoot.add(mesh);
    });
  }

  function applyLighting() {
    const preset = UI_SCENE[uiId] || UI_SCENE.dark;
    ambient.color.setHex(preset.ambient.color);
    ambient.intensity = preset.ambient.intensity + 0.15;
    key.color.setHex(preset.key.color);
    key.intensity = preset.key.intensity;
    fill.color.setHex(preset.fill.color);
    fill.intensity = preset.fill.intensity;
    hemi.color.setHex(preset.hemi.sky);
    hemi.groundColor.setHex(preset.hemi.ground);
    hemi.intensity = preset.hemi.intensity;
    const bg = preset.background != null ? preset.background : boardTheme.bg;
    scene.background = new THREE.Color(bg);
  }

  function resize() {
    const w = Math.max(host.clientWidth, 1);
    const h = Math.max(host.clientHeight, 1);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - t0) / 1000);
    t0 = now;
    if (spinning) {
      boardRoot.rotation.y += dt * 0.35;
      pieceRoot.rotation.y = boardRoot.rotation.y;
    }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }

  function setThemes({ ui, board, piece } = {}) {
    if (ui && UI_SCENE[ui]) uiId = ui;

    const nextBoard = board && BOARD_THEMES[board] ? BOARD_THEMES[board] : boardTheme;
    const nextPiece = piece && PIECE_THEMES[piece] ? PIECE_THEMES[piece] : pieceTheme;
    const boardChanged = nextBoard.id !== boardTheme.id || !tiles.length;
    const pieceChanged = nextPiece.id !== pieceTheme.id || !pieceRoot.children.length;

    boardTheme = nextBoard;
    pieceTheme = nextPiece;

    if (boardChanged) rebuildBoard();
    if (pieceChanged) rebuildPieces();
    applyLighting();
    resize();
  }

  // Initial build
  rebuildBoard();
  rebuildPieces();
  applyLighting();
  resize();

  const ro = new ResizeObserver(() => resize());
  ro.observe(host);

  return {
    setThemes,
    start() {
      if (running) return;
      running = true;
      t0 = performance.now();
      raf = requestAnimationFrame(frame);
      resize();
    },
    stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
    resize,
    dispose() {
      this.stop();
      ro.disconnect();
      clearGroup(boardRoot);
      clearGroup(pieceRoot);
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    },
  };
}
