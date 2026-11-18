// Combat: the pistol, melee, enemy thugs, tracers and hit feedback.
// Shooting is a raycast from the camera through the crosshair; enemies are the
// marina crew in mission 4 plus any thug the story spawns.
import { clamp } from './util.js';
import { damagePlayer } from './police.js';

const THREE = window.THREE;

export function createCombat(G) {
  return {
    weapon: 'fists', // 'fists' | 'pistol'
    ammo: 0,
    reserve: 0,
    lastShotTime: -99,
    shotsFiredRecently: false,
    enemies: [],
    shootCooldown: 0,
    givePistol(ammo) {
      this.weapon = 'pistol';
      this.ammo = ammo;
      this.reserve = 48;
      G.hud.setWeapon('pistol', this.ammo, this.reserve);
    },
    reload() {
      if (this.weapon !== 'pistol' || this.ammo >= 12 || this.reserve <= 0) return;
      const need = Math.min(12 - this.ammo, this.reserve);
      this.ammo += need;
      this.reserve -= need;
      G.audio.reload();
      G.hud.setWeapon('pistol', this.ammo, this.reserve);
    },
    punch() {
      const p = G.player;
      p.punchTimer = 0.35;
      G.audio.swing();
      // Hit the nearest enemy or ped within reach.
      for (const e of this.enemies) {
        if (e.health > 0 && Math.hypot(e.x - p.x, e.z - p.z) < 2.2) {
          e.health -= 34;
          G.effects.sparks(e.x, 1.4, e.z, 8);
          G.audio.hit();
          if (e.health <= 0) killEnemy(G, e);
          return;
        }
      }
    },
    shoot() {
      if (this.weapon !== 'pistol' || this.shootCooldown > 0) return;
      if (this.ammo <= 0) { G.audio.click(); this.reload(); return; }
      this.shootCooldown = 0.22;
      this.ammo -= 1;
      this.lastShotTime = G.time;
      this.shotsFiredRecently = true;
      G.audio.shot(false);
      G.effects.muzzle(G.player);
      const cam = G.camera;
      const dir = new THREE.Vector3();
      cam.getWorldDirection(dir);
      const origin = cam.position.clone();
      const ray = new THREE.Raycaster(origin, dir, 0.1, 120);
      // Test enemies first.
      let hitEnemy = null, hitDist = Infinity;
      for (const e of this.enemies) {
        if (e.health <= 0) continue;
        const toE = new THREE.Vector3(e.x - origin.x, 1.3 - origin.y, e.z - origin.z);
        const along = toE.dot(dir);
        if (along < 0 || along > 120) continue;
        const perp = toE.clone().addScaledVector(dir, -along).length();
        if (perp < 1.1 && along < hitDist) { hitDist = along; hitEnemy = e; }
      }
      if (hitEnemy) {
        hitEnemy.health -= 34;
        const hx = origin.x + dir.x * hitDist, hy = origin.y + dir.y * hitDist, hz = origin.z + dir.z * hitDist;
        G.effects.tracer(origin, new THREE.Vector3(hx, hy, hz));
        G.effects.sparks(hx, hy, hz, 10);
        G.audio.hit();
        if (hitEnemy.health <= 0) killEnemy(G, hitEnemy);
      } else {
        const end = origin.clone().addScaledVector(dir, 60);
        G.effects.tracer(origin, end);
      }
      G.effects.shake(0.12);
      G.hud.setWeapon('pistol', this.ammo, this.reserve);
      if (this.ammo === 0) G.hud.toast('Out of ammo — press R to reload');
    },
    /** An enemy or officer fires at the player; simple hit chance by distance. */
    enemyShot(fx, fy, fz, tx, ty, tz) {
      const from = new THREE.Vector3(fx, fy, fz);
      const to = new THREE.Vector3(tx, ty, tz);
      G.effects.tracer(from, to);
      const dist = from.distanceTo(to);
      if (Math.random() < clamp(0.55 - dist * 0.012, 0.08, 0.5)) {
        damagePlayer(G, 8 + Math.random() * 6);
        G.audio.hit();
      }
    },
  };
}

export function spawnEnemy(G, x, z, opts = {}) {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: opts.color ?? 0x3a3a3a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.88, 0.38), jacket);
  body.position.y = 1.05;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), new THREE.MeshLambertMaterial({ color: 0xc98d64 }));
  head.position.y = 1.72;
  g.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.24), new THREE.MeshLambertMaterial({ color: 0x222222 }));
  legL.position.set(-0.16, 0.38, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.16;
  g.add(legR);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.42), new THREE.MeshLambertMaterial({ color: 0x111111 }));
  gun.position.set(0.44, 0.9, 0.2);
  g.add(gun);
  g.position.set(x, 0, z);
  G.scene.add(g);
  const enemy = {
    mesh: g, x, z, heading: 0, health: opts.health ?? 100,
    shootTimer: 1 + Math.random(), walkPhase: 0, legL, legR,
    bar: null,
  };
  // Health bar sprite above the head.
  const barGeo = new THREE.PlaneGeometry(1.1, 0.12);
  const barMat = new THREE.MeshBasicMaterial({ color: 0xff3333 });
  const bar = new THREE.Mesh(barGeo, barMat);
  bar.position.y = 2.25;
  g.add(bar);
  enemy.bar = bar;
  G.combat.enemies.push(enemy);
  return enemy;
}

function killEnemy(G, e) {
  e.health = 0;
  e.mesh.rotation.x = -Math.PI / 2;
  e.mesh.position.y = 0.3;
  if (e.bar) e.bar.visible = false;
  G.effects.sparks(e.x, 1, e.z, 12);
  G.wanted.addHeat(8, 'a shooting');
  G.money += 25;
  G.hud.setCash(G.money);
  G.hud.toast('+$25 picked up');
}

/** Enemies advance on the player and shoot when in range. */
export function stepEnemies(G, dt) {
  const p = G.player;
  for (const e of G.combat.enemies) {
    if (e.health <= 0) continue;
    const dx = p.x - e.x, dz = p.z - e.z;
    const dist = Math.hypot(dx, dz);
    e.heading = Math.atan2(dx, dz);
    if (dist > 16) {
      e.x += Math.sin(e.heading) * 4.2 * dt;
      e.z += Math.cos(e.heading) * 4.2 * dt;
      e.walkPhase += dt * 8;
    } else {
      e.shootTimer -= dt;
      if (e.shootTimer <= 0) {
        e.shootTimer = 1.1 + Math.random() * 0.9;
        G.combat.enemyShot(e.x, 1.4, e.z, p.x, 1.3, p.z);
        G.audio.shot(true);
      }
    }
    e.mesh.position.set(e.x, 0, e.z);
    e.mesh.rotation.y = e.heading;
    e.legL.rotation.x = Math.sin(e.walkPhase) * 0.5;
    e.legR.rotation.x = -Math.sin(e.walkPhase) * 0.5;
    if (e.bar) {
      e.bar.scale.x = Math.max(0.05, e.health / 100);
      e.bar.lookAt(G.camera.position);
    }
  }
}
