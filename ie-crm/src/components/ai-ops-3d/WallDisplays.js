/**
 * WallDisplays.js
 * Holographic wall display creation, canvas texture rendering, data update methods.
 */
import * as THREE from 'three';
import { CYAN, BLUE, emissiveMat } from './CommandCenterScene.js';

const MID_METAL = 0x151520;

/** Display config keyed by index */
const DISPLAY_CONFIG = [
  { id: 'agent-status', title: 'AGENT STATUS', color: CYAN },
  { id: 'crm-stats', title: 'CRM STATISTICS', color: BLUE },
  { id: 'pipeline', title: 'PIPELINE QUEUE', color: CYAN },
  { id: 'campaign', title: 'CAMPAIGN ANALYTICS', color: BLUE },
  { id: 'system-health', title: 'SYSTEM HEALTH', color: CYAN },
];

const DISPLAY_ANGLES = [0.4, 1.5, 2.8, 4.2, 5.5];

/**
 * Create 5 holographic wall displays.
 * @param {THREE.Scene} scene
 * @returns {{ displays, displayMeshes, createAnimationTick, updateDisplayData }}
 */
export function createWallDisplays(scene) {
  const displays = [];
  const displayMeshes = []; // for raycasting

  DISPLAY_ANGLES.forEach((angle, idx) => {
    const displayGroup = new THREE.Group();
    const dist = 10;
    displayGroup.position.set(Math.sin(angle) * dist, 3.5, Math.cos(angle) * dist);
    displayGroup.rotation.y = angle;

    // Frame
    const frameMat = new THREE.MeshStandardMaterial({
      color: MID_METAL, roughness: 0.5, metalness: 0.9,
      transparent: true, opacity: 0.3, side: THREE.DoubleSide,
    });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 0.05), frameMat);
    displayGroup.add(frame);

    // Screen canvas texture
    const dCanvas = document.createElement('canvas');
    dCanvas.width = 512;
    dCanvas.height = 256;
    const dctx = dCanvas.getContext('2d');
    const dTex = new THREE.CanvasTexture(dCanvas);

    const screenMat = new THREE.MeshStandardMaterial({
      map: dTex,
      emissive: idx % 2 === 0 ? CYAN : BLUE,
      emissiveIntensity: 1.5,
      emissiveMap: dTex,
      transparent: true,
      opacity: 0.9,
    });
    const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.8), screenMat);
    screenMesh.position.z = 0.03;
    screenMesh.userData.screenId = DISPLAY_CONFIG[idx].id;
    displayGroup.add(screenMesh);
    displayMeshes.push(screenMesh);

    // Border glow
    const border = new THREE.Mesh(
      new THREE.BoxGeometry(3.1, 2.1, 0.02),
      emissiveMat(CYAN, 1.5)
    );
    border.position.z = -0.02;
    displayGroup.add(border);

    scene.add(displayGroup);
    displays.push({
      group: displayGroup,
      canvas: dCanvas,
      ctx: dctx,
      tex: dTex,
      scroll: 0,
      type: idx,
      config: DISPLAY_CONFIG[idx],
      data: null, // will be populated by API fetches
    });
  });

  // Also push frame meshes for raycasting (the frame box)
  // Actually screen meshes are enough for click detection

  /**
   * Get screen ID from a raycasted mesh.
   */
  function getScreenIdFromMesh(mesh) {
    return mesh?.userData?.screenId ?? null;
  }

  /**
   * Update cached data for a display by ID.
   */
  function updateDisplayData(screenId, data) {
    const display = displays.find((d) => d.config.id === screenId);
    if (display) display.data = data;
  }

  /**
   * Create tick callback for animated display rendering.
   */
  function createAnimationTick() {
    return (t) => {
      displays.forEach((d) => renderDisplay(d, t));
    };
  }

  return { displays, displayMeshes, createAnimationTick, updateDisplayData, getScreenIdFromMesh };
}

// ══════════════════════════════════════════════════════
// Display rendering
// ══════════════════════════════════════════════════════

function renderDisplay(d, time) {
  const ctx = d.ctx;
  const w = 512;
  const h = 256;
  ctx.fillStyle = 'rgba(0, 5, 15, 0.92)';
  ctx.fillRect(0, 0, w, h);

  d.scroll += 0.5;
  const isEven = d.type % 2 === 0;
  const color = isEven ? '#00ffff' : '#0088ff';
  const dimColor = isEven ? 'rgba(0,255,255,0.3)' : 'rgba(0,100,255,0.3)';

  // Header bar
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, 2);
  ctx.fillRect(0, h - 2, w, 2);

  // Title
  ctx.font = 'bold 14px Courier New';
  ctx.fillStyle = color;
  ctx.fillText(d.config.title, 15, 18);

  // Separator
  ctx.fillStyle = dimColor;
  ctx.fillRect(15, 24, w - 30, 1);

  // Render real data if available, else fallback
  if (d.data) {
    renderRealData(ctx, d, time, color, dimColor, w, h);
  } else {
    renderFallbackData(ctx, d, time, color, dimColor, w, h);
  }

  // Blinking cursor
  if (Math.sin(time * 4) > 0) {
    ctx.fillStyle = color;
    ctx.fillRect(15, 240, 8, 10);
  }

  // Bar chart on right side
  for (let i = 0; i < 6; i++) {
    const bh = 20 + Math.sin(time * 2 + i) * 15 + Math.random() * 5;
    ctx.fillStyle = dimColor;
    ctx.fillRect(380 + i * 20, h - 30 - bh, 14, bh);
  }

  // Scan line
  const scanY = (time * 40 + d.type * 60) % h;
  ctx.fillStyle = 'rgba(0,255,255,0.08)';
  ctx.fillRect(0, scanY, w, 3);

  d.tex.needsUpdate = true;
}

