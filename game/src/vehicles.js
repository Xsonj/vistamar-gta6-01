// Cars: mesh factory, player driving physics, traffic AI and parked cars.
// Every car is a low-poly box build with spinning wheels, brake lights and a
// headlight cone; traffic cars drive the road graph and stop for each other.
import { createRandom, clamp, angleDiff, distance2D } from './util.js';
import { BLOCK, GRID, CITY_HALF, nearestNode, collideCircle } from './city.js';

const THREE = window.THREE;

const CAR_COLORS = [0xd43d2a, 0x2a6fd4, 0xf2c230, 0x37b24d, 0xe8e8e8, 0x222831, 0x8a5cf6, 0xf27d16, 0x0ea5a5, 0xc026d3];
const SPORT_COLORS = [0xff2d55, 0xffd60a, 0x00e5ff, 0xff6b00];

/** Build a car mesh. opts: { color, sport, police, taxi }. */
export function buildCarMesh(opts = {}) {
  const color = opts.color ?? 0x888888;
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1b2733 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x14181d });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.62, 4.4), bodyMat);
  body.position.y = 0.62;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.1), glassMat);
  cabin.position.set(0, 1.18, -0.25);
  g.add(cabin);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.34, 0.7), bodyMat);
  nose.position.set(0, 0.55, 2.35);
  g.add(nose);
  // Headlights and tail lights.
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff6c9, emissive: 0xffedb0, emissiveIntensity: 0.9 });
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xaa0000, emissiveIntensity: 0.6 });
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.1), headMat);
    h.position.set(s * 0.62, 0.66, 2.72);
    g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.1), tailMat);
    t.position.set(s * 0.62, 0.72, -2.22);
    g.add(t);
  }
  if (opts.sport) {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.4), darkMat);
    spoiler.position.set(0, 1.15, -2.1);
    g.add(spoiler);
  }
  if (opts.taxi) {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 0.5), new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0xaa7700, emissiveIntensity: 0.5 }));
    sign.position.set(0, 1.6, -0.25);
    g.add(sign);
  }
  if (opts.police) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.5), darkMat);
    bar.position.set(0, 1.52, -0.25);
    g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.5), new THREE.MeshLambertMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 1 }));
    red.position.set(-0.28, 1.56, -0.25);
    red.name = 'sirenRed';
    g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.5), new THREE.MeshLambertMaterial({ color: 0x0044ff, emissive: 0x0044ff, emissiveIntensity: 1 }));
    blue.position.set(0.28, 1.56, -0.25);
    blue.name = 'sirenBlue';
    g.add(blue);
  }
  // Wheels.
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, darkMat);
    w.position.set(wx, 0.38, wz);
    g.add(w);
    wheels.push(w);
  }
  g.userData.wheels = wheels;
  g.userData.body = body;
  return g;
}

function makeCar(G, x, z, heading, opts) {
  const mesh = buildCarMesh(opts);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  G.scene.add(mesh);
  return {
    mesh, x, z, heading, speed: 0,
    maxSpeed: opts.sport ? 42 : opts.police ? 40 : 16 + Math.random() * 4,
    accel: opts.sport ? 22 : 13,
    color: opts.color ?? 0x888888,
    sport: !!opts.sport, police: !!opts.police, taxi: !!opts.taxi,
    parked: false, locked: false, driver: null, health: 100,
    node: nearestNode(G.city, x, z), targetNode: -1, wait: 0,
    sirenPhase: Math.random() * 10, smoke: 0,
  };
}

/** Create traffic, parked cars and the player's starter car. */
export function createVehicles(G) {
  const rng = createRandom(G.seed + 77);
  const traffic = [];
  const parked = [];
  // Traffic cars on the road graph.
  for (let i = 0; i < 14; i++) {
    const node = Math.floor(rng.next() * G.city.nodes.length);
    const n = G.city.nodes[node];
    const car = makeCar(G, n.x + rng.range(-3, 3), n.z + rng.range(-3, 3), rng.range(0, Math.PI * 2), { color: rng.pick(CAR_COLORS) });
    car.node = node;
    car.targetNode = G.city.adjacency[node][Math.floor(rng.next() * G.city.adjacency[node].length)];
    car.speed = car.maxSpeed * rng.range(0.5, 0.9);
    traffic.push(car);
  }
  // Parked cars along road edges.
  for (let i = 0; i < 12; i++) {
    const k = rng.int(-GRID, GRID);
    const along = rng.range(-GRID * BLOCK, GRID * BLOCK);
    const horizontal = rng.next() < 0.5;
    const x = horizontal ? along : k * BLOCK + 5.2;
    const z = horizontal ? k * BLOCK + 5.2 : along;
    const car = makeCar(G, x, z, horizontal ? 0 : Math.PI / 2, { color: rng.pick(CAR_COLORS), sport: i === 0 });
    car.parked = true;
    car.locked = rng.next() < 0.35;
    parked.push(car);
  }
  // The player's starter car, a battered sedan by the plaza.
  const starter = makeCar(G, 14, 10, Math.PI / 2, { color: 0x8a5cf6 });
  starter.parked = true;
  parked.push(starter);
  // The mission sports car (Hot Wheels target) parked near the marina.
  const sports = makeCar(G, G.city.landmarks.marina.x - 10, G.city.landmarks.marina.z + 8, 0, { color: rng.pick(SPORT_COLORS), sport: true });
  sports.parked = true;
  sports.locked = true;
  sports.isMissionCar = true;
  parked.push(sports);
  return { traffic, parked, starter, sports, all: [...traffic, ...parked] };
}

