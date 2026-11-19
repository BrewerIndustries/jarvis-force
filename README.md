# Jarvis Force

A vertical-scrolling shoot-'em-up with a star-economy upgrade loop. It's an original game in the classic arcade-shooter genre.

**Story:** Six years after the Collapse, the old defense network has gone rogue as the **Rust Legion**. Jarvis has taken
command of what's left of the air force. He builds the jets, runs the hangar and upgrades, and plans every
sortie, but he can't fly (eleven million simulations, eleven million lakes). You are the human pilot. Rescue
survivors, bring stars home, and push through six sectors to the **Overseer Core**.

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

- **24 missions** across 6 sectors, each with its own terrain (`BIOMES` in game.js):
  - Drowned Coast: islands, shallows and drowned tower blocks
  - Ashen Peaks: faceted mountains, volcanoes and lava rivers
  - Frozen Relay: a stormy sea with rolling swell, ice floes, icebergs and radio rigs
  - Overgrown Sprawl: city blocks with overgrown rooftops
  - Stormfront: rain-lashed moorland with patchwork fields, flooded pools, wind turbines and lattice masts.
    Dark cloud banks drift over the fight and hide any drone flying beneath them (their bullets stay visible).
    Rain hazes the ground, so tanks and turrets are hard to spot, and survivors and salvage crates burn flares
    so you can still find them. Lightning flashes light up the moor for a moment and are drawn to the masts.
  - Overseer Core: machine plating, conduits, data cylinders and vents

  Wave height, volcano count and building height grow through each sector, and each mission in a sector has its own
  light (dawn, day, dusk, night).
  Every mission ends with a boss: a "vanguard" mini-boss on missions 1–3 and a major sector boss on mission 4.
- **3 tiers per mission (Mk I / Mk II / Mk III).** Earn every medal on a tier to unlock the next one. It's the same
  mission (same seed) with extra seeded waves layered on, plus tougher drones, heavier and faster fire, and more damage
  (`TIERS` in game.js), with bigger star and medal payouts. Each tier adds a medal: Mk II = *No EMP used*,
  Mk III = *30-kill chain*. That's 5 + 6 + 7 = 18 medals per mission, 432 in all. The tier picker opens from the
  mission board once a mission has anything past Mk I to show.
- **Fleet of 9 ships**, on its own Fleet screen (the Hangar is upgrades only). Ember is the starter. The other 8 (Kestrel, Lifeline, Bulwark, Tempest, Stormcrow, Aegis, Phantom, Sovereign)
  are each assembled from 4 parts (Wings, Engine, Cockpit, Reactor) found in blue **salvage crates**. Each part lives on one
  mission and tier (`PART_SPOTS`). Sectors 1–6 Mk I hold Kestrel → Aegis, Mk II holds Phantom and Mk III holds Sovereign.
  Missions with a part still to find show 🔩. Every ship has trade-offs (`SHIPS[].mods`): hull, shield, speed, fire rate,
  damage, rescue speed, magnet, star value, hitbox, recovery time, and a **First Strike barrier** that blocks one hit and
  restores itself. Upgrades apply to every ship. Parts are saved the moment you pick them up.
- **16 enemy types**, including **attack helicopters** (they hover on station, sidestep and fire 3-round bursts, then pull out),
  twin-rotor **lifters** that set two turrets down on the ground as they pass, the **Hive** (a carrier that launches drones until destroyed, and retreats when the boss
  arrives), mines that arm near you and burst, snipers with a telegraphed aim line, splitters that break into
  three, and patrolling ground tanks.
- **Unique sector bosses** (`BOSSES`), each with its own silhouette and attack set:
  - Tidebreaker (manta: walls with gaps)
  - Cinder Colossus (flame cone, mine drops)
  - Glacier Maw (splitting ice shards, telegraphed beam)
  - Thornwarden (rotating cross, summons splitters)
  - Thunderhead (a storm cell with an anemometer crown; calls down telegraphed lightning strikes, three at a time)
  - Overseer (3 phases, with a Hive at phase 2)

  Each sector's vanguard mini-boss uses a subset of its boss's attacks.

  **Every boss can be beaten without taking a hit.** Each attack is built from fixed geometry with a guaranteed way through.
  Rings and fans keep more than 24px between bullets (hitbox plus bullet on both sides) from about 200px out. Wall gaps only
  shift one lane per wall. The falling rain has an open stretch that drifts slower than the ship and opens where you are.
  Flame cones lock their aim for each burst, so the lanes between rays stay straight. Lightning strikes one spot on you and two
  beside it, never above or below, so there's always an exit. The beam gets a 1.3s warning. The Overseer's Hive only launches
  drones during the fight and doesn't add fire on top of the boss's.
