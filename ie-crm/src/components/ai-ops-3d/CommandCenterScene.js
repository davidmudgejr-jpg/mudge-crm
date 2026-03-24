/**
 * CommandCenterScene.js
 * Three.js scene setup — room, holotable, orb, rings, particles, bloom, camera, controls, animation loop.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// ─── Color constants ───
export const CYAN = 0x00ffff;
export const BLUE = 0x0066ff;
export const AMBER = 0xff8800;
export const DARK_METAL = 0x0a0a10;
export const MID_METAL = 0x151520;

// ─── Material helpers ───
export function metalMat(color, rough = 0.7) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.9 });
}

export function glowMat(color, _intensity = 2) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
}

export function emissiveMat(color, intensity = 3) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.3,
    metalness: 0.5,
    transparent: true,
    opacity: 0.85,
  });
}

/**
 * Create the full command center scene.
 * @param {HTMLElement} container — DOM element to mount the renderer in
 * @returns {{ scene, camera, renderer, composer, controls, clock, animatables, dispose }}
 */
export function createCommandCenterScene(container) {
  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;

  // ─── Renderer ───
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.8;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // ─── Scene ───
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010208);
  scene.fog = new THREE.FogExp2(0x010208, 0.018);

  // ─── Camera ───
  const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 200);
  camera.position.set(8, 6, 10);
  camera.lookAt(0, 1.5, 0);

  // ─── Controls ───
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.5, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 2;
  controls.maxDistance = 35;
  controls.maxPolarAngle = Math.PI * 0.85;
  controls.update();

  // ─── Postprocessing ───
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    1.8,
    0.6,
    0.15
  );
  composer.addPass(bloomPass);

  // ─── Build the room ───
  buildRoom(scene);
  const holotableAnimatables = buildHolotable(scene);
  const orbAnimatables = buildOrb(scene);
  const ringAnimatables = buildRings(scene);
  const particleAnimatables = buildParticles(scene);
  buildLighting(scene);
  buildProjector(scene);

  // ─── Clock ───
  const clock = new THREE.Clock();

  // ─── Bundle animatable refs ───
  const animatables = {
    ...holotableAnimatables,
    ...orbAnimatables,
    rings: ringAnimatables,
    ...particleAnimatables,
    bloomPass,
  };

  // ─── Resize handler ───
  function onResize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  // ─── Animation tick ───
  let animFrameId = null;
  /** External tick consumers (AgentFigures, WallDisplays) register here */
  const tickCallbacks = [];

  function animate() {
    animFrameId = requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    // Orb pulse
    const pulse = 1 + Math.sin(t * 2) * 0.15;
    animatables.orb.scale.setScalar(pulse);
    animatables.orbWire.rotation.y = t * 0.3;
    animatables.orbWire.rotation.x = t * 0.2;
    animatables.innerGlow.scale.setScalar(0.8 + Math.sin(t * 3) * 0.2);
    animatables.orbMat.emissiveIntensity = 3 + Math.sin(t * 2.5) * 1.5;
    animatables.orbLight.intensity = 12 + Math.sin(t * 2) * 5;

    // Beam flicker
    animatables.beamMat.opacity = 0.1 + Math.sin(t * 4) * 0.05 + Math.random() * 0.02;

    // Rings + data nodes
    animatables.rings.forEach((ring, i) => {
      if (ring.userData.speed !== undefined && ring.geometry?.type === 'TorusGeometry') {
        ring.rotation.y += ring.userData.speed * 0.01;
      } else if (ring.userData.angle !== undefined) {
        ring.userData.angle += ring.userData.speed * 0.01;
        ring.position.x = Math.cos(ring.userData.angle) * ring.userData.radius;
        ring.position.z = Math.sin(ring.userData.angle) * ring.userData.radius;
        ring.position.y = ring.userData.yOff + Math.sin(t * 2 + i) * 0.1;
      }
    });

    // Particles
    const pos = animatables.particles.geometry.attributes.position.array;
    const vels = animatables.particleVelocities;
    const pCount = vels.length;
    for (let i = 0; i < pCount; i++) {
      pos[i * 3] += vels[i].x;
      pos[i * 3 + 1] += vels[i].y;
      pos[i * 3 + 2] += vels[i].z;
      if (Math.abs(pos[i * 3]) > 10) pos[i * 3] *= -0.9;
      if (pos[i * 3 + 1] > 7) pos[i * 3 + 1] = 0.1;
      if (pos[i * 3 + 1] < 0) pos[i * 3 + 1] = 6.9;
      if (Math.abs(pos[i * 3 + 2]) > 10) pos[i * 3 + 2] *= -0.9;
    }
    animatables.particles.geometry.attributes.position.needsUpdate = true;

    // Bloom pulse
    animatables.bloomPass.strength = 1.6 + Math.sin(t * 0.5) * 0.2;

    // External tick consumers
    for (const cb of tickCallbacks) cb(t);

    controls.update();
    composer.render();
  }

  animate();

  // ─── Dispose / cleanup ───
  function dispose() {
    window.removeEventListener('resize', onResize);
    if (animFrameId != null) cancelAnimationFrame(animFrameId);
    controls.dispose();
    renderer.dispose();
    composer.dispose();
    if (renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
  }

  return { scene, camera, renderer, composer, controls, clock, animatables, tickCallbacks, dispose };
}

