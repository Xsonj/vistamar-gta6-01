// Mara Voss on foot: third-person walker with run, jump, punch and car entry.
// The camera orbits with mouse drag; movement is camera-relative.
import { clamp, angleDiff } from './util.js';
import { collideCircle } from './city.js';

const THREE = window.THREE;

export function createPlayer(G, x, z) {
  const group = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0xd43d2a });
  const jeans = new THREE.MeshLambertMaterial({ color: 0x2a3f5f });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b48a });
  const hair = new THREE.MeshLambertMaterial({ color: 0x1a1210 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.85, 0.36), jacket);
  body.position.y = 1.05;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skin);
  head.position.y = 1.72;
  group.add(head);
  const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  hairM.position.y = 1.78;
  group.add(hairM);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.75, 0.26), jeans);
  legL.position.set(-0.17, 0.38, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.17;
  group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.22), jacket);
  armL.position.set(-0.44, 1.05, 0);
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.44;
  group.add(armR);
  // Pistol in the right hand when armed.
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.42), new THREE.MeshLambertMaterial({ color: 0x222222 }));
  gun.position.set(0.44, 0.72, 0.2);
  gun.visible = false;
  group.add(gun);
  group.position.set(x, 0, z);
  G.scene.add(group);
  return {
    mesh: group, x, z, heading: 0, vy: 0, grounded: true,
    health: 100, maxHealth: 100, armor: 0,
    car: null, // the car Mara is driving, or null
    speed: 0, walkPhase: 0, punchTimer: 0,
    legL, legR, armL, armR, gun,
    camYaw: Math.PI, camPitch: 0.32, camDist: 7,
  };
}

/** On-foot step: camera-relative WASD, sprint, jump, collisions, walk cycle. */
export function stepPlayer(G, dt) {
  const p = G.player;
  if (p.car) return;
  const input = G.input;
  const sprint = input.sprint ? 1.7 : 1;
  const speed = 6.2 * sprint;
  let mx = 0, mz = 0;
  if (input.forward) mz += 1;
  if (input.back) mz -= 1;
  if (input.left) mx -= 1;
  if (input.right) mx += 1;
  const moving = mx !== 0 || mz !== 0;
  if (moving) {
    const len = Math.hypot(mx, mz);
    mx /= len; mz /= len;
    const sin = Math.sin(p.camYaw), cos = Math.cos(p.camYaw);
    const wx = mx * cos - mz * sin;
    const wz = -mx * sin - mz * cos;
    const nx = p.x + wx * speed * dt;
    const nz = p.z + wz * speed * dt;
    const fixed = collideCircle(G.city, nx, nz, 0.55);
    p.x = fixed.x; p.z = fixed.z;
    p.heading = Math.atan2(wx, wz);
    p.walkPhase += dt * speed * 1.6;
    p.speed = speed;
  } else {
    p.speed = 0;
  }
  // Jump + gravity.
  if (input.jump && p.grounded) { p.vy = 7.5; p.grounded = false; }
  if (!p.grounded) {
    p.vy -= 22 * dt;
    p.mesh.position.y += p.vy * dt;
    if (p.mesh.position.y <= 0) { p.mesh.position.y = 0; p.vy = 0; p.grounded = true; }
  }
  p.mesh.position.x = p.x;
  p.mesh.position.z = p.z;
  p.mesh.rotation.y += angleDiff(p.mesh.rotation.y, p.heading) * Math.min(1, dt * 12);
  const swing = moving ? Math.sin(p.walkPhase) * 0.55 : 0;
  p.legL.rotation.x = swing;
  p.legR.rotation.x = -swing;
  p.armL.rotation.x = -swing * 0.8;
  p.armR.rotation.x = swing * 0.8;
  if (p.punchTimer > 0) {
    p.punchTimer -= dt;
    p.armR.rotation.x = -1.4;
  }
  p.gun.visible = G.combat.weapon !== 'fists';
  // Enter a nearby car.
  if (input.enterPressed) {
    const car = nearestCar(G, p.x, p.z, 4.2);
    if (car) enterCar(G, car);
  }
}

