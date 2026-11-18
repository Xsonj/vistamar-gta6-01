// Wanted level and the Vistamar Police Department.
// Heat 0-100 maps to 0-5 stars. Police cars spawn, chase and ram; on-foot officers
// appear at 2+ stars; heat decays when the player is unseen. Busted on foot.
import { clamp, angleDiff } from './util.js';
import { buildCarMesh, stepSiren } from './vehicles.js';
import { collideCircle } from './city.js';

const THREE = window.THREE;

export function createWanted(G) {
  return {
    heat: 0,
    stars: 0,
    cops: [],
    officers: [],
    bustedTimer: 0,
    addHeat(amount, why) {
      const before = this.stars;
      this.heat = clamp(this.heat + amount, 0, 100);
      this.stars = Math.ceil(this.heat / 20);
      if (this.stars > before) {
        G.hud.setWanted(this.stars);
        G.hud.toast(this.stars >= 3 ? 'The whole VPD is after you!' : 'Wanted level up!');
        G.audio.siren(this.stars >= 1);
      }
    },
    decay(dt) {
      if (this.heat <= 0) return;
      const nearCop = this.cops.some(c => Math.hypot(c.x - G.player.x, c.z - G.player.z) < 30);
      if (!nearCop) {
        this.heat = Math.max(0, this.heat - dt * 2.2);
        const s = Math.ceil(this.heat / 20);
        if (s !== this.stars) { this.stars = s; G.hud.setWanted(s); }
        if (this.heat <= 0) G.audio.siren(false);
      }
    },
  };
}

export function spawnCopCarAt(G, x, z) {
  return spawnCopCar(G, x, z);
}

function spawnCopCar(G, x, z) {
  const mesh = buildCarMesh({ color: 0xf5f5f5, police: true });
  mesh.position.set(x, 0, z);
  G.scene.add(mesh);
  const cop = {
    mesh, x, z, heading: 0, speed: 0, maxSpeed: 38, accel: 20,
    health: 100, sirenPhase: Math.random() * 10,
  };
  G.wanted.cops.push(cop);
  return cop;
}

function spawnOfficer(G, x, z) {
  const g = new THREE.Group();
  const navy = new THREE.MeshLambertMaterial({ color: 0x1e3a5f });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.85, 0.36), navy);
  body.position.y = 1.05;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), new THREE.MeshLambertMaterial({ color: 0xe8b48a }));
  head.position.y = 1.72;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.1, 10), navy);
  cap.position.y = 1.9;
  g.add(cap);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.24), navy);
  legL.position.set(-0.16, 0.38, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.16;
  g.add(legR);
  g.position.set(x, 0, z);
  G.scene.add(g);
  const off = { mesh: g, x, z, heading: 0, speed: 0, shootTimer: 1, walkPhase: 0, legL, legR };
  G.wanted.officers.push(off);
  return off;
}