function renderRealData(ctx, d, time, color, dimColor, w, h) {
  ctx.font = '10px Courier New';
  const data = d.data;
  let lines = [];

  switch (d.config.id) {
    case 'agent-status':
      lines = formatAgentStatus(data);
      break;
    case 'crm-stats':
      lines = formatCrmStats(data);
      break;
    case 'pipeline':
      lines = formatPipeline(data);
      break;
    case 'campaign':
      lines = formatCampaign(data);
      break;
    case 'system-health':
      lines = formatSystemHealth(data);
      break;
    default:
      lines = ['NO DATA'];
  }

  const offset = Math.floor(d.scroll / 14) % Math.max(lines.length, 1);
  for (let i = 0; i < 14; i++) {
    const lineIdx = (i + offset) % lines.length;
    const y = 36 + i * 15 - (d.scroll % 14);
    if (y < 24 || y > h - 20) continue;
    ctx.fillStyle = i < 2 ? color : dimColor;
    ctx.fillText(lines[lineIdx] || '', 15, y);
  }
}

function renderFallbackData(ctx, d, time, color, dimColor, w, h) {
  ctx.font = '10px Courier New';
  const dataLines = [
    'AGENT-01 STATUS: ACTIVE    CPU: 87%  MEM: 4.2GB',
    'AGENT-02 STATUS: ACTIVE    CPU: 62%  MEM: 3.8GB',
    'AGENT-03 STATUS: STANDBY   CPU: 12%  MEM: 1.1GB',
    'AGENT-04 STATUS: ACTIVE    CPU: 91%  MEM: 5.6GB',
    'AGENT-05 STATUS: ACTIVE    CPU: 73%  MEM: 4.0GB',
    'AGENT-06 STATUS: SCANNING  CPU: 45%  MEM: 2.3GB',
    '─────────────────────────────────────────────────',
    'NETWORK: SECURE    UPLINK: 12.4 Gbps    LAT: 2ms',
    'THREATS DETECTED: 0     ANOMALIES: 3 (LOW)',
    'MARKET SCAN: 847 PROPERTIES  |  42 NEW TODAY',
    'CRM SYNC: OK  |  CONTACTS: 9,247  |  +12 TODAY',
    'TPE SCORES RECALCULATED: 2,841 ENTITIES',
    'ENRICHMENT QUEUE: 156 PENDING  |  ETA: 14 MIN',
    '─────────────────────────────────────────────────',
    'LEANNE ASSOC. COMMAND CENTER v3.7.1',
    'HOUSTON AI: ONLINE    MODE: AUTONOMOUS',
    'MEMORY: 48GB ALLOCATED | 31GB ACTIVE',
    'NEXT BRIEFING: 06:00 PST',
  ];

  const offset = Math.floor(d.scroll / 14) % dataLines.length;
  for (let i = 0; i < 14; i++) {
    const lineIdx = (i + offset) % dataLines.length;
    const y = 36 + i * 15 - (d.scroll % 14);
    if (y < 24 || y > h - 20) continue;
    ctx.fillStyle = i < 2 ? color : dimColor;
    ctx.fillText(dataLines[lineIdx], 15, y);
  }
}

// ══════════════════════════════════════════════════════
// Data formatters
// ══════════════════════════════════════════════════════

function formatAgentStatus(data) {
  if (!data) return ['LOADING...'];
  const lines = ['AGENT HEARTBEAT REPORT', '═══════════════════════════════════════════'];
  if (Array.isArray(data)) {
    data.forEach((agent) => {
      const status = agent.status?.toUpperCase() || 'UNKNOWN';
      const name = (agent.name || agent.agentId || 'AGENT').toUpperCase();
      lines.push(`${name.padEnd(18)} STATUS: ${status.padEnd(10)}`);
      if (agent.lastSeen) lines.push(`  LAST SEEN: ${new Date(agent.lastSeen).toLocaleTimeString()}`);
    });
  } else if (data.agents) {
    Object.entries(data.agents).forEach(([id, info]) => {
      const status = (typeof info === 'string' ? info : info?.status || 'UNKNOWN').toUpperCase();
      lines.push(`${id.toUpperCase().padEnd(18)} STATUS: ${status}`);
    });
  } else {
    lines.push(`STATUS: ${JSON.stringify(data).slice(0, 60)}`);
  }
  lines.push('═══════════════════════════════════════════');
  return lines;
}

