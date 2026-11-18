// Save / load through localStorage: cash, story progress, health, position and
// the car Mara was driving. Autosaves after every mission.
const KEY = 'vistamar-save-v1';

export function createSave(G) {
  return {
    save() {
      try {
        const p = G.player;
        const data = {
          money: Math.floor(G.money),
          missionIndex: G.missions.index,
          missionsDone: G.missions.completed,
          health: Math.round(p.health),
          x: p.car ? p.car.x : p.x,
          z: p.car ? p.car.z : p.z,
          inCar: !!p.car,
          carColor: p.car ? p.car.color : null,
          at: Date.now(),
        };
        window.localStorage.setItem(KEY, JSON.stringify(data));
        return true;
      } catch {
        return false;
      }
    },
    load() {
      try {
        const raw = window.localStorage.getItem(KEY);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
    has() {
      try { return !!window.localStorage.getItem(KEY); } catch { return false; }
    },
    clear() {
      try { window.localStorage.removeItem(KEY); } catch { /* ignore */ }
    },
  };
}