// ══════════════════════════════════════════════════════
// Room builder helpers
// ══════════════════════════════════════════════════════

function buildRoom(scene) {
  // Floor
  const floorGeo = new THREE.PlaneGeometry(30, 30);
  const floorCanvas = document.createElement('canvas');
  floorCanvas.width = 512;
  floorCanvas.height = 512;
  const fctx = floorCanvas.getContext('2d');
  fctx.fillStyle = '#08080f';
  fctx.fillRect(0, 0, 512, 512);
  fctx.strokeStyle = '#0a1520';
  fctx.lineWidth = 1;
  for (let i = 0; i <= 512; i += 32) {
    fctx.beginPath(); fctx.moveTo(i, 0); fctx.lineTo(i, 512); fctx.stroke();
    fctx.beginPath(); fctx.moveTo(0, i); fctx.lineTo(512, i); fctx.stroke();
  }
  fctx.strokeStyle = 'rgba(0, 255, 255, 0.07)';
  fctx.lineWidth = 2;
  for (let i = 0; i <= 512; i += 64) {
    fctx.beginPath(); fctx.moveTo(i, 0); fctx.lineTo(i, 512); fctx.stroke();
    fctx.beginPath(); fctx.moveTo(0, i); fctx.lineTo(512, i); fctx.stroke();
  }
  const floorTex = new THREE.CanvasTexture(floorCanvas);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(4, 4);
  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTex, roughness: 0.8, metalness: 0.6, color: 0x0a0a12,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Ceiling
  const ceilingMat = new THREE.MeshStandardMaterial({
    color: 0x050510, roughness: 0.9, metalness: 0.9,
    transparent: true, opacity: 0.15, side: THREE.DoubleSide,
  });
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), ceilingMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 7;
  scene.add(ceiling);

  // Walls — octagonal
  const wallCount = 8;
  const wallRadius = 12;
  const wallHeight = 7;
  const wallWidth = wallRadius * 2 * Math.tan(Math.PI / wallCount);
  for (let i = 0; i < wallCount; i++) {
    const angle = (i / wallCount) * Math.PI * 2;
    const wallGeo = new THREE.BoxGeometry(wallWidth, wallHeight, 0.3);

    const wCanvas = document.createElement('canvas');
    wCanvas.width = 512; wCanvas.height = 512;
    const wctx = wCanvas.getContext('2d');
    wctx.fillStyle = '#0c0c14';
    wctx.fillRect(0, 0, 512, 512);
    wctx.strokeStyle = '#161622';
    wctx.lineWidth = 2;
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 4; c++) {
        const px = c * 128 + 8;
        const py = r * 85 + 8;
        wctx.strokeRect(px, py, 112, 70);
        if (Math.random() > 0.5) { wctx.fillStyle = '#0e0e18'; wctx.fillRect(px + 10, py + 10, 30, 8); }
        if (Math.random() > 0.7) { wctx.fillStyle = '#12121e'; wctx.fillRect(px + 60, py + 20, 40, 40); }
      }
    }
    for (let j = 0; j < 5; j++) {
      wctx.fillStyle = Math.random() > 0.5 ? 'rgba(0,255,255,0.15)' : 'rgba(255,136,0,0.12)';
      wctx.fillRect(Math.random() * 500, Math.random() * 500, 4, 4);
    }
    const wallTex = new THREE.CanvasTexture(wCanvas);
    const wMat = new THREE.MeshStandardMaterial({
      map: wallTex, roughness: 0.85, metalness: 0.7, color: 0x0c0c14,
      side: THREE.DoubleSide, transparent: true, opacity: 0.15,
    });

    const wall = new THREE.Mesh(wallGeo, wMat);
    wall.position.set(Math.sin(angle) * wallRadius, wallHeight / 2, Math.cos(angle) * wallRadius);
    wall.rotation.y = angle;
    wall.receiveShadow = true;
    scene.add(wall);

    // Trims
    const trimGeo = new THREE.BoxGeometry(wallWidth * 0.8, 0.02, 0.05);
    const trimMat = emissiveMat(CYAN, 1);
    trimMat.side = THREE.DoubleSide;
    const trim = new THREE.Mesh(trimGeo, trimMat);
    trim.position.set(Math.sin(angle) * (wallRadius - 0.2), 0.1, Math.cos(angle) * (wallRadius - 0.2));
    trim.rotation.y = angle;
    scene.add(trim);

    const trimU = trim.clone();
    trimU.position.y = wallHeight - 0.3;
    scene.add(trimU);
  }
}

