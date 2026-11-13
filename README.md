# Jarvis Force

A vertical-scrolling shoot-'em-up with a star-economy upgrade loop. It's an original game in the classic arcade-shooter genre.

**Story:** Six years after the Collapse, the old defense network has gone rogue as the **Rust Legion**. Jarvis has taken
command of what's left of the air force. He builds the jets, runs the hangar and upgrades, and plans every
sortie, but he can't fly (eleven million simulations, eleven million lakes). You are the human pilot. Rescue
survivors, bring stars home, and push through five sectors to the **Overseer Core**.

## Run it

Plain static files, no build step:

```bash
python3 -m http.server 4905
```

Then open http://localhost:4905. From the umbrella folder's `.claude/launch.json` it's the `jarvis-force` preview.

**Controls:** mouse, or drag anywhere on touch (the ship moves relative to your finger) · WASD/arrows ·
Space/B or the EMP button = EMP charge · P/Esc or the ⏸ button = pause. The ship fires automatically. Only the white dot at the centre of the ship takes hits.

## Content

- **20 missions** across 5 sectors (Drowned Coast, Ash Wastes, Frozen Relay, Overgrown Sprawl, Overseer Core).
  Every mission ends with a boss: a "vanguard" mini-boss on missions 1–3 and a major sector boss on mission 4.
- **5 Star Rush bonus stages** (one per sector, unlocked by beating its boss). No enemy fire, stars everywhere.
- **14 upgrades** in Jarvis's hangar: Pulse Cannon, Autoloader, Wing Guns, Seeker Missiles, Arc Lance (beam),
  Wingman Drones, Hull Plating, Deflector shield, Repair Nanites, EMP Charges, Star Magnet, Salvage Scanner
  (+star value), Targeting Core (crits), Ejection Protocol (one revive per mission).
- **3 difficulties**: Cadet (default, gentle) / Pilot (+30% stars) / Ace (+70% stars).
- **20 Commendations** (one-time star rewards) and a **daily check-in** streak.

### Ways to earn stars
Drone kills · kill-chain multiplier (up to ×3, plus an end-of-mission chain bonus) · survivor rescues ·
supply caches · mission-complete bonus · 5 medals per mission (70% kills, 100% kills, rescue all,
no hull damage, 90% stars collected) + all-five jackpot · Star Rush stages (+first-clear bonus) ·
commendations · daily check-in · difficulty and Salvage Scanner multipliers. Stars are kept even if you're shot down.

### Easier than the genre norm
Tiny hitbox, slower bullets, a recharging shield that blocks the "no damage" penalty, regen, health drops,
an auto-revive upgrade, and the stars-kept-on-death rule.

## Code layout

- `index.html`: DOM screens (menu, mission board, hangar, commendations, story comms, results, pause)
- `style.css`: UI styling
- `game.js`: everything else: save (localStorage key `jarvisforce.save.v1`), upgrade/stat tables, seeded
  level generator (`genLevel`, `genRush`), entities and bosses, rendering (all procedural vector art, no assets),
  results/medals, story text, and Jarvis quips.

`window.JF` exposes the save, run state, `update()` and `startLevel()` for headless balance testing.

## Balance notes (2026-11-13)

A non-dodging test bot clears 1-1 on base gear, and clears 2-4 / 3-4 / 4-4 / 5-4 with roughly 30% / 50% / 70% / 100%
of upgrades bought. Maxing every upgrade costs about 88k stars, and first-time medals alone pay about 75k across the campaign.
