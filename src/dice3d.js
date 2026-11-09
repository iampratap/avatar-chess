import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** d6 faces: 1 pawn … 6 pass — painted on cube sides. */
const FACE_GLYPH = {
  1: '♟',
  2: '♘',
  3: '♗',
  4: '♖',
  5: '♕',
  6: '⊘',
};

const FACE_TINT = {
  1: '#94a3b8',
  2: '#7dd3fc',
  3: '#86efac',
  4: '#fde68a',
  5: '#f9a8d4',
  6: '#fda4af',
};

/**
 * Box material order: +X, -X, +Y, -Y, +Z, -Z
 * Opposite faces sum to 7.
 */
const FACE_ON_SIDE = {
  0: 3, // +X
  1: 4, // -X
  2: 1, // +Y
  3: 6, // -Y
  4: 2, // +Z
  5: 5, // -Z
};

/** Local outward normals matching FACE_ON_SIDE indices. */
const SIDE_NORMALS = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
];

const DIE_SIZE = 0.95;
const HALF = DIE_SIZE / 2;
const FLOOR_Y = 0.06 + HALF;
const BOARD_LIMIT = 3.15;
const GRAVITY = -28;
const RESTITUTION = 0.58;
const FRICTION = 0.82;
const SPIN_DAMP_AIR = 0.995;
const SPIN_DAMP_BOUNCE = 0.62;
const SETTLE_SPEED = 0.55;

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function makeFaceTexture(value) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);

  // Rounded sticker so it sits cleanly on a filleted die
  const pad = 18;
  const rad = 48;
  roundRectPath(ctx, pad, pad, size - pad * 2, size - pad * 2, rad);
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, '#f8fafc');
  g.addColorStop(1, '#e2e8f0');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.16)';
  ctx.lineWidth = 10;
  ctx.stroke();

  // Small pip number tucked in the top-left corner
  ctx.fillStyle = FACE_TINT[value] || '#0f172a';
  ctx.font = 'bold 42px Georgia, serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(String(value), pad + 14, pad + 12);

  // Power icon dominates the face
  ctx.fillStyle = '#0f172a';
  ctx.font = '138px "Segoe UI Symbol", "Apple Symbols", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(FACE_GLYPH[value] || '', size / 2, size / 2 + 10);

  const tex = new THREE.CanvasTexture(canvas);
  if ('colorSpace' in tex && THREE.SRGBColorSpace) {
    tex.colorSpace = THREE.SRGBColorSpace;
  } else if ('encoding' in tex && THREE.sRGBEncoding) {
    tex.encoding = THREE.sRGBEncoding;
  }
  tex.anisotropy = 4;
  return tex;
}

/** Ivory rounded body + face stickers (RoundedBox has no per-face materials). */
function createRoundedDieMesh() {
  const die = new THREE.Group();

  const body = new THREE.Mesh(
    new RoundedBoxGeometry(DIE_SIZE, DIE_SIZE, DIE_SIZE, 5, 0.16),
    new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      roughness: 0.42,
      metalness: 0.06,
    })
  );
  body.castShadow = true;
  die.add(body);

  const sticker = DIE_SIZE * 0.7;
  const lift = HALF + 0.004;
  const faces = [
    { value: 3, pos: [lift, 0, 0], rot: [0, Math.PI / 2, 0] },
    { value: 4, pos: [-lift, 0, 0], rot: [0, -Math.PI / 2, 0] },
    { value: 1, pos: [0, lift, 0], rot: [-Math.PI / 2, 0, 0] },
    { value: 6, pos: [0, -lift, 0], rot: [Math.PI / 2, 0, 0] },
    { value: 2, pos: [0, 0, lift], rot: [0, 0, 0] },
    { value: 5, pos: [0, 0, -lift], rot: [0, Math.PI, 0] },
  ];

  for (const f of faces) {
    const mat = new THREE.MeshStandardMaterial({
      map: makeFaceTexture(f.value),
      roughness: 0.5,
      metalness: 0.04,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(sticker, sticker), mat);
    plane.position.set(f.pos[0], f.pos[1], f.pos[2]);
    plane.rotation.set(f.rot[0], f.rot[1], f.rot[2]);
    die.add(plane);
  }

  return die;
}

/** Quaternion that puts the given pip face on world +Y (top). */
function quatForFaceUp(face) {
  const e = new THREE.Euler(0, 0, 0, 'XYZ');
  switch (face) {
    case 1:
      break;
    case 6:
      e.set(Math.PI, 0, 0);
      break;
    case 2:
      e.set(-Math.PI / 2, 0, 0);
      break;
    case 5:
      e.set(Math.PI / 2, 0, 0);
      break;
    case 3:
      e.set(0, 0, Math.PI / 2);
      break;
    case 4:
      e.set(0, 0, -Math.PI / 2);
      break;
    default:
      break;
  }
  return new THREE.Quaternion().setFromEuler(e);
}