function buildHolotable(scene) {
  const tableGroup = new THREE.Group();
  scene.add(tableGroup);

  const baseMat = metalMat(0x0e0e1a, 0.6);
  const base1 = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.8, 0.3, 32), baseMat);
  base1.position.y = 0.15;
  base1.receiveShadow = true;
  tableGroup.add(base1);

  const base2 = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 3.0, 0.2, 32), metalMat(0x101020, 0.5));
  base2.position.y = 0.4;
  tableGroup.add(base2);

  const tableRingGeo = new THREE.TorusGeometry(2.2, 0.15, 8, 48);
  const tableRing = new THREE.Mesh(tableRingGeo, emissiveMat(CYAN, 1.5));
  tableRing.rotation.x = Math.PI / 2;
  tableRing.position.y = 0.55;
  tableGroup.add(tableRing);

  const tableSurface = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 0.05, 32),
    new THREE.MeshStandardMaterial({
      color: 0x050515, roughness: 0.3, metalness: 0.8,
      emissive: CYAN, emissiveIntensity: 0.1, transparent: true, opacity: 0.7,
    })
  );
  tableSurface.position.y = 0.52;
  tableGroup.add(tableSurface);

  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const lineGeo = new THREE.BoxGeometry(0.02, 0.01, 1.8);
    const line = new THREE.Mesh(lineGeo, emissiveMat(CYAN, 0.8));
    line.position.set(Math.sin(a) * 1.1, 0.56, Math.cos(a) * 1.1);
    line.rotation.y = a;
    tableGroup.add(line);
  }

  for (const r of [0.6, 1.0, 1.5]) {
    const cRing = new THREE.Mesh(new THREE.TorusGeometry(r, 0.01, 4, 48), emissiveMat(CYAN, 0.6));
    cRing.rotation.x = Math.PI / 2;
    cRing.position.y = 0.56;
    tableGroup.add(cRing);
  }

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.8, 0.15), metalMat(MID_METAL, 0.5));
    pylon.position.set(Math.sin(a) * 2.5, 0.7, Math.cos(a) * 2.5);
    tableGroup.add(pylon);

    const pLight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.06), emissiveMat(CYAN, 2));
    pLight.position.set(Math.sin(a) * 2.5, 1.0, Math.cos(a) * 2.5);
    tableGroup.add(pLight);
  }

  return {};
}

