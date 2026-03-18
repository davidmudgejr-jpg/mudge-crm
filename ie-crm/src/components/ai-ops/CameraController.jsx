import { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import gsap from 'gsap';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// CameraController — GSAP-driven cinematic camera with swoop transitions
//
// Default: overhead isometric looking down at room
// On screen click: swoops DOWN to floor level (y=1.7 — agent eye height),
// PANS toward the wall, and TURNS to face the screen head-on.
//
// The lookAt target is animated separately from position using a dummy Vector3,
// which allows the camera to smoothly rotate during the swoop.
// ---------------------------------------------------------------------------

// Camera resting positions — where does an "agent standing on the floor" look?
const CAMERA_TARGETS = {
  // Default 3/4 cinematic — see full room
  default: {
    pos: [0, 6, 12],
    lookAt: [0, 1.2, -1],
    fov: 52,
  },

  // BACK WALL — Pipeline
  pipeline: {
    pos: [-1.5, 1.7, 1],
    lookAt: [-3, 2.2, -5.88],
    fov: 68,
  },
  // LEFT WALL — Costs
  costs: {
    pos: [-2.5, 1.7, 0.5],
    lookAt: [-5.39, 2.0, -1.5],
    fov: 68,
  },
  // BACK WALL — Agent Status
  'agent-overview': {
    pos: [1.5, 1.7, 1],
    lookAt: [3, 2.2, -5.88],
    fov: 68,
  },
  // RIGHT WALL — Alerts
  'approval-queue': {
    pos: [2.5, 1.7, 0.5],
    lookAt: [5.39, 2.0, -1.5],
    fov: 68,
  },

  // CENTER — orb / console
  territory: {
    pos: [0, 2.0, 3],
    lookAt: [0, 1.5, 0],
    fov: 65,
  },
  health: {
    pos: [0, 1.6, 3.5],
    lookAt: [0, 0.6, 1.0],
    fov: 65,
  },
  logs: {
    pos: [0, 3, 5],
    lookAt: [0, 1, 0],
    fov: 58,
  },
};

// Agent dossier: orbit to their position
function getAgentTarget(viewKey, agentPositions) {
  const agentName = viewKey.replace('agent-', '');
  const agentPos = agentPositions?.[agentName];
  if (agentPos) {
    return {
      pos: [agentPos[0] + 1.5, 2.0, agentPos[2] + 2.5],
      lookAt: [agentPos[0], 1.0, agentPos[2]],
      fov: 60,
    };
  }
  // Fallback — generic center view
  return {
    pos: [0, 3, 5],
    lookAt: [0, 1, 0],
    fov: 58,
  };
}

export default function CameraController({ activeView, onTransitionComplete, agentPositions }) {
  const { camera } = useThree();
  const lookAtTarget = useRef(new THREE.Vector3(0, 0, -0.5));
  const animating = useRef(false);
  const tlRef = useRef(null);
  const fovProxy = useRef({ value: 50 });

  // On mount — intro swoop from high above
  useEffect(() => {
    camera.position.set(0, 10, 18);
    camera.fov = 52;
    camera.updateProjectionMatrix();
    lookAtTarget.current.set(0, 1.2, -1);

    const tl = gsap.timeline();
    tl.to(camera.position, {
      x: 0, y: 6, z: 12,
      duration: 2.5,
      ease: 'power2.out',
    });
    tl.to(lookAtTarget.current, {
      x: 0, y: 1.2, z: -1,
      duration: 2.5,
      ease: 'power2.out',
    }, '<');
  }, []);

  // Animate to target view or back to default
  useEffect(() => {
    if (tlRef.current) {
      tlRef.current.kill();
    }

    let target;
    if (activeView === null) {
      target = CAMERA_TARGETS.default;
    } else if (CAMERA_TARGETS[activeView]) {
      target = CAMERA_TARGETS[activeView];
    } else if (activeView.startsWith('agent-')) {
      target = getAgentTarget(activeView, agentPositions);
    } else {
      target = CAMERA_TARGETS.default;
    }

    animating.current = true;
    const duration = activeView === null ? 0.9 : 1.1;

    const tl = gsap.timeline({
      onComplete: () => {
        animating.current = false;
        onTransitionComplete?.();
      },
    });

    // Animate camera position
    tl.to(camera.position, {
      x: target.pos[0],
      y: target.pos[1],
      z: target.pos[2],
      duration,
      ease: 'power2.inOut',
    });

    // Animate look-at target
    tl.to(lookAtTarget.current, {
      x: target.lookAt[0],
      y: target.lookAt[1],
      z: target.lookAt[2],
      duration,
      ease: 'power2.inOut',
    }, '<'); // simultaneously

    // Animate FOV
    fovProxy.current.value = camera.fov;
    tl.to(fovProxy.current, {
      value: target.fov,
      duration,
      ease: 'power2.inOut',
    }, '<');

    tlRef.current = tl;

    return () => {
      if (tlRef.current) tlRef.current.kill();
    };
  }, [activeView, agentPositions]);

  // Every frame: apply lookAt + FOV
  useFrame(() => {
    camera.lookAt(lookAtTarget.current);
    if (Math.abs(camera.fov - fovProxy.current.value) > 0.01) {
      camera.fov = fovProxy.current.value;
      camera.updateProjectionMatrix();
    }
  });

  return null; // no DOM output
}
