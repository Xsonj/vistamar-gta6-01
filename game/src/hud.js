// HUD: DOM panels (health, cash, wanted stars, weapon, speed, objective, dialogue,
// toasts) and the live 2D minimap canvas.
import { money } from './util.js';
import { CITY_HALF } from './city.js';

export function createHud(G) {
  const $ = id => document.getElementById(id);
  const el = {
    cash: $('cash'), healthfill: $('healthfill'), armor: $('armor'),
    wanted: $('wanted'), weapon: $('weapon'), speed: $('speed'),
    objective: $('objective'), dialog: $('dialog'), toast: $('toast'),
    crosshair: $('crosshair'), vignette: $('vignette'), hint: $('hint'),
    minimap: $('minimap'), status: $('status'),
  };
  const mm = el.minimap.getContext('2d');
  let dialogTimer = 0;
  let toastTimer = 0;
  let objectiveBase = '';
  const hud = {
    announce(msg) { el.status.textContent = msg; },
    setCash(v) { el.cash.textContent = money(v); },
    setHealth(h, max, armor) {
      const pct = Math.max(0, h / max) * 100;
      el.healthfill.style.width = pct + '%';
      el.healthfill.style.background = pct > 50 ? 'linear-gradient(90deg,#37d67a,#a5e635)' : pct > 25 ? 'linear-gradient(90deg,#f59e0b,#fbbf24)' : 'linear-gradient(90deg,#dc2626,#ef4444)';
      el.armor.textContent = armor > 0 ? `Armor ${Math.round(armor)}` : '';
    },
    setWanted(stars) {
      let s = '';
      for (let i = 0; i < 5; i++) s += i < stars ? '★' : '<span class="off">★</span>';
      el.wanted.innerHTML = s;
    },
    setWeapon(name, ammo, reserve) {
      const label = name === 'pistol' ? `Pistol — ${ammo} / ${reserve}` : 'Fists';
      el.weapon.textContent = label;
      el.crosshair.style.display = name === 'pistol' ? 'block' : 'none';
    },
    showSpeed(show) { el.speed.style.display = show ? 'block' : 'none'; },
    setSpeed(mph) { el.speed.innerHTML = `${Math.round(mph)}<small> MPH</small>`; },
    setObjective(text) {
      objectiveBase = text;
      if (!text) { el.objective.style.display = 'none'; return; }
      el.objective.style.display = 'block';
      el.objective.innerHTML = `<b>MISSION</b> ${text}`;
    },
    setObjectiveDistance(m) {
      if (!objectiveBase) return;
      el.objective.innerHTML = `<b>MISSION</b> ${objectiveBase} &nbsp;·&nbsp; ${m}m`;
    },
    queueDialog(who, text) {
      hud._dialogQueue = hud._dialogQueue || [];
      hud._dialogQueue.push([who, text]);
    },
    toast(text) {
      el.toast.textContent = text;
      el.toast.style.display = 'block';
      toastTimer = 3;
    },
    flashDamage() {
      el.vignette.style.boxShadow = 'inset 0 0 120px 40px rgba(200,0,0,0.55)';
      setTimeout(() => { el.vignette.style.boxShadow = 'inset 0 0 120px 40px rgba(200,0,0,0)'; }, 180);
    },
    drawMinimap() {
      const S = 190, half = CITY_HALF + 20;
      const toMap = (x, z) => [S / 2 + (x / half) * (S / 2), S / 2 + (z / half) * (S / 2)];
      mm.clearRect(0, 0, S, S);
      mm.fillStyle = '#0e1a2e';
      mm.fillRect(0, 0, S, S);
      // Ocean + beach on the west edge.
      mm.fillStyle = '#2a7ab8';
      mm.fillRect(0, 0, 14, S);
      mm.fillStyle = '#e8d29a';
      mm.fillRect(14, 0, 5, S);
      // Roads.
      mm.strokeStyle = '#5a6270';
      mm.lineWidth = 4;
      for (let k = -4; k <= 4; k++) {
        const [x1, y1] = toMap(k * 52, -half);
        const [x2, y2] = toMap(k * 52, half);
        mm.beginPath(); mm.moveTo(x1, y1); mm.lineTo(x2, y2); mm.stroke();
        const [x3, y3] = toMap(-half, k * 52);
        const [x4, y4] = toMap(half, k * 52);
        mm.beginPath(); mm.moveTo(x3, y3); mm.lineTo(x4, y4); mm.stroke();
      }
      // Mission marker.
      const M = G.missions;
      let mx = null, mz = null;
      if (M.active) {
        const step = M.active.mission.steps[M.active.stepIndex];
        if (step.x !== undefined) { mx = step.x; mz = step.z; }
        else if (M.active.mission.id === 'hotwheels') { mx = G.vehicles.sports.x; mz = G.vehicles.sports.z; }
        else { mx = G.city.landmarks.marina.x; mz = G.city.landmarks.marina.z; }
      } else if (M.fareActive && M.fareMarker) { mx = M.fareMarker.x; mz = M.fareMarker.z; }
      if (mx !== null) {
        const [px2, py2] = toMap(mx, mz);
        mm.fillStyle = '#ffd23f';
        mm.beginPath(); mm.arc(px2, py2, 5 + Math.sin(G.time * 5) * 1.5, 0, Math.PI * 2); mm.fill();
        mm.strokeStyle = '#fff'; mm.lineWidth = 1.5; mm.stroke();
      }
      // Traffic dots.
      mm.fillStyle = '#cbd5e1';
      for (const car of G.vehicles.traffic) {
        const [cx, cy] = toMap(car.x, car.z);
        mm.fillRect(cx - 1.5, cy - 1.5, 3, 3);
      }
      // Enemies.
      mm.fillStyle = '#ff5555';
      for (const e of G.combat.enemies) {
        if (e.health <= 0) continue;
        const [ex, ey] = toMap(e.x, e.z);
        mm.fillRect(ex - 2, ey - 2, 4, 4);
      }
      // Police: flashing.
      const flash = Math.sin(G.time * 10) > 0;
      mm.fillStyle = flash ? '#ff3333' : '#3388ff';
      for (const cop of G.wanted.cops) {
        const [cx, cy] = toMap(cop.x, cop.z);
        mm.beginPath(); mm.arc(cx, cy, 3.5, 0, Math.PI * 2); mm.fill();
      }
      // Player arrow.
      const p = G.player;
      const [px3, py3] = toMap(p.car ? p.car.x : p.x, p.car ? p.car.z : p.z);
      const heading = p.car ? p.car.heading : p.heading;
      mm.save();
      mm.translate(px3, py3);
      mm.rotate(heading);
      mm.fillStyle = '#fff';
      mm.beginPath(); mm.moveTo(0, -7); mm.lineTo(5, 6); mm.lineTo(-5, 6); mm.closePath(); mm.fill();
      mm.restore();
      // North tick.
      mm.fillStyle = '#fff';
      mm.font = 'bold 11px sans-serif';
      mm.fillText('N', S / 2 - 4, 12);
    },
    step(dt) {
      if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) el.toast.style.display = 'none'; }
      if (dialogTimer > 0) {
        dialogTimer -= dt;
        if (dialogTimer <= 0) el.dialog.style.display = 'none';
      }
      if (dialogTimer <= 0 && hud._dialogQueue && hud._dialogQueue.length) {
        const [who, text] = hud._dialogQueue.shift();
        el.dialog.innerHTML = `<span class="who">${who}:</span> ${text}`;
        el.dialog.style.display = 'block';
        dialogTimer = 4.5;
      }
      this.drawMinimap();
    },
  };
  return hud;
}