function buildOrb(scene) {
  const orbGroup = new THREE.Group();
  orbGroup.position.y = 2.5;
  scene.add(orbGroup);

  const orbGeo = new THREE.IcosahedronGeometry(0.5, 3);
  const orbMat = new THREE.MeshStandardMaterial({
    color: CYAN, emissive: CYAN, emissiveIntensity: 4,
    transparent: true, opacity: 0.6, wireframe: false,
  });
  const orb = new THREE.Mesh(orbGeo, orbMat);
  orbGroup.add(orb);

  const orbWire = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.55, 2),
    new THREE.MeshBasicMaterial({ color: CYAN, wireframe: true, transparent: true, opacity: 0.4 })
  );
  orbGroup.add(orbWire);

  const innerGlow = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 })
  );
  orbGroup.add(innerGlow);

  const orbLight = new THREE.PointLight(CYAN, 15, 15, 2);
  orbLight.position.copy(orbGroup.position);
  scene.add(orbLight);

  // Vertical beam
  const beamGeo = new THREE.CylinderGeometry(0.08, 0.3, 2, 8, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({
    color: CYAN, transparent: true, opacity: 0.15, side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.y = 1.5;
  scene.add(beam);

  return { orb, orbWire, innerGlow, orbMat, orbLight, beamMat };
}

function buildRings(scene) {
  const rings = [];
  const ringConfigs = [
    { radius: 0.9, tube: 0.015, tiltX: 0.3, tiltZ: 0.1, speed: 0.7, color: CYAN },
    { radius: 1.1, tube: 0.012, tiltX: -0.5, tiltZ: 0.4, speed: -0.5, color: BLUE },
    { radius: 1.35, tube: 0.018, tiltX: 0.8, tiltZ: -0.3, speed: 0.3, color: CYAN },
    { radius: 0.7, tube: 0.01, tiltX: -0.2, tiltZ: 0.7, speed: -0.9, color: 0x00aaff },
    { radius: 1.6, tube: 0.008, tiltX: 0.1, tiltZ: -0.6, speed: 0.2, color: BLUE },
  ];
  ringConfigs.forEach((cfg) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(cfg.radius, cfg.tube, 8, 64),
      emissiveMat(cfg.color, 3)
    );
    ring.rotation.x = cfg.tiltX;
    ring.rotation.z = cfg.tiltZ;
    ring.position.y = 2.5;
    ring.userData = { speed: cfg.speed, baseRotX: cfg.tiltX, baseRotZ: cfg.tiltZ };
    scene.add(ring);
    rings.push(ring);
  });

  // Orbiting data nodes
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 0.7 + Math.random() * 0.9;
    const node = new THREE.Mesh(new THREE.OctahedronGeometry(0.04, 0), emissiveMat(CYAN, 4));
    node.position.set(Math.cos(a) * r, 2.5 + (Math.random() - 0.5) * 0.5, Math.sin(a) * r);
    node.userData = { angle: a, radius: r, speed: 0.3 + Math.random() * 0.5, yOff: node.position.y };
    scene.add(node);
    rings.push(node);
  }

  return rings;
}

function buildParticles(scene) {
  const particleCount = 600;
  const particleGeo = new THREE.BufferGeometry();
  const particlePositions = new Float32Array(particleCount * 3);
  const particleSizes = new Float32Array(particleCount);
  const particleVelocities = [];

  for (let i = 0; i < particleCount; i++) {
    particlePositions[i * 3] = (Math.random() - 0.5) * 20;
    particlePositions[i * 3 + 1] = Math.random() * 7;
    particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 20;
    particleSizes[i] = Math.random() * 3 + 0.5;
    particleVelocities.push({
      x: (Math.random() - 0.5) * 0.003,
      y: (Math.random() - 0.5) * 0.002,
      z: (Math.random() - 0.5) * 0.003,
    });
  }
  particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  particleGeo.setAttribute('size', new THREE.BufferAttribute(particleSizes, 1));

  const particleMat = new THREE.PointsMaterial({
    color: CYAN, size: 0.03, transparent: true, opacity: 0.4,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const particles = new THREE.Points(particleGeo, particleMat);
  scene.add(particles);

  return { particles, particleVelocities };
}

function buildLighting(scene) {
  const ambient = new THREE.AmbientLight(0x040410, 0.5);
  scene.add(ambient);

  const spotPositions = [[4, 6.8, 4], [-4, 6.8, -4], [4, 6.8, -4], [-4, 6.8, 4]];
  spotPositions.forEach((pos) => {
    const spot = new THREE.PointLight(AMBER, 2, 12, 2);
    spot.position.set(...pos);
    scene.add(spot);

    const fixture = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.2, 0.1, 6),
      emissiveMat(AMBER, 1)
    );
    fixture.position.set(...pos);
    scene.add(fixture);
  });

  const centerLight = new THREE.SpotLight(CYAN, 8, 15, Math.PI / 6, 0.5, 2);
  centerLight.position.set(0, 6.9, 0);
  centerLight.target.position.set(0, 0, 0);
  scene.add(centerLight);
  scene.add(centerLight.target);

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const fLight = new THREE.PointLight(CYAN, 0.5, 4, 2);
    fLight.position.set(Math.sin(a) * 3.5, 0.1, Math.cos(a) * 3.5);
    scene.add(fLight);
  }
}

function buildProjector(scene) {
  const MID_METAL_LOCAL = 0x151520;
  const projectorMat = new THREE.MeshStandardMaterial({
    color: MID_METAL_LOCAL, roughness: 0.4, metalness: 0.9,
    transparent: true, opacity: 0.3, side: THREE.DoubleSide,
  });
  const projector = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 0.3, 8), projectorMat);
  projector.position.set(0, 6.85, 0);
  scene.add(projector);

  const projRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.6, 0.03, 4, 16),
    emissiveMat(CYAN, 2)
  );
  projRing.rotation.x = Math.PI / 2;
  projRing.position.set(0, 6.7, 0);
  scene.add(projRing);
}