export function nearestCar(G, x, z, maxDist) {
  let best = null, bd = maxDist * maxDist;
  for (const car of G.vehicles.all) {
    const d = (car.x - x) ** 2 + (car.z - z) ** 2;
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}

export function enterCar(G, car) {
  const p = G.player;
  p.car = car;
  car.parked = false;
  car.driver = p;
  p.mesh.visible = false;
  // The car keeps its own heading; the player turns to face it.
  p.heading = car.heading;
  G.audio.door();
  if (car.locked) {
    car.locked = false;
    G.wanted.addHeat(12, 'car theft');
    G.hud.toast('You smashed the window — someone called it in!');
    G.audio.alarm();
  } else if (car.wasMoving) {
    G.wanted.addHeat(10, 'carjacking');
    G.hud.toast('Carjacked!');
  } else {
    G.hud.toast('In the car. Drive!');
  }
  G.hud.showSpeed(true);
  G.hud.setWeapon(G.combat.weapon);
}

export function exitCar(G) {
  const p = G.player;
  if (!p.car) return;
  const car = p.car;
  p.car = null;
  car.driver = null;
  const side = Math.cos(car.heading);
  p.x = car.x - Math.sin(car.heading) * 2.4;
  p.z = car.z - Math.cos(car.heading) * 2.4;
  const fixed = collideCircle(G.city, p.x, p.z, 0.55);
  p.x = fixed.x; p.z = fixed.z;
  p.mesh.position.set(p.x, 0, p.z);
  p.mesh.visible = true;
  p.heading = car.heading;
  G.audio.door();
  G.hud.showSpeed(false);
  G.hud.setWeapon(G.combat.weapon);
}

/** Third-person camera: chase behind the car, shoulder view on foot. */
export function updateCamera(G, dt) {
  const p = G.player;
  const cam = G.camera;
  let target, dist, height, lookY;
  if (p.car) {
    const car = p.car;
    const back = 7.2 + Math.abs(car.speed) * 0.07;
    const tx = car.x - Math.sin(car.heading) * back;
    const tz = car.z - Math.cos(car.heading) * back;
    target = { x: tx, z: tz, y: 3.0 + Math.abs(car.speed) * 0.015 };
    dist = back; height = 3.0; lookY = 1.2;
    // FOV kick with speed.
    const wantFov = 62 + clamp(Math.abs(car.speed) / 42, 0, 1) * 9;
    if (Math.abs(cam.fov - wantFov) > 0.1) {
      cam.fov += (wantFov - cam.fov) * Math.min(1, dt * 4);
      cam.updateProjectionMatrix();
    }
  } else {
    const tx = p.x - Math.sin(p.camYaw) * Math.cos(p.camPitch) * p.camDist;
    const tz = p.z - Math.cos(p.camYaw) * Math.cos(p.camPitch) * p.camDist;
    target = { x: tx, z: tz, y: 2 + Math.sin(p.camPitch) * p.camDist };
    dist = p.camDist; height = 2; lookY = 1.4;
    if (Math.abs(cam.fov - 62) > 0.1) { cam.fov = 62; cam.updateProjectionMatrix(); }
  }
  const k = 1 - Math.exp(-dt * 7);
  cam.position.x += (target.x - cam.position.x) * k;
  cam.position.y += (target.y - cam.position.y) * k;
  cam.position.z += (target.z - cam.position.z) * k;
  const look = p.car ? { x: p.car.x, y: lookY, z: p.car.z } : { x: p.x, y: lookY, z: p.z };
  cam.lookAt(look.x, look.y, look.z);
  if (G.effects.shakeTime > 0) {
    cam.position.x += (Math.random() - 0.5) * 0.3;
    cam.position.y += (Math.random() - 0.5) * 0.3;
  }
}
