# Vistamar — product-spec checklist (gta6-01)

Open-world crime game, original city "Vistamar", original story and names.
Every system below is implemented and wired into play; screenshots show several at once.

## 1. Explorable city on foot and by car
- [x] Procedural grid city (city.js): 9x9 blocks, roads, sidewalks, crosswalks,
      buildings of varied height/colour with lit windows, streetlights, palm trees,
      benches, hydrants, billboards; beach + ocean on the west edge, marina, downtown
      towers, suburbs; sun-soaked warm directional light, sky gradient, fog.
- [x] Third-person on-foot character (player.js): WASD move, mouse-drag orbit camera,
      sprint, jump, collision against building AABBs and city bounds.
- [x] Driving (vehicles.js): arcade physics — acceleration, braking, reverse,
      steering that tightens with speed, drift on handbrake, suspension bob, wheel spin.

## 2. Traffic
- [x] Traffic AI (vehicles.js): ~14 cars looping the road graph, lane discipline,
      stop-and-go at junctions, brake when blocked, headlights at dusk, varied colours.
- [x] Parked cars (vehicles.js): stealable, some locked (need to smash window — noise
      raises wanted level).

## 3. Pedestrians
- [x] Pedestrian AI (pedestrians.js): ~24 walkers on sidewalks with random routes,
      idle chatter bubbles, they flee and scream when shots are fired or police chase
      nearby, ragdoll-free fall on being hit by a car (raises wanted level).

## 4. Car stealing
- [x] Enter/exit any nearby car with E (player.js + vehicles.js): parked cars are
      free to take, moving traffic cars can be pulled over and jacked (driver flees),
      stealing in view of police/peds raises wanted stars.

## 5. Wanted level + police response
- [x] Wanted system (police.js): 0–5 stars, heat rises on crimes (steal, assault,
      killing, speeding past police), decays when unseen.
- [x] Police AI (police.js): patrol cars spawn at 1 star, chase and ram the player,
      roadblocks at 3+, on-foot officers with pistols at 2+, helicopter searchlight
      at 4+ (visual), busted screen when caught on foot, wanted clears on escape.

## 6. Missions + story
- [x] Story mission chain (missions.js): 4 missions for fixer Rocco "Rook" Hale,
      starring driver Mara Voss — "First Fare" (drive a client across town),
      "Hot Wheels" (steal a sports car, lose 1-star heat), "The Getaway"
      (pick up the crew, escape a 3-star chase to the safehouse), "The Big Score"
      (shootout at the marina, escape with the loot, 4-star chase to the yacht).
- [x] Objective markers: 3D beacon + HUD compass arrow + distance readout, dialogue
      text boxes, cash rewards per mission, mission fail + retry, free-roam after the
      chain, side activity: taxi fares for cash.

## 7. Combat
- [x] Combat (combat.js): pistol with ammo, mouse aim + click to shoot, raycast hits,
      muzzle flash + tracer + impact sparks, enemy thugs with health bars who shoot
      back, player health + regen, melee punch, wanted rise on killing.

## 8. HUD + minimap
- [x] HUD (hud.js): health bar, cash, wanted stars, weapon + ammo, speedometer in car,
      mission objective panel, dialogue box, damage vignette, radio station label.
- [x] Minimap (hud.js): live 2D canvas map — roads, beach, player arrow, traffic dots,
      police (flashing red/blue), mission marker (gold), north indicator.

## 9. Start screen, pause, save
- [x] Start screen (main.js + index.html): title "VISTAMAR", story intro, controls list,
      Continue (loads save) / New Game buttons, best-stats line.
- [x] Pause menu (main.js): Esc/P pauses, resume / restart / quit-to-title, controls recap.
- [x] Save system (save.js): localStorage autosave after each mission + manual save,
      stores cash, missions done, health, position, current car; Continue restores it.
- [x] Wasted/Busted screens with respawn at the hospital / police station.

## 10. Sound
- [x] Procedural WebAudio (audio.js): engine hum pitched by speed, tyre screech,
      two-tone police siren, gunshot noise burst, footsteps, ambient synthwave music
      loop (chord pad + bass + hats), UI clicks, mute toggle (M), no audio files.

## 11. Polish
- [x] Day lighting: warm sun, long shadows, sky gradient, dusk tint cycling slowly.
- [x] Effects (effects.js): muzzle flash, impact sparks, smoke puffs, explosion fireball
      on car destruction, skid particles, blood-free impact stars, screen shake.
- [x] Camera: smooth chase cam with lag, on-foot shoulder cam, look-back, FOV kick with
      speed, collision-safe (pulls in near buildings).
- [x] Deterministic staging: ?shot=chase|street|drive|start (+&seed=N) stages a scene
      and sets window.__shotReady for screenshots; normal play unaffected.

## Gates (from RULES.txt)
- [x] game/ ≤993 files, ≤48 MiB; index.html ≤1 MiB.
- [x] 4 screenshots, each ≤256 KiB, long side ≤1280, short side ≥480.
- [x] Zero network requests: three.js vendored as game/vendor/three.min.js (UMD .min.js),
      all imports relative or via import map to files inside game/.
- [x] main.ts copies game/ + screenshots/ and writes dossier.json via
      vendor/makefun-game.ts (kit copy, unchanged); MIT LICENSE at root.
- [x] All names/city/story/art original — no Rockstar/GTA names, logos, characters,
      maps or assets anywhere.
