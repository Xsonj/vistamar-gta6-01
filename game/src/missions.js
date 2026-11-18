// Story missions for Mara Voss and fixer Rocco "Rook" Hale, plus a free-roam
// fare side activity. Each mission is a chain of steps: drive to a marker, steal
// a car, pick someone up, survive a chase, or clear out armed crew.
import { money } from './util.js';
import { spawnEnemy } from './combat.js';

const THREE = window.THREE;

const MISSIONS = [
  {
    id: 'fare', title: 'First Fare', reward: 150,
    brief: [
      ['Rook', 'Mara. You are back in Vistamar, and you owe me. First job is easy: pick up my client at the plaza and drive her to the marina. Do not scratch the paint.'],
      ['Mara', 'Easy money. I am on my way.'],
    ],
    steps: [
      { type: 'goto', x: 0, z: -8, r: 6, text: 'Pick up the client at the plaza', needCar: false },
      { type: 'goto', x: 190, z: 190, r: 8, text: 'Drive the client to the marina', needCar: true },
    ],
  },
  {
    id: 'hotwheels', title: 'Hot Wheels', reward: 400,
    brief: [
      ['Rook', 'A red Comet GT is parked by the marina. Locked, alarmed, worth a fortune. Bring it to the chop shop on the north side. The owner will notice. The cops will notice.'],
      ['Mara', 'So drive fast. Got it.'],
    ],
    steps: [
      { type: 'steal', text: 'Steal the Comet GT at the marina' },
      { type: 'deliver', x: 104, z: -208, r: 9, text: 'Deliver the Comet GT to the chop shop', needCar: true },
    ],
  },
  {
    id: 'getaway', title: 'The Getaway', reward: 800,
    brief: [
      ['Rook', 'The crew hit the Meridian Bank and the whole VPD is rolling. Pick them up at the safehouse and get them to the yacht before the roadblocks close. Three stars, minimum.'],
      ['Mara', 'Tell them to run. I do not wait.'],
    ],
    steps: [
      { type: 'goto', x: -104, z: 156, r: 7, text: 'Pick up the crew at the safehouse', needCar: true },
      { type: 'escape', x: -240, z: 156, r: 10, text: 'Escape to the yacht — lose the heat!', needCar: true, heat: 60 },
    ],
  },
  {
    id: 'bigscore', title: 'The Big Score', reward: 1500,
    brief: [
      ['Rook', 'Last one. The Marinos are moving their cash through the marina tonight. Take the crew down, grab the case, and bring it to the yacht. Then we are square, Mara.'],
      ['Mara', 'Square. And then Vistamar is mine.'],
    ],
    steps: [
      { type: 'goto', x: 190, z: 190, r: 9, text: 'Reach the marina — the Marinos are waiting', needCar: false },
      { type: 'clear', text: 'Take down the Marino crew (4 left)' },
      { type: 'escape', x: -240, z: 156, r: 10, text: 'Take the case to the yacht!', needCar: false, heat: 80 },
    ],
  },
];

