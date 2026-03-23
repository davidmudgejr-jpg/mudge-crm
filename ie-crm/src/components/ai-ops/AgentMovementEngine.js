// ---------------------------------------------------------------------------
// AgentMovementEngine
// Pure-logic module that manages agent positions, movement scheduling,
// and state machines. NOT a React component.
// ---------------------------------------------------------------------------

const STATES = {
  SEATED_WORKING: 'SEATED_WORKING',
  STANDING_IDLE: 'STANDING_IDLE',
  GETTING_UP: 'GETTING_UP',
  WALKING_TO_TARGET: 'WALKING_TO_TARGET',
  AT_TARGET: 'AT_TARGET',
  WALKING_HOME: 'WALKING_HOME',
  SITTING_DOWN: 'SITTING_DOWN',
};

// Hardcoded waypoints at radius 6.0 world units from center (0,0,0)
// Converted to SVG: worldX*390/6+450, -(worldZ*200/4)+300
// radius 6 → SVG offset = 6*390/6 = 390px from center (450,300)
// These are provably outside the platform (radius 3.2 → SVG ~208px)
const POI = [
  { name: 'wp-north', x: 450, y: 0 },    // (0, 0, 6) → behind platform
  { name: 'wp-east',  x: 840, y: 300 },   // (6, 0, 0) → right of platform
  { name: 'wp-south', x: 450, y: 600 },   // (0, 0, -6) → in front of platform
  { name: 'wp-west',  x: 60,  y: 300 },   // (-6, 0, 0) → left of platform
];
console.log('[AI Ops] Agent waypoints hardcoded at SVG radius ~390px from center. Platform SVG radius ~208px.');

const WALK_SPEED = 12; // pixels per second (slow, deliberate pace — Sims-style)
const MAX_WALKING = 2;
const GET_UP_DURATION = 400; // ms
const SIT_DOWN_DURATION = 400;

// Floor diamond bounds — agents must stay inside this
// Diamond vertices: top(450,100), right(840,300), bottom(450,500), left(60,300)
// Inset for safety (don't walk to very edge)
function isOnFloor(x, y) {
  // Use diamond equation: |x-cx|/hw + |y-cy|/hh <= 1
  // Large inset keeps agents well within floor, away from walls and screens
  const cx = 450, cy = 360, hw = 240, hh = 100;
  return Math.abs(x - cx) / hw + Math.abs(y - cy) / hh <= 1;
}

// Dais exclusion — agents must not walk through the raised platform
// Dais center at SVG (450, 300), radius ~195px in SVG space (3.0 world units)
// Platform radius 3.2 world = 3.2*390/6 = 208 SVG pixels. Add 2.5 world = 162px buffer.
const DAIS_CX = 450, DAIS_CY = 300, DAIS_RADIUS = 370; // 208 + 162 = never walk inside
function isOnDais(x, y) {
  return Math.sqrt((x - DAIS_CX) ** 2 + (y - DAIS_CY) ** 2) < DAIS_RADIUS;
}