/**
 * Which pip is pointing most upward given current orientation.
 * This is the actual random outcome of the physical tumble.
 */
function readFaceUp(quaternion) {
  const up = new THREE.Vector3(0, 1, 0);
  const n = new THREE.Vector3();
  let best = 1;
  let bestDot = -Infinity;
  for (let i = 0; i < 6; i++) {
    n.copy(SIDE_NORMALS[i]).applyQuaternion(quaternion);
    const d = n.dot(up);
    if (d > bestDot) {
      bestDot = d;
      best = FACE_ON_SIDE[i];
    }
  }
  return best;
}

/**
 * Align so the currently-upward face sits flat on +Y, preserving yaw
 * (natural “square up on the board” without teleporting to a pre-picked result).
 */
function quatAlignCurrentFaceUp(quaternion) {
  const face = readFaceUp(quaternion);
  const target = quatForFaceUp(face);
  // Match yaw of current orientation so the settle feels continuous
  const curEuler = new THREE.Euler().setFromQuaternion(quaternion, 'YXZ');
  const tgtEuler = new THREE.Euler().setFromQuaternion(target, 'YXZ');
  tgtEuler.y = curEuler.y;
  return { face, quat: new THREE.Quaternion().setFromEuler(tgtEuler) };
}

function randSign() {
  return Math.random() < 0.5 ? -1 : 1;
}

/**
 * Physics-driven d6: gravity + bounces decide the face; game reads the result after.
 */
