// Vistamar — boot and the one loop.
// Screens: title (attract orbit), play, paused, wasted, busted. The world advances
// in fixed 1/60 s steps. ?seed=N fixes the city; ?shot=chase|street|drive|start
// stages that scene instead of the title and sets window.__shotReady for a screenshot.
import { createRandom, clamp } from './util.js';
import { createCity, CITY_HALF } from './city.js';
import { createVehicles, stepPlayerCar, stepTraffic } from './vehicles.js';
import { createPlayer, stepPlayer, updateCamera, enterCar, exitCar } from './player.js';
import { createPedestrians, stepPedestrians } from './pedestrians.js';
import { createWanted, stepPolice, spawnCopCarAt } from './police.js';
import { createCombat, stepEnemies } from './combat.js';
import { createMissions, stepMissions } from './missions.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import { createSave } from './save.js';

const THREE = window.THREE;
const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261118;

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');

// Renderer, scene, sun-soaked sky.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfe0f2, 240, 760);
{
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#3f7fd0');
  grad.addColorStop(0.55, '#8fc3e8');
  grad.addColorStop(0.8, '#ffd9a0');
  grad.addColorStop(1, '#ffe9c4');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const skyTex = new THREE.CanvasTexture(c);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 16, 12), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }));
  scene.add(sky);
}
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(40, 30, 80);

const sun = new THREE.DirectionalLight(0xffe0b3, 1.25);
sun.position.set(140, 200, 80);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -260; sun.shadow.camera.right = 260;
sun.shadow.camera.top = 260; sun.shadow.camera.bottom = -260;
sun.shadow.camera.far = 600;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.75));

// Input: held keys plus edge-triggered actions consumed once per frame.
const input = {
  forward: false, back: false, left: false, right: false,
  sprint: false, jump: false, handbrake: false,
  enterPressed: false, punchPressed: false, shootHeld: false,
};
const KEYMAP = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
  Space: 'jump',
};
let dragging = false, dragMoved = 0, lastMX = 0, lastMY = 0;
window.addEventListener('keydown', e => {
  if (e.code === 'Space') e.preventDefault();
  if (KEYMAP[e.code] !== undefined) input[KEYMAP[e.code]] = true;
  if (e.code === 'Space' && G.player.car) input.handbrake = true;
  if (e.code === 'KeyE' && !e.repeat) input.enterPressed = true;
  if (e.code === 'KeyF' && !e.repeat) input.punchPressed = true;
  if (e.code === 'KeyR' && !e.repeat) G.combat.reload();
  if (e.code === 'KeyM' && !e.repeat) { const m = G.audio.toggleMute(); G.hud.toast(m ? 'Sound muted' : 'Sound on'); }
  if (e.code === 'KeyV' && !e.repeat) { if (G.save.save()) G.hud.toast('Game saved'); }
  if (e.code === 'KeyT' && !e.repeat) startNextMission();
  if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) togglePause();
});
window.addEventListener('keyup', e => {
  if (KEYMAP[e.code] !== undefined) input[KEYMAP[e.code]] = false;
  if (e.code === 'Space') input.handbrake = false;
});
canvas.addEventListener('mousedown', e => {
  dragging = true; dragMoved = 0; lastMX = e.clientX; lastMY = e.clientY;
  G.audio.unlock();
});
window.addEventListener('mousemove', e => {
  if (!dragging) return;
  const dx = e.clientX - lastMX, dy = e.clientY - lastMY;
  dragMoved += Math.abs(dx) + Math.abs(dy);
  lastMX = e.clientX; lastMY = e.clientY;
  if (!G.player.car) {
    G.player.camYaw -= dx * 0.006;
    G.player.camPitch = clamp(G.player.camPitch + dy * 0.004, -0.1, 1.1);
  }
});
window.addEventListener('mouseup', e => {
  if (dragging && dragMoved < 6 && G.screen === 'play') {
    G.audio.unlock();
    if (G.player.car) { /* driving: no shooting from the car */ }
    else if (G.combat.weapon === 'pistol') G.combat.shoot();
    else G.combat.punch();
  }
  dragging = false;
});
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  G.player.camDist = clamp(G.player.camDist + Math.sign(e.deltaY) * 1.2, 4, 13);
}, { passive: false });
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && G.screen === 'play') togglePause();
});