/** Arcade driving: throttle, steering, drift, building collision, car-car push. */
export function stepPlayerCar(G, car, input, dt) {
  const fwd = input.forward ? 1 : input.back ? -0.6 : 0;
  const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const dir = car.speed >= 0 ? 1 : -1;
  car.speed += fwd * car.accel * dt;
  car.speed -= car.speed * (input.handbrake ? 2.2 : 0.35) * dt;
  if (!fwd) car.speed -= Math.sign(car.speed) * 6 * dt;
  car.speed = clamp(car.speed, -12, car.maxSpeed);
  if (G.cruise && G.cruiseSpeed) car.speed = Math.min(car.speed, G.cruiseSpeed);
  if (Math.abs(car.speed) < 0.15 && !fwd) car.speed = 0;
  const steerAngle = steer * clamp(Math.abs(car.speed) / 10, 0, 1) * 1.9 * dir;
  car.heading += steerAngle * dt * (input.handbrake ? 1.6 : 1);
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const fixed = collideCircle(G.city, nx, nz, 1.9);
  if ((fixed.x !== nx || fixed.z !== nz) && Math.abs(car.speed) > 4) {
    car.speed *= 0.45;
    G.effects.sparks(fixed.x, 0.6, fixed.z, 6);
    G.audio.thud();
  }
  car.x = fixed.x; car.z = fixed.z;
  // Car-car push: simple circle repulsion against traffic.
  for (const other of G.vehicles.all) {
    if (other === car || other.parked) continue;
    const d = distance2D(car.x, car.z, other.x, other.z);
    if (d < 4.4 && d > 0.01) {
      const push = (4.4 - d) / 2;
      const ux = (car.x - other.x) / d, uz = (car.z - other.z) / d;
      car.x += ux * push; car.z += uz * push;
      other.x -= ux * push; other.z -= uz * push;
      if (Math.abs(car.speed) > 8) { car.speed *= 0.8; other.speed = car.speed * 0.5; }
    }
  }
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  car.mesh.rotation.z = -steer * clamp(Math.abs(car.speed) / 30, 0, 1) * 0.06;
  car.mesh.position.y = Math.sin(G.time * 22) * 0.02 * clamp(Math.abs(car.speed) / 20, 0, 1);
  for (const w of car.mesh.userData.wheels) w.rotation.x += (car.speed / 0.38) * dt;
  G.audio.setEngine(Math.abs(car.speed) / car.maxSpeed, car.speed !== 0);
}

/** Traffic AI: drive node to node, brake for cars ahead and at junctions. */
export function stepTraffic(G, dt) {
  for (const car of G.vehicles.traffic) {
    if (car.wait > 0) { car.wait -= dt; car.speed = Math.max(0, car.speed - 10 * dt); continue; }
    const target = G.city.nodes[car.targetNode];
    const dx = target.x - car.x, dz = target.z - car.z;
    const dist = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    car.heading += clamp(angleDiff(car.heading, want), -1.6 * dt, 1.6 * dt);
    // Brake for a car ahead.
    let blocked = false;
    for (const other of G.vehicles.all) {
      if (other === car) continue;
      const ox = other.x - car.x, oz = other.z - car.z;
      const along = ox * Math.sin(car.heading) + oz * Math.cos(car.heading);
      const side = Math.abs(ox * Math.cos(car.heading) - oz * Math.sin(car.heading));
      if (along > 0 && along < 9 && side < 2.4) { blocked = true; break; }
    }
    const playerCar = G.player.car;
    if (playerCar && playerCar !== car) {
      const ox = playerCar.x - car.x, oz = playerCar.z - car.z;
      const along = ox * Math.sin(car.heading) + oz * Math.cos(car.heading);
      const side = Math.abs(ox * Math.cos(car.heading) - oz * Math.sin(car.heading));
      if (along > 0 && along < 9 && side < 2.4) blocked = true;
    }
    const targetSpeed = blocked ? 0 : car.maxSpeed;
    car.speed += clamp(targetSpeed - car.speed, -14 * dt, 8 * dt);
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    if (dist < 3) {
      car.node = car.targetNode;
      const next = G.city.adjacency[car.node];
      car.targetNode = next[Math.floor(Math.random() * next.length)];
      if (Math.random() < 0.12) car.wait = 1 + Math.random() * 2;
    }
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    for (const w of car.mesh.userData.wheels) w.rotation.x += (car.speed / 0.38) * dt;
  }
}

/** Flash a police car's light bar. */
export function stepSiren(car, time) {
  const red = car.mesh.getObjectByName('sirenRed');
  const blue = car.mesh.getObjectByName('sirenBlue');
  if (!red || !blue) return;
  const phase = Math.sin(time * 10 + car.sirenPhase) > 0;
  red.material.emissiveIntensity = phase ? 2.2 : 0.15;
  blue.material.emissiveIntensity = phase ? 0.15 : 2.2;
}