/** Keep the right number of police units for the current star level. */
export function stepPolice(G, dt) {
  const W = G.wanted;
  const p = G.player;
  const px = p.car ? p.car.x : p.x;
  const pz = p.car ? p.car.z : p.z;
  const wantCars = W.stars === 0 ? 0 : Math.min(1 + W.stars, 6);
  while (W.cops.length < wantCars) {
    const a = Math.random() * Math.PI * 2;
    spawnCopCar(G, px + Math.sin(a) * 55, pz + Math.cos(a) * 55);
  }
  while (W.cops.length > wantCars) {
    const cop = W.cops.pop();
    G.scene.remove(cop.mesh);
  }
  const wantOfficers = W.stars >= 2 && !p.car ? Math.min(W.stars - 1, 3) : 0;
  while (W.officers.length < wantOfficers) {
    const a = Math.random() * Math.PI * 2;
    spawnOfficer(G, px + Math.sin(a) * 18, pz + Math.cos(a) * 18);
  }
  while (W.officers.length > wantOfficers) {
    const off = W.officers.pop();
    G.scene.remove(off.mesh);
  }
  // Police cars chase and ram.
  for (const cop of W.cops) {
    const dx = px - cop.x, dz = pz - cop.z;
    const dist = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    cop.heading += clamp(angleDiff(cop.heading, want), -2.2 * dt, 2.2 * dt);
    const targetSpeed = dist > 6 ? cop.maxSpeed : cop.maxSpeed * 0.6;
    cop.speed += clamp(targetSpeed - cop.speed, -18 * dt, cop.accel * dt);
    const nx = cop.x + Math.sin(cop.heading) * cop.speed * dt;
    const nz = cop.z + Math.cos(cop.heading) * cop.speed * dt;
    const fixed = collideCircle(G.city, nx, nz, 1.9);
    cop.x = fixed.x; cop.z = fixed.z;
    cop.mesh.position.set(cop.x, 0, cop.z);
    cop.mesh.rotation.y = cop.heading;
    for (const w of cop.mesh.userData.wheels) w.rotation.x += (cop.speed / 0.38) * dt;
    stepSiren(cop, G.time);
    // Ram the player's car: damage + push.
    if (p.car && dist < 4.6) {
      p.car.speed *= 0.86;
      p.car.x += (p.car.x - cop.x) * 0.06;
      p.car.z += (p.car.z - cop.z) * 0.06;
      p.car.health -= 10 * dt;
      G.effects.sparks(p.car.x, 1, p.car.z, 4);
      G.audio.thud();
      if (p.car.health <= 0) explodeCar(G, p.car);
    }
    // Ram the player on foot: damage, and busted if pinned.
    if (!p.car && dist < 2.4) {
      damagePlayer(G, 12 * dt);
    }
  }
  // Officers chase on foot and shoot.
  for (const off of W.officers) {
    const dx = p.x - off.x, dz = p.z - off.z;
    const dist = Math.hypot(dx, dz);
    off.heading = Math.atan2(dx, dz);
    if (dist > 14) {
      off.speed = 5.5;
      off.x += Math.sin(off.heading) * off.speed * dt;
      off.z += Math.cos(off.heading) * off.speed * dt;
    } else {
      off.speed = 0;
      off.shootTimer -= dt;
      if (off.shootTimer <= 0) {
        off.shootTimer = 1.4 + Math.random();
        G.combat.enemyShot(off.x, 1.4, off.z, p.x, 1.3, p.z);
        G.audio.shot(true);
      }
    }
    off.walkPhase += dt * off.speed * 2;
    off.mesh.position.set(off.x, 0, off.z);
    off.mesh.rotation.y = off.heading;
    off.legL.rotation.x = Math.sin(off.walkPhase) * 0.5;
    off.legR.rotation.x = -Math.sin(off.walkPhase) * 0.5;
    if (!p.car && dist < 2.2) {
      W.bustedTimer += dt;
      if (W.bustedTimer > 2) {
        G.main.busted();
        W.bustedTimer = 0;
      }
    } else {
      W.bustedTimer = Math.max(0, W.bustedTimer - dt);
    }
  }
  W.decay(dt);
}

export function damagePlayer(G, amount) {
  const p = G.player;
  if (p.armor > 0) {
    const absorbed = Math.min(p.armor, amount);
    p.armor -= absorbed;
    amount -= absorbed;
  }
  p.health -= amount;
  G.hud.setHealth(p.health, p.maxHealth, p.armor);
  G.hud.flashDamage();
  if (p.health <= 0) G.main.wasted();
}

/** A car explodes: fireball, smoke, shake, and the driver is thrown clear. */
export function explodeCar(G, car) {
  G.effects.explosion(car.x, 1.2, car.z);
  G.audio.explosion();
  G.effects.shake(0.7);
  car.health = 100;
  car.speed = 0;
  if (G.player.car === car) {
    G.player.car = null;
    G.player.mesh.visible = true;
    G.player.x = car.x + 4;
    G.player.z = car.z + 4;
    G.player.mesh.position.set(G.player.x, 0, G.player.z);
    damagePlayer(G, 25);
    G.hud.showSpeed(false);
  }
  // Move the wreck off the road so it stops blocking traffic.
  car.x += 8;
  car.z += 8;
  car.mesh.position.set(car.x, 0, car.z);
}
