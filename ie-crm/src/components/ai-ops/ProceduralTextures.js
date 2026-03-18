import * as THREE from 'three';

// ---------------------------------------------------------------------------
// ProceduralTextures — Canvas-based textures for walls, floor, and platform
// Generates Perlin-like noise patterns without external image dependencies
// ---------------------------------------------------------------------------

// Simple 2D hash noise (deterministic, fast)
function hash(x, y) {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) & 0xffff) / 0xffff;
}

// Smoothed noise with bilinear interpolation
function smoothNoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n00 = hash(ix, iy);
  const n10 = hash(ix + 1, iy);
  const n01 = hash(ix, iy + 1);
  const n11 = hash(ix + 1, iy + 1);
  return (n00 * (1 - sx) + n10 * sx) * (1 - sy) + (n01 * (1 - sx) + n11 * sx) * sy;
}

// Multi-octave fractal noise
function fbm(x, y, octaves = 4) {
  let value = 0, amplitude = 0.5, frequency = 1;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * smoothNoise(x * frequency, y * frequency);
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value;
}

// Wall texture — dark teal-grey stone with panel lines
export function createWallTexture(size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Base dark teal-grey
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const noise = fbm(x * 0.02, y * 0.02, 5);
      const base = 22 + noise * 18;
      const r = base * 0.75;
      const g = base * 0.85;
      const b = base * 1.1;
      ctx.fillStyle = `rgb(${r|0},${g|0},${b|0})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Horizontal panel lines
  ctx.strokeStyle = 'rgba(0,200,200,0.06)';
  ctx.lineWidth = 1;
  for (let y = 64; y < size; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }

  // Vertical panel lines (less frequent)
  for (let x = 128; x < size; x += 128) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  return tex;
}

// Wall normal map — simulates panel depth
export function createWallNormalMap(size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Flat blue base (neutral normal)
  ctx.fillStyle = '#8080ff';
  ctx.fillRect(0, 0, size, size);

  // Panel groove lines — darker = recessed
  ctx.strokeStyle = 'rgba(100,100,255,0.4)';
  ctx.lineWidth = 2;
  for (let y = 64; y < size; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }
  for (let x = 128; x < size; x += 128) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }

  // Subtle noise variation
  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      const n = (Math.random() - 0.5) * 8;
      ctx.fillStyle = `rgb(${128 + n|0},${128 + n|0},${255})`;
      ctx.fillRect(x, y, 2, 2);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  return tex;
}

// Floor texture — dark polished concrete
export function createFloorTexture(size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const noise = fbm(x * 0.015, y * 0.015, 4);
      const detail = fbm(x * 0.06, y * 0.06, 2) * 0.3;
      const base = 10 + (noise + detail) * 12;
      const r = base * 0.9;
      const g = base * 0.92;
      const b = base * 1.05;
      ctx.fillStyle = `rgb(${r|0},${g|0},${b|0})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

// Platform texture — light grey polished stone
export function createPlatformTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const noise = fbm(x * 0.025, y * 0.025, 3);
      const base = 170 + noise * 30;
      const r = base * 0.97;
      const g = base * 0.98;
      const b = base * 1.0;
      ctx.fillStyle = `rgb(${Math.min(255, r)|0},${Math.min(255, g)|0},${Math.min(255, b)|0})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}