function formatCrmStats(data) {
  if (!data) return ['LOADING...'];
  const lines = ['CRM DATABASE STATISTICS', '═══════════════════════════════════════════'];
  const fields = [
    ['contacts', 'CONTACTS'],
    ['companies', 'COMPANIES'],
    ['properties', 'PROPERTIES'],
    ['comps', 'COMPS'],
    ['deals', 'DEALS'],
    ['tasks', 'TASKS'],
  ];
  fields.forEach(([key, label]) => {
    if (data[key] !== undefined) {
      const val = typeof data[key] === 'number' ? data[key].toLocaleString() : data[key];
      lines.push(`${label.padEnd(16)} ${String(val).padStart(10)}`);
    }
  });
  // Dump any other keys
  Object.entries(data).forEach(([k, v]) => {
    if (!fields.some(([fk]) => fk === k) && typeof v !== 'object') {
      lines.push(`${k.toUpperCase().padEnd(16)} ${String(v).padStart(10)}`);
    }
  });
  lines.push('═══════════════════════════════════════════');
  return lines;
}

function formatPipeline(data) {
  if (!data) return ['LOADING...'];
  const lines = ['PIPELINE QUEUE — PENDING', '═══════════════════════════════════════════'];
  const items = Array.isArray(data) ? data : data.items || data.queue || [];
  if (items.length === 0) {
    lines.push('NO PENDING ITEMS');
  } else {
    items.slice(0, 12).forEach((item, i) => {
      const type = (item.type || item.action || 'TASK').toUpperCase();
      const status = (item.status || 'PENDING').toUpperCase();
      const target = item.target || item.name || item.id || '';
      lines.push(`${String(i + 1).padStart(2)}. ${type.padEnd(12)} ${status.padEnd(10)} ${target.slice(0, 20)}`);
    });
    if (items.length > 12) lines.push(`  ... +${items.length - 12} more`);
  }
  lines.push('═══════════════════════════════════════════');
  return lines;
}

function formatCampaign(data) {
  if (!data) return ['LOADING...'];
  const lines = ['CAMPAIGN ANALYTICS', '═══════════════════════════════════════════'];
  const fields = [
    ['totalSent', 'EMAILS SENT'],
    ['delivered', 'DELIVERED'],
    ['opened', 'OPENED'],
    ['clicked', 'CLICKED'],
    ['replied', 'REPLIED'],
    ['bounced', 'BOUNCED'],
    ['openRate', 'OPEN RATE'],
    ['clickRate', 'CLICK RATE'],
    ['replyRate', 'REPLY RATE'],
  ];
  fields.forEach(([key, label]) => {
    if (data[key] !== undefined) {
      let val = data[key];
      if (key.endsWith('Rate') && typeof val === 'number') val = (val * 100).toFixed(1) + '%';
      else if (typeof val === 'number') val = val.toLocaleString();
      lines.push(`${label.padEnd(16)} ${String(val).padStart(10)}`);
    }
  });
  if (Array.isArray(data.campaigns)) {
    data.campaigns.slice(0, 5).forEach((c) => {
      lines.push(`  → ${(c.name || c.id || '').slice(0, 30)}  sent:${c.sent || 0}`);
    });
  }
  lines.push('═══════════════════════════════════════════');
  return lines;
}

function formatSystemHealth(data) {
  if (!data) return ['LOADING...'];
  const lines = ['SYSTEM HEALTH', '═══════════════════════════════════════════'];
  if (data.uptime) lines.push(`UPTIME:          ${data.uptime}`);
  if (data.tokensUsed) lines.push(`TOKENS USED:     ${Number(data.tokensUsed).toLocaleString()}`);
  if (data.tokenBudget) lines.push(`TOKEN BUDGET:    ${Number(data.tokenBudget).toLocaleString()}`);
  if (data.cpu) lines.push(`CPU LOAD:        ${data.cpu}`);
  if (data.memory) lines.push(`MEMORY:          ${data.memory}`);
  if (data.version) lines.push(`VERSION:         ${data.version}`);
  if (data.status) lines.push(`STATUS:          ${String(data.status).toUpperCase()}`);
  // Dump extras
  Object.entries(data).forEach(([k, v]) => {
    if (!['uptime', 'tokensUsed', 'tokenBudget', 'cpu', 'memory', 'version', 'status'].includes(k)) {
      if (typeof v !== 'object') lines.push(`${k.toUpperCase().padEnd(18)} ${String(v)}`);
    }
  });
  lines.push('═══════════════════════════════════════════');
  lines.push('LEANNE ASSOC. COMMAND CENTER v3.7.1');
  lines.push('HOUSTON AI: ONLINE    MODE: AUTONOMOUS');
  return lines;
}