function clampToFloor(x, y) {
  let px = x, py = y;
  if (!isOnFloor(px, py)) {
    // Push toward center until on floor
    const cx = 450, cy = 300;
    for (let t = 0.9; t >= 0; t -= 0.05) {
      const tx = cx + (px - cx) * t;
      const ty = cy + (py - cy) * t;
      if (isOnFloor(tx, ty)) { px = tx; py = ty; break; }
    }
  }
  // Push OUT of dais if inside it
  if (isOnDais(px, py)) {
    const dx = px - DAIS_CX, dy = py - DAIS_CY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    px = DAIS_CX + (dx / dist) * (DAIS_RADIUS + 10);
    py = DAIS_CY + (dy / dist) * (DAIS_RADIUS + 10);
  }
  return { x: px, y: py };
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function distance(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function lerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function facingFromVector(dx, dy) {
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  // Show side view when horizontal movement exceeds vertical
  // Lower threshold (1.0) means side profiles appear during lateral movement
  if (absDx > absDy * 1.0) {
    return dx < 0 ? 'side-left' : 'side-right';
  }
  // Otherwise diagonal/front/back
  if (dx <= 0 && dy >= 0) return 'front-left';
  if (dx > 0 && dy >= 0) return 'front-right';
  if (dx <= 0 && dy < 0) return 'back-left';
  return 'back-right';
}

export function createMovementEngine(agentConfigs) {
  // Internal state map
  const agents = {};

  // Initialize each agent
  agentConfigs.forEach((cfg) => {
    const homePos = cfg.homeDesk || cfg.standing;
    const isDesk = !!cfg.homeDesk;

    agents[cfg.name] = {
      config: cfg,
      position: { ...homePos },
      homePosition: { ...homePos },
      isDesk,
      state: isDesk ? STATES.SEATED_WORKING : STATES.STANDING_IDLE,
      facing: 'front-left',
      isWalking: false,
      isSeated: isDesk,
      status: 'idle', // heartbeat status
      targetPosition: null,
      walkOrigin: null,
      walkProgress: 0,
      walkDistance: 0,
      stateTimer: 0,
      atTargetDuration: 0,
      nextCheckTimer: randomBetween(6000, 18000),
    };
  });

  function getWalkingCount() {
    return Object.values(agents).filter(
      (a) => a.state === STATES.WALKING_TO_TARGET || a.state === STATES.WALKING_HOME
    ).length;
  }

  function pickTarget(agent) {
    // Pick a random POI or another agent's home position
    const candidates = [...POI];

    // Add other agent home positions as targets
    Object.values(agents).forEach((other) => {
      if (other.config.name !== agent.config.name) {
        candidates.push({
          name: other.config.name,
          x: other.homePosition.x,
          y: other.homePosition.y,
        });
      }
    });

    // Houston preferentially visits the sphere and agent desks
    if (agent.config.isHouston) {
      const preferred = candidates.filter(
        (c) => c.name === 'sphere' || c.name === 'console' || agentConfigs.some((a) => a.name === c.name)
      );
      if (preferred.length > 0 && Math.random() < 0.7) {
        return preferred[Math.floor(Math.random() * preferred.length)];
      }
    }

    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  function tryStartWalk(agentName) {
    const agent = agents[agentName];
    if (!agent) return;

    // Only start walks from idle states
    const canWalk =
      agent.state === STATES.SEATED_WORKING ||
      agent.state === STATES.STANDING_IDLE;
    if (!canWalk) return;
    if (getWalkingCount() >= MAX_WALKING) return;

    const moveChance = agent.config.isHouston ? 0.6 : 0.3;
    if (Math.random() > moveChance) return;

    const target = pickTarget(agent);
    const dist = distance(agent.position, target);
    if (dist < 20) return; // too close, skip

    // Clamp target to floor bounds
    const clamped = clampToFloor(target.x, target.y);
    agent.targetPosition = { x: clamped.x, y: clamped.y };
    agent.walkOrigin = { ...agent.position };
    agent.walkProgress = 0;
    agent.walkDistance = dist;
    agent.atTargetDuration = randomBetween(5000, 15000);

    if (agent.isDesk) {
      agent.state = STATES.GETTING_UP;
      agent.stateTimer = 0;
      agent.isSeated = false;
    } else {
      agent.state = STATES.WALKING_TO_TARGET;
      agent.isWalking = true;
    }
  }

  function tickAgent(agent, deltaMs) {
    agent.nextCheckTimer -= deltaMs;

    switch (agent.state) {
      case STATES.SEATED_WORKING:
      case STATES.STANDING_IDLE:
        if (agent.nextCheckTimer <= 0) {
          agent.nextCheckTimer = randomBetween(8000, 20000);
          tryStartWalk(agent.config.name);
        }
        break;

      case STATES.GETTING_UP:
        agent.stateTimer += deltaMs;
        if (agent.stateTimer >= GET_UP_DURATION) {
          agent.state = STATES.WALKING_TO_TARGET;
          agent.isWalking = true;
          agent.isSeated = false;
        }
        break;

      case STATES.WALKING_TO_TARGET: {
        const moveAmt = (WALK_SPEED * deltaMs) / 1000;
        agent.walkProgress += moveAmt / agent.walkDistance;

        if (agent.walkProgress >= 1) {
          agent.walkProgress = 1;
          agent.position = { ...agent.targetPosition };
          agent.state = STATES.AT_TARGET;
          agent.isWalking = false;
          agent.stateTimer = 0;
        } else {
          agent.position = lerp(agent.walkOrigin, agent.targetPosition, agent.walkProgress);
          const dx = agent.targetPosition.x - agent.position.x;
          const dy = agent.targetPosition.y - agent.position.y;
          agent.facing = facingFromVector(dx, dy);
        }
        break;
      }

      case STATES.AT_TARGET:
        agent.stateTimer += deltaMs;
        // Face forward while at target
        agent.facing = 'front-left';
        if (agent.stateTimer >= agent.atTargetDuration) {
          // Head home
          agent.targetPosition = { ...agent.homePosition };
          agent.walkOrigin = { ...agent.position };
          agent.walkProgress = 0;
          agent.walkDistance = distance(agent.position, agent.homePosition);
          if (agent.walkDistance < 5) {
            // Already home
            agent.state = agent.isDesk ? STATES.SEATED_WORKING : STATES.STANDING_IDLE;
            agent.isSeated = agent.isDesk;
            agent.position = { ...agent.homePosition };
          } else {
            agent.state = STATES.WALKING_HOME;
            agent.isWalking = true;
          }
        }
        break;

      case STATES.WALKING_HOME: {
        const moveAmt2 = (WALK_SPEED * deltaMs) / 1000;
        agent.walkProgress += moveAmt2 / agent.walkDistance;

        if (agent.walkProgress >= 1) {
          agent.walkProgress = 1;
          agent.position = { ...agent.homePosition };
          if (agent.isDesk) {
            agent.state = STATES.SITTING_DOWN;
            agent.stateTimer = 0;
            agent.isWalking = false;
          } else {
            agent.state = STATES.STANDING_IDLE;
            agent.isWalking = false;
          }
        } else {
          agent.position = lerp(agent.walkOrigin, agent.homePosition, agent.walkProgress);
          const dx = agent.homePosition.x - agent.position.x;
          const dy = agent.homePosition.y - agent.position.y;
          agent.facing = facingFromVector(dx, dy);
        }
        break;
      }

      case STATES.SITTING_DOWN:
        agent.stateTimer += deltaMs;
        if (agent.stateTimer >= SIT_DOWN_DURATION) {
          agent.state = STATES.SEATED_WORKING;
          agent.isSeated = true;
          agent.facing = 'front-left';
        }
        break;
    }
  }

  return {
    tick(deltaMs) {
      const capped = Math.min(deltaMs, 200); // cap large deltas
      Object.values(agents).forEach((agent) => tickAgent(agent, capped));

      const result = {};
      Object.entries(agents).forEach(([name, agent]) => {
        result[name] = {
          position: { ...agent.position },
          facing: agent.facing,
          isWalking: agent.isWalking,
          isSeated: agent.isSeated,
          state: agent.state,
        };
      });
      return result;
    },

    onHeartbeatUpdate(agentName, newStatus) {
      const agent = agents[agentName];
      if (!agent) return;
      agent.status = newStatus;

      // Status change may trigger a walk
      if (newStatus === 'running' || newStatus === 'idle') {
        tryStartWalk(agentName);
      }
    },

    getAgentState(agentName) {
      const agent = agents[agentName];
      if (!agent) return null;
      return {
        position: { ...agent.position },
        facing: agent.facing,
        isWalking: agent.isWalking,
        isSeated: agent.isSeated,
        state: agent.state,
        status: agent.status,
      };
    },

    getAllStates() {
      const result = {};
      Object.entries(agents).forEach(([name, agent]) => {
        result[name] = {
          position: { ...agent.position },
          facing: agent.facing,
          isWalking: agent.isWalking,
          isSeated: agent.isSeated,
          state: agent.state,
          status: agent.status,
        };
      });
      return result;
    },
  };
}