// The game object every system shares.
const G = {
  seed, time: 0, screen: 'title',
  scene, camera, renderer, input,
  rng: createRandom(seed + 5),
  money: 250,
  city: null, vehicles: null, player: null, peds: [],
  wanted: null, combat: null, missions: null, hud: null, audio: null, effects: null, save: null,
  main: null,
};
G.city = createCity(scene, seed);
G.vehicles = createVehicles(G);
G.player = createPlayer(G, 10, 14);
G.peds = createPedestrians(G, 24);
G.wanted = createWanted(G);
G.combat = createCombat(G);
G.missions = createMissions(G);
G.hud = createHud(G);
G.audio = createAudio();
G.effects = createEffects(G);
G.save = createSave(G);
G.main = {
  wasted() {
    if (G.screen !== 'play') return;
    G.screen = 'dead';
    document.getElementById('dead-title').textContent = 'WASTED';
    document.getElementById('dead-text').textContent = 'Mara went down in Vistamar. The hospital patched her up — for a fee.';
    showOverlay('screen-dead');
    G.audio.siren(false);
    G.hud.announce('Wasted. Respawning at the hospital.');
  },
  busted() {
    if (G.screen !== 'play') return;
    G.screen = 'dead';
    document.getElementById('dead-title').textContent = 'BUSTED';
    document.getElementById('dead-text').textContent = 'The VPD hauled Mara in. Bail was not cheap.';
    showOverlay('screen-dead');
    G.audio.siren(false);
    G.hud.announce('Busted. Respawning at the police station.');
  },
};

function showOverlay(id) {
  for (const oid of ['screen-title', 'screen-pause', 'screen-dead']) {
    document.getElementById(oid).style.display = oid === id ? 'flex' : 'none';
  }
  document.getElementById('hud').style.display = id ? 'none' : 'block';
}
function hideOverlays() {
  for (const oid of ['screen-title', 'screen-pause', 'screen-dead']) {
    document.getElementById(oid).style.display = 'none';
  }
  document.getElementById('hud').style.display = 'block';
}

function respawn() {
  const p = G.player;
  if (p.car) { p.car = null; p.mesh.visible = true; }
  p.health = p.maxHealth;
  p.armor = 0;
  G.money = Math.max(0, G.money - 200);
  G.wanted.heat = 0; G.wanted.stars = 0;
  G.hud.setWanted(0);
  for (const cop of G.wanted.cops) G.scene.remove(cop.mesh);
  G.wanted.cops.length = 0;
  for (const off of G.wanted.officers) G.scene.remove(off.mesh);
  G.wanted.officers.length = 0;
  p.x = G.city.landmarks.hospital.x;
  p.z = G.city.landmarks.hospital.z;
  p.mesh.position.set(p.x, 0, p.z);
  G.hud.setHealth(p.health, p.maxHealth, 0);
  G.hud.setCash(G.money);
  G.hud.showSpeed(false);
  hideOverlays();
  G.screen = 'play';
  G.audio.siren(false);
  statusEl.textContent = 'Respawned at the hospital.';
}

function startNextMission() {
  if (G.screen !== 'play') return;
  if (!G.missions.active && G.missions.index < G.missions.list.length) {
    G.missions.start(G.missions.index);
  }
}

function togglePause() {
  if (G.screen === 'play') {
    G.screen = 'pause';
    showOverlay('screen-pause');
    statusEl.textContent = 'Paused.';
  } else if (G.screen === 'pause') {
    G.screen = 'play';
    hideOverlays();
    statusEl.textContent = 'Playing.';
  }
}

function startGame(newGame) {
  G.audio.unlock();
  hideOverlays();
  G.screen = 'play';
  if (newGame) {
    G.save.clear();
    G.money = 250;
    G.player.health = 100;
    G.player.armor = 0;
    G.player.x = 10; G.player.z = 14;
    G.player.mesh.position.set(10, 0, 14);
    G.missions.index = 0;
    G.missions.completed = 0;
    G.missions.active = null;
    G.wanted.heat = 0; G.wanted.stars = 0;
  } else {
    const s = G.save.load();
    if (s) {
      G.money = s.money ?? 250;
      G.player.health = s.health ?? 100;
      G.player.x = s.x ?? 10;
      G.player.z = s.z ?? 14;
      G.player.mesh.position.set(G.player.x, 0, G.player.z);
      G.missions.index = s.missionIndex ?? 0;
      G.missions.completed = s.missionsDone ?? 0;
    }
  }
  G.hud.setCash(G.money);
  G.hud.setHealth(G.player.health, G.player.maxHealth, G.player.armor);
  G.hud.setWanted(G.wanted.stars);
  G.hud.setWeapon(G.combat.weapon, G.combat.ammo, G.combat.reserve);
  if (!G.missions.active && G.missions.index < G.missions.list.length) {
    G.missions.start(G.missions.index);
  }
  statusEl.textContent = 'Playing. Follow the gold marker.';
}

document.getElementById('btn-new').addEventListener('click', () => startGame(true));
document.getElementById('btn-continue').addEventListener('click', () => startGame(false));
document.getElementById('btn-resume').addEventListener('click', togglePause);
document.getElementById('btn-save').addEventListener('click', () => { if (G.save.save()) G.hud.toast('Game saved'); });
document.getElementById('btn-quit').addEventListener('click', () => {
  G.screen = 'title';
  showOverlay('screen-title');
  document.getElementById('btn-continue').style.display = G.save.has() ? 'inline-block' : 'none';
});
document.getElementById('btn-respawn').addEventListener('click', respawn);

// Title screen: hide Continue when there is no save yet.
document.getElementById('btn-continue').style.display = G.save.has() ? 'inline-block' : 'none';

