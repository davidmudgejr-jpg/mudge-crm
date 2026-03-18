// ---------------------------------------------------------------------------
// coordMap.js — SVG ↔ Three.js coordinate mapping
//
// SVG viewBox: 0 0 900 640, floor diamond center at (450, 300)
// Three.js:   12m × 8m room centered at origin, floor at y=0
//
// SVG X → World X:  (svgX - 450) / 390 * 6  → range [-6, +6]
// SVG Y → World Z:  -(svgY - 300) / 200 * 4 → range [-4, +4]  (Y flipped)
// ---------------------------------------------------------------------------

export function svgToWorld(svgX, svgY) {
  const worldX = ((svgX - 450) / 390) * 6;
  const worldZ = -((svgY - 300) / 200) * 4;
  return [worldX, 0, worldZ];
}

export function worldToSvg(worldX, worldZ) {
  const svgX = (worldX / 6) * 390 + 450;
  const svgY = -(worldZ / 4) * 200 + 300;
  return { x: svgX, y: svgY };
}

// Platform radius = 3.2. Agents walk at radius 6.0 (platform + 2.8 clearance)
const PLATFORM_RADIUS = 3.2;
const AGENT_WALK_RADIUS = PLATFORM_RADIUS + 2.8; // = 6.0
console.log('[AI Ops] Platform radius:', PLATFORM_RADIUS, '| Agent walk radius:', AGENT_WALK_RADIUS);

// 5 agents evenly spaced (72° apart) at radius 6.0
const AGENT_DEFS = [
  { name: 'enricher',   color: '#10b981', accessories: ['labcoat'],   tier: 3, angle: 180 },
  { name: 'scout',      color: '#f59e0b', accessories: [],            tier: 3, angle: 252 },
  { name: 'matcher',    color: '#8b5cf6', accessories: ['tablet'],    tier: 3, angle: 324 },
  { name: 'researcher', color: '#3b82f6', accessories: ['headset'],   tier: 3, angle: 36 },
  { name: 'houston',    color: '#fbbf24', accessories: [],            tier: 1, angle: 108, isHouston: true },
];

// Convert circle positions to SVG coords (so movement engine still works)
export const AGENT_CONFIGS_3D = AGENT_DEFS.map((def) => {
  const rad = (def.angle * Math.PI) / 180;
  const worldX = Math.cos(rad) * AGENT_WALK_RADIUS;
  const worldZ = Math.sin(rad) * AGENT_WALK_RADIUS;
  // Convert back to SVG coords for the movement engine
  const svgX = (worldX / 6) * 390 + 450;
  const svgY = -(worldZ / 4) * 200 + 300;
  return {
    ...def,
    standing: { x: Math.round(svgX), y: Math.round(svgY) },
  };
});

// Get 3D home position for an agent config
export function getHome3D(cfg) {
  const home = cfg.homeDesk || cfg.standing;
  return svgToWorld(home.x, home.y);
}
