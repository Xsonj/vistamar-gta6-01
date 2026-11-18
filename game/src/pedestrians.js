// Pedestrians: sidewalk walkers with random routes who flee from gunfire,
// police chases and cars. Simple low-poly figures with a walk cycle.
import { createRandom, clamp } from './util.js';
import { BLOCK, GRID, collideCircle } from './city.js';

const THREE = window.THREE;

const SHIRTS = [0x4a90d9, 0xe86a92, 0x7bc47f, 0xf2a541, 0x9b59b6, 0xeeeeee, 0x34495e];
const PANTS = [0x2a3f5f, 0x5f3a2a, 0x333333, 0x6b7c93];

function buildPedMesh(shirt, pants, skin) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.8, 0.32), new THREE.MeshLambertMaterial({ color: shirt }));
  body.position.y = 1.0;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), new THREE.MeshLambertMaterial({ color: skin }));
  head.position.y = 1.62;
  g.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.22), new THREE.MeshLambertMaterial({ color: pants }));
  legL.position.set(-0.14, 0.31, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.14;
  g.add(legR);
  g.userData.legL = legL;
  g.userData.legR = legR;
  return g;
}

export function createPedestrians(G, count) {
  const rng = createRandom(G.seed + 31);
  const peds = [];
  for (let i = 0; i < count; i++) {
    const x = rng.range(-GRID * BLOCK, GRID * BLOCK);
    const z = rng.range(-GRID * BLOCK, GRID * BLOCK);
    const mesh = buildPedMesh(rng.pick(SHIRTS), rng.pick(PANTS), rng.pick([0xe8b48a, 0xc98d64, 0x8a5a3b, 0xf2c9a0]));
    mesh.position.set(x, 0, z);
    G.scene.add(mesh);
    peds.push({
      mesh, x, z, heading: rng.range(0, Math.PI * 2),
      speed: rng.range(1.2, 2.2), targetX: x, targetZ: z,
      walkPhase: rng.range(0, 6), fleeing: 0, scared: false,
    });
  }
  return peds;
}

function pickSidewalkTarget(G, rng) {
  // A point on a sidewalk: inside a block, near its edge.
  const i = Math.floor(rng.range(-GRID, GRID));
  const j = Math.floor(rng.range(-GRID, GRID));
  const cx = (i + 0.5) * BLOCK, cz = (j + 0.5) * BLOCK;
  const edge = rng.int(0, 3);
  const off = 15;
  if (edge === 0) return { x: cx + rng.range(-off, off), z: cz - off };
  if (edge === 1) return { x: cx + rng.range(-off, off), z: cz + off };
  if (edge === 2) return { x: cx - off, z: cz + rng.range(-off, off) };
  return { x: cx + off, z: cz + rng.range(-off, off) };
}

export function stepPedestrians(G, dt) {
  const rng = G.rng;
  const p = G.player;
  const danger = G.combat.shotsFiredRecently || G.wanted.stars >= 2;
  for (const ped of G.peds) {
    // Flee if danger is close or a shot just rang out.
    const pd = Math.hypot(ped.x - p.x, ped.z - p.z);
    if ((danger && pd < 26) || (G.combat.lastShotTime > G.time - 1.5 && pd < 30)) {
      if (ped.fleeing <= 0) {
        ped.fleeing = 2.5 + Math.random() * 2;
        ped.scared = true;
      }
    }
    if (ped.fleeing > 0) {
      ped.fleeing -= dt;
      const away = Math.atan2(ped.x - p.x, ped.z - p.z);
      ped.heading = away;
      const s = 5.2;
      const nx = ped.x + Math.sin(away) * s * dt;
      const nz = ped.z + Math.cos(away) * s * dt;
      const fixed = collideCircle(G.city, nx, nz, 0.5);
      ped.x = fixed.x; ped.z = fixed.z;
      ped.walkPhase += dt * 14;
    } else {
      const dx = ped.targetX - ped.x, dz = ped.targetZ - ped.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.5) {
        const t = pickSidewalkTarget(G, rng);
        ped.targetX = t.x; ped.targetZ = t.z;
      } else {
        ped.heading = Math.atan2(dx, dz);
        const nx = ped.x + Math.sin(ped.heading) * ped.speed * dt;
        const nz = ped.z + Math.cos(ped.heading) * ped.speed * dt;
        const fixed = collideCircle(G.city, nx, nz, 0.5);
        ped.x = fixed.x; ped.z = fixed.z;
        ped.walkPhase += dt * ped.speed * 4;
      }
    }
    ped.mesh.position.set(ped.x, 0, ped.z);
    ped.mesh.rotation.y = ped.heading;
    const swing = Math.sin(ped.walkPhase) * 0.5;
    ped.mesh.userData.legL.rotation.x = swing;
    ped.mesh.userData.legR.rotation.x = -swing;
    // Hit by the player's car: knock down, count as a crime.
    if (p.car && Math.abs(p.car.speed) > 3) {
      const d = Math.hypot(ped.x - p.car.x, ped.z - p.car.z);
      if (d < 2.2) {
        ped.mesh.rotation.x = -Math.PI / 2;
        ped.mesh.position.y = 0.4;
        ped.fleeing = 0;
        ped.knocked = true;
        G.wanted.addHeat(15, 'hit a pedestrian');
        G.hud.toast('You hit a pedestrian!');
        G.effects.sparks(ped.x, 1, ped.z, 8);
        // Drag the body aside so it is not hit again every frame.
        ped.x += (ped.x - p.car.x) * 0.5;
        ped.z += (ped.z - p.car.z) * 0.5;
      }
    }
    if (ped.knocked) {
      ped.knockedTime = (ped.knockedTime ?? 0) + dt;
      if (ped.knockedTime > 4) {
        ped.mesh.rotation.x = 0;
        ped.mesh.position.y = 0;
        ped.knocked = false;
        ped.knockedTime = 0;
        ped.fleeing = 3;
      }
    }
  }
}
