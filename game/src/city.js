// Vistamar: a procedural sun-soaked coastal city.
// A 9x9 block grid of roads, with downtown towers, a marina, suburbs, a beach and
// the ocean to the west. Also owns the road graph traffic and police drive on, the
// building colliders, and the runtime window textures.
import { createRandom, clamp } from './util.js';

const THREE = window.THREE;

export const BLOCK = 52;          // block pitch (road centre to road centre)
export const ROAD_W = 12;         // road width
export const GRID = 4;            // roads at k*BLOCK for k in -4..4
export const CITY_HALF = GRID * BLOCK + 26;

const PALETTE = [
  0xf2e3c6, 0xe8b4a0, 0xf6d9a0, 0xd9e6f2, 0xf2c9d4, 0xcfe3c0, 0xe6d3f2, 0xf5c98a,
];
const TOWER_COLORS = [0x9fc3e8, 0xc9d6e8, 0x8fb8d8, 0xb8c4d4, 0xd8c9a8];

/** A canvas texture of lit windows, generated at runtime (no files, no network). */
function makeWindowTexture(rng, litRatio) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  // White base so the building's palette colour shows through; windows are
  // dark glass rectangles, a few of them warmly lit.
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 256);
  for (let y = 8; y < 248; y += 18) {
    for (let x = 8; x < 120; x += 16) {
      const lit = rng.next() < litRatio;
      g.fillStyle = lit ? (rng.next() < 0.5 ? '#ffd98a' : '#9fd8ff') : '#3a4356';
      g.fillRect(x, y, 10, 12);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeRoadTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#33363d'; g.fillRect(0, 0, 64, 64);
  // Dashed yellow centre line running along the road (u axis), at v middle.
  g.fillStyle = '#f5d76e';
  g.fillRect(0, 30, 26, 4); g.fillRect(38, 30, 26, 4);
  g.fillStyle = '#8a8f98';
  for (let i = 0; i < 90; i++) g.fillRect(Math.random() * 64, Math.random() * 64, 1, 1);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Build the city into the scene. Returns { colliders, nodes, edges, landmarks }. */
export function createCity(scene, seed) {
  const rng = createRandom(seed);
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const landmarks = {};

  // Ground: grass base, sand beach, ocean plane.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2 + 400, CITY_HALF * 2 + 120),
    new THREE.MeshLambertMaterial({ color: 0x5d8a4a }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(-40, 0, 0);
  group.add(ground);

  const beach = new THREE.Mesh(
    new THREE.PlaneGeometry(34, CITY_HALF * 2 + 120),
    new THREE.MeshLambertMaterial({ color: 0xe8d29a }),
  );
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(-GRID * BLOCK - 17, 0.05, 0);
  group.add(beach);

  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(420, CITY_HALF * 2 + 120),
    new THREE.MeshLambertMaterial({ color: 0x2a7ab8 }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(-GRID * BLOCK - 34 - 210, 0.02, 0);
  group.add(ocean);

  // Roads: dark strips along every grid line, with dashed centre lines.
  const roadTex = makeRoadTexture();
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  const span = GRID * BLOCK * 2 + ROAD_W;
  for (let k = -GRID; k <= GRID; k++) {
    for (const horizontal of [true, false]) {
      const tex = roadTex.clone();
      tex.needsUpdate = true;
      tex.repeat.set(span / 14, 1);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(span, ROAD_W), new THREE.MeshLambertMaterial({ map: tex }));
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = horizontal ? 0 : Math.PI / 2;
      m.position.set(horizontal ? 0 : k * BLOCK, 0.08, horizontal ? k * BLOCK : 0);
      group.add(m);
    }
  }

  // Sidewalks: light slabs inside each block edge.
  const walkMat = new THREE.MeshLambertMaterial({ color: 0xb8b0a0 });
  for (let i = -GRID; i < GRID; i++) {
    for (let j = -GRID; j < GRID; j++) {
      const cx = (i + 0.5) * BLOCK, cz = (j + 0.5) * BLOCK;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(BLOCK - ROAD_W, 0.3, BLOCK - ROAD_W), walkMat);
      slab.position.set(cx, 0.15, cz);
      group.add(slab);
    }
  }

  // Buildings: one to four per block, height by district.
  const winTexA = makeWindowTexture(rng, 0.55);
  const winTexB = makeWindowTexture(rng, 0.3);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x6b5a49 });
  let buildingCount = 0;
  for (let i = -GRID; i < GRID; i++) {
    for (let j = -GRID; j < GRID; j++) {
      const cx = (i + 0.5) * BLOCK, cz = (j + 0.5) * BLOCK;
      const dist = Math.hypot(cx, cz);
      const downtown = dist < 90;
      const marina = cx > 120 && cz > 60;
      const count = downtown ? 2 : rng.int(1, 3);
      for (let b = 0; b < count; b++) {
        const w = rng.range(10, 20), d = rng.range(10, 20);
        const h = downtown ? rng.range(28, 68) : marina ? rng.range(8, 16) : rng.range(6, 26);
        const ox = (b % 2 === 0 ? -1 : 1) * rng.range(2, 9);
        const oz = (b < 2 ? -1 : 1) * rng.range(2, 9);
        const bx = cx + ox, bz = cz + oz;
        if (bx - w / 2 < cx - 18 || bx + w / 2 > cx + 18 || bz - d / 2 < cz - 18 || bz + d / 2 > cz + 18) continue;
        const color = downtown && h > 40 ? rng.pick(TOWER_COLORS) : rng.pick(PALETTE);
        const mat = new THREE.MeshLambertMaterial({ color, map: h > 18 ? (rng.next() < 0.5 ? winTexA : winTexB) : null });
        const mesh = new THREE.Mesh(boxGeo, mat);
        mesh.scale.set(w, h, d);
        mesh.position.set(bx, h / 2 + 0.3, bz);
        group.add(mesh);
        const roof = new THREE.Mesh(boxGeo, roofMat);
        roof.scale.set(w + 0.6, 0.6, d + 0.6);
        roof.position.set(bx, h + 0.6, bz);
        group.add(roof);
        // Rooftop AC box on tall towers.
        if (h > 30) {
          const ac = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x9aa0a8 }));
          ac.scale.set(3, 1.6, 3);
          ac.position.set(bx + w / 4, h + 1.6, bz);
          group.add(ac);
        }
        colliders.push({ minX: bx - w / 2, maxX: bx + w / 2, minZ: bz - d / 2, maxZ: bz + d / 2 });
        buildingCount++;
        if (downtown && h > 55 && !landmarks.tower) landmarks.tower = { x: bx, z: bz, h };
      }
    }
  }

  // Landmarks: city hall plaza (centre), marina pier, hospital, safehouse.
  landmarks.plaza = { x: 0, z: 0 };
  landmarks.hospital = { x: 3 * BLOCK, z: -2 * BLOCK };
  landmarks.safehouse = { x: -2 * BLOCK, z: 3 * BLOCK };
  landmarks.marina = { x: 4 * BLOCK, z: 4 * BLOCK };
  landmarks.yacht = { x: -GRID * BLOCK - 60, z: 3 * BLOCK };
  landmarks.chopshop = { x: 2 * BLOCK, z: -4 * BLOCK };

  // Streetlights along every road, alternating sides.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f47 });
  const lampMat = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffd76e, emissiveIntensity: 0.7 });
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7, 6);
  const lampGeo = new THREE.SphereGeometry(0.34, 8, 6);
  const armGeo = new THREE.BoxGeometry(2.2, 0.18, 0.18);
  for (let k = -GRID; k <= GRID; k++) {
    for (let t = -GRID * BLOCK; t <= GRID * BLOCK; t += 26) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(k * BLOCK + 7.5, 3.5, t);
      group.add(pole);
      const arm = new THREE.Mesh(armGeo, poleMat);
      arm.position.set(k * BLOCK + 6.4, 6.9, t);
      group.add(arm);
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(k * BLOCK + 5.4, 6.8, t);
      group.add(lamp);
    }
  }

  // Palm trees along the beach boardwalk and plaza.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b45 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f9e4f });
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.45, 6, 6);
  const leafGeo = new THREE.ConeGeometry(2.2, 1.5, 6);
  function palm(x, z) {
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 3, z);
    group.add(trunk);
    const leaves = new THREE.Mesh(leafGeo, leafMat);
    leaves.position.set(x, 7, z);
    group.add(leaves);
  }
  for (let z = -GRID * BLOCK; z <= GRID * BLOCK; z += 26) palm(-GRID * BLOCK - 6, z);
  for (let i = 0; i < 8; i++) palm(rng.range(-30, 30), rng.range(-30, 30));

  // Props: benches and hydrants scattered on sidewalks.
  const benchMat = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
  const hydMat = new THREE.MeshLambertMaterial({ color: 0xd43d2a });
  for (let i = 0; i < 40; i++) {
    const bx = rng.range(-GRID * BLOCK, GRID * BLOCK);
    const bz = rng.range(-GRID * BLOCK, GRID * BLOCK);
    if (Math.abs(bx % BLOCK) < 8 || Math.abs(bz % BLOCK) < 8) continue;
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.9), benchMat);
    bench.position.set(bx, 0.55, bz);
    group.add(bench);
    if (i % 3 === 0) {
      const hyd = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 1, 8), hydMat);
      hyd.position.set(bx + 3, 0.8, bz + 2);
      group.add(hyd);
    }
  }

  // Billboards on two downtown rooftops.
  const boardMat = new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0xaa7700, emissiveIntensity: 0.4 });
  for (const [bx, bz] of [[-26, -26], [26, 26]]) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(14, 5, 0.6), boardMat);
    board.position.set(bx, 34, bz);
    group.add(board);
  }

  // Road graph: intersections at every (k*BLOCK, m*BLOCK).
  const nodes = [];
  const nodeIndex = new Map();
  for (let k = -GRID; k <= GRID; k++) {
    for (let m = -GRID; m <= GRID; m++) {
      const id = nodes.length;
      nodes.push({ x: k * BLOCK, z: m * BLOCK });
      nodeIndex.set(k + ',' + m, id);
    }
  }
  const edges = [];
  for (let k = -GRID; k <= GRID; k++) {
    for (let m = -GRID; m <= GRID; m++) {
      const id = nodeIndex.get(k + ',' + m);
      if (k < GRID) edges.push([id, nodeIndex.get((k + 1) + ',' + m)]);
      if (m < GRID) edges.push([id, nodeIndex.get(k + ',' + (m + 1))]);
    }
  }
  const adjacency = nodes.map(() => []);
  for (const [a, b] of edges) { adjacency[a].push(b); adjacency[b].push(a); }

  return { group, colliders, nodes, adjacency, landmarks, buildingCount };
}