/** One fixed step of the living world. */
function stepWorld(dt) {
  G.time += dt;
  stepTraffic(G, dt);
  stepPedestrians(G, dt);
  stepPolice(G, dt);
  stepEnemies(G, dt);
  stepMissions(G, dt);
  G.effects.step(dt);
  if (G.player.car) {
    // Staged driving shots cruise forward on their own so the scene stays alive.
    const driveInput = G.cruise ? { ...input, forward: true } : input;
    stepPlayerCar(G, G.player.car, driveInput, dt);
    G.hud.setSpeed(Math.abs(G.player.car.speed) * 2.237);
  } else {
    stepPlayer(G, dt);
    G.audio.setEngine(0, false);
  }
  if (input.enterPressed && G.player.car) exitCar(G);
  if (input.punchPressed && !G.player.car && G.combat.weapon === 'fists') G.combat.punch();
  G.combat.shootCooldown = Math.max(0, G.combat.shootCooldown - dt);
  G.combat.shotsFiredRecently = G.time - G.combat.lastShotTime < 2;
  // Consume edge-triggered actions.
  input.enterPressed = false;
  input.punchPressed = false;
  updateCamera(G, dt);
  G.hud.step(dt);
}

// Screenshot staging: deterministic scenes, no title screen.
function stageShot(name) {
  G.screen = 'play';
  hideOverlays();
  const p = G.player;
  if (name === 'start') {
    G.screen = 'title';
    showOverlay('screen-title');
    return;
  }
  if (name === 'chase') {
    // Mara in the red sports car, three units on her tail, 3 stars.
    // Start mid-downtown so the shot still has buildings around after the cruise.
    G.cruise = true;
    G.cruiseSpeed = 20;
    const car = G.vehicles.sports;
    car.x = 0; car.z = 104; car.heading = Math.PI; car.speed = 18;
    // Two units ahead in the frame, closing in from the front.
    spawnCopCarAt(G, -9, 62);
    spawnCopCarAt(G, 11, 48);
    car.mesh.position.set(0, 0, -40);
    enterCar(G, car);
    G.wanted.addHeat(55, 'staged chase');
    G.missions.start(1);
    G.missions.active.stepIndex = 1;
    G.missions.placeBeacon();
    G.hud.setObjective('Hot Wheels — Deliver the Comet GT to the chop shop');
    G.hud.queueDialog('Rook', 'Drive, Mara! The whole VPD is on your tail!');
  } else if (name === 'street') {
    // Mara on the plaza road looking north down the avenue, peds nearby.
    p.x = 8; p.z = 26;
    p.mesh.position.set(8, 0, 26);
    p.camYaw = Math.PI * 0.92;
    p.heading = Math.PI;
    p.mesh.rotation.y = Math.PI;
    const near = [[2, 16], [-6, 32], [14, 36], [-2, 8]];
    G.peds.slice(0, 4).forEach((ped, i) => {
      ped.x = near[i][0]; ped.z = near[i][1];
      ped.targetX = near[i][0]; ped.targetZ = near[i][1] - 20;
      ped.mesh.position.set(ped.x, 0, ped.z);
    });
    G.missions.start(0);
    G.hud.queueDialog('Rook', 'Pick up my client at the plaza. Do not scratch the paint.');
  } else if (name === 'drive') {
    G.cruise = true;
    G.cruiseSpeed = 16;
    const car = G.vehicles.starter;
    car.x = -52; car.z = 104; car.heading = Math.PI; car.speed = 14;
    car.mesh.position.set(26, 0, 26);
    enterCar(G, car);
    G.missions.start(0);
    G.missions.active.stepIndex = 1;
    G.missions.placeBeacon();
    G.hud.setObjective('First Fare — Drive the client to the marina');
  }
  G.hud.setCash(G.money);
  G.hud.setHealth(p.health, p.maxHealth, p.armor);
  G.hud.setWanted(G.wanted.stars);
}

let accumulator = 0;
let last = performance.now();
let frames = 0;
let shotReadyAt = shot ? 25 : -1;

function frame(now) {
  requestAnimationFrame(frame);
  accumulator += Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  if (G.screen === 'play') {
    while (accumulator >= STEP) {
      stepWorld(STEP);
      accumulator -= STEP;
    }
  } else if (G.screen === 'title') {
    // Attract mode: slow orbit over the plaza while traffic moves.
    G.time += 1 / 60;
    stepTraffic(G, 1 / 60);
    stepPedestrians(G, 1 / 60);
    G.effects.step(1 / 60);
    const a = G.time * 0.05;
    camera.position.set(Math.sin(a) * 90, 42, Math.cos(a) * 90);
    camera.lookAt(0, 8, 0);
    accumulator = 0;
  } else {
    accumulator = 0;
  }
  renderer.render(scene, camera);
  frames += 1;
  window.__frames = frames;
  if (shotReadyAt > 0 && frames >= shotReadyAt && !window.__shotReady) {
    window.__shotReady = true;
  }
}

if (shot) stageShot(shot);
window.__game = G;
statusEl.textContent = shot ? 'Staged scene.' : 'Vistamar. Press Space or click to start.';
requestAnimationFrame(frame);