- **Buildings fly at three altitudes** (`mkTerrain`/`updStructs` in game.js):
  - *Low:* scenery below your altitude. Bullets pass over it.
  - *Legion-held:* red roof roundel. Absorbs your fire and collapses for stars (HP scales with the mission and the threat level).
  - *Towers:* very tall, with a yellow hazard edge and a blinking red beacon. They are indestructible and block shots both ways,
    so they work as cover. Clipping one costs hull and shoves you aside. Towers stop spawning about 22s before the boss, so
    boss arenas stay clear.

  Every sector has buildings: drowned tower blocks, Legion outposts in the peaks, sea rigs, city blocks, moorland farms and Core blocks.
- **6 Star Rush bonus stages** (one per sector, unlocked by beating its boss). No enemy fire, stars everywhere.
- **20 upgrades** in Jarvis's hangar: Pulse Cannon, Autoloader, Wing Guns, Seeker Missiles, Arc Lance (beam),
  Wingman Drones, Hull Plating, Deflector shield, Repair Nanites, EMP Charges, Star Magnet, Salvage Scanner
  (+star value), Targeting Core (crits), Thrusters (speed), Reactive Armour (damage reduction), Flak Pods (shrapnel ring),
  Tesla Coil (chain lightning), Overdrive (damage from kill chains), Rescue Winch, and Ejection Protocol (one revive per mission).
- **The Legion adapts** (`threat()`). Each mission expects a share of the full loadout, set geometrically between a bare Ember
  and a maxed jet. Firepower above that raises enemy HP (power ratio^0.6), and toughness above it raises enemy bullet damage
  (^0.55). Gold-ringed **elite** drones (×1.9 HP, faster fire, ×2 stars) get more common by sector, by tier and when you're over-built.
  A toast and the tier sheet show the threat multiplier when it's high.
- **3 difficulties**: Cadet (default, gentle) / Pilot (+30% stars) / Ace (+70% stars).
- **28 Commendations** (one-time star rewards) and a **daily check-in** streak.

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
- Shadows for terrain, jets and bosses are drawn into one black offscreen layer (`shadowPass()`) at half resolution and
  upscaled when composited, so contact shadows read as penumbra rather than hard black shapes (and it is cheaper).
- Ships and drones use gradient body shading. The jet is painted once into a 2x canvas (`shipArt()`: hull lighting,
  panel seams, rivets, wing stripes, nozzle metal, canopy gradient and specular) and then stamped, with a black
  silhouette of the same bake feeding the shadow layer. Animated parts stay live: afterburner bloom and flame,
  blinking port/starboard nav lights. Fighters and gunships get a rim light, a canopy and engine glow.
- Bosses carry battle damage as their hull fails: scorch patches past 28%, smoke past 50%, open fire past 78%,
  plus a thruster wash under the hull. The HUD is drawn on glass panels (`panel()`) with a segmented hull readout,
  a glowing star counter and a boss plate with a bright leading edge. Stars on the field carry a warm bloom.