/** Push a circle (x, z, radius) out of every building AABB it overlaps. */
export function collideCircle(city, x, z, radius) {
  let px = x, pz = z;
  for (const c of city.colliders) {
    const nx = clamp(px, c.minX, c.maxX);
    const nz = clamp(pz, c.minZ, c.maxZ);
    const dx = px - nx, dz = pz - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        px = nx + (dx / d) * radius;
        pz = nz + (dz / d) * radius;
      } else {
        // Centre inside the box: push out along the smallest penetration axis.
        const left = px - c.minX, right = c.maxX - px;
        const top = pz - c.minZ, bottom = c.maxZ - pz;
        const m = Math.min(left, right, top, bottom);
        if (m === left) px = c.minX - radius;
        else if (m === right) px = c.maxX + radius;
        else if (m === top) pz = c.minZ - radius;
        else pz = c.maxZ + radius;
      }
    }
  }
  // City bounds + ocean edge.
  px = clamp(px, -CITY_HALF, CITY_HALF);
  pz = clamp(pz, -CITY_HALF, CITY_HALF);
  return { x: px, z: pz };
}

/** Nearest road-graph node to a point. */
export function nearestNode(city, x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < city.nodes.length; i++) {
    const d = (city.nodes[i].x - x) ** 2 + (city.nodes[i].z - z) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