export function createMissions(G) {
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 30, 20, 1, true), beaconMat);
  beacon.visible = false;
  G.scene.add(beacon);
  const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(1.2), new THREE.MeshBasicMaterial({ color: 0xffd23f, emissive: 0xffaa00, emissiveIntensity: 1 }));
  diamond.visible = false;
  G.scene.add(diamond);
  return {
    list: MISSIONS,
    index: 0,           // next mission to start
    active: null,       // { mission, step, dialogQueue }
    stepIndex: 0,
    beacon, diamond,
    fareMarker: null, fareActive: false,
    completed: 0,
    start(i) {
      const m = MISSIONS[i];
      if (!m) return;
      this.active = { mission: m, stepIndex: 0 };
      this.stepIndex = 0;
      G.hud.setObjective(`${m.title} — ${m.steps[0].text}`);
      for (const [who, text] of m.brief) G.hud.queueDialog(who, text);
      this.placeBeacon();
      if (m.id === 'hotwheels') G.hud.toast('The Comet GT is the red sports car at the marina');
      if (m.id === 'bigscore') G.combat.givePistol(36);
      G.hud.announce(`Mission started: ${m.title}`);
    },
    placeBeacon() {
      if (!this.active) { this.beacon.visible = false; this.diamond.visible = false; return; }
      const step = this.active.mission.steps[this.active.stepIndex];
      if (step.x === undefined) {
        // Steal / clear steps: beacon on the sports car or the marina.
        const t = this.active.mission.id === 'hotwheels' ? G.vehicles.sports : G.city.landmarks.marina;
        this.beacon.position.set(t.x ?? t.x, 15, t.z ?? t.z);
        this.diamond.position.set(t.x ?? t.x, 8, t.z ?? t.z);
      } else {
        this.beacon.position.set(step.x, 15, step.z);
        this.diamond.position.set(step.x, 8, step.z);
      }
      this.beacon.visible = true;
      this.diamond.visible = true;
    },
    advance() {
      const m = this.active.mission;
      this.active.stepIndex += 1;
      this.stepIndex = this.active.stepIndex;
      if (this.active.stepIndex >= m.steps.length) {
        this.complete();
        return;
      }
      const step = m.steps[this.active.stepIndex];
      G.hud.setObjective(`${m.title} — ${step.text}`);
      if (step.type === 'escape' && step.heat) G.wanted.addHeat(step.heat, 'the job went loud');
      if (step.type === 'clear') {
        const mx = G.city.landmarks.marina.x, mz = G.city.landmarks.marina.z;
        for (const [ox, oz] of [[-8, -6], [8, -4], [-4, 8], [10, 6]]) spawnEnemy(G, mx + ox, mz + oz);
        G.hud.toast('The Marino crew is armed — take them down!');
      }
      this.placeBeacon();
    },
    complete() {
      const m = this.active.mission;
      G.money += m.reward;
      this.completed += 1;
      G.hud.setCash(G.money);
      G.hud.toast(`Mission complete: ${m.title}  +${money(m.reward)}`);
      G.audio.missionComplete();
      G.hud.setObjective('');
      this.beacon.visible = false;
      this.diamond.visible = false;
      this.active = null;
      this.index += 1;
      G.save.save();
      if (this.index < MISSIONS.length) {
        G.hud.queueDialog('Rook', `Good work. Next job is ready when you are — press T to start "${MISSIONS[this.index].title}".`);
      } else {
        G.hud.queueDialog('Rook', 'That is the whole score, Mara. Vistamar is yours now. Fares still pay — keep driving.');
        G.hud.announce('Story complete! Free roam: fares pay $75 a trip.');
        this.spawnFare();
      }
    },
    spawnFare() {
      const x = (Math.random() - 0.5) * 380;
      const z = (Math.random() - 0.5) * 380;
      this.fareMarker = { x, z };
      this.fareActive = true;
      this.beacon.position.set(x, 15, z);
      this.diamond.position.set(x, 8, z);
      this.beacon.visible = true;
      this.diamond.visible = true;
      G.hud.setObjective(`Fare — pick up the passenger (${Math.round(Math.hypot(x - G.player.x, z - G.player.z))}m)`);
    },
  };
}

export function stepMissions(G, dt) {
  const M = G.missions;
  // Beacon pulse.
  if (M.beacon.visible) {
    const s = 1 + Math.sin(G.time * 4) * 0.12;
    M.beacon.scale.set(s, 1, s);
    M.diamond.rotation.y += dt * 2;
    M.diamond.position.y = 8 + Math.sin(G.time * 3) * 0.5;
  }
  const p = G.player;
  const px = p.car ? p.car.x : p.x;
  const pz = p.car ? p.car.z : p.z;
  if (M.active) {
    const step = M.active.mission.steps[M.active.stepIndex];
    if (step.type === 'goto' || step.type === 'deliver' || step.type === 'escape') {
      const inCar = !!p.car;
      const okCar = !step.needCar || inCar;
      const d = Math.hypot(step.x - px, step.z - pz);
      G.hud.setObjectiveDistance(Math.round(d));
      if (d < step.r && okCar) {
        if (step.type === 'escape' && G.wanted.stars > 0 && M.active.mission.id === 'getaway') {
          G.hud.setObjective(`${M.active.mission.title} — Lose the cops first!`);
          return;
        }
        M.advance();
      } else if (d < step.r && !okCar) {
        G.hud.setObjective(`${M.active.mission.title} — Get in a car!`);
      }
    } else if (step.type === 'steal') {
      if (p.car === G.vehicles.sports) M.advance();
    } else if (step.type === 'clear') {
      const left = G.combat.enemies.filter(e => e.health > 0).length;
      G.hud.setObjective(`${M.active.mission.title} — Take down the Marino crew (${left} left)`);
      if (left === 0) M.advance();
    }
  } else if (M.fareActive && M.fareMarker) {
    const d = Math.hypot(M.fareMarker.x - px, M.fareMarker.z - pz);
    G.hud.setObjectiveDistance(Math.round(d));
    if (d < 7) {
      G.money += 75;
      G.hud.setCash(G.money);
      G.hud.toast('Fare complete  +$75');
      G.audio.missionComplete();
      M.spawnFare();
    }
  }
}
