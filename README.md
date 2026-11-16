# Jarvis Force

A vertical-scrolling shoot-'em-up with a star-economy upgrade loop. It's an original game in the classic arcade-shooter genre.

**Story:** Six years after the Collapse, the old defense network has gone rogue as the **Rust Legion**. Jarvis has taken
command of what's left of the air force. He builds the jets, runs the hangar and upgrades, and plans every
sortie, but he can't fly (eleven million simulations, eleven million lakes). You are the human pilot. Rescue
survivors, bring stars home, and push through five sectors to the **Overseer Core**.

## Live

- Prod (`main`): https://jarvis-force.dabrewer.dev/
- Dev (`dev`): https://jarvis-force.dabrewer.dev/dev/

The site is on GitHub Pages via `.github/workflows/pages.yml`, which lives on `dev` and publishes `main` to `/` and `dev` to `/dev/`.
A push to `dev` redeploys both. Promote to `main` with a PR.

## Run it

Plain static files, no build step:

```bash
python3 -m http.server 4905
```

Then open http://localhost:4905. From the umbrella folder's `.claude/launch.json` it's the `jarvis-force` preview.

**Controls:** mouse, or drag anywhere on touch (the ship moves relative to your finger) · WASD/arrows ·
Space/B or the EMP button = EMP charge · P/Esc or the ⏸ button = pause. The ship fires automatically. Only the white dot at the centre of the ship takes hits.

## Content

- **20 missions** across 5 sectors, each with its own terrain (`BIOMES` in game.js):
  - Drowned Coast: islands, shallows and drowned tower blocks
  - Ashen Peaks: faceted mountains, volcanoes and lava rivers
  - Frozen Relay: a stormy sea with rolling swell, ice floes, icebergs and radio rigs
  - Overgrown Sprawl: city blocks with overgrown rooftops
  - Overseer Core: machine plating, conduits, data cylinders and vents

  Wave height, volcano count and building height grow through each sector, and each mission in a sector has its own
  light (dawn, day, dusk, night).
  Every mission ends with a boss: a "vanguard" mini-boss on missions 1–3 and a major sector boss on mission 4.
- **3 tiers per mission (Mk I / Mk II / Mk III).** Earn every medal on a tier to unlock the next one. It's the same
  mission (same seed) with extra seeded waves layered on, plus tougher drones, heavier and faster fire, and more damage
  (`TIERS` in game.js), with bigger star and medal payouts. Each tier adds a medal: Mk II = *No EMP used*,
  Mk III = *30-kill chain*. That's 5 + 6 + 7 = 18 medals per mission, 360 in all. The tier picker opens from the
  mission board once a mission has anything past Mk I to show.
- **Fleet of 8 ships.** Ember is the starter. The other 7 (Kestrel, Lifeline, Bulwark, Tempest, Aegis, Phantom, Sovereign)
  are each assembled from 4 parts (Wings, Engine, Cockpit, Reactor) found in blue **salvage crates**. Each part lives on one
  mission and tier (`PART_SPOTS`). Sectors 1–5 Mk I hold Kestrel → Aegis, Mk II holds Phantom and Mk III holds Sovereign.
  Missions with a part still to find show 🔩. Every ship has trade-offs (`SHIPS[].mods`): hull, shield, speed, fire rate,
  damage, rescue speed, magnet, star value, hitbox, recovery time, and a **First Strike barrier** that blocks one hit and
  restores itself. Upgrades apply to every ship. Parts are saved the moment you pick them up.
- **14 enemy types**, including the **Hive** (a carrier that launches drones until destroyed, and retreats when the boss
  arrives), mines that arm near you and burst, snipers with a telegraphed aim line, splitters that break into
  three, and patrolling ground tanks.
- **Unique sector bosses** (`BOSSES`), each with its own silhouette and attack set:
  - Tidebreaker (manta: walls with gaps)
  - Cinder Colossus (flame cone, mine drops)
  - Glacier Maw (splitting ice shards, telegraphed beam)
  - Thornwarden (rotating cross, summons splitters)
  - Overseer (3 phases, with a Hive at phase 2)

  Each sector's vanguard mini-boss uses a subset of its boss's attacks.
- **5 Star Rush bonus stages** (one per sector, unlocked by beating its boss). No enemy fire, stars everywhere.
- **20 upgrades** in Jarvis's hangar: Pulse Cannon, Autoloader, Wing Guns, Seeker Missiles, Arc Lance (beam),
  Wingman Drones, Hull Plating, Deflector shield, Repair Nanites, EMP Charges, Star Magnet, Salvage Scanner
  (+star value), Targeting Core (crits), Thrusters (speed), Reactive Armour (damage reduction), Flak Pods (shrapnel ring),
  Tesla Coil (chain lightning), Overdrive (damage from kill chains), Rescue Winch, and Ejection Protocol (one revive per mission).
- **The Legion adapts** (`threat()`). Each mission expects a share of the full loadout, set geometrically between a bare Ember
  and a maxed jet. Firepower above that raises enemy HP (power ratio^0.6), and toughness above it raises enemy bullet damage
  (^0.55). Gold-ringed **elite** drones (×1.9 HP, faster fire, ×2 stars) get more common by sector, by tier and when you're over-built.
  A toast and the tier sheet show the threat multiplier when it's high.
- **3 difficulties**: Cadet (default, gentle) / Pilot (+30% stars) / Ace (+70% stars).
- **27 Commendations** (one-time star rewards) and a **daily check-in** streak.

### Ways to earn stars
Drone kills · kill-chain multiplier (up to ×3, plus an end-of-mission chain bonus) · survivor rescues ·
supply caches · mission-complete bonus · 5 medals per mission (70% kills, 100% kills, rescue all,
no hull damage, 90% stars collected) + all-medals jackpot, then Mk II/III replays of every mission at higher pay · Star Rush stages (+first-clear bonus) ·
commendations · daily check-in · difficulty and Salvage Scanner multipliers. Stars are kept even if you're shot down.

### Easier than the genre norm
Tiny hitbox, slower bullets, a recharging shield that blocks the "no damage" penalty, regen, health drops,
an auto-revive upgrade, and the stars-kept-on-death rule.

### Rendering
Everything is procedural Canvas 2D with a pseudo-3D look:
- Terrain prisms (`prism()`) lean away from the screen centre as they scroll past, and walls are shaded from a top-left light.
- Shadows for terrain, jets and bosses are drawn into one black offscreen layer (`shadowPass()`) and composited once.
- Ships and drones use gradient body shading.
- Each biome adds weather (embers, snow, pollen or data motes), and the world sits under a vignette.

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

Save format: `save.lv[L] = { done, t: [[5 medals], [6], [7]] }`, one array per tier. Older single-array
`medals` saves are migrated on load by `normRec()`.

Tier balance (bot, 2026-11-15): Mk II 1-1 clears at about 30% upgrades, and Mk III 3-4 / 5-4 clear at full upgrades with
about 1.5–2× the enemies and roughly 4× the stars of Mk I.

Hardening (bot, 2026-11-16): a maxed jet used to kill the 1-4 boss in about 6s without taking damage. It now takes about 16s
and real damage. A 25% loadout still clears 5-4, and an un-upgraded Ember loses on 2-4. The boss sway clock now starts on
arrival (it used to reuse the entry timer, so bosses snapped sideways when they arrived), and the boss's x eases toward its target.

Save adds `ships: { <id>: [4 part flags] }` and `ship` (selected id). Part pickups write immediately via `collectPart()`.
