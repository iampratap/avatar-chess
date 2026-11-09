import * as THREE from 'three';

function makeRuneTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);

  // Soft mystical glow core
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
  g.addColorStop(0, 'rgba(220, 240, 255, 1)');
  g.addColorStop(0.25, 'rgba(167, 139, 250, 0.95)');
  g.addColorStop(0.55, 'rgba(56, 189, 248, 0.45)');
  g.addColorStop(1, 'rgba(56, 189, 248, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  // Tiny star / rune cross
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(32, 14);
  ctx.lineTo(32, 50);
  ctx.moveTo(14, 32);
  ctx.lineTo(50, 32);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(20, 20);
  ctx.lineTo(44, 44);
  ctx.moveTo(44, 20);
  ctx.lineTo(20, 44);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function makeRingTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);

  const cx = 128;
  const cy = 128;
  ctx.strokeStyle = 'rgba(196, 181, 253, 0.95)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(cx, cy, 100, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(125, 211, 252, 0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 78, 0, Math.PI * 2);
  ctx.stroke();

  // Runic ticks
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const x1 = cx + Math.cos(a) * 88;
    const y1 = cy + Math.sin(a) * 88;
    const x2 = cx + Math.cos(a) * 108;
    const y2 = cy + Math.sin(a) * 108;
    ctx.strokeStyle = 'rgba(253, 230, 138, 0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Wizard / arcane power-switch FX: rune spiral, magic circle, beam — no bounce.
 */
export function createPowerFx(scene) {
  const COUNT = 160;
  const positions = new Float32Array(COUNT * 3);
  const colors = new Float32Array(COUNT * 3);
  const seeds = [];

  for (let i = 0; i < COUNT; i++) {
    positions[i * 3 + 1] = -20;
    seeds.push({
      angle0: Math.random() * Math.PI * 2,
      radius0: 0.4 + Math.random() * 2.8,
      spin: 1.2 + Math.random() * 2.2,
      rise: 1.2 + Math.random() * 2.4,
      phase: Math.random(),
    });
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.42,
    map: makeRuneTexture(),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    opacity: 1,
  });

  const points = new THREE.Points(geometry, material);
  points.visible = false;
  scene.add(points);

  // Magic circle on the board
  const ringMat = new THREE.MeshBasicMaterial({
    map: makeRingTexture(),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 7.2), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.12;
  ring.visible = false;
  scene.add(ring);

  // Vertical arcane column
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xa78bfa,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.55, 6, 16, 1, true), beamMat);
  beam.position.y = 3;
  beam.visible = false;
  scene.add(beam);

  // Soft ambient veil
  const veilMat = new THREE.MeshBasicMaterial({
    color: 0x1e1b4b,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const veil = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), veilMat);
  veil.rotation.x = -Math.PI / 2;
  veil.position.y = 2.4;
  scene.add(veil);

  let active = false;
  let elapsed = 0;
  let duration = 0.95;
  let resolveDone = null;
  let palette = [0xc4b5fd, 0x7dd3fc, 0xfde68a, 0xe9d5ff, 0xffffff];

  function armParticles() {
    for (let i = 0; i < COUNT; i++) {
      const c = new THREE.Color(palette[i % palette.length]);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
      const s = seeds[i];
      positions[i * 3] = Math.cos(s.angle0) * s.radius0;
      positions[i * 3 + 1] = 0.2 + s.phase * 0.3;
      positions[i * 3 + 2] = Math.sin(s.angle0) * s.radius0;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    points.visible = true;
    ring.visible = true;
    beam.visible = true;
  }

  return {
    get active() {
      return active;
    },
    play(options = {}) {
      if (active && resolveDone) resolveDone();
      duration = options.duration ?? 0.95;
      palette = options.palette || [0xc4b5fd, 0x7dd3fc, 0xfde68a, 0xe9d5ff, 0xffffff];
      elapsed = 0;
      active = true;
      armParticles();
      return new Promise((resolve) => {
        resolveDone = resolve;
      });
    },
    playShort() {
      return this.play({
        duration: 0.42,
        palette: [0xa78bfa, 0x7dd3fc, 0xffffff],
      });
    },
    update(dt) {
      if (!active) {
        veilMat.opacity = Math.max(0, veilMat.opacity - dt * 1.8);
        ringMat.opacity = Math.max(0, ringMat.opacity - dt * 2);
        beamMat.opacity = Math.max(0, beamMat.opacity - dt * 2);
        if (ringMat.opacity <= 0) ring.visible = false;
        if (beamMat.opacity <= 0) beam.visible = false;
        return;
      }

      elapsed += dt;
      const t = Math.min(1, elapsed / duration);
      // Ease in-out for mystical feel
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      veilMat.opacity = Math.sin(Math.PI * t) * 0.28;
      ringMat.opacity = Math.sin(Math.PI * Math.min(1, t * 1.15)) * 0.85;
      beamMat.opacity = Math.sin(Math.PI * t) * 0.35;

      ring.rotation.z = elapsed * 0.9;
      ring.scale.setScalar(0.85 + ease * 0.35);
      beam.rotation.y = elapsed * 1.4;
      beam.scale.y = 0.7 + ease * 0.5;

      for (let i = 0; i < COUNT; i++) {
        const s = seeds[i];
        const life = (t + s.phase * 0.25) % 1.05;
        const spiral = s.angle0 + life * s.spin * Math.PI * 2;
        const radius = s.radius0 * (1 - life * 0.55) + Math.sin(life * Math.PI) * 0.35;
        const y = 0.15 + life * s.rise * 2.8;

        positions[i * 3] = Math.cos(spiral) * radius;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = Math.sin(spiral) * radius;
      }
      geometry.attributes.position.needsUpdate = true;
      material.opacity = Math.sin(Math.PI * Math.min(1, t * 1.05)) * 0.95;
      material.size = 0.28 + Math.sin(Math.PI * t) * 0.22;

      if (elapsed >= duration) {
        active = false;
        points.visible = false;
        material.opacity = 1;
        const done = resolveDone;
        resolveDone = null;
        done?.();
      }
    },
  };
}