export function createDice3D(scene) {
  const root = new THREE.Group();
  root.visible = false;
  scene.add(root);

  const mesh = createRoundedDieMesh();
  root.add(mesh);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.62, 24),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.05;
  root.add(shadow);

  const _omegaQ = new THREE.Quaternion();
  const _axis = new THREE.Vector3();
  let anim = null;

  function finish() {
    if (!anim) return;
    const done = anim.resolve;
    const face = anim.landedFace || readFaceUp(mesh.quaternion);
    mesh.quaternion.copy(anim.endQuat || quatForFaceUp(face));
    mesh.position.y = FLOOR_Y;
    mesh.position.x = THREE.MathUtils.clamp(mesh.position.x, -BOARD_LIMIT, BOARD_LIMIT);
    mesh.position.z = THREE.MathUtils.clamp(mesh.position.z, -BOARD_LIMIT, BOARD_LIMIT);
    shadow.position.x = mesh.position.x;
    shadow.position.z = mesh.position.z;
    shadow.material.opacity = 0.32;
    shadow.scale.setScalar(1);
    anim = null;
    setTimeout(() => {
      root.visible = false;
      done?.(face);
    }, 520);
  }

  function beginSettle() {
    const aligned = quatAlignCurrentFaceUp(mesh.quaternion);
    anim.phase = 'settle';
    anim.landedFace = aligned.face;
    anim.endQuat = aligned.quat;
    anim.settleFrom = mesh.quaternion.clone();
    anim.settleT = 0;
    anim.vx *= 0.25;
    anim.vz *= 0.25;
    anim.vy = 0;
    anim.wx = anim.wy = anim.wz = 0;
    mesh.position.y = FLOOR_Y;
  }

  function update(dt) {
    if (!anim) return;
    const step = Math.min(0.033, Math.max(0.001, dt));
    anim.t += step;

    if (anim.phase === 'physics') {
      anim.vy += GRAVITY * step;

      mesh.position.x += anim.vx * step;
      mesh.position.y += anim.vy * step;
      mesh.position.z += anim.vz * step;

      const spinLen = Math.hypot(anim.wx, anim.wy, anim.wz);
      if (spinLen > 1e-4) {
        _axis.set(anim.wx, anim.wy, anim.wz).multiplyScalar(1 / spinLen);
        _omegaQ.setFromAxisAngle(_axis, spinLen * step);
        mesh.quaternion.premultiply(_omegaQ);
        mesh.quaternion.normalize();
      }
      anim.wx *= SPIN_DAMP_AIR;
      anim.wy *= SPIN_DAMP_AIR;
      anim.wz *= SPIN_DAMP_AIR;

      if (Math.abs(mesh.position.x) > BOARD_LIMIT) {
        mesh.position.x = Math.sign(mesh.position.x) * BOARD_LIMIT;
        anim.vx *= -RESTITUTION * 0.85;
        anim.wx *= SPIN_DAMP_BOUNCE;
        anim.wz += -Math.sign(mesh.position.x) * Math.abs(anim.vx) * 0.4;
        anim.bounces += 0.25;
      }
      if (Math.abs(mesh.position.z) > BOARD_LIMIT) {
        mesh.position.z = Math.sign(mesh.position.z) * BOARD_LIMIT;
        anim.vz *= -RESTITUTION * 0.85;
        anim.wz *= SPIN_DAMP_BOUNCE;
        anim.wx += Math.sign(mesh.position.z) * Math.abs(anim.vz) * 0.4;
        anim.bounces += 0.25;
      }

      if (mesh.position.y <= FLOOR_Y && anim.vy < 0) {
        mesh.position.y = FLOOR_Y;
        const impact = Math.abs(anim.vy);
        anim.vy = -anim.vy * RESTITUTION;
        anim.vx *= FRICTION;
        anim.vz *= FRICTION;
        anim.wx = (anim.wx + (Math.random() - 0.5) * impact * 1.4) * SPIN_DAMP_BOUNCE;
        anim.wy = (anim.wy + (Math.random() - 0.5) * impact * 0.8) * SPIN_DAMP_BOUNCE;
        anim.wz = (anim.wz + (Math.random() - 0.5) * impact * 1.4) * SPIN_DAMP_BOUNCE;
        anim.bounces += 1;

        if (impact < SETTLE_SPEED && anim.bounces >= 2) {
          beginSettle();
        } else if (anim.vy < 1.1) {
          anim.vy *= 0.5;
        }
      }

      if (anim.t > 3.2 && anim.phase === 'physics') {
        beginSettle();
      }
    } else if (anim.phase === 'settle') {
      anim.settleT += step;
      const dur = 0.34;
      const u = Math.min(1, anim.settleT / dur);
      const e = u * u * (3 - 2 * u);
      mesh.quaternion.slerpQuaternions(anim.settleFrom, anim.endQuat, e);
      mesh.position.y = FLOOR_Y;
      anim.vx *= 0.85;
      anim.vz *= 0.85;
      mesh.position.x += anim.vx * step;
      mesh.position.z += anim.vz * step;
      mesh.position.x = THREE.MathUtils.clamp(mesh.position.x, -BOARD_LIMIT, BOARD_LIMIT);
      mesh.position.z = THREE.MathUtils.clamp(mesh.position.z, -BOARD_LIMIT, BOARD_LIMIT);

      if (u >= 1) {
        finish();
        return;
      }
    }

    const height = Math.max(0, mesh.position.y - FLOOR_Y);
    shadow.position.x = mesh.position.x;
    shadow.position.z = mesh.position.z;
    shadow.material.opacity = THREE.MathUtils.clamp(0.34 - height * 0.08, 0.08, 0.36);
    shadow.scale.setScalar(THREE.MathUtils.clamp(0.55 + height * 0.12, 0.55, 1.35));
  }

  /**
   * Toss the die; resolves with the pip (1–6) that lands face-up.
   * Outcome is NOT chosen ahead of time — physics decides.
   */
  function playRoll() {
    return new Promise((resolve) => {
      if (anim?.resolve) {
        const prev = anim.resolve;
        anim = null;
        prev(readFaceUp(mesh.quaternion));
      }
      root.visible = true;

      const startX = (Math.random() - 0.5) * 2.4;
      const startZ = (Math.random() - 0.5) * 2.4;
      mesh.position.set(startX, 3.4 + Math.random() * 0.6, startZ);
      mesh.quaternion
        .set(Math.random(), Math.random(), Math.random(), Math.random())
        .normalize();

      shadow.position.x = startX;
      shadow.position.z = startZ;
      shadow.scale.setScalar(0.45);
      shadow.material.opacity = 0.08;

      anim = {
        t: 0,
        phase: 'physics',
        bounces: 0,
        landedFace: null,
        endQuat: null,
        settleFrom: null,
        settleT: 0,
        vx: (Math.random() - 0.5) * 3.2,
        vy: -1.5 - Math.random() * 2.5,
        vz: (Math.random() - 0.5) * 3.2,
        wx: (6 + Math.random() * 8) * randSign(),
        wy: (5 + Math.random() * 7) * randSign(),
        wz: (6 + Math.random() * 8) * randSign(),
        resolve,
      };
    });
  }

  function hide() {
    if (anim?.resolve) {
      const prev = anim.resolve;
      const face = readFaceUp(mesh.quaternion);
      anim = null;
      prev(face);
    }
    root.visible = false;
  }

  return {
    playRoll,
    update,
    hide,
    get object() {
      return root;
    },
  };
}
