/**
 * AgentFigures.js
 * Agent mesh creation, idle animation, raycasting setup.
 */
import * as THREE from 'three';
import { CYAN, MID_METAL, metalMat, emissiveMat } from './CommandCenterScene.js';

const MID_METAL_VAL = 0x151520;

/** Agent IDs mapped to the 6 positions */
const AGENT_IDS = ['houston', 'researcher', 'enricher', 'matcher', 'validator-gpt', 'validator-gemini'];

/**
 * Create 6 agent figures around the holotable.
 * @param {THREE.Scene} scene
 * @returns {{ agents: Array, agentMeshes: THREE.Object3D[], getAgentIdFromMesh: Function }}
 */
export function createAgentFigures(scene) {
  const agents = [];
  const agentMeshes = []; // all meshes that should be raycast-tested
  const agentCount = 6;

  for (let i = 0; i < agentCount; i++) {
    const angle = (i / agentCount) * Math.PI * 2 + Math.PI / 6;
    const dist = 3.2 + (i % 2) * 0.4;
    const agentGroup = new THREE.Group();
    agentGroup.position.set(Math.sin(angle) * dist, 0.5, Math.cos(angle) * dist);
    agentGroup.rotation.y = angle + Math.PI; // face center
    agentGroup.userData.agentId = AGENT_IDS[i];

    // Torso
    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.22, 0.7, 8),
      new THREE.MeshStandardMaterial({
        color: 0x0a0a18, roughness: 0.6, metalness: 0.8,
        emissive: CYAN, emissiveIntensity: 0.08,
      })
    );
    torso.position.y = 0.8;
    agentGroup.add(torso);

    // Head
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 8),
      new THREE.MeshStandardMaterial({
        color: 0x0e0e20, roughness: 0.5, metalness: 0.7,
        emissive: CYAN, emissiveIntensity: 0.1,
      })
    );
    head.position.y = 1.3;
    agentGroup.add(head);

    // Visor
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.03, 0.05),
      emissiveMat(CYAN, 5)
    );
    visor.position.set(0, 1.32, 0.1);
    agentGroup.add(visor);

    // Legs
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.07, 0.5, 6),
        metalMat(0x080816, 0.7)
      );
      leg.position.set(side * 0.1, 0.25, 0);
      agentGroup.add(leg);
    }

    // Arms
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.05, 0.5, 6),
        metalMat(0x0a0a18, 0.7)
      );
      arm.position.set(side * 0.28, 0.75, 0.05);
      arm.rotation.z = side * 0.2;
      arm.rotation.x = -0.3;
      agentGroup.add(arm);
    }

    // Console
    const consoleMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.4, 0.2),
      metalMat(MID_METAL_VAL, 0.5)
    );
    consoleMesh.position.set(0, 0.55, 0.5);
    agentGroup.add(consoleMesh);

    // Console screen
    const screenMat = emissiveMat(CYAN, 1.5);
    const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.2), screenMat);
    screenMesh.position.set(0, 0.7, 0.39);
    agentGroup.add(screenMesh);

    scene.add(agentGroup);

    // Collect all child meshes for raycasting
    agentGroup.traverse((child) => {
      if (child.isMesh) {
        child.userData.agentId = AGENT_IDS[i];
        agentMeshes.push(child);
      }
    });

    agents.push({
      group: agentGroup,
      baseY: 0.5,
      phase: Math.random() * Math.PI * 2,
      speed: 0.8 + Math.random() * 0.4,
      id: AGENT_IDS[i],
    });
  }

  /**
   * Returns a tick callback for agent idle animation.
   */
  function createAnimationTick() {
    return (t) => {
      agents.forEach((agent) => {
        const breathe = Math.sin(t * agent.speed + agent.phase) * 0.02;
        agent.group.position.y = agent.baseY + breathe;
        agent.group.rotation.y += Math.sin(t * 0.5 + agent.phase) * 0.0002;
      });
    };
  }

  /**
   * Given a mesh hit by a raycaster, return the agent ID.
   */
  function getAgentIdFromMesh(mesh) {
    return mesh?.userData?.agentId ?? null;
  }

  return { agents, agentMeshes, createAnimationTick, getAgentIdFromMesh };
}