- **Rendered sprite art** for the hero jet and every Legion unit: scout, fighter, gunship, helicopter, diver, sniper,
  splitter (mini reuses it at half size), bomber, lifter, carrier, hive, mine, turret and tank.
  `tools/key_sprites.py` keys the generated art off its magenta backdrop (a magenta-ness key with despill, not a
  colour match, so dark hulls and the helicopter's blurred rotor do not fringe purple), trims it, normalises it to
  2x the in-game size and writes `sprites/<id>.png`. `game.js` loads them at boot and falls back to the procedural
  art when a file is missing, so the site never depends on the images. Enemy sprites are hue-rotated per sector and
  cached, which keeps the Legion's per-sector colour identity.
- Buildings are prisms with windows mapped onto their visible walls (`wallWindows()`): each wall is a quad, so a
  window is a small quad interpolated between its base edge and the leaned top edge. City blocks and Legion towers
  use it; sea rigs get cross-braced legs, a reflection and a helipad (skipped on Legion-held rigs, which carry the
  roundel instead).
- Distance haze: each sector tints the top of the screen so the far edge sits under atmosphere while the near edge
  stays crisp, and a diagonal light overlay warms the top-left and cools the bottom-right.
- Sea rows key their height, phase and foam to the **world** row (`base - r`), not the screen row: keying to the
  screen row re-hashed every row as the sea scrolled, which made the whole wave field pop every 46px.
- Open water gets a specular sun path of drifting dashes in addition to the crest highlights.
- **Bloom:** the bright parts of the frame (flashes, explosions, engine glow, sun glitter) go through a quarter-size
  contrast-and-blur pass and are added back, so lit things bleed light without washing out the sea. Composited
  before the HUD, and skipped on any browser whose canvas has no `filter`.
- **Explosions** (`boom()`) are layered on separate clocks: a white flash, a fireball that cools from yellow to red,
  tumbling shrapnel with gravity, embers, a flat shockwave, and smoke that billows up as the fire dies. Fire and smoke
  are pre-rendered sprites stamped per particle, so no radial gradients are built per frame. Counts drop when the
  screen is already busy.
- **Gunfire** shows a muzzle flash at each barrel and a tumbling brass casing, and player rounds are tracers with a hot
  core and a soft aura. Enemy rounds carry short trails, sniper rounds a long tracer, and missiles a flame and smoke
  trail. Bullet impacts add a pinpoint flash.
- Damaged machines trail smoke below 45% hull and throw embers below 20%.
- On water the jet leaves a wake and casts a blurred, flattened reflection, islands have breathing surf rings and a
  shaded far slope (lit plateau, shadowed side away from the sun), and ice floes carry cracks, a bright top rim and a
  reflection in the swell. The northern sea's wave rows each get their own height, phase and foam streaks instead of
  reading as stripes.
- **Side-scrolling camera:** the world is 64px wider than the screen on each side (`PAN`, `XL`/`XR` in game.js).
  The camera eases after the ship, so steering toward an edge pans the view and reveals extra room. Waves are
  stretched across the wider world (`widen()`), and clouds slide slightly faster than the ground for parallax.
- Each biome adds weather (embers, snow, pollen or data motes), and the world sits under a vignette.

### Audio
`audio.js` synthesises everything with WebAudio. There are no sound files.
- **Music** is a procedurally composed military-band march. A brass melody (it opens with a bugle-call figure) and
  horn harmony play over an oom-pah tuba, offbeat brass stabs, a snare corps with ruffs and phrase-end rolls, bass
  drum, crash cymbals and a piccolo on alternate passes, all through a small hall reverb. Each mission seeds its own
  tune, and the key is set by sector. Bosses get a faster minor-key battle march, Star Rush gets a quicker march, and the menus play a slow anthem.
  The music sits under the effects (bus gain 0.2), ducks while paused, and brass jingles play on mission complete and failed.
- **Sound effects** are built like foley, not blips. Gunfire stacks a broadband crack (the muzzle), a band-passed body
  (the round), a low thump (the pressure) and a mechanical tick (the action), with a brass casing tink on most shots and
  small random pitch changes so bursts don't sound mechanical. Explosions add a sub-bass thump, debris crackle and a
  reverb tail; heavy ones kick the camera.
- Effects cover guns, missiles, the laser, flak, tesla arcs, hits, explosions, shield and barrier blocks, EMP,
  star pickups (pitch rises with the kill chain), rescues, parts, the boss warning siren, sniper aim beeps, mine arming,
  beam and lightning strikes, and storm thunder. They also cover enemy fire and boss volleys, flame breath, sniper cracks,
  helicopter rotors, bomber flybys, Hive launches, splitters breaking, elite arrivals, buildings collapsing, ricochets off towers,
  tower collisions, a low-hull alarm, a take-off whoosh, and a chime for each medal on the results screen.
  The Stormfront adds a looping rain bed. Rapid sounds are rate-limited.
- **Stereo placement:** enemy fire, volleys, blasts, sniper shots and lightning pan with their position on screen, so a
  drone on the right fires from the right. Effects have their own reverb send (behind the Sound toggle) and share a
  master compressor, so a busy fight stays loud without clipping.
- Music and Sound toggles sit on the main menu and the pause screen and are saved in localStorage (`jarvisforce.audio`).
  Audio starts on the first tap or key press, as browsers require. On iPhone it unlocks on touchend/click (pointerdown doesn't
  count as a tap there), resumes after calls or app switches, and asks to play even with the silent switch on (`navigator.audioSession`).

## Code layout

- `index.html`: DOM screens (menu, mission board, hangar, commendations, story comms, results, pause)
- `style.css`: UI styling
- `audio.js`: synthesised sound effects and the procedural march (`SND`)
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

No-hit boss test (bot, 2026-11-17): a dodge bot that decides only every 0.3s (human reaction time) and moves at 260px/s,
on Mk III / Ace with each boss held at 40% HP (enraged) and the Overseer in all three phases, takes 0 hits from every boss and
vanguard in 45 to 60s each. The same bot was hit by the old Tidebreaker fans, Thunderhead lightning and Overseer beam. Boss fire
averages about 9–18 bullets a second.

Save `sv: 2` marks the six-sector layout. Older saves (no `sv`) are migrated on load: Core progress moves from missions
16–19 to 20–23, along with its Star Rush clear and story flag.

Save adds `ships: { <id>: [4 part flags] }` and `ship` (selected id). Part pickups write immediately via `collectPart()`.

Toughness pass (2026-11-18): enemies were melting. Every drone's HP now scales `1 + L*.8 + sector*.1`
(was `1 + L*.42`), so a fighter at 3-1 with 35% upgrades takes 0.61s instead of 0.35s, a gunship 2.5s instead of
1.45s, and a carrier 8.1s instead of 4.7s. Elites are 2.1x HP and start at 5% + 4.5% per sector, enemy fire is
faster (sector term .24) and waves arrive a little closer together. Cadet was softened less (damage .65, bullet
speed .84, fire rate .85). Bosses keep their own, gentler HP curve so boss fights stay 45-60s. The per-blast camera
shake added with the effects pass was removed: with several kills a second it never settled, which read as a
bouncing screen.
