// Particles, tracers, muzzle flash, explosions and screen shake.
// One THREE.Points pool is reused for every burst; tracers are fading lines.
const THREE = window.THREE;

export function createEffects(G) {
  const MAX = 400;
  const positions = new Float32Array(MAX * 3);
  const colors = new Float32Array(MAX * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({ size: 0.2, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  G.scene.add(points);
  const parts = [];
  for (let i = 0; i < MAX; i++) parts.push({ life: 0, x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1 });
  const tracers = [];
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });

  function spawn(x, y, z, vx, vy, vz, r, g, b, life) {
    const p = parts.find(q => q.life <= 0);
    if (!p) return;
    p.life = life; p.x = x; p.y = y; p.z = z;
    p.vx = vx; p.vy = vy; p.vz = vz; p.r = r; p.g = g; p.b = b;
  }

  return {
    shakeTime: 0,
    shake(amount) { this.shakeTime = Math.max(this.shakeTime, amount); },
    sparks(x, y, z, n) {
      for (let i = 0; i < n; i++) {
        spawn(x, y, z, (Math.random() - 0.5) * 9, Math.random() * 7, (Math.random() - 0.5) * 9, 1, 0.8, 0.3, 0.4 + Math.random() * 0.4);
      }
    },
    smoke(x, y, z, n) {
      for (let i = 0; i < n; i++) {
        spawn(x, y, z, (Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2, 0.45, 0.45, 0.5, 1.2 + Math.random());
      }
    },
    explosion(x, y, z) {
      for (let i = 0; i < 60; i++) {
        const a = Math.random() * Math.PI * 2, up = Math.random() * 9 + 2;
        spawn(x, y, z, Math.cos(a) * 8, up, Math.sin(a) * 8, 1, 0.45 + Math.random() * 0.3, 0.1, 0.7 + Math.random() * 0.6);
      }
      for (let i = 0; i < 20; i++) this.smoke(x + (Math.random() - 0.5) * 3, y + 1, z + (Math.random() - 0.5) * 3, 1);
      const light = new THREE.PointLight(0xff7733, 60, 30);
      light.position.set(x, y + 2, z);
      G.scene.add(light);
      setTimeout(() => G.scene.remove(light), 450);
    },
    muzzle(player) {
      const p = player;
      const fx = p.x + Math.sin(p.heading) * 0.8;
      const fz = p.z + Math.cos(p.heading) * 0.8;
      this.sparks(fx, 1.3, fz, 5);
      const light = new THREE.PointLight(0xffe9a8, 12, 8);
      light.position.set(fx, 1.4, fz);
      G.scene.add(light);
      setTimeout(() => G.scene.remove(light), 70);
    },
    tracer(from, to) {
      const geoT = new THREE.BufferGeometry().setFromPoints([from, to]);
      const line = new THREE.Line(geoT, tracerMat.clone());
      line.userData.life = 0.12;
      G.scene.add(line);
      tracers.push(line);
    },
    step(dt) {
      for (let i = 0; i < MAX; i++) {
        const p = parts[i];
        if (p.life > 0) {
          p.life -= dt;
          p.vy -= 9 * dt;
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.3; }
        }
        positions[i * 3] = p.x;
        positions[i * 3 + 1] = p.life > 0 ? p.y : -99;
        positions[i * 3 + 2] = p.z;
        colors[i * 3] = p.r; colors[i * 3 + 1] = p.g; colors[i * 3 + 2] = p.b;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      for (let i = tracers.length - 1; i >= 0; i--) {
        const t = tracers[i];
        t.userData.life -= dt;
        t.material.opacity = Math.max(0, t.userData.life / 0.12) * 0.9;
        if (t.userData.life <= 0) {
          G.scene.remove(t);
          t.geometry.dispose();
          t.material.dispose();
          tracers.splice(i, 1);
        }
      }
      if (this.shakeTime > 0) this.shakeTime -= dt;
    },
  };
}
