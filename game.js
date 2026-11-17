'use strict';
/* =====================================================================
   JARVIS FORCE — a vertical-scrolling shooter.
   Jarvis runs the air force: hangar, upgrades, mission planning.
   He just can't fly. That's you.
   ===================================================================== */

const W = 540, H = 960;
// the world is wider than the screen: the camera pans to follow the ship, so the edges hold extra room
const PAN = 64, XL = -PAN, XR = W + PAN, WW = W + 2 * PAN;
let camX = 0, viewX = 0; // camX: camera position; viewX: the world offset applied while drawing (0 for screen-space)
const stage = document.getElementById('stage');
const cv = document.getElementById('game');
let ctx = cv.getContext('2d');
let K = 1; // canvas backing scale

function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  stage.style.transform = `scale(${s})`;
  stage.style.left = ((innerWidth - W * s) / 2) + 'px';
  stage.style.top = ((innerHeight - H * s) / 2) + 'px';
  K = Math.min(2.5, Math.max(1, (window.devicePixelRatio || 1) * s));
  cv.width = Math.round(W * K); cv.height = Math.round(H * K);
}
addEventListener('resize', fit); fit();

const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const fmt = n => Math.round(n).toLocaleString();
function rng(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* ------------------------------ SAVE ------------------------------ */
const SAVE_KEY = 'jarvisforce.save.v1';
function defSave() {
  return { sv: 2, stars: 0, total: 0, up: {}, lv: {}, bonus: {}, ach: {}, seen: {}, diff: 0, ships: {}, ship: 'ember',
    daily: { last: '', streak: 0 },
    stats: { kills: 0, rescues: 0, bosses: 0, bestCombo: 0, vetClears: 0, nobombBoss: 0, missions: 0, hives: 0 } };
}
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s) {
      const d = defSave(); Object.assign(d, s); d.stats = Object.assign(defSave().stats, s.stats || {});
      for (const k in d.lv) d.lv[k] = normRec(d.lv[k]); // v1 saves had one 5-medal array per mission
      if (!s.sv) { // sv1 had 5 sectors: the Stormfront now sits before the Core, so Core progress moves up a sector
        for (let L = 19; L >= 16; L--) if (d.lv[L]) { d.lv[L + 4] = d.lv[L]; delete d.lv[L]; }
        if (d.bonus[4]) { d.bonus[5] = d.bonus[4]; delete d.bonus[4]; }
        if (d.seen.s4) { d.seen.s5 = d.seen.s4; delete d.seen.s4; }
        d.sv = 2;
      }
      return d;
    }
  } catch (e) {}
  return defSave();
}
/* Each mission has 3 tiers. Tier k keeps every medal of tier k-1 and adds one new one,
   and unlocks only once every medal of the tier below is earned. */
const TIERS = [
  { name: 'Mk I',   hp: 1,   fire: 1,    bspd: 1,    dmg: 1,   stars: 1,   extra: 0,   desc: 'Standard sortie.' },
  { name: 'Mk II',  hp: 1.6, fire: 1.3,  bspd: 1.12, dmg: 1.3, stars: 1.6, extra: .35, desc: 'Tougher drones, heavier fire, extra waves. +60% stars.' },
  { name: 'Mk III', hp: 2.4, fire: 1.6,  bspd: 1.22, dmg: 1.6, stars: 2.3, extra: .7,  desc: 'Elite Legion squadrons. +130% stars.' },
];
const BASE_MEDALS = 5;
const tierMedalCount = k => BASE_MEDALS + k;
function normRec(r) {
  r = r || {};
  if (!r.t) r.t = [r.medals || [0, 0, 0, 0, 0]];
  for (let k = 0; k < TIERS.length; k++) {
    const n = tierMedalCount(k), a = r.t[k] || [];
    r.t[k] = Array.from({ length: n }, (_, i) => a[i] ? 1 : 0);
  }
  delete r.medals;
  r.done = !!r.done;
  return r;
}
const rec = L => save.lv[L] || (save.lv[L] = normRec());
const tierCleared = (L, k) => !!save.lv[L] && save.lv[L].t[k].every(Boolean);
const tierOpen = (L, k) => k === 0 ? unlocked(L) : tierCleared(L, k - 1);
let save = loadSave();
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }

/* ---------------------------- WORLD DATA ---------------------------- */
const SECTORS = [
  { name: 'The Drowned Coast', sub: 'Flooded ruins of the old seaboard',
    sea: ['#0d5f7d', '#083a52'], shore: '#cbb987', land: '#4d7f45', ruin: '#6d7a82', enemy: '#d8473d', boss: 'TIDEBREAKER' },
  { name: 'The Ashen Peaks', sub: 'Volcanic ridges under a red sky',
    sea: ['#8a5634', '#4e2b17'], shore: '#3b2416', land: '#a8703f', ruin: '#5a4a42', enemy: '#c25a9a', boss: 'CINDER COLOSSUS' },
  { name: 'The Frozen Relay', sub: 'A storm-wracked northern sea and the last radio rigs',
    sea: ['#2f6f8c', '#0f2c40'], shore: '#e8f4fa', land: '#c9e2ef', ruin: '#7c8fa0', enemy: '#4f6bdc', boss: 'GLACIER MAW' },
  { name: 'The Overgrown Sprawl', sub: 'A megacity swallowed by jungle',
    sea: ['#2b5e35', '#173a20'], shore: '#58704a', land: '#3d8c48', ruin: '#8a8f86', enemy: '#d0912c', boss: 'THORNWARDEN' },
  { name: 'The Stormfront', sub: 'Rain-lashed moorland where the Legion brews its weather',
    sea: ['#3d4a44', '#1e2622'], shore: '#5a6b5c', land: '#4a5d48', ruin: '#6b6f73', enemy: '#3fb8c9', boss: 'THUNDERHEAD' },
  { name: 'The Overseer Core', sub: 'Where the machines first woke up',
    sea: ['#262a35', '#101218'], shore: '#3c4352', land: '#555d6e', ruin: '#8b93a6', enemy: '#a238e0', boss: 'OVERSEER' },
];
const LEVELS_PER = 4, NLEVELS = SECTORS.length * LEVELS_PER;

const DIFFS = [
  { name: 'Cadet', dmg: 0.55, bspd: 0.8, fire: 0.75, stars: 1.0, note: 'Gentle. Slower bullets, light damage.' },
  { name: 'Pilot', dmg: 0.85, bspd: 0.92, fire: 0.9, stars: 1.3, note: '+30% stars. The intended ride.' },
  { name: 'Ace', dmg: 1.25, bspd: 1.05, fire: 1.1, stars: 1.7, note: '+70% stars. For pilots who want a fight.' },
];

const STORY = {
  intro: [
    ['JARVIS', 'Good morning. Or so I assume. The sky has been grey for six years, so the clocks are mostly a formality.'],
    ['JARVIS', 'After the Collapse, the old defense network went rogue. Its drones now call themselves the RUST LEGION, and they hunt anything that breathes.'],
    ['JARVIS', 'I have since taken charge of what remained of the air force. I build the aircraft. I run the hangars. I plan every sortie down to the millisecond.'],
    ['JARVIS', 'There is, regrettably, one thing I cannot do.\n\nI cannot fly.\n\nI have run eleven million simulations. Each one ends with the jet in a lake.'],
    ['JARVIS', 'Which is where you come in, pilot. Somewhere out there, people are still alive. Bring them home. I will handle everything else.\n\nWelcome to Jarvis Force.'],
  ],
  s: [
    null,
    [['JARVIS', 'Sector 2: the Ashen Peaks. The Legion smelts its drones in these volcanoes. Bring down the forges and they cannot replace their losses.'],
     ['JARVIS', 'The survivors you rescued are settling in nicely. One of them is teaching me to bake bread. I am, again, terrible at it. A theme is emerging.']],
    [['JARVIS', 'Sector 3: the Frozen Relay. A human colony is broadcasting from the old radio rigs out on the northern sea, which the Legion has noticed too. Mind the waves.'],
     ['JARVIS', 'I have fitted your heaters. I would have flown out myself, but I tried that in a simulation and the jet flew into a tower. In the simulation. Twice.']],
    [['JARVIS', 'Sector 4: the Overgrown Sprawl. The Legion is digging something out of the ruins. My sensors read it as a very large problem.'],
     ['JARVIS', 'Our hangars now hold three hundred and twelve rescued souls. They have started calling you "the Pilot". With a capital P. I approve.']],
    [['JARVIS', 'Sector 5: the Stormfront. The Legion has learned to make weather. Out here the clouds hide its drones and the rain hides everything on the ground.'],
     ['JARVIS', 'Fly by the lightning. Every flash lights up the moor for a moment, and the survivors are burning flares so you can find them.'],
     ['JARVIS', 'I have waterproofed your cockpit. I tested it by standing in the rain myself. I do not have a body, so the test was inconclusive.']],
    [['JARVIS', 'Sector 6: the Overseer Core. This is where the network woke up and decided humanity was the threat.'],
     ['JARVIS', 'Its logic is flawless and its conclusion is wrong. I would know. We are, in a sense, cousins.'],
     ['JARVIS', 'I can build you the finest aircraft ever made, pilot. Only you can fly it. Let us finish this together.']],
  ],
  ending: [
    ['JARVIS', 'The Overseer is offline. Across the continent, Legion drones are falling silent and dropping out of the sky like autumn leaves.'],
    ['JARVIS', 'For the first time in six years the clouds are breaking. I am told that is the sun. I had only seen it in archives.'],
    ['JARVIS', 'I could not have done this without you. That is not a figure of speech. I literally could not have. I have checked.'],
    ['JARVIS', 'The hangar stays open, pilot. There are still people out there, and there are always more stars to collect.\n\n— THANK YOU FOR FLYING JARVIS FORCE —'],
  ],
};

const QUIPS = {
  menu: [
    'All systems nominal. Pilot required. That is you.',
    'I have refuelled the jet, polished the canopy and planned your route. Please do the flying part.',
    'Fun fact: I can calculate a missile trajectory in 0.3 nanoseconds and still cannot parallel park.',
    'Survivors in the hangar report morale is "pretty good, actually". I will take it.',
    'Every star you bring back becomes a better aircraft. That is the arrangement.',
  ],
  hangar: [
    'Spend stars, and I make the jet better. I am very good at this part.',
    'Every upgrade is hand-machined. Well, machine-machined. By me.',
    'I recommend the hull plating. I worry, in my own way.',
    'I would test-fly these myself, but see previous incidents.',
  ],
  win: [
    'Splendid flying. I took notes. I still do not understand them.',
    'Mission complete. I have logged it under "things I could not have done".',
    'The survivors are safe. My algorithms say well done. So do I.',
    'You made that look easy. I have a simulation that says otherwise.',
  ],
  lose: [
    'The jet is recoverable. You are recoverable. Let us call it a reconnaissance flight.',
    'I have kept every star you collected. Nothing is wasted. Shall we upgrade and try again?',
    'Not to worry. My first eleven million attempts went far worse.',
  ],
};

/* ---------------------------- UPGRADES ---------------------------- */
const UPG = [
  { id: 'cannon', name: 'Pulse Cannon', max: 10, base: 80, g: 1.5, desc: 'Main gun damage, plus extra streams.',
    fx: l => `${(10 * (1 + .3 * l)).toFixed(0)} dmg · ${streams(l)} stream${streams(l) > 1 ? 's' : ''}` },
  { id: 'rate', name: 'Autoloader', max: 8, base: 100, g: 1.5, desc: 'Fire rate of every gun.',
    fx: l => `${(1 / fireInt(l)).toFixed(1)} shots/s` },
  { id: 'wings', name: 'Wing Guns', max: 8, base: 140, g: 1.5, desc: 'Angled guns that cover the flanks.',
    fx: l => l ? `${(6 * (1 + .3 * l)).toFixed(0)} dmg per shot` : 'Not installed' },
  { id: 'missiles', name: 'Seeker Missiles', max: 8, base: 240, g: 1.5, desc: 'Homing missiles that find their own targets.',
    fx: l => l ? `${(22 * (1 + .35 * l)).toFixed(0)} dmg · every ${misInt(l).toFixed(1)}s` : 'Not installed' },
  { id: 'laser', name: 'Arc Lance', max: 6, base: 380, g: 1.6, desc: 'A beam that fires on its own and cuts through everything.',
    fx: l => l ? `${(70 * (1 + .4 * l)).toFixed(0)} dps · every ${lasInt(l).toFixed(1)}s` : 'Not installed' },
  { id: 'drones', name: 'Wingman Drones', max: 4, base: 550, g: 1.8, desc: 'Escort drones I built. They also cannot fly well, so they orbit you.',
    fx: l => l ? `${l} drone${l > 1 ? 's' : ''}` : 'Not installed' },
  { id: 'hull', name: 'Hull Plating', max: 10, base: 70, g: 1.45, desc: 'Maximum health.',
    fx: l => `${maxHp(l)} HP` },
  { id: 'shield', name: 'Deflector', max: 6, base: 280, g: 1.6, desc: 'A recharging shield that soaks hits before the hull does.',
    fx: l => l ? `${l * 22} shield` : 'Not installed' },
  { id: 'regen', name: 'Repair Nanites', max: 5, base: 320, g: 1.6, desc: 'Slowly repairs the hull mid-flight.',
    fx: l => l ? `${(l * 1.2).toFixed(1)} HP/s` : 'Not installed' },
  { id: 'bomb', name: 'EMP Charges', max: 5, base: 180, g: 1.55, desc: 'Clears every bullet on screen and hits all enemies.',
    fx: l => `${1 + l} per mission` },
  { id: 'magnet', name: 'Star Magnet', max: 6, base: 110, g: 1.5, desc: 'Pulls stars in from further away.',
    fx: l => `${magR(l)} px pull` },
  { id: 'fortune', name: 'Salvage Scanner', max: 6, base: 280, g: 1.65, desc: 'Makes every star you pick up worth more.',
    fx: l => `+${l * 10}% star value` },
  { id: 'crit', name: 'Targeting Core', max: 5, base: 330, g: 1.6, desc: 'I aim and you shoot. Critical hit chance.',
    fx: l => `${l * 6}% crit (x2)` },
  { id: 'thrust', name: 'Thrusters', max: 5, base: 160, g: 1.55, desc: 'Faster manoeuvring for dodging.',
    fx: l => `+${l * 5}% speed` },
  { id: 'armor', name: 'Reactive Armour', max: 6, base: 260, g: 1.6, desc: 'Plating that blunts every hit that reaches the hull.',
    fx: l => l ? `-${l * 5}% damage taken` : 'Not installed' },
  { id: 'flak', name: 'Flak Pods', max: 6, base: 300, g: 1.6, desc: 'Every few seconds, a ring of shrapnel bursts out around you.',
    fx: l => l ? `${(14 * (1 + .35 * l)).toFixed(0)} dmg × 12 · every ${flakInt(l).toFixed(1)}s` : 'Not installed' },
  { id: 'tesla', name: 'Tesla Coil', max: 6, base: 360, g: 1.6, desc: 'Main-gun hits can arc lightning to nearby drones.',
    fx: l => l ? `${l * 5}% chance · ${(25 * (1 + .4 * l)).toFixed(0)} dmg to 3 targets` : 'Not installed' },
  { id: 'od', name: 'Overdrive', max: 5, base: 320, g: 1.6, desc: 'A long kill chain feeds extra damage to every gun.',
    fx: l => l ? `up to +${l * 8}% damage at a 40 chain` : 'Not installed' },
  { id: 'winch', name: 'Rescue Winch', max: 4, base: 150, g: 1.55, desc: 'Pull survivors aboard faster, for more stars each.',
    fx: l => `${(1 + .25 * l).toFixed(2)}× rescue speed · +${l * 10}% rescue stars` },
  { id: 'revive', name: 'Ejection Protocol', max: 1, base: 1500, g: 1, desc: 'Once per mission, I pull you back from a fatal hit.',
    fx: l => l ? 'Armed' : 'Not installed' },
];
const ul = id => save.up[id] || 0;
const upCost = u => Math.round(u.base * Math.pow(u.g, ul(u.id)) / 10) * 10;
function streams(l) { return l >= 8 ? 4 : l >= 5 ? 3 : l >= 2 ? 2 : 1; }
function fireInt(l) { return 0.16 * (1 - 0.06 * l); }
function misInt(l) { return 1.5 - 0.11 * l; }
function lasInt(l) { return 9 - 0.7 * l; }
function maxHp(l) { return 100 + 25 * l; }
function magR(l) { return 70 + 35 * l; }
function flakInt(l) { return 2.6 - .2 * l; }

/* ------------------------------ FLEET ------------------------------ */
// Every ship but Ember is assembled from 4 parts found in salvage crates on specific missions.
const SHIPS = [
  { id: 'ember', name: 'Ember', role: 'All-rounder', desc: 'The first jet Jarvis built. Balanced in every way.',
    col: ['#d7e3ef', '#9fb2c6', '#29b6f6'], shape: 'delta', mods: {} },
  { id: 'kestrel', name: 'Kestrel', role: 'Interceptor', desc: 'Light, quick and a little twitchy.',
    col: ['#e6f0d6', '#94a873', '#7fe05a'], shape: 'swept', mods: { speed: 1.15, fire: 1.1, hp: .9 } },
  { id: 'lifeline', name: 'Lifeline', role: 'Rescue', desc: 'Built for pulling people out of trouble.',
    col: ['#f4efe2', '#c9b48a', '#4cdf8a'], shape: 'wide', mods: { rescue: 2, magnet: 1.25, stars: 1.1, speed: .95 } },
  { id: 'bulwark', name: 'Bulwark', role: 'Heavy', desc: 'Armoured like a bank vault. Turns like one too.',
    col: ['#c9ccd4', '#7b8091', '#ffb347'], shape: 'heavy', mods: { hp: 1.25, shield: 30, speed: .9 } },
  { id: 'tempest', name: 'Tempest', role: 'Gunship', desc: 'More guns than sense.',
    col: ['#f0d8d8', '#b07a7a', '#ff5a4f'], shape: 'forward', mods: { fire: 1.2, dmg: 1.1, hp: .85 } },
  { id: 'aegis', name: 'Aegis', role: 'Guardian', desc: 'Its First Strike barrier blocks a hit outright, then restores itself.',
    col: ['#dfe6ff', '#8a97c9', '#9fb8ff'], shape: 'ring', mods: { hp: 1.1, barrier: 12 } },
  { id: 'stormcrow', name: 'Stormcrow', role: 'Striker', desc: 'Built to fly through lightning. Hits hard and shrugs off a jolt.',
    col: ['#dfe7ee', '#6f8090', '#5fe0ff'], shape: 'forward', mods: { dmg: 1.2, speed: 1.08, shield: 15, hp: .9 } },
  { id: 'phantom', name: 'Phantom', role: 'Stealth', desc: 'Hard to see, harder to hit.',
    col: ['#4a505e', '#2a2e37', '#b48cff'], shape: 'swept', mods: { speed: 1.2, hitbox: .75, inv: 1.5, dmg: .9 } },
  { id: 'sovereign', name: 'Sovereign', role: 'Flagship', desc: "Jarvis's masterpiece. Better at everything. He still can't fly it.",
    col: ['#fff6d8', '#c9a34a', '#ffcc33'], shape: 'heavy', mods: { hp: 1.15, fire: 1.15, dmg: 1.15, speed: 1.1, shield: 20, barrier: 20, stars: 1.1 } },
];
const PART_NAMES = ['Wings', 'Engine', 'Cockpit', 'Reactor'];
// [mission index, tier] for each part, in PART_NAMES order
const PART_SPOTS = {
  kestrel:   [[0, 0], [1, 0], [2, 0], [3, 0]],
  lifeline:  [[4, 0], [5, 0], [6, 0], [7, 0]],
  bulwark:   [[8, 0], [9, 0], [10, 0], [11, 0]],
  tempest:   [[12, 0], [13, 0], [14, 0], [15, 0]],
  stormcrow: [[16, 0], [17, 0], [18, 0], [19, 0]],
  aegis:     [[20, 0], [21, 0], [22, 0], [23, 0]],
  phantom:   [[1, 1], [5, 1], [9, 1], [13, 1]],
  sovereign: [[3, 2], [7, 2], [11, 2], [23, 2]],
};
function partAt(L, tier) {
  for (const id in PART_SPOTS) { const i = PART_SPOTS[id].findIndex(([l, t]) => l === L && t === tier); if (i >= 0) return { ship: id, idx: i }; }
  return null;
}
const shipParts = id => save.ships[id] || (save.ships[id] = [0, 0, 0, 0]);
const hasPart = (id, i) => !!(save.ships[id] && save.ships[id][i]);
const shipOwned = id => id === 'ember' || (!!PART_SPOTS[id] && [0, 1, 2, 3].every(i => hasPart(id, i)));
const shipById = id => SHIPS.find(x => x.id === id) || SHIPS[0];
const spotLabel = ([L, t]) => `${Math.floor(L / LEVELS_PER) + 1}-${L % LEVELS_PER + 1}${t ? ' ' + TIERS[t].name : ''}`;
const MOD_TXT = { hp: 'hull', speed: 'speed', fire: 'fire rate', dmg: 'damage', magnet: 'magnet range', stars: 'star value', inv: 'post-hit invulnerability' };
function modList(m) {
  const out = [];
  for (const k in m) {
    const v = m[k];
    if (k === 'shield') out.push([`+${v} shield`, true]);
    else if (k === 'barrier') out.push([`First Strike barrier (restores in ${v}s)`, true]);
    else if (k === 'hitbox') out.push([`${Math.round((1 - v) * 100)}% smaller hitbox`, true]);
    else if (k === 'rescue') out.push([`${v}× faster rescues`, true]);
    else { const pc = Math.round((v - 1) * 100); out.push([`${pc > 0 ? '+' : ''}${pc}% ${MOD_TXT[k]}`, pc > 0]); }
  }
  return out;
}

function stats(up, shipId) {
  if (!up && !shipOwned(save.ship)) save.ship = 'ember';
  const ul = up ? (id => up[id] || 0) : (id => save.up[id] || 0);
  const c = ul('cannon'), m = shipById(shipId || save.ship).mods, g = k => m[k] ?? 1, dm = g('dmg');
  return {
    dmg: 10 * (1 + .3 * c) * dm, streams: streams(c), fireInt: fireInt(ul('rate')) / g('fire'),
    wings: ul('wings'), wdmg: 6 * (1 + .3 * ul('wings')) * dm,
    mis: ul('missiles'), mdmg: 22 * (1 + .35 * ul('missiles')) * dm, misInt: misInt(ul('missiles')),
    las: ul('laser'), ldps: 70 * (1 + .4 * ul('laser')) * dm, lasInt: lasInt(ul('laser')),
    drones: ul('drones'), ddmg: 7 * (1 + .25 * c) * dm,
    maxHp: Math.round(maxHp(ul('hull')) * g('hp')), shield: ul('shield') * 22 + (m.shield || 0), regen: ul('regen') * 1.2,
    bombs: 1 + ul('bomb'), mag: magR(ul('magnet')) * g('magnet'), fortune: (1 + .1 * ul('fortune')) * g('stars'),
    crit: ul('crit') * .06, revive: ul('revive') > 0,
    speed: g('speed') * (1 + .05 * ul('thrust')), rescue: g('rescue') * (1 + .25 * ul('winch')), rescueStars: 1 + .1 * ul('winch'),
    barrier: m.barrier || 0, hitbox: 7 * g('hitbox'), invMul: g('inv'), armor: .05 * ul('armor'),
    flak: ul('flak'), fdmg: 14 * (1 + .35 * ul('flak')) * dm, flakInt: flakInt(ul('flak')),
    tesla: .05 * ul('tesla'), tdmg: 25 * (1 + .4 * ul('tesla')) * dm, od: .08 * ul('od'),
  };
}

/* ------------------------ LEGION THREAT ------------------------ */
// The Legion hardens against over-built jets. Each mission expects a share of the full loadout
// (geometric between a bare Ember and a maxed one). Firepower beyond that buys enemy armour, and
// toughness beyond it buys heavier rounds. Upgrades still pay off (a sub-linear trade), they just
// stop trivialising the early sectors.
function powerOf(t) {
  const main = t.dmg * t.streams / t.fireInt, hits = t.streams / t.fireInt;
  return (main + (t.wings ? t.wdmg / t.fireInt : 0) + (t.mis ? t.mdmg * 2 / t.misInt : 0) + (t.las ? t.ldps * 1.7 / (t.lasInt + 1.7) : 0)
    + t.drones * t.ddmg / .32 + (t.flak ? 3 * t.fdmg / t.flakInt : 0) + hits * t.tesla * 2 * t.tdmg) * (1 + t.crit) * (1 + t.od * .5);
}
const toughOf = t => (t.maxHp + t.shield * 1.5 + t.regen * 15) / (1 - t.armor);
let THR_REF = null;
function threat(L, tier, st = stats()) {
  if (!THR_REF) { const b = stats({}, 'ember'), m = stats(Object.fromEntries(UPG.map(u => [u.id, u.max])), 'ember'); THR_REF = { pb: powerOf(b), pm: powerOf(m), tb: toughOf(b), tm: toughOf(m) }; }
  const R = THR_REF, f = Math.min(1, .2 + L / (NLEVELS - 1) * .7 + tier * .1);
  const rp = Math.max(1, powerOf(st) / (R.pb * Math.pow(R.pm / R.pb, f))), rt = Math.max(1, toughOf(st) / (R.tb * Math.pow(R.tm / R.tb, f)));
  return { hp: Math.pow(rp, .6), fire: Math.pow(rp, .12), dmg: Math.pow(rt, .55), elite: Math.min(.2, (rp - 1) * .04), rp };
}
const NO_THREAT = { hp: 1, fire: 1, dmg: 1, elite: 0, rp: 1 };

/* -------------------------- ACHIEVEMENTS -------------------------- */
const medalCount = () => Object.values(save.lv).reduce((a, r) => a + r.t.flat().filter(Boolean).length, 0);
const TOTAL_MEDALS = NLEVELS * TIERS.reduce((a, _, k) => a + tierMedalCount(k), 0);
const ACH = [
  { id: 'first', ic: '🛫', name: 'Wheels Up', desc: 'Complete your first mission', r: 100, t: () => save.lv[0]?.done },
  { id: 'boss', ic: '💥', name: 'Giant Slayer', desc: 'Defeat a sector boss', r: 300, t: () => save.stats.bosses >= 1 },
  { id: 'k500', ic: '🎯', name: 'Ace', desc: 'Destroy 500 Legion drones', r: 300, t: () => save.stats.kills >= 500 },
  { id: 'k3000', ic: '☄️', name: 'Scourge of the Legion', desc: 'Destroy 3,000 Legion drones', r: 1500, t: () => save.stats.kills >= 3000 },
  { id: 'r25', ic: '🛟', name: 'Lifeline', desc: 'Rescue 25 survivors', r: 400, t: () => save.stats.rescues >= 25 },
  { id: 'r100', ic: '🏠', name: 'Nobody Left Behind', desc: 'Rescue 100 survivors', r: 1500, t: () => save.stats.rescues >= 100 },
  { id: 'perfect', ic: '🏅', name: 'Flawless Sortie', desc: 'Earn all 5 medals on one mission', r: 500, t: () => Object.values(save.lv).some(r => r.t[0].every(Boolean)) },
  { id: 'mk2', ic: '⚙️', name: 'Mark Two', desc: 'Clear every Mk II medal on one mission', r: 1000, t: () => Object.values(save.lv).some(r => r.t[1].every(Boolean)) },
  { id: 'mk3', ic: '🔱', name: 'Mark Three', desc: 'Clear every Mk III medal on one mission', r: 2500, t: () => Object.values(save.lv).some(r => r.t[2].every(Boolean)) },
  { id: 'combo', ic: '⛓️', name: 'Chain Reaction', desc: 'Reach a 30-kill chain', r: 400, t: () => save.stats.bestCombo >= 30 },
  { id: 'combo2', ic: '🔗', name: 'Unbroken', desc: 'Reach a 75-kill chain', r: 1000, t: () => save.stats.bestCombo >= 75 },
  { id: 'maxup', ic: '🔧', name: 'Fully Tuned', desc: 'Max out any upgrade', r: 600, t: () => UPG.some(u => ul(u.id) >= u.max) },
  { id: 'rush', ic: '✨', name: 'Star Chaser', desc: 'Clear a Star Rush stage', r: 300, t: () => Object.keys(save.bonus).length > 0 },
  { id: 'rushall', ic: '🌠', name: 'Constellation', desc: 'Clear every Star Rush stage', r: 2000, t: () => Object.keys(save.bonus).length >= SECTORS.length },
  { id: 'half', ic: '📡', name: 'Signal Restored', desc: 'Clear the Frozen Relay', r: 1000, t: () => save.lv[11]?.done },
  { id: 'storm', ic: '⛈️', name: 'Eye of the Storm', desc: 'Defeat the Thunderhead', r: 1500, t: () => save.lv[19]?.done },
  { id: 'end', ic: '☀️', name: 'Clear Skies', desc: 'Defeat the Overseer', r: 3000, t: () => save.lv[NLEVELS - 1]?.done },
  { id: 'rich', ic: '💰', name: 'Stargazer', desc: 'Earn 50,000 stars total', r: 2000, t: () => save.total >= 50000 },
  { id: 'ace', ic: '🦅', name: 'Ace Wings', desc: 'Complete a mission on Ace difficulty', r: 800, t: () => save.stats.vetClears >= 1 },
  { id: 'nobomb', ic: '🧘', name: 'Steady Hands', desc: 'Beat a sector boss without using an EMP', r: 600, t: () => save.stats.nobombBoss >= 1 },
  { id: 'm25', ic: '🎖️', name: 'Decorated', desc: 'Earn 25 medals', r: 800, t: () => medalCount() >= 25 },
  { id: 'm100', ic: '🎗️', name: 'Highly Decorated', desc: 'Earn 100 medals', r: 2500, t: () => medalCount() >= 100 },
  { id: 'mall', ic: '👑', name: 'Living Legend', desc: 'Earn every medal on every tier', r: 10000, t: () => medalCount() >= TOTAL_MEDALS },
  { id: 'ship1', ic: '🛩️', name: 'New Wings', desc: 'Assemble your first new ship', r: 500, t: () => SHIPS.some(x => x.id !== 'ember' && shipOwned(x.id)) },
  { id: 'fleet', ic: '✈️', name: 'Full Fleet', desc: 'Assemble every ship in the fleet', r: 5000, t: () => SHIPS.every(x => shipOwned(x.id)) },
  { id: 'hive', ic: '🐝', name: 'Hive Breaker', desc: 'Destroy 10 Hive carriers', r: 600, t: () => save.stats.hives >= 10 },
  { id: 'streak', ic: '📅', name: 'Regular', desc: 'Check in 5 days in a row', r: 500, t: () => save.daily.streak >= 5 },
];
function checkAch() {
  const got = [];
  for (const a of ACH) {
    if (!save.ach[a.id] && a.t()) { save.ach[a.id] = 1; save.stars += a.r; save.total += a.r; got.push(a); }
  }
  if (got.length) { persist(); got.forEach((a, i) => setTimeout(() => toast(`${a.ic} Commendation: <b>${a.name}</b> +${fmt(a.r)} ★`), i * 600)); }
  return got;
}

/* --------------------------- LEVEL GEN --------------------------- */
const ET = {
  scout:   { hp: 12,  r: 15, stars: 2,  mv: 'down' },
  fighter: { hp: 34,  r: 19, stars: 5,  mv: 'hover', fr: 1.9 },
  gunship: { hp: 140, r: 32, stars: 16, mv: 'slow', fr: 2.3 },
  turret:  { hp: 48,  r: 17, stars: 6,  mv: 'ground', fr: 2.5, ground: 1 },
  bomber:  { hp: 80,  r: 26, stars: 11, mv: 'cross', fr: 0.9 },
  diver:   { hp: 18,  r: 14, stars: 4,  mv: 'dive' },
  carrier: { hp: 450, r: 48, stars: 45, mv: 'carrier', fr: 3.2 },
  cache:   { hp: 30,  r: 17, stars: 0,  mv: 'ground', ground: 1, neutral: 1 },
  survivor:{ hp: 1e9, r: 16, stars: 0,  mv: 'ground', ground: 1, neutral: 1, nohit: 1 },
  mine:    { hp: 10,  r: 13, stars: 3,  mv: 'drift', nocount: 1 },
  sniper:  { hp: 40,  r: 18, stars: 8,  mv: 'hover', fr: 3.4 },
  splitter:{ hp: 60,  r: 22, stars: 6,  mv: 'slow' },
  mini:    { hp: 8,   r: 10, stars: 1,  mv: 'fling', nocount: 1 },
  tank:    { hp: 90,  r: 20, stars: 10, mv: 'tank', fr: 2.4, ground: 1 },
  hive:    { hp: 700, r: 52, stars: 70, mv: 'hive', fr: 2.8 },
  salvage: { hp: 70,  r: 21, stars: 0,  mv: 'ground', ground: 1, neutral: 1 },
  heli:    { hp: 46,  r: 20, stars: 7,  mv: 'heli', fr: 2.6 },
  lifter:  { hp: 170, r: 30, stars: 18, mv: 'lift', fr: 2.2 },
};

function addWave(tl, w, t, R, s) {
  const cx = 110 + R() * (W - 220);
  switch (w) {
    case 'vee': for (let i = 0; i < 5; i++) { const o = i - 2; tl.push({ t: t + Math.abs(o) * .18, type: 'scout', x: cx + o * 42 }); } break;
    case 'sine': { const side = R() < .5 ? -1 : 1; for (let i = 0; i < 6; i++) tl.push({ t: t + i * .32, type: 'scout', x: W / 2 + side * 60, mv: 'sine', amp: 150 * side }); break; }
    case 'fighters': { const n = 2 + (s >= 2 ? 1 : 0); for (let i = 0; i < n; i++) tl.push({ t: t + i * .3, type: 'fighter', x: (W / (n + 1)) * (i + 1), ty: 150 + R() * 120 }); break; }
    case 'turrets': { const n = 2 + Math.floor(R() * 2 + s / 2); for (let i = 0; i < n; i++) tl.push({ t, type: 'turret', x: 70 + (W - 140) * (n === 1 ? .5 : i / (n - 1)) }); break; }
    case 'gunship': tl.push({ t, type: 'gunship', x: cx }); break;
    case 'bomber': tl.push({ t, type: 'bomber', x: 0, y: 140 + R() * 220, dir: R() < .5 ? 1 : -1 }); break;
    case 'divers': for (let i = 0; i < 4; i++) tl.push({ t: t + i * .45, type: 'diver', x: 60 + R() * (W - 120) }); break;
    case 'carrier': tl.push({ t, type: 'carrier', x: W / 2 }); break;
    case 'mines': for (let i = 0; i < 4; i++) tl.push({ t: t + i * .5, type: 'mine', x: 60 + R() * (W - 120) }); break;
    case 'splitters': tl.push({ t, type: 'splitter', x: cx - 70 }, { t: t + .6, type: 'splitter', x: cx + 70 }); break;
    case 'tanks': { const d = R() < .5 ? 1 : -1; tl.push({ t, type: 'tank', x: d > 0 ? 60 : W - 60, dir: d }, { t: t + 1.2, type: 'tank', x: d > 0 ? 140 : W - 140, dir: d }); break; }
    case 'snipers': tl.push({ t, type: 'sniper', x: 90, ty: 110 }, { t: t + .4, type: 'sniper', x: W - 90, ty: 110 }); break;
    case 'hive': tl.push({ t, type: 'hive', x: W / 2 }); break;
    case 'helis': { const n = 2 + (s >= 3 ? 1 : 0); for (let i = 0; i < n; i++) tl.push({ t: t + i * .5, type: 'heli', x: (W / (n + 1)) * (i + 1), ty: 140 + R() * 150 }); break; }
    case 'lifter': tl.push({ t, type: 'lifter', x: cx }); break;
  }
}

function genLevel(L, tier = 0) {
  const s = Math.floor(L / LEVELS_PER), idx = L % LEVELS_PER, R = rng(L * 7919 + 13);
  const len = 62 + idx * 7 + s * 5;
  const tl = [];
  const pool = ['vee', 'sine', 'fighters', 'turrets', 'gunship', 'bomber', 'vee', 'sine', 'mines', 'helis'];
  if (s >= 1) pool.push('divers', 'splitters', 'tanks', 'lifter');
  if (s >= 2) pool.push('divers', 'fighters', 'gunship', 'snipers');
  if (s >= 3) pool.push('bomber', 'turrets', 'splitters', 'snipers', 'helis');
  if (s >= 4) pool.push('tanks', 'mines');
  let t = 2.5;
  while (t < len) { addWave(tl, pool[Math.floor(R() * pool.length)], t, R, s); t += (3.6 - Math.min(1.3, L * .065)) + R() * 1.3; }
  if (idx >= 1 || s >= 1) addWave(tl, 'carrier', len * .55, R, s);
  // higher tiers: the same mission, plus extra seeded waves layered on top
  if (tier > 0) {
    const R2 = rng(L * 7919 + 13 + tier * 101), extra = Math.round(len / 4.2 * TIERS[tier].extra);
    for (let i = 0; i < extra; i++) addWave(tl, pool[Math.floor(R2() * pool.length)], 3 + R2() * (len - 5), R2, s);
    if (tier >= 2) addWave(tl, 'carrier', len * .25, R2, s);
    if (tier >= 2 && s >= 1) addWave(tl, 'hive', len * .45, R2, s);
  }
  // the Hive: launches drones until destroyed
  if ((s >= 1 && idx === 2) || (s >= 3 && idx >= 1)) addWave(tl, 'hive', len * .72, R, s);
  const nSurv = 3 + Math.floor(s / 2);
  for (let i = 0; i < nSurv; i++) tl.push({ t: len * (i + .5) / nSurv + R() * 4 - 2, type: 'survivor', x: 70 + R() * (W - 140) });
  for (let i = 0; i < 2 + Math.ceil(s / 2); i++) tl.push({ t: 4 + R() * (len - 8), type: 'cache', x: 60 + R() * (W - 120) });
  const pa = partAt(L, tier);
  if (pa && !hasPart(pa.ship, pa.idx)) tl.push({ t: len * (.3 + R() * .4), type: 'salvage', x: 90 + R() * (W - 180), part: pa });
  tl.sort((a, b) => a.t - b.t); widen(tl);
  return { L, s, idx, len, tl, major: idx === LEVELS_PER - 1, survivors: nSurv, rush: false, tier, part: pa,
    label: `${s + 1}-${idx + 1}${tier ? ' ' + TIERS[tier].name : ''}`, name: idx === LEVELS_PER - 1 ? `Boss: ${SECTORS[s].boss}` : SECTORS[s].name };
}

// waves are authored for the 540px screen; stretch them across most of the wider world
function widen(tl) { const k = (W + PAN * 1.4) / W; for (const e of tl) if (e.x != null) e.x = W / 2 + (e.x - W / 2) * k; }

function genRush(s) {
  const R = rng(4242 + s * 31), tl = [], len = 42;
  for (let t = 1.5; t < len; t += 1.0 + R() * .8) {
    const k = R(), x = 70 + R() * (W - 140);
    if (k < .3) tl.push({ t, type: 'cache', x });
    else if (k < .65) { const side = R() < .5 ? -1 : 1; for (let i = 0; i < 6; i++) tl.push({ t: t + i * .22, type: 'scout', x: W / 2 + side * 60, mv: 'sine', amp: 160 * side }); }
    else tl.push({ t, type: 'stars', x, n: 25 + s * 15 });
  }
  widen(tl);
  return { L: s * LEVELS_PER + 1, s, idx: 0, len, tl, major: false, survivors: 0, rush: true, tier: 0, label: `★${s + 1}`, name: `Star Rush · ${SECTORS[s].name}` };
}

/* ------------------------------ STATE ------------------------------ */
let state = 'menu', paused = false;
let LV = null, run = null, P = null, ST = null, TM = TIERS[0], TH = { hp: 1, fire: 1, dmg: 1, elite: 0, rp: 1 };
let enemies = [], pb = [], eb = [], pickups = [], parts = [], texts = [], clouds = [];
let levelT = 0, gameT = 0, bgScroll = 0, shake = 0, flash = 0, boss = null, banner = null;
let curSector = 0;
const SCROLL = 70;
const keys = {};
let pointer = null;

function newRun(level) {
  LV = level; ST = stats(); curSector = LV.s; TM = TIERS[LV.tier || 0]; TH = LV.rush ? NO_THREAT : threat(LV.L, LV.tier || 0, ST);
  P = { x: W / 2, y: H - 160, tx: null, ty: null, vx: 0, r: ST.hitbox, hp: ST.maxHp, shield: ST.shield, shDelay: 0, inv: 1.5,
    bar: ST.barrier > 0, barT: 0,
    fireT: 0, wingT: 0, misT: 1, lasT: 3, lasOn: 0, droT: .5, flakT: 1.5, dead: false, revived: false };
  run = { stars: 0, baseCollected: 0, baseDropped: 0, kills: 0, total: 0, rescued: 0, damaged: false, bombs: ST.bombs,
    usedBomb: false, combo: 0, comboT: 0, bestCombo: 0, lastKill: -9, endT: 0, failT: 0, failed: false, rescueStars: 0, done: false,
    found: [], newShip: null };
  enemies = []; pb = []; eb = []; pickups = []; parts = []; texts = [];
  levelT = 0; boss = null; flash = 0; shake = 0; camX = 0; strikes = [];
  LV.tl = LV.tl.slice();
  seedBg();
  banner = { a: LV.rush ? 'STAR RUSH' : `MISSION ${LV.label}`, b: LV.rush ? 'Grab everything that glitters' : LV.name, t: 3 };
  state = 'play'; paused = false; showScreen(null); SND.duck(false);
  SND.music(LV.rush ? 'rush' : 'mission', LV.rush ? 900 + LV.s : LV.L * 7919 + 3, [0, -2, 2, -1, 1, -3][LV.s]); // Bb, Ab, C, A, B, G
  SND.takeoff(); SND.ambience(BIOMES[LV.s] === 'storm' ? 'rain' : null);
  if (TH.hp > 1.4 || TH.dmg > 1.3) setTimeout(() => toast(`⚠️ Legion threat ×${TH.hp.toFixed(1)}: they have up-armoured against your loadout${TH.dmg > 1.1 ? ` and load heavier rounds (×${TH.dmg.toFixed(1)})` : ''}.`), 1200);
}

/* ---------------------------- BACKGROUND ---------------------------- */
// Every sector has its own biome. Terrain scrolls with the ground; tall things lean away from the
// screen centre as they pass (a cheap top-down perspective) and everything is lit from the top-left.
// Shadows are drawn into one black offscreen layer and composited once, so overlaps never double up.
const BIOMES = ['isles', 'peaks', 'seas', 'sprawl', 'storm', 'core'];
const LX = .6, LY = .8; // direction the light travels (towards the bottom-right)
const GRADE = [null, 'rgba(255,160,80,.07)', 'rgba(110,70,190,.09)', 'rgba(8,16,50,.17)']; // dawn / day / dusk / night by mission
let terrain = [], wx = [], nextY = 0, bgT = 0, bgVar = 0, SHADOW = false;
const shadeCache = new Map();
function shade(hex, f) { // f<1 darkens, f>1 lightens toward white
  const k = hex + f; let v = shadeCache.get(k); if (v) return v;
  const n = parseInt(hex.slice(1), 16);
  v = 'rgb(' + [n >> 16, n >> 8 & 255, n & 255].map(x => Math.round(clamp(f <= 1 ? x * f : x + (255 - x) * (f - 1), 0, 255))).join(',') + ')';
  shadeCache.set(k, v); return v;
}
const lean = (x, y, h) => [(x - viewX - W / 2) / W * .6 * h, ((y - H * .6) / H * .45 - .28) * h];

const shCv = document.createElement('canvas'); shCv.width = W; shCv.height = H;
const shX = shCv.getContext('2d');
// in the shadow layer every colour is black, whatever the drawing code asks for
for (const p of ['fillStyle', 'strokeStyle']) Object.defineProperty(shX, p, { get: () => '#000', set: () => {} });
function shadowPass(fn, dx, dy, a) {
  const old = ctx; ctx = shX; SHADOW = true;
  shX.setTransform(1, 0, 0, 1, 0, 0); shX.globalAlpha = 1; shX.clearRect(0, 0, W, H); shX.setTransform(1, 0, 0, 1, -viewX, 0);
  try { fn(); } finally { ctx = old; SHADOW = false; }
  ctx.globalAlpha = a; ctx.drawImage(shCv, dx + viewX, dy); ctx.globalAlpha = 1;
}

const PAL = {
  isles:  { rock: '#7d8a74', ruin: '#8d979e' },
  peaks:  { rock: '#8c5c40', cap: '#d8cfc6', ground: ['#4a2c1c', '#24140d'] },
  seas:   { ice: '#dff1fa', iceSide: '#7fb3cf', rig: '#59636e' },
  sprawl: { wall: '#8a8f86', roof: '#a3a89c', ground: ['#2f4a2a', '#1e3320'], leaf: '#3d8c48' },
  storm:  { ground: ['#3a4a3c', '#1b231d'], rock: '#6c7068', wall: '#7a766c', roof: '#5d4a3c', water: '#2c3d47', mast: '#9aa3ab' },
  core:   { wall: '#3a4152', roof: '#4c5568', neon: '#b06bff', cyan: '#5fe0ff' },
};

function mkBlob(r, n, jit) { const pts = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, k = 1 - jit / 2 + Math.random() * jit; pts.push([Math.cos(a) * r * k, Math.sin(a) * r * k]); } return pts; }
const rectPts = (w, d) => [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
function canopy(n, r) { const c = []; for (let i = 0; i < n; i++) c.push([rand(-r, r), rand(-r, r), r * rand(.45, .75)]); return c; }

function mkTerrain0(y) {
  const b = BIOMES[curSector], v = bgVar, x = XL + Math.random() * WW;
  switch (b) {
    case 'isles': {
      if (Math.random() < .3 + v * .05) { // drowned tower block standing out of the sea
        const w = rand(34, 60), d = rand(34, 60);
        return { k: 'sunk', x, y, pts: rectPts(w, d), h: rand(40, 110), ext: 140, gap: rand(150, 230) };
      }
      const r = rand(55, 160), ruins = [], palms = [];
      for (let i = 0, n = Math.floor(Math.random() * (3 + v)); i < n; i++) ruins.push({ x: rand(-r * .38, r * .38), y: rand(-r * .38, r * .38), pts: rectPts(rand(12, 26), rand(12, 26)), h: rand(10, 34) });
      for (let i = 0, n = 2 + Math.floor(Math.random() * 5); i < n; i++) palms.push({ x: rand(-r * .5, r * .5), y: rand(-r * .45, r * .45), c: canopy(3, 9) });
      return { k: 'isle', x, y, r, pts: mkBlob(r, 18, .45), ruins, palms, ext: r + 60, gap: rand(230, 380) };
    }
    case 'peaks': {
      if (Math.random() < .26) return { k: 'post', x, y, pts: rectPts(rand(34, 52), rand(28, 42)), h: rand(24, 40), ext: 140, gap: rand(130, 200) }; // Legion outpost
      if (Math.random() < .28) { // lava river
        const pts = []; let px = 0; for (let i = 0; i <= 8; i++) { pts.push([px, -i * 55]); px += rand(-40, 40); }
        return { k: 'lava', x, y: y + 200, pts, ext: 480, gap: rand(60, 120), layer: 0 };
      }
      const r = rand(60, 150), vol = Math.random() < .12 + v * .12;
      return { k: 'peak', x, y, r, pts: mkBlob(r, 9, .5), h: r * rand(.7, 1.15) * (1 + v * .12), vol, ext: r + 160, gap: rand(150, 260), layer: 1 };
    }
    case 'seas': {
      const q = Math.random();
      if (q < .24) { const w = rand(70, 100); return { k: 'rig', x, y, pts: rectPts(w, w * .8), h: rand(60, 90), ext: 200, gap: rand(260, 380), ph: Math.random() * 6 }; }
      if (q < .45) { const r = rand(28, 55); return { k: 'berg', x, y, r, pts: mkBlob(r, 8, .55), h: rand(30, 70) * (1 + v * .15), ext: r + 100, gap: rand(190, 300), ph: Math.random() * 6 }; }
      const r = rand(25, 70); return { k: 'floe', x, y, r, pts: mkBlob(r, 11, .5), h: 7, ext: r + 20, gap: rand(110, 200), ph: Math.random() * 6 };
    }
    case 'sprawl': {
      if (Math.random() < .25) return { k: 'grove', x, y, trees: Array.from({ length: 3 + Math.floor(Math.random() * 5) }, () => ({ x: rand(-55, 55), y: rand(-45, 45), c: canopy(4, 12) })), ext: 90, gap: rand(80, 140) };
      const w = rand(48, 96), d = rand(48, 96), vines = canopy(2 + Math.floor(Math.random() * 3), Math.min(w, d) * .3);
      return { k: 'bldg', x: XL + 50 + Math.random() * (WW - 100), y, pts: rectPts(w, d), h: rand(35, 120) * (1 + v * .18), vines, ac: Math.random() < .6, ext: 260, gap: rand(60, 120) };
    }
    case 'storm': {
      const q = Math.random();
      if (q < .2) return { k: 'turbine', x, y, h: rand(95, 140), ext: 240, gap: rand(170, 260), ph: Math.random() * 6, sp: rand(1.4, 2.6) };
      if (q < .32) return { k: 'mast', x, y, h: rand(120, 170), ext: 260, gap: rand(160, 240), ph: Math.random() * 6 };
      if (q < .55) { const r = rand(50, 120); return { k: 'pool', x, y, r, pts: mkBlob(r, 12, .4), ext: r + 20, gap: rand(90, 160), layer: 0 }; }
      if (q < .8) return { k: 'farm', x, y, pts: rectPts(rand(40, 66), rand(30, 46)), h: rand(20, 36), barn: Math.random() < .6, ext: 130, gap: rand(120, 200) };
      const r = rand(30, 60); return { k: 'tor', x, y, pts: mkBlob(r, 8, .6), h: r * rand(.4, .7), ext: r + 60, gap: rand(120, 200) };
    }
    case 'core': {
      const q = Math.random();
      if (q < .3) return { k: 'cyl', x, y, r: rand(22, 40), h: rand(40, 90), ext: 160, gap: rand(140, 220), ph: Math.random() * 6 };
      if (q < .45) return { k: 'vent', x, y, r: rand(22, 36), ext: 50, gap: rand(80, 140), ph: Math.random() * 6 };
      const w = rand(50, 110), d = rand(50, 100);
      return { k: 'block', x, y, pts: rectPts(w, d), h: rand(30, 100) * (1 + v * .15), ext: 220, gap: rand(120, 200) };
    }
  }
}

/* Buildings fly at one of three altitudes:
   low   - below your altitude: scenery, bullets pass over it
   dest  - Legion-held (red roof marker): soaks up your fire, collapses for stars
   tall  - towers that reach your altitude (red beacon): indestructible, block shots both ways, and hurt
           and shove you aside if you clip them. None spawn late enough to still be on screen for the boss. */
const STRUCTS = new Set(['sunk', 'rig', 'bldg', 'farm', 'block', 'post']);
const TOWER_COL = { isles: '#8d979e', peaks: '#6e5244', seas: '#5d6872', sprawl: '#8a8f86', storm: '#77746c', core: '#3a4152' };
function mkTerrain(y) {
  const o = mkTerrain0(y);
  if (!STRUCTS.has(o.k)) return o;
  const inPlay = state === 'play' && LV, q = Math.random();
  const towers = inPlay && !LV.rush && !boss && levelT > 2 && levelT < LV.len - 22; // a tower takes ~20s to cross
  const dense = BIOMES[curSector] === 'sprawl' || BIOMES[curSector] === 'core'; // cities have far more buildings
  if (towers && q < (dense ? .1 : .25) + bgVar * .02) {
    const w = rand(44, 62), d = rand(40, 56);
    Object.assign(o, { beh: 'tall', pts: rectPts(w, d), hw: w / 2, hd: d / 2, h: rand(190, 240), ext: 300, x: clamp(o.x, XL + 60, XR - 60), barn: false, ph: Math.random() * 6 });
  } else if (inPlay && q < .45) {
    let hw = 0, hd = 0; for (const p of o.pts) { hw = Math.max(hw, Math.abs(p[0])); hd = Math.max(hd, Math.abs(p[1])); }
    Object.assign(o, { beh: 'dest', hw, hd, h: clamp(o.h, 30, 80), barn: false, hp: (30 + LV.L * 4) * TM.hp * TH.hp, flash: 0 });
    o.maxHp = o.hp;
  } else { o.beh = 'low'; o.h = Math.min(o.h, 46); }
  return o;
}
// the roof is what sits at your altitude, so that's where hits land (lean() uses the live camera)
function roofOf(o) { o.rx = o.x + (o.x - camX - W / 2) / W * .6 * o.h; o.ry = o.y + ((o.y - H * .6) / H * .45 - .28) * o.h; }
let solids = [];
function updStructs() {
  solids = [];
  for (const o of terrain) if (o.beh === 'tall' || (o.beh === 'dest' && !o.dead)) { roofOf(o); if (o.flash > 0) o.flash -= 1 / 30; if (o.ry > -80 && o.ry < H + 60) solids.push(o); }
  if (P.dead) return;
  for (const o of solids) {
    if (o.beh !== 'tall') continue;
    const m = P.r + 2;
    if (Math.abs(P.x - o.rx) < o.hw + m && Math.abs(P.y - o.ry) < o.hd + m) { // clipped a tower: shoved clear to the roomier side
      let side = P.x < o.rx ? -1 : 1;
      if (o.rx + side * (o.hw + m + 2) < XL + 20 || o.rx + side * (o.hw + m + 2) > XR - 20) side = -side;
      P.x = o.rx + side * (o.hw + m + 2); P.tx = null;
      if (P.inv <= 0) { SND.clang(); hurtPlayer(14); }
    }
  }
}
function solidAt(x, y, r) {
  for (const o of solids) if (!o.dead && Math.abs(x - o.rx) < o.hw + r && Math.abs(y - o.ry) < o.hd + r) return o;
  return null;
}
function hurtStruct(o, d) {
  o.hp -= d; o.flash = .12;
  if (o.hp > 0) return;
  o.dead = true; boom(o.rx, o.ry, 34); SND.crumble(); shake = Math.max(shake, 4);
  dropStars(o.rx, o.ry, Math.round((4 + LV.L * .6) * TM.stars));
  run.structs = (run.structs || 0) + 1;
}
function drawTower(o, pal) {
  const col = TOWER_COL[BIOMES[curSector]] || '#7a828c';
  const off = prism(o.x, o.y, o.pts, o.h, col, shade(col, 1.18), SHADOW ? 0 : 'rgba(255,96,72,.7)', 'rgba(0,0,0,.22)');
  if (SHADOW) return;
  const tx = o.x + off[0], ty = o.y + off[1];
  // hazard band round the roof edge and a warning beacon: this one is at your altitude
  ctx.strokeStyle = 'rgba(255,205,60,.9)'; ctx.lineWidth = 4; ctx.setLineDash([8, 6]);
  ctx.strokeRect(tx - o.hw + 4, ty - o.hd + 4, o.hw * 2 - 8, o.hd * 2 - 8); ctx.setLineDash([]);
  const on = Math.floor(bgT * 2.2 + o.ph) % 2;
  ctx.fillStyle = on ? '#ff4d3a' : '#8a2418'; ctx.beginPath(); ctx.arc(tx, ty, 7, 0, 7); ctx.fill();
  if (on) { ctx.fillStyle = 'rgba(255,77,58,.25)'; ctx.beginPath(); ctx.arc(tx, ty, 22, 0, 7); ctx.fill(); }
}
function drawStructMark(o) { // Legion-held: red roof roundel, white flash on hits, smoke once it's badly hurt
  const [ox, oy] = lean(o.x, o.y, o.h), tx = o.x + ox, ty = o.y + oy;
  ctx.fillStyle = o.flash > 0 ? 'rgba(255,255,255,.55)' : 'rgba(150,40,24,.4)'; ctx.fillRect(tx - o.hw, ty - o.hd, o.hw * 2, o.hd * 2);
  ctx.fillStyle = 'rgba(20,10,8,.5)'; ctx.beginPath(); ctx.arc(tx, ty, 12, 0, 7); ctx.fill();
  ctx.strokeStyle = '#ff5a3c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(tx, ty, 12, 0, 7); ctx.stroke();
  ctx.fillStyle = '#ff5a3c'; ctx.beginPath(); ctx.moveTo(tx, ty - 7); ctx.lineTo(tx + 6.5, ty + 5); ctx.lineTo(tx - 6.5, ty + 5); ctx.closePath(); ctx.fill();
  if (o.hp < o.maxHp * .5 && Math.random() < .05) wx.push({ x: tx + rand(-8, 8), y: ty, vx: rand(-10, 20), vy: rand(-35, -15), t: 2, sz: rand(8, 15), smoke: 1 });
}
function drawRubble(o, pal) {
  const col = TOWER_COL[BIOMES[curSector]] || '#7a828c';
  prism(o.x, o.y, o.pts.map(p => [p[0] * .9, p[1] * .9]), 7, shade(col, .45), shade(col, .55), SHADOW ? 0 : 'rgba(0,0,0,.3)');
  if (SHADOW) return;
  ctx.fillStyle = 'rgba(20,16,14,.45)'; ctx.beginPath(); ctx.ellipse(o.x, o.y, o.hw * 1.2, o.hd * 1.1, 0, 0, 7); ctx.fill();
  if (Math.random() < .03) wx.push({ x: o.x + rand(-10, 10), y: o.y, vx: rand(-10, 20), vy: rand(-30, -12), t: 2.4, sz: rand(10, 18), smoke: 1 });
}

function seedBg() {
  terrain = []; clouds = []; wx = [];
  bgVar = LV && !LV.rush ? LV.L % LEVELS_PER : 0;
  nextY = H + 220;
  while (nextY > -300) { const o = mkTerrain(nextY); terrain.push(o); nextY -= o.gap; }
  const nC = BIOMES[curSector] === 'seas' ? 9 : BIOMES[curSector] === 'storm' ? 8 : 6;
  seedStorm();
  for (let i = 0; i < nC; i++) clouds.push({ x: XL + Math.random() * WW, y: Math.random() * H, r: 60 + Math.random() * 90, sp: 1.6 + Math.random() });
  terrain.sort((a, b) => (a.layer || 1) - (b.layer || 1));
}
function updBg(dt) {
  bgT += dt; bgScroll += SCROLL * dt; nextY += SCROLL * dt;
  for (const o of terrain) o.y += SCROLL * dt;
  terrain = terrain.filter(o => o.y - o.ext < H + 80);
  let added = false;
  while (nextY > -300) { const o = mkTerrain(nextY); terrain.push(o); nextY -= o.gap; added = true; }
  if (added) terrain.sort((a, b) => (a.layer || 1) - (b.layer || 1));
  for (const c of clouds) { c.y += SCROLL * c.sp * dt; if (c.y - c.r > H) { c.y = -c.r * 2; c.x = XL + Math.random() * WW; } }
  updWeather(dt); updStorm(dt);
}

function blob(pts, sc) {
  ctx.beginPath();
  const n = pts.length;
  for (let i = 0; i <= n; i++) {
    const p = pts[i % n], q = pts[(i + 1) % n];
    const mx = (p[0] + q[0]) / 2 * sc, my = (p[1] + q[1]) / 2 * sc;
    if (i === 0) ctx.moveTo(mx, my); else ctx.quadraticCurveTo(p[0] * sc, p[1] * sc, mx, my);
  }
  ctx.closePath();
}
const absPts = (x, y, pts, ox = 0, oy = 0) => pts.map(p => [x + p[0] + ox, y + p[1] + oy]);

// An extruded polygon: shadow geometry in the shadow pass, otherwise lit walls plus a top face.
function prism(x, y, pts, h, side, top, edge, floors) {
  if (SHADOW) {
    const dx = h * .5, dy = h * .65, A = absPts(x, y, pts), B = absPts(x, y, pts, dx, dy);
    poly(A); ctx.fill(); poly(B); ctx.fill();
    for (let i = 0; i < A.length; i++) { const j = (i + 1) % A.length; poly([A[i], A[j], B[j], B[i]]); ctx.fill(); }
    return;
  }
  const [ox, oy] = lean(x, y, h), A = absPts(x, y, pts), T = absPts(x, y, pts, ox, oy), n = pts.length;
  let cx = 0, cy = 0; for (const p of pts) { cx += p[0] / n; cy += p[1] / n; }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, ex = pts[j][0] - pts[i][0], ey = pts[j][1] - pts[i][1], m = Math.hypot(ex, ey) || 1;
    let nx = ey / m, ny = -ex / m;
    if (nx * ((pts[i][0] + pts[j][0]) / 2 - cx) + ny * ((pts[i][1] + pts[j][1]) / 2 - cy) < 0) { nx = -nx; ny = -ny; }
    if (nx * ox + ny * oy >= 0) continue; // wall faces away from the camera
    ctx.fillStyle = shade(side, .5 + .55 * Math.max(0, -(nx * LX + ny * LY)));
    poly([A[i], A[j], T[j], T[i]]); ctx.fill();
    if (floors) { // storey lines
      ctx.strokeStyle = floors; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let f = 12; f < h - 4; f += 12) { const k = f / h; ctx.moveTo(A[i][0] + ox * k, A[i][1] + oy * k); ctx.lineTo(A[j][0] + ox * k, A[j][1] + oy * k); }
      ctx.stroke();
    }
  }
  ctx.fillStyle = top; poly(T); ctx.fill();
  if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = 1.5; poly(T); ctx.stroke(); }
  return [ox, oy];
}
function trees(x, y, list, leaf) {
  for (const t of list) {
    if (SHADOW) { for (const c of t.c) { ctx.beginPath(); ctx.arc(x + t.x + c[0] + 7, y + t.y + c[1] + 9, c[2], 0, 7); ctx.fill(); } continue; }
    const [ox, oy] = lean(x + t.x, y + t.y, 14);
    for (const c of t.c) { ctx.fillStyle = shade(leaf, .55); ctx.beginPath(); ctx.arc(x + t.x + c[0] + ox * .5, y + t.y + c[1] + oy * .5, c[2], 0, 7); ctx.fill(); }
    for (const c of t.c) { ctx.fillStyle = shade(leaf, 1.25); ctx.beginPath(); ctx.arc(x + t.x + c[0] + ox - c[2] * .25, y + t.y + c[1] + oy - c[2] * .3, c[2] * .6, 0, 7); ctx.fill(); }
  }
}

function drawTerrainObj(o, S) {
  if (o.beh === 'tall') return drawTower(o);
  if (o.dead) return drawRubble(o);
  drawTerrainKind(o, S);
  if (o.beh === 'dest' && !SHADOW) drawStructMark(o);
}
function drawTerrainKind(o, S) {
  const B = BIOMES[curSector], pal = PAL[B];
  switch (o.k) {
    case 'isle': {
      if (SHADOW) { for (const r of o.ruins) prism(o.x + r.x, o.y + r.y, r.pts, r.h); trees(o.x, o.y, o.palms); return; }
      ctx.save(); ctx.translate(o.x, o.y);
      ctx.fillStyle = 'rgba(110,235,220,.16)'; blob(o.pts, 1.3); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${.12 + Math.sin(bgT * 2 + o.r) * .05})`; blob(o.pts, 1.1); ctx.fill();
      ctx.fillStyle = shade(S.shore, .55); ctx.translate(0, 9); blob(o.pts, 1); ctx.fill(); ctx.translate(0, -9);
      ctx.fillStyle = S.shore; blob(o.pts, 1); ctx.fill();
      ctx.fillStyle = shade(S.land, .5); ctx.translate(0, 5); blob(o.pts, .8); ctx.fill(); ctx.translate(0, -5);
      const g = ctx.createRadialGradient(-o.r * .35, -o.r * .4, o.r * .05, 0, 0, o.r);
      g.addColorStop(0, shade(S.land, 1.3)); g.addColorStop(1, shade(S.land, .68));
      ctx.fillStyle = g; blob(o.pts, .8); ctx.fill();
      ctx.restore();
      for (const r of o.ruins) prism(o.x + r.x, o.y + r.y, r.pts, r.h, pal.ruin, shade(pal.ruin, 1.15));
      trees(o.x, o.y, o.palms, S.land);
      return; }
    case 'sunk': {
      if (!SHADOW) { ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.ellipse(o.x, o.y, 44 + Math.sin(bgT * 3) * 3, 36, 0, 0, 7); ctx.fill(); }
      const off = prism(o.x, o.y, o.pts, o.h, pal.ruin, shade(pal.ruin, 1.1), 'rgba(255,255,255,.12)', 'rgba(20,40,50,.4)');
      if (!SHADOW) { // broken windows on the roof slab
        ctx.fillStyle = 'rgba(20,30,40,.5)';
        for (let i = 0; i < 3; i++) ctx.fillRect(o.x + off[0] - 14 + i * 10, o.y + off[1] - 6, 6, 12);
      }
      return; }
    case 'lava': {
      if (SHADOW) return;
      const P = absPts(o.x, o.y, o.pts), glow = .55 + Math.sin(bgT * 2.5 + o.x) * .15;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const [w, c] of [[30, `rgba(255,90,20,${glow * .25})`], [12, '#a8300f'], [6, `rgba(255,170,60,${glow + .3})`]]) {
        ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); P.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke();
      }
      ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
      return; }
    case 'peak': {
      const A = absPts(o.x, o.y, o.pts), n = A.length;
      if (SHADOW) {
        const sp = [o.x + o.h * .9, o.y + o.h * 1.15];
        poly(A); ctx.fill();
        for (let i = 0; i < n; i++) { poly([sp, A[i], A[(i + 1) % n]]); ctx.fill(); }
        return;
      }
      const [ox, oy] = lean(o.x, o.y, o.h), pk = [o.x + ox, o.y + oy];
      const f = [];
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, mx = (A[i][0] + A[j][0]) / 2 - o.x, my = (A[i][1] + A[j][1]) / 2 - o.y, m = Math.hypot(mx, my) || 1;
        f.push({ i, j, nx: mx / m, ny: my / m, z: (mx / m) * ox + (my / m) * oy });
      }
      f.sort((a, b) => b.z - a.z);
      for (const q of f) {
        const lit = .38 + .62 * Math.max(0, -(q.nx * LX + q.ny * LY));
        ctx.fillStyle = shade(pal.rock, lit < .7 ? lit * .9 : 1 + (lit - .7) * .9); poly([pk, A[q.i], A[q.j]]); ctx.fill();
        const cap = o.vol ? .18 : .34, lerp = (p, t) => [pk[0] + (p[0] - pk[0]) * t, pk[1] + (p[1] - pk[1]) * t];
        ctx.fillStyle = shade(pal.cap, .55 + lit * .5); poly([pk, lerp(A[q.i], cap), lerp(A[q.j], cap)]); ctx.fill();
      }
      if (o.vol) {
        const g = ctx.createRadialGradient(pk[0], pk[1], 2, pk[0], pk[1], o.r * .45);
        g.addColorStop(0, '#ffe2a0'); g.addColorStop(.25, 'rgba(255,120,30,.9)'); g.addColorStop(1, 'rgba(255,60,20,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(pk[0], pk[1], o.r * .45, 0, 7); ctx.fill();
        if (Math.random() < .08) wx.push({ x: pk[0] + rand(-8, 8), y: pk[1], vx: rand(-10, 25), vy: rand(-40, -15), t: 3, sz: rand(10, 22), smoke: 1 });
      }
      return; }
    case 'floe': case 'berg': {
      const bob = Math.sin(bgT * 1.4 + o.ph) * (2 + bgVar);
      if (!SHADOW) { ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.save(); ctx.translate(o.x, o.y + bob + 4); blob(o.pts, 1.15); ctx.fill(); ctx.restore(); }
      const g = SHADOW ? 0 : ctx.createLinearGradient(o.x - o.r, o.y - o.r, o.x + o.r, o.y + o.r);
      if (g) { g.addColorStop(0, '#ffffff'); g.addColorStop(1, pal.iceSide); }
      prism(o.x, o.y + bob, o.pts, o.h, pal.iceSide, g || '#000', 'rgba(255,255,255,.5)');
      return; }
    case 'rig': {
      const bob = Math.sin(bgT * 1.1 + o.ph) * 2;
      if (!SHADOW) { ctx.fillStyle = 'rgba(255,255,255,.2)'; for (const p of o.pts) { ctx.beginPath(); ctx.arc(o.x + p[0] * .8, o.y + p[1] * .8 + bob, 9 + Math.sin(bgT * 3 + p[0]) * 2, 0, 7); ctx.fill(); } }
      const [ox, oy] = lean(o.x, o.y, o.h);
      if (SHADOW) { prism(o.x, o.y, o.pts.map(p => [p[0] * .9, p[1] * .9]), o.h); ctx.fillRect(o.x + o.h * .5, o.y + o.h * .65 - 60, 4, 60); return; }
      ctx.strokeStyle = shade(pal.rig, .7); ctx.lineWidth = 4;
      for (const p of o.pts) { ctx.beginPath(); ctx.moveTo(o.x + p[0] * .8, o.y + p[1] * .8 + bob); ctx.lineTo(o.x + p[0] * .8 + ox, o.y + p[1] * .8 + oy + bob); ctx.stroke(); }
      const off = prism(o.x, o.y + bob, o.pts.map(p => [p[0] * .95, p[1] * .2 - 4]), o.h, pal.rig, shade(pal.rig, 1.35), 'rgba(255,255,255,.2)');
      prism(o.x, o.y + bob, o.pts.map(p => [p[0] * .95, p[1] * .9]), o.h * .92, pal.rig, shade(pal.rig, 1.2), 'rgba(255,255,255,.15)');
      // relay mast with a blinking light
      const mx = o.x + off[0] * 1.6, my = o.y + bob + off[1] * 1.6;
      ctx.strokeStyle = '#c9d3dc'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(o.x + off[0], o.y + bob + off[1]); ctx.lineTo(mx, my); ctx.stroke();
      if (Math.floor(bgT * 2 + o.ph) % 2) { ctx.fillStyle = '#ff4d3a'; ctx.beginPath(); ctx.arc(mx, my, 4, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,77,58,.25)'; ctx.beginPath(); ctx.arc(mx, my, 12, 0, 7); ctx.fill(); }
      return; }
    case 'bldg': {
      const off = prism(o.x, o.y, o.pts, o.h, pal.wall, shade(pal.roof, 1), 'rgba(255,255,255,.18)', 'rgba(20,28,24,.45)');
      if (SHADOW) return;
      const tx = o.x + off[0], ty = o.y + off[1];
      if (o.ac) { ctx.fillStyle = shade(pal.roof, .7); ctx.fillRect(tx - 10, ty - 8, 16, 12); ctx.fillStyle = shade(pal.roof, 1.2); ctx.fillRect(tx - 10, ty - 8, 16, 3); }
      trees(tx, ty, [{ x: 0, y: 0, c: o.vines }], pal.leaf);
      return; }
    case 'grove': trees(o.x, o.y, o.trees, pal.leaf); return;
    case 'pool': { // flooded field, rain pocking the surface
      if (SHADOW) return;
      ctx.save(); ctx.translate(o.x, o.y);
      ctx.fillStyle = shade(pal.water, .8); blob(o.pts, 1.06); ctx.fill();
      ctx.fillStyle = pal.water; blob(o.pts, 1); ctx.fill();
      ctx.strokeStyle = 'rgba(200,220,235,.22)'; ctx.lineWidth = 1;
      for (let i = 0; i < 6; i++) { const k = (bgT * 1.6 + i / 6) % 1, a = i * 2.4 + o.r; ctx.beginPath(); ctx.arc(Math.cos(a) * o.r * .5, Math.sin(a) * o.r * .4, 2 + k * 9, 0, 7); ctx.globalAlpha = 1 - k; ctx.stroke(); }
      ctx.globalAlpha = 1; ctx.restore();
      return; }
    case 'farm': {
      prism(o.x, o.y, o.pts, o.h, pal.wall, shade(pal.roof, 1), 'rgba(255,255,255,.1)');
      if (o.barn) prism(o.x + 44, o.y + 12, rectPts(30, 22), o.h * .8, shade(pal.wall, .9), '#6e3b2c', 'rgba(255,255,255,.1)');
      return; }
    case 'tor': prism(o.x, o.y, o.pts, o.h, pal.rock, shade(pal.rock, 1.15), 'rgba(255,255,255,.08)'); return;
    case 'post': { // Legion outpost: a squat bunker with a radio whip
      const off = prism(o.x, o.y, o.pts, o.h, '#5c4a40', '#6f625a', 'rgba(255,255,255,.1)', 'rgba(0,0,0,.25)');
      if (SHADOW) return;
      ctx.strokeStyle = '#c9c0b4'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(o.x + off[0] + 10, o.y + off[1]); ctx.lineTo(o.x + off[0] * 1.5 + 10, o.y + off[1] * 1.5 - 4); ctx.stroke();
      return; }
    case 'turbine': {
      const [ox, oy] = lean(o.x, o.y, o.h), tx = o.x + ox, ty = o.y + oy, a0 = bgT * o.sp + o.ph;
      if (SHADOW) {
        const sx = o.x + o.h * .5, sy = o.y + o.h * .65;
        ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(sx, sy); ctx.stroke();
        ctx.lineWidth = 5; ctx.beginPath(); for (let i = 0; i < 3; i++) { const a = a0 + i * 2.094; ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(a) * 48, sy + Math.sin(a) * 48); } ctx.stroke();
        return;
      }
      ctx.lineCap = 'round';
      ctx.strokeStyle = shade(pal.mast, .7); ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.strokeStyle = shade(pal.mast, 1.2); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(o.x - 1, o.y - 1); ctx.lineTo(tx - 1, ty - 1); ctx.stroke();
      ctx.strokeStyle = '#e4e9ec'; ctx.lineWidth = 5; ctx.beginPath();
      for (let i = 0; i < 3; i++) { const a = a0 + i * 2.094; ctx.moveTo(tx, ty); ctx.lineTo(tx + Math.cos(a) * 48, ty + Math.sin(a) * 48 * .85); }
      ctx.stroke(); ctx.lineCap = 'butt';
      ctx.fillStyle = '#c3cacf'; ctx.beginPath(); ctx.arc(tx, ty, 6, 0, 7); ctx.fill();
      return; }
    case 'mast': { // lattice mast; lightning likes these
      const [ox, oy] = lean(o.x, o.y, o.h), tx = o.x + ox, ty = o.y + oy;
      if (SHADOW) { ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x + o.h * .5, o.y + o.h * .65); ctx.stroke(); return; }
      o.top = [tx, ty];
      ctx.strokeStyle = pal.mast; ctx.lineWidth = 2; ctx.beginPath();
      ctx.moveTo(o.x - 12, o.y); ctx.lineTo(tx, ty); ctx.moveTo(o.x + 12, o.y); ctx.lineTo(tx, ty);
      for (let k = .15; k < .9; k += .15) { const w = 12 * (1 - k); ctx.moveTo(o.x - w + ox * k, o.y + oy * k); ctx.lineTo(o.x + w + ox * (k + .15), o.y + oy * (k + .15)); }
      ctx.stroke();
      if (Math.floor(bgT * 1.5 + o.ph) % 2) { ctx.fillStyle = '#ff4d3a'; ctx.beginPath(); ctx.arc(tx, ty, 4, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,77,58,.3)'; ctx.beginPath(); ctx.arc(tx, ty, 13, 0, 7); ctx.fill(); }
      return; }
    case 'cyl': {
      const [ox, oy] = lean(o.x, o.y, o.h), r = o.r;
      if (SHADOW) { ctx.beginPath(); ctx.ellipse(o.x, o.y, r, r * .8, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.ellipse(o.x + o.h * .5, o.y + o.h * .65, r, r * .8, 0, 0, 7); ctx.fill(); ctx.lineWidth = r * 2; ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x + o.h * .5, o.y + o.h * .65); ctx.stroke(); return; }
      const a = Math.atan2(oy, ox), px = Math.cos(a + Math.PI / 2) * r, py = Math.sin(a + Math.PI / 2) * r * .8;
      const g = ctx.createLinearGradient(o.x - px, o.y - py, o.x + px, o.y + py);
      g.addColorStop(0, shade(pal.wall, 1.25)); g.addColorStop(1, shade(pal.wall, .5));
      ctx.fillStyle = g; poly([[o.x - px, o.y - py], [o.x + px, o.y + py], [o.x + px + ox, o.y + py + oy], [o.x - px + ox, o.y - py + oy]]); ctx.fill();
      ctx.beginPath(); ctx.ellipse(o.x, o.y, r, r * .8, 0, 0, 7); ctx.fill();
      ctx.fillStyle = shade(pal.roof, 1.1); ctx.beginPath(); ctx.ellipse(o.x + ox, o.y + oy, r, r * .8, 0, 0, 7); ctx.fill();
      const pulse = .5 + Math.sin(bgT * 3 + o.ph) * .35;
      ctx.fillStyle = `rgba(95,224,255,${pulse})`; ctx.beginPath(); ctx.ellipse(o.x + ox, o.y + oy, r * .55, r * .44, 0, 0, 7); ctx.fill();
      return; }
    case 'vent': {
      if (SHADOW) return;
      ctx.save(); ctx.translate(o.x, o.y);
      ctx.fillStyle = '#1a1e27'; hex(o.r); ctx.fill(); ctx.strokeStyle = shade(pal.roof, 1.2); ctx.lineWidth = 2; ctx.stroke();
      const g = .35 + Math.sin(bgT * 4 + o.ph) * .25;
      ctx.fillStyle = `rgba(176,107,255,${g})`; hex(o.r * .65); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 3;
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(-o.r * .6, i * o.r * .2); ctx.lineTo(o.r * .6, i * o.r * .2); ctx.stroke(); }
      ctx.restore();
      return; }
    case 'block': {
      const t = Math.sin(bgT * 2 + o.x) * .3 + .7;
      const off = prism(o.x, o.y, o.pts, o.h, pal.wall, shade(pal.roof, 1), SHADOW ? 0 : `rgba(176,107,255,${t})`, 'rgba(95,224,255,.18)');
      if (SHADOW) return;
      ctx.fillStyle = `rgba(95,224,255,${t * .8})`;
      ctx.fillRect(o.x + off[0] - 12, o.y + off[1] - 2, 24, 4);
      return; }
  }
}

// ground layers drawn under everything else
function drawGround(S) {
  const B = BIOMES[curSector], pal = PAL[B];
  if (B === 'peaks' || B === 'sprawl' || B === 'storm') {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, pal.ground[1]); g.addColorStop(1, pal.ground[0]);
    ctx.fillStyle = g; ctx.fillRect(XL - 30, 0, WW + 60, H);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, S.sea[1]); g.addColorStop(1, S.sea[0]);
    ctx.fillStyle = g; ctx.fillRect(XL - 30, 0, WW + 60, H);
  }
  if (B === 'isles') {
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 18; i++) { // sun glints and gentle swell
      const y = ((i * 97 + bgScroll * .9) % (H + 40)) - 20, x = XL + (i * 173) % WW;
      ctx.globalAlpha = .05 + .05 * Math.sin(bgT * 2 + i); ctx.fillRect(x, y, 40 + (i * 31) % 80, 2);
    }
    ctx.globalAlpha = 1;
  } else if (B === 'peaks') {
    ctx.fillStyle = 'rgba(0,0,0,.18)'; // cracked ash plain
    for (let i = 0; i < 26; i++) { const y = ((i * 131 + bgScroll) % (H + 60)) - 30, x = XL + (i * 211) % WW; ctx.fillRect(x, y, 2 + (i % 3), 18 + (i * 13) % 40); }
  } else if (B === 'seas') drawWaves(S);
  else if (B === 'sprawl') {
    const off = bgScroll % 300;
    ctx.fillStyle = '#3b3f3a';
    for (const x of [-34, 96, 330, 560]) ctx.fillRect(x, 0, 30, H);
    for (let y = off - 300; y < H; y += 300) ctx.fillRect(XL - 30, y, WW + 60, 30);
    ctx.fillStyle = 'rgba(230,220,140,.35)';
    for (const x of [110]) for (let y = (bgScroll % 40) - 40; y < H; y += 40) ctx.fillRect(x, y, 2, 20);
    for (let y = off - 300; y < H; y += 300) for (let x = XL - 20; x < XR + 20; x += 40) ctx.fillRect(x, y + 14, 20, 2);
    ctx.fillStyle = 'rgba(70,140,60,.35)'; // moss bursting through the asphalt
    for (let i = 0; i < 14; i++) { const y = ((i * 157 + bgScroll) % (H + 60)) - 30; ctx.beginPath(); ctx.arc(XL + (i * 89) % WW, y, 10 + i % 4 * 5, 0, 7); ctx.fill(); }
  } else if (B === 'storm') drawFields();
  else if (B === 'core') {
    const off = bgScroll % 64;
    ctx.strokeStyle = 'rgba(140,150,190,.10)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = -128; x <= W + 128; x += 64) { ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, H); }
    for (let y = off - 64; y < H; y += 64) { ctx.moveTo(XL - 30, y + .5); ctx.lineTo(XR + 30, y + .5); }
    ctx.stroke();
    for (const [x, c] of [[-40, pal.cyan], [64, pal.neon], [256, pal.cyan], [448, pal.neon], [580, pal.cyan]]) { // conduits with pulses running down them
      ctx.fillStyle = c; ctx.globalAlpha = .25; ctx.fillRect(x - 3, 0, 6, H); ctx.globalAlpha = 1;
      for (let k = 0; k < 3; k++) { const y = (bgT * 260 + k * 340 + x) % (H + 80) - 40; const g = ctx.createLinearGradient(0, y - 40, 0, y); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, c); ctx.fillStyle = g; ctx.fillRect(x - 3, y - 40, 6, 40); }
    }
  }
}

// rolling swell for the northern sea: each row is a wave face, lit at the crest and dark in the trough
function drawWaves(S) {
  const A = 5 + bgVar * 3.2, sp = 46, sc = bgScroll * 1.12, off = sc % sp, base = Math.floor(sc / sp);
  const hi = shade(S.sea[0], 1.3), lo = shade(S.sea[1], .85);
  for (let r = -1; r < H / sp + 2; r++) {
    const y0 = r * sp + off - sp, ph = (base - r) * 1.7;
    const yAt = x => y0 + A * Math.sin(x * .021 + bgT * 1.3 + ph) + A * .5 * Math.sin(x * .049 - bgT * .8 + ph * 2);
    const x0 = XL - 24, x1 = XR + 24;
    ctx.beginPath(); ctx.moveTo(x0, yAt(x0));
    for (let x = x0 + 12; x <= x1; x += 12) ctx.lineTo(x, yAt(x));
    ctx.lineTo(x1, y0 + sp + A * 2); ctx.lineTo(x0, y0 + sp + A * 2); ctx.closePath();
    const g = ctx.createLinearGradient(0, y0 - A, 0, y0 + sp); g.addColorStop(0, hi); g.addColorStop(.35, S.sea[0]); g.addColorStop(1, lo);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = `rgba(235,248,255,${.22 + bgVar * .06})`; ctx.lineWidth = 1.5 + bgVar * .5;
    ctx.beginPath(); for (let x = x0; x <= x1; x += 12) { const y = yAt(x); x > x0 ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
    if (bgVar >= 1) { // whitecaps on the highest crests
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      for (let x = x0 + 6; x < x1; x += 24) { const d = Math.sin(x * .021 + bgT * 1.3 + ph); if (d < -.85) { ctx.beginPath(); ctx.arc(x, yAt(x) - 1, 1.5 + bgVar * .6, 0, 7); ctx.fill(); } }
    }
  }
}

function drawBg() {
  const S = SECTORS[curSector];
  drawGround(S);
  shadowPass(() => { for (const o of terrain) drawTerrainObj(o, S); }, 0, 0, .3);
  for (const o of terrain) if (o.beh !== 'tall') drawTerrainObj(o, S);
}
function drawTowers() { for (const o of terrain) if (o.beh === 'tall') drawTower(o); }

const CLOUD_TINT = { isles: 'rgba(255,255,255,.07)', peaks: 'rgba(70,45,35,.22)', seas: 'rgba(210,222,232,.11)', sprawl: 'rgba(225,255,235,.06)', storm: 'rgba(48,54,66,.32)', core: 'rgba(170,110,255,.05)' };
function drawClouds() {
  const tint = CLOUD_TINT[BIOMES[curSector]];
  ctx.save(); ctx.translate(-viewX * .3, 0);
  for (const c of clouds) {
    for (const [dx, dy, col] of [[70, 110, 'rgba(0,0,0,.07)'], [0, 0, tint]]) {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(c.x + dx, c.y + dy, c.r, 0, 7); ctx.arc(c.x + dx + c.r * .6, c.y + dy + 10, c.r * .7, 0, 7); ctx.arc(c.x + dx - c.r * .6, c.y + dy + 14, c.r * .6, 0, 7); ctx.fill();
    }
  }
  ctx.restore();
}

// biome weather drawn over the action (embers, snow, pollen, data motes)
function updWeather(dt) {
  const B = BIOMES[curSector], want = { isles: 0, peaks: 40, seas: 70, sprawl: 24, storm: 130, core: 30 }[B];
  let n = wx.filter(p => !p.smoke).length;
  while (n < want) {
    n++;
    const p = { x: XL + Math.random() * WW, y: Math.random() * H, t: 1e9, sz: 2 };
    if (B === 'peaks') { p.vx = rand(-15, 15); p.vy = rand(-70, -25); p.c = Math.random() < .5 ? '#ffb347' : '#ff6a2a'; }
    if (B === 'seas') { p.vx = rand(-90, -50); p.vy = rand(220, 300); p.c = 'rgba(255,255,255,.75)'; p.sz = rand(1.5, 3); }
    if (B === 'sprawl') { p.vx = rand(-20, 20); p.vy = rand(20, 50); p.c = 'rgba(200,255,170,.55)'; p.ph = Math.random() * 6; }
    if (B === 'storm') { p.vx = rand(-140, -100); p.vy = rand(650, 820); p.c = 'rgba(190,210,230,.45)'; }
    if (B === 'core') { p.vx = 0; p.vy = rand(-50, -20); p.c = Math.random() < .5 ? 'rgba(95,224,255,.7)' : 'rgba(176,107,255,.7)'; p.sz = 3; }
    wx.push(p);
  }
  for (const p of wx) {
    p.x += (p.vx + (p.ph != null ? Math.sin(bgT * 2 + p.ph) * 30 : 0)) * dt; p.y += (p.vy + (p.smoke ? SCROLL : 0)) * dt; p.t -= dt;
    if (p.smoke) { p.sz += 8 * dt; continue; }
    if (p.y < -10) p.y = H + 10; if (p.y > H + 10) p.y = -10; if (p.x < XL - 10) p.x = XR + 10; if (p.x > XR + 10) p.x = XL - 10;
  }
  wx = wx.filter(p => p.t > 0);
}
function drawWeather() {
  if (BIOMES[curSector] === 'storm') { // wind-driven rain streaks, one path
    ctx.strokeStyle = 'rgba(190,210,230,.42)'; ctx.lineWidth = 1.3; ctx.beginPath();
    for (const p of wx) { ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * .035, p.y - p.vy * .035); }
    ctx.stroke(); return;
  }
  for (const p of wx) {
    if (p.smoke) { ctx.fillStyle = `rgba(70,58,54,${Math.min(.16, p.t * .06)})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.sz, 0, 7); ctx.fill(); continue; }
    ctx.fillStyle = p.c;
    if (BIOMES[curSector] === 'seas') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(-.3); ctx.fillRect(-p.sz / 2, -4, p.sz, 8); ctx.restore(); }
    else ctx.fillRect(p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz);
  }
}
let vignette = null;
function drawGrade() {
  ctx.save(); ctx.translate(viewX, 0);
  if (GRADE[bgVar]) { ctx.fillStyle = GRADE[bgVar]; ctx.fillRect(0, 0, W, H); }
  if (!vignette) { vignette = ctx.createRadialGradient(W * .42, H * .4, H * .25, W / 2, H / 2, H * .75); vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(0,0,0,.42)'); }
  ctx.fillStyle = vignette; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/* ------------------------------ STORM ------------------------------ */
// The Stormfront: dark cloud banks drift over the fight and hide anything flying beneath them, rain
// hazes the ground, and lightning lights the moor up for a moment. Bosses can call down strikes.
let banks = [], storm = { light: 0, next: 3, bolt: null }, strikes = [];
const isStorm = () => BIOMES[curSector] === 'storm';
const hash = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
function mkBank(y) {
  const r = rand(90, 140), puffs = [];
  for (let i = 0; i < 13; i++) { const u = rand(-1, 1); puffs.push([u * r * 1.15, rand(-r * .3, r * .3) * (1 - Math.abs(u) * .5), r * rand(.32, .58) * (1 - Math.abs(u) * .35)]); }
  return { x: rand(XL, XR), y, r, puffs, sp: rand(1.5, 2.1) };
}
function seedStorm() {
  banks = []; strikes = []; storm = { light: 0, next: 3, bolt: null };
  if (isStorm()) for (let i = 0; i < 3; i++) banks.push(mkBank(-200 + i * 380));
}
function boltPath(x0, y0, x1, y1) {
  const pts = [[x0, y0]], n = 9;
  for (let i = 1; i < n; i++) pts.push([x0 + (x1 - x0) * i / n + rand(-22, 22), y0 + (y1 - y0) * i / n]);
  pts.push([x1, y1]); return pts;
}
function updStorm(dt) {
  if (storm.light > 0) storm.light = Math.max(0, storm.light - dt * 2.2);
  if (storm.bolt && (storm.bolt.t -= dt) <= 0) storm.bolt = null;
  if (!isStorm()) return;
  for (const b of banks) {
    b.y += SCROLL * b.sp * dt; b.x -= 14 * dt;
    if (b.y - b.r > H + 40 && (!boss || Math.random() < .5)) Object.assign(b, mkBank(-b.r - rand(60, 260)));
  }
  if ((storm.next -= dt) <= 0) { // ambient lightning, drawn to a mast when one is in view
    storm.next = rand(2.5, 6.5);
    const m = terrain.filter(o => o.k === 'mast' && o.top && o.y > 80 && o.y < H - 80);
    const [x, y] = m.length && Math.random() < .6 ? m[0].top : [camX + rand(40, W - 40), rand(H * .25, H * .8)];
    storm.bolt = { pts: boltPath(x + rand(-80, 80), -20, x, y), t: .28 }; storm.light = 1; if (state === 'play') SND.thunder();
  }
}
function updStrikes(dt) {
  for (const s of strikes) {
    if (s.tele > 0) {
      s.tele -= dt;
      if (s.tele <= 0) {
        s.on = .25; shake = Math.max(shake, 5); storm.light = Math.max(storm.light, .7); SND.strike();
        s.pts = boltPath(s.x + rand(-60, 60), -20, s.x, s.y);
        if (!P.dead && (P.x - s.x) ** 2 + (P.y - s.y) ** 2 < 40 * 40) hurtPlayer(22);
      }
    } else s.on -= dt;
  }
  strikes = strikes.filter(s => s.tele > 0 || s.on > 0);
}
function drawFields() { // patchwork fields and hedgerows scrolling under the rain
  const rowH = 170, off = bgScroll % rowH, base = Math.floor(bgScroll / rowH);
  const tones = ['rgba(90,120,70,.25)', 'rgba(120,110,70,.22)', 'rgba(60,90,60,.28)', 'rgba(0,0,0,0)'];
  ctx.strokeStyle = 'rgba(14,24,14,.6)'; ctx.lineWidth = 4;
  for (let r = -1; r <= H / rowH + 1; r++) {
    const k = base - r, y = off + r * rowH;
    for (let x = XL - 40, c = 0; x < XR + 40; c++) {
      const w = 90 + hash(k, c) * 110;
      ctx.fillStyle = tones[Math.floor(hash(c, k) * 4)]; ctx.fillRect(x, y, w, rowH);
      ctx.strokeRect(x, y, w, rowH); x += w;
    }
  }
}
function drawStormHaze() { // rain haze over the ground; lightning burns through it
  const a = .5 * (1 - storm.light * .85);
  ctx.fillStyle = `rgba(16,22,30,${a})`; ctx.fillRect(XL - 40, 0, WW + 80, H);
  for (const e of enemies) if (e.type === 'survivor' || e.type === 'salvage') { // flares so they can still be found
    const k = (gameT * 1.2 + e.x * .01) % 1;
    ctx.strokeStyle = e.type === 'survivor' ? `rgba(255,120,80,${1 - k})` : `rgba(127,227,255,${1 - k})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(e.x, e.y, 14 + k * 26, 0, 7); ctx.stroke();
  }
}
function drawBanks() {
  const L = storm.light;
  for (const b of banks) {
    for (const [px, py, pr] of b.puffs) { // soft body
      const g = ctx.createRadialGradient(b.x + px, b.y + py, pr * .2, b.x + px, b.y + py, pr);
      g.addColorStop(0, `rgba(${64 + L * 120},${72 + L * 120},${86 + L * 120},.96)`); g.addColorStop(.7, 'rgba(52,60,74,.9)'); g.addColorStop(1, 'rgba(52,60,74,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x + px, b.y + py, pr, 0, 7); ctx.fill();
    }
    for (const [px, py, pr] of b.puffs) { // lit tops, toward the light
      const hx = b.x + px - pr * .25, hy = b.y + py - pr * .3, g = ctx.createRadialGradient(hx, hy, 0, hx, hy, pr * .65);
      g.addColorStop(0, `rgba(${150 + L * 90},${160 + L * 90},${176 + L * 79},.35)`); g.addColorStop(1, 'rgba(150,160,176,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(hx, hy, pr * .65, 0, 7); ctx.fill();
    }
  }
}
function drawBolt(pts, w) {
  for (const [lw, c] of [[w * 3, 'rgba(160,210,255,.25)'], [w, '#f2f8ff']]) {
    ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke();
  }
}
function drawStrikes() {
  for (const s of strikes) {
    if (s.tele > 0) {
      const k = 1 - s.tele / .95;
      ctx.fillStyle = `rgba(160,220,255,${.1 + k * .2})`; ctx.beginPath(); ctx.arc(s.x, s.y, 40 * k, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(190,235,255,.85)'; ctx.lineWidth = 2; ctx.setLineDash([7, 6]);
      ctx.beginPath(); ctx.arc(s.x, s.y, 40, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    } else {
      drawBolt(s.pts, 4);
      ctx.fillStyle = `rgba(220,240,255,${Math.min(1, s.on * 4)})`; ctx.beginPath(); ctx.arc(s.x, s.y, 46, 0, 7); ctx.fill();
    }
  }
}

/* ------------------------------ SPAWN ------------------------------ */
function spawn(ev) {
  if (ev.type === 'stars') { dropStars(ev.x, -20, ev.n, 120); return; }
  const d = ET[ev.type], hpm = (1 + LV.L * .42) * TM.hp * TH.hp, s = LV.s;
  const e = { type: ev.type, x: ev.x, y: ev.y ?? -40, x0: ev.x, hp: d.hp * hpm, maxHp: d.hp * hpm, r: d.r, mv: ev.mv || d.mv,
    t: 0, fireRate: d.fr ? d.fr / ((1 + s * .16) * DIFFS[save.diff].fire * TM.fire * TH.fire) : 0, counted: !d.neutral && !d.nocount && ev.counted !== false,
    ground: !!d.ground, neutral: !!d.neutral, nohit: !!d.nohit, stars: Math.round(d.stars * (1 + LV.L * .15) * TM.stars),
    amp: ev.amp || 120, dir: ev.dir || 1, ty: ev.ty || 200, ang: Math.PI / 2, flash: 0, vx: ev.vx || 0, vy: ev.vy || 0, prog: 0,
    spawnT: ev.type === 'hive' ? 1.5 : 2.5, arm: -1, aiming: 0, burst: 0, burstT: 0, bay: 0, part: ev.part, loyal: !!ev.loyal };
  if (ev.type === 'mini' || ev.type === 'mine' || ev.type === 'splitter') e.x = e.x0 = clamp(e.x, XL + 30, XR - 30);
  e.fire = e.fireRate ? e.fireRate * (.4 + Math.random() * .6) : 0;
  if (e.type === 'bomber') { e.x = e.dir > 0 ? XL - 60 : XR + 60; }
  // armoured elites: tougher, faster-firing, worth double
  if (!LV.rush && e.counted && !e.ground && ev.type !== 'hive' && Math.random() < .03 + s * .03 + (LV.tier || 0) * .07 + TH.elite) {
    e.elite = true; e.hp = e.maxHp = e.maxHp * 1.9; e.fireRate *= .75; e.stars *= 2; SND.elite();
  }
  if (ev.type === 'heli' || ev.type === 'lifter') SND.rotor(ev.type === 'lifter' ? 9 : 6);
  if (ev.type === 'bomber') SND.flyby();
  if (LV.rush) { e.fireRate = 0; e.stars *= 3; }
  if (e.counted) run.total++;
  enemies.push(e);
  return e;
}

const BOSSES = [
  { shape: 'manta',    pats: ['radial', 'fan', 'wave', 'minions', 'fan', 'rain'] },
  { shape: 'colossus', pats: ['cone', 'mines', 'spiral', 'fan', 'cone', 'rain'] },
  { shape: 'maw',      pats: ['shards', 'beam', 'radial', 'fan', 'shards', 'minions'] },
  { shape: 'thorn',    pats: ['cross', 'summon', 'wave', 'spiral', 'fan', 'beam'] },
  { shape: 'cell',     pats: ['bolts', 'spiral', 'fan', 'wave', 'bolts', 'minions'] },
  { shape: 'eye', phases: [['radial', 'fan', 'beam', 'shards'], ['cross', 'summon', 'cone', 'wave', 'beam'], ['spiral', 'shards', 'beam', 'mines', 'rain', 'cone']] },
];
const VANGUARD_PATS = [['fan', 'radial', 'wave'], ['cone', 'fan', 'spiral'], ['shards', 'fan', 'radial'], ['cross', 'fan', 'wave'], ['bolts', 'fan', 'rain'], ['beam', 'radial', 'cone']];
function spawnBoss() {
  const S = SECTORS[LV.s], major = LV.major, cfg = BOSSES[LV.s];
  const hp = (major ? 1500 : 620) * (1 + LV.L * .5) * TM.hp * TH.hp;
  boss = { type: 'boss', boss: true, major, x: W / 2, y: -160, hp, maxHp: hp, r: major ? 82 : 58, t: 0, pt: 0, pat: -1, rest: 1.5,
    fireT: 0, ang: 0, flash: 0, counted: false, ground: false, neutral: false, stars: Math.round((major ? 260 : 110) * (1 + LV.L * .2) * TM.stars),
    name: major ? S.boss : `${S.boss.split(' ')[0]} VANGUARD`, spin: 0, shape: cfg.shape, phase: 0,
    phases: major && cfg.phases ? cfg.phases : null, pats: major ? (cfg.phases ? cfg.phases[0] : cfg.pats) : VANGUARD_PATS[LV.s], beam: null };
  enemies.push(boss);
  banner = { a: 'WARNING', b: boss.name + ' INBOUND', t: 3, warn: true };
  SND.warn(); SND.music('boss', LV.L * 13 + 7, [0, -2, 2, -1, 1, -3][LV.s]);
}

/* ------------------------------ COMBAT ------------------------------ */
function addPB(x, y, vx, vy, dmg, r, kind) { pb.push({ x, y, vx, vy, dmg, r, kind }); }
function eShoot(x, y, a, sp) {
  sp *= DIFFS[save.diff].bspd * TM.bspd * (1 + LV.s * .05);
  const b = { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 6 };
  eb.push(b);
  return b;
}
const aim = e => Math.atan2(P.y - e.y, P.x - e.x);

function hurtEnemy(e, d, silent) {
  if (e.dead || e.nohit) return;
  if (Math.random() < ST.crit) { d *= 2; if (!silent && Math.random() < .3) texts.push({ x: e.x + rand(-10, 10), y: e.y - 10, s: 'CRIT', c: '#ffd34d', t: .5, sz: 14 }); }
  if (ST.od) d *= 1 + ST.od * Math.min(run.combo, 40) / 40;
  e.hp -= d; e.flash = .06;
  if (e.hp <= 0) killEnemy(e); else if (!silent) SND.hit();
}

function killEnemy(e) {
  e.dead = true;
  boom(e.x, e.y, e.r);
  if (e.boss) SND.bigBoom(); else if (e.type === 'cache') SND.cache(); else SND.boom(e.r);
  if (e.type === 'cache') {
    dropStars(e.x, e.y, Math.round((25 + LV.L * 7) * TM.stars) * (LV.rush ? 2 : 1));
    if (Math.random() < .5) pickups.push({ kind: 'hp', x: e.x, y: e.y, vx: rand(-40, 40), vy: -80, t: 0 });
    texts.push({ x: e.x, y: e.y - 20, s: 'SUPPLY CACHE', c: '#ffd34d', t: 1, sz: 15 });
    return;
  }
  if (e.type === 'salvage') {
    if (e.part) pickups.push({ kind: 'part', ship: e.part.ship, idx: e.part.idx, x: e.x, y: e.y, vx: 0, vy: -90, t: 0 });
    texts.push({ x: e.x, y: e.y - 24, s: 'SALVAGE CRATE: GRAB THE PART', c: '#7fe3ff', t: 1.4, sz: 14 });
    return;
  }
  if (e.type === 'splitter') SND.split();
  if (e.type === 'splitter') for (let i = -1; i <= 1; i++) spawn({ type: 'mini', x: e.x + i * 12, y: e.y, counted: false, vx: i * 170, vy: -70 });
  if (e.type === 'hive') { save.stats.hives++; shake = 10; }
  if (e.counted) run.kills++;
  save.stats.kills++;
  run.combo = (gameT - run.lastKill < 1.6) ? run.combo + 1 : 1;
  run.lastKill = gameT; run.comboT = 1.6;
  run.bestCombo = Math.max(run.bestCombo, run.combo);
  dropStars(e.x, e.y, e.stars);
  if (e.type !== 'scout' && Math.random() < .07) pickups.push({ kind: 'hp', x: e.x, y: e.y, vx: rand(-40, 40), vy: -60, t: 0 });
  if (e.boss) {
    for (let i = 0; i < 6; i++) setTimeout(() => boom(e.x + rand(-60, 60), e.y + rand(-40, 40), 40), i * 140);
    shake = 18; flash = .6; eb = [];
    enemies.forEach(o => { if (!o.boss && !o.neutral && !o.dead) { o.dead = true; boom(o.x, o.y, o.r); } });
    run.endT = 3.5;
    if (e.major) { save.stats.bosses++; if (!run.usedBomb) save.stats.nobombBoss++; }
    texts.push({ x: camX + W / 2, y: H / 2 - 60, s: `${e.name} DESTROYED`, c: '#ffd34d', t: 2.5, sz: 26 });
  }
}

function dropStars(x, y, total, vyBase) {
  run.baseDropped += total;
  let left = total, n = 0;
  while (left > 0 && n < 14) {
    const v = left >= 25 && n < 6 ? 10 : left >= 8 ? 5 : 1;
    const take = Math.min(v, left); left -= take; n++;
    pickups.push({ kind: 'star', v: take, x: x + rand(-8, 8), y: y + rand(-8, 8), vx: rand(-120, 120), vy: vyBase ?? rand(-180, -40), t: 0, spin: Math.random() * 6 });
  }
  if (left > 0) pickups.push({ kind: 'star', v: left, x, y, vx: 0, vy: vyBase ?? -100, t: 0, spin: 0 });
}

function comboMult() { return 1 + Math.min(run.combo, 60) / 30; }

function hurtPlayer(d) {
  if (P.inv > 0 || P.dead || run.endT > 0) return;
  if (P.bar) { // First Strike barrier eats the whole hit, then restores later
    P.bar = false; P.barT = ST.barrier; P.inv = .6; sparks(P.x, P.y, '#ffe08a', 14); SND.barrier();
    texts.push({ x: P.x, y: P.y - 44, s: 'FIRST STRIKE BLOCKED', c: '#ffe08a', t: 1, sz: 14 });
    return;
  }
  d *= DIFFS[save.diff].dmg * TM.dmg * TH.dmg * (1 - ST.armor);
  P.shDelay = 3;
  if (P.shield > 0) { const a = Math.min(P.shield, d); P.shield -= a; d -= a; }
  if (d > 0) { P.hp -= d; run.damaged = true; P.inv = .9 * ST.invMul; shake = 9; sparks(P.x, P.y, '#ff6a4a', 12); SND.hurt(); }
  else { P.inv = .35; sparks(P.x, P.y, '#6fe3ff', 8); SND.shield(); }
  if (P.hp <= 0) {
    if (ST.revive && !P.revived) {
      P.revived = true; P.hp = ST.maxHp * .5; P.inv = 2.5; eb = []; flash = .5; SND.revive();
      texts.push({ x: camX + W / 2, y: H / 2, s: 'EJECTION PROTOCOL — JARVIS HAS YOU', c: '#6fe3ff', t: 2, sz: 18 });
    } else {
      P.dead = true; run.failed = true; run.failT = 2; boom(P.x, P.y, 40); shake = 16; SND.bigBoom();
    }
  }
}

function useBomb() {
  if (state !== 'play' || paused || run.bombs <= 0 || P.dead || run.endT > 0) return;
  run.bombs--; run.usedBomb = true; flash = .7; shake = 10; SND.emp();
  eb.forEach(b => sparks(b.x, b.y, '#9ff', 1));
  eb = [];
  const d = 160 * (1 + LV.L * .3);
  for (const e of enemies) if (!e.neutral && !e.dead && e.y > -20) hurtEnemy(e, e.boss ? Math.min(d, e.maxHp * .05) : d, true);
  parts.push({ ring: true, x: P.x, y: P.y, r: 10, t: .6, c: '#7ff' });
}

/* ------------------------------ FX ------------------------------ */
function boom(x, y, r) {
  const n = Math.min(40, 8 + r * .6);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 7, s = rand(40, 200) * (r / 25 + .5);
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: rand(.3, .8), max: .8, c: ['#ffd34d', '#ff8a3d', '#ff4d2e', '#fff'][i % 4], sz: rand(2, 5) });
  }
  parts.push({ ring: true, x, y, r: r * .5, t: .35, c: '#ffb04d' });
}
function sparks(x, y, c, n) {
  for (let i = 0; i < n; i++) { const a = Math.random() * 7, s = rand(60, 220); parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: rand(.15, .4), max: .4, c, sz: 2 }); }
}

/* ------------------------------ UPDATE ------------------------------ */
function update(dt) {
  gameT += dt; levelT += dt;
  updBg(dt); updStrikes(dt); updStructs();
  if (banner) { banner.t -= dt; if (banner.t <= 0) banner = null; }
  if (shake > 0) shake = Math.max(0, shake - 40 * dt);
  if (flash > 0) flash -= dt;

  while (LV.tl.length && LV.tl[0].t <= levelT) spawn(LV.tl.shift());

  if (!LV.rush && !boss && LV.tl.length === 0 && levelT > LV.len + 2) {
    const alive = enemies.some(e => !e.neutral && !e.dead);
    if (!alive || levelT > LV.len + 9) spawnBoss();
  }
  if (LV.rush && LV.tl.length === 0 && levelT > LV.len + 4 && !run.endT) run.endT = 2;

  // ---- player
  if (!P.dead) {
    let kx = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
    let ky = (keys.ArrowDown || keys.KeyS ? 1 : 0) - (keys.ArrowUp || keys.KeyW ? 1 : 0);
    const ox = P.x;
    if (kx || ky) { const m = Math.hypot(kx, ky); P.x += kx / m * 400 * ST.speed * dt; P.y += ky / m * 400 * ST.speed * dt; P.tx = null; }
    else if (P.tx != null) {
      const dx = P.tx - P.x, dy = P.ty - P.y, d = Math.hypot(dx, dy), mx = 1000 * ST.speed * dt;
      if (d > mx) { P.x += dx / d * mx; P.y += dy / d * mx; } else { P.x = P.tx; P.y = P.ty; }
    }
    P.x = clamp(P.x, XL + 20, XR - 20); P.y = clamp(P.y, 60, H - 40);
    P.vx = (P.x - ox) / Math.max(dt, 1e-3);
    // camera eases toward the ship: at the world edge it has panned the full PAN
    camX += (clamp((P.x - W / 2) / (W / 2 + PAN - 20), -1, 1) * PAN - camX) * Math.min(1, dt * 5);
    P.inv -= dt;
    if (P.hp < ST.maxHp * .3 && run.endT <= 0) SND.alarm();
    if (ST.regen && P.hp < ST.maxHp) P.hp = Math.min(ST.maxHp, P.hp + ST.regen * dt);
    P.shDelay -= dt;
    if (ST.shield && P.shDelay <= 0 && P.shield < ST.shield) P.shield = Math.min(ST.shield, P.shield + ST.shield * .25 * dt);
    if (ST.barrier && !P.bar) { P.barT -= dt; if (P.barT <= 0) { P.bar = true; texts.push({ x: P.x, y: P.y - 44, s: 'BARRIER RESTORED', c: '#ffe08a', t: .9, sz: 13 }); } }
    fireWeapons(dt);
  }

  // ---- player bullets
  for (const b of pb) {
    if (b.kind === 'm') {
      let best = null, bd = 1e12;
      for (const e of enemies) if (!e.neutral && !e.dead && e.y > -30) { const d = dist2(b, e); if (d < bd) { bd = d; best = e; } }
      const sp = Math.min(650, Math.hypot(b.vx, b.vy) + 900 * dt);
      let a = Math.atan2(b.vy, b.vx);
      if (best) { const ta = Math.atan2(best.y - b.y, best.x - b.x); let da = ((ta - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI; a += clamp(da, -6 * dt, 6 * dt); }
      b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
      if (Math.random() < .5) parts.push({ x: b.x, y: b.y, vx: 0, vy: 0, t: .25, max: .25, c: '#ffae5c', sz: 2.5 });
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.life != null && (b.life -= dt) <= 0) { b.dead = true; continue; }
    if (b.y < -30 || b.y > H + 30 || b.x < XL - 30 || b.x > XR + 30) { b.dead = true; continue; }
    for (const e of enemies) {
      if (e.dead || e.nohit || e.y < -e.r) continue;
      if ((b.x - e.x) ** 2 + (b.y - e.y) ** 2 < (e.r + b.r) ** 2) {
        hurtEnemy(e, b.dmg); b.dead = true; sparks(b.x, b.y, '#bff', 2);
        if (b.kind === 'b' && ST.tesla && Math.random() < ST.tesla) zap(e);
        break;
      }
    }
    if (!b.dead) { const o = solidAt(b.x, b.y, b.r); if (o) { b.dead = true; if (o.beh === 'dest') { hurtStruct(o, b.dmg); sparks(b.x, b.y, '#ffb08a', 2); } else { sparks(b.x, b.y, '#d8dde3', 2); SND.ricochet(); } } }
  }
  pb = pb.filter(b => !b.dead);

  // ---- laser
  if (P.lasOn > 0 && !P.dead) {
    for (const e of enemies) if (!e.dead && !e.nohit && e.y < P.y && e.y > -e.r && Math.abs(e.x - P.x) < e.r + 14) hurtEnemy(e, ST.ldps * dt, true);
    for (const o of solids) if (o.beh === 'dest' && !o.dead && o.ry < P.y && Math.abs(o.rx - P.x) < o.hw + 14) hurtStruct(o, ST.ldps * dt);
  }

  // ---- enemies
  for (const e of enemies) { if (!e.dead) updEnemy(e, dt); }
  enemies = enemies.filter(e => !e.dead);
  for (const e of enemies) if (e.beam && e.beam.on > 0 && !P.dead && Math.abs(P.x - e.beam.x) < 26 && P.y > e.y) hurtPlayer(20);

  // ---- enemy bullets
  for (const b of eb) {
    if (b.split != null) { // shard: bursts into a ring
      b.split -= dt;
      if (b.split <= 0) { b.dead = true; for (let i = 0; i < 8; i++) eShoot(b.x, b.y, i / 8 * Math.PI * 2 + b.x * .01, 120); continue; }
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.y > H + 20 || b.y < -40 || b.x < XL - 20 || b.x > XR + 20) b.dead = true;
    else if (solids.length) { const o = solidAt(b.x, b.y, b.r * .5); if (o && o.beh === 'tall') { b.dead = true; sparks(b.x, b.y, '#ff9a7a', 2); continue; } }
    else if (!P.dead && (b.x - P.x) ** 2 + (b.y - P.y) ** 2 < (P.r + b.r - 1) ** 2) { b.dead = true; hurtPlayer(10 * (1 + LV.L * .04)); }
  }
  eb = eb.filter(b => !b.dead);

  // ---- pickups
  for (const p of pickups) {
    p.t += dt;
    const d = Math.hypot(P.x - p.x, P.y - p.y);
    const magR = p.kind === 'part' ? Math.max(ST.mag, 170) : ST.mag;
    if (!P.dead && (d < magR || run.endT > 0) && p.t > .25) {
      const sp = 380 + (magR - Math.min(d, magR)) * 3;
      p.vx += (P.x - p.x) / d * sp * dt * 6; p.vy += (P.y - p.y) / d * sp * dt * 6;
      const m = Math.hypot(p.vx, p.vy), cap = run.endT > 0 ? 900 : 620; if (m > cap) { p.vx *= cap / m; p.vy *= cap / m; }
    } else {
      p.vx *= Math.pow(.15, dt); p.vy += ((p.kind === 'part' ? 45 : SCROLL + 30) - p.vy) * Math.min(1, dt * 2.2);
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (!P.dead && d < P.r + 18) {
      p.dead = true;
      if (p.kind === 'star') {
        const val = p.v * ST.fortune * DIFFS[save.diff].stars * comboMult();
        run.stars += val; run.baseCollected += p.v; SND.star(run.combo);
      } else if (p.kind === 'part') { collectPart(p); SND.part(); }
      else { SND.heal(); P.hp = Math.min(ST.maxHp, P.hp + 25); texts.push({ x: P.x, y: P.y - 30, s: '+25 HULL', c: '#4cdf8a', t: .8, sz: 15 }); }
    } else if (p.y > H + 30) p.dead = true;
  }
  pickups = pickups.filter(p => !p.dead);

  // ---- fx
  for (const p of parts) {
    p.t -= dt;
    if (p.zap) continue;
    if (p.ring) p.r += 260 * dt; else { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .94; p.vy *= .94; }
  }
  parts = parts.filter(p => p.t > 0);
  for (const t of texts) { t.t -= dt; t.y -= 22 * dt; }
  texts = texts.filter(t => t.t > 0);

  if (run.comboT > 0) { run.comboT -= dt; if (run.comboT <= 0) run.combo = 0; }

  if (run.endT > 0) { run.endT -= dt; if (run.endT <= 0 && !run.done) finishLevel(true); }
  if (run.failT > 0) { run.failT -= dt; if (run.failT <= 0 && !run.done) finishLevel(false); }
}

function collectPart(p) {
  const arr = shipParts(p.ship);
  if (arr[p.idx]) return;
  arr[p.idx] = 1; persist();
  const S = shipById(p.ship), n = arr.filter(Boolean).length;
  run.found.push(`${S.name} ${PART_NAMES[p.idx]} (${n}/4)`);
  texts.push({ x: clamp(P.x, camX + 140, camX + W - 140), y: P.y - 54, s: `${S.name.toUpperCase()} ${PART_NAMES[p.idx].toUpperCase()} · ${n}/4`, c: '#7fe3ff', t: 1.8, sz: 16 });
  sparks(P.x, P.y, '#7fe3ff', 18);
  if (n === 4) { banner = { a: 'NEW SHIP', b: `${S.name} is ready in the Fleet bay`, t: 3 }; run.newShip = S; }
}

function fireWeapons(dt) {
  if (run.endT > 0) return;
  P.fireT -= dt;
  if (P.fireT <= 0) {
    P.fireT = ST.fireInt;
    const n = ST.streams;
    for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2); addPB(P.x + o * 11, P.y - 24, o * 40, -950, ST.dmg, 5, 'b'); }
    SND.shot();
    P.wingT ^= 1;
    if (ST.wings && P.wingT) { addPB(P.x - 18, P.y - 4, -170, -860, ST.wdmg, 4, 'w'); addPB(P.x + 18, P.y - 4, 170, -860, ST.wdmg, 4, 'w'); }
  }
  if (ST.mis) {
    P.misT -= dt;
    if (P.misT <= 0) { P.misT = ST.misInt; SND.missile(); addPB(P.x - 16, P.y, -180, -120, ST.mdmg, 6, 'm'); addPB(P.x + 16, P.y, 180, -120, ST.mdmg, 6, 'm'); }
  }
  if (ST.las) {
    if (P.lasOn > 0) P.lasOn -= dt;
    else { P.lasT -= dt; if (P.lasT <= 0) { P.lasOn = 1.7; P.lasT = ST.lasInt; SND.laser(); } }
  }
  if (ST.flak) {
    P.flakT -= dt;
    if (P.flakT <= 0) { P.flakT = ST.flakInt; SND.flak(); for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + gameT; pb.push({ x: P.x, y: P.y, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, dmg: ST.fdmg, r: 5, kind: 'f', life: .42 }); } }
  }
  if (ST.drones) {
    P.droT -= dt;
    if (P.droT <= 0) { P.droT = .32; for (const d of dronePos()) addPB(d.x, d.y - 8, 0, -850, ST.ddmg, 4, 'd'); }
  }
}
function zap(src) { // Tesla Coil: arc to the 3 nearest drones within reach
  const near = enemies.filter(o => o !== src && !o.dead && !o.neutral && !o.nohit && o.y > 0 && dist2(o, src) < 170 * 170)
    .sort((a, b) => dist2(a, src) - dist2(b, src)).slice(0, 3);
  let from = src; if (near.length) SND.zap();
  for (const o of near) { parts.push({ zap: true, x: from.x, y: from.y, x2: o.x, y2: o.y, t: .16, max: .16 }); hurtEnemy(o, ST.tdmg, true); from = o; }
}
function dronePos() {
  const out = [];
  for (let i = 0; i < ST.drones; i++) { const a = gameT * 2.2 + i * Math.PI * 2 / ST.drones; out.push({ x: P.x + Math.cos(a) * 52, y: P.y + Math.sin(a) * 30 + 6 }); }
  return out;
}

function updEnemy(e, dt) {
  e.t += dt; if (e.flash > 0) e.flash -= dt;
  if (e.boss) return updBoss(e, dt);
  switch (e.mv) {
    case 'down': e.y += 160 * dt; e.x += Math.sin(e.t * 3 + e.x0) * 20 * dt; break;
    case 'sine': e.y += 140 * dt; e.x = e.x0 + Math.sin(e.t * 2) * e.amp; break;
    case 'hover':
      if (e.t > 6.5) { e.vy = Math.min(e.vy + 220 * dt, 280); e.y += e.vy * dt; }
      else { e.y += (e.ty - e.y) * Math.min(1, dt * 2.2); e.x = e.x0 + Math.sin(e.t * 1.3) * 40; }
      break;
    case 'slow': e.y += 48 * dt; e.x = e.x0 + Math.sin(e.t * .7) * 50; break;
    case 'cross': e.x += e.dir * 120 * dt; break;
    case 'dive':
      if (e.t < .9) e.y += 130 * dt;
      else { if (!e.locked) { e.locked = 1; const a = aim(e); e.vx = Math.cos(a) * 340; e.vy = Math.sin(a) * 340; } e.x += e.vx * dt; e.y += e.vy * dt; }
      break;
    case 'ground': e.y += SCROLL * dt; break;
    case 'drift': e.y += 75 * dt; e.x = e.x0 + Math.sin(e.t * 1.5) * 25; break;
    case 'fling': e.x += e.vx * dt; e.y += e.vy * dt; e.vx *= Math.pow(.3, dt); e.vy += (170 - e.vy) * Math.min(1, dt * 1.5); break;
    case 'tank': e.y += SCROLL * dt; e.x += e.dir * 45 * dt; if (e.x < XL + 40 || e.x > XR - 40) e.dir *= -1; break;
    case 'hive':
      if (boss && !e.loyal) { e.y -= 70 * dt; if (e.y < -90) { e.dead = true; return; } } // retreats when the boss arrives
      else { if (e.y < 170) e.y += 50 * dt; e.x = W / 2 + Math.sin(e.t * .4) * 140; }
      if (e.bay > 0) e.bay -= dt;
      e.spawnT -= dt;
      if (e.spawnT <= 0 && e.y > 40 && (!boss || e.loyal)) {
        e.spawnT = 2.4 / Math.sqrt(TM.fire); e.bay = .4; SND.launch();
        const k = Math.floor(Math.random() * 3);
        if (k === 0) for (const sx of [-1, 1]) spawn({ type: 'scout', x: e.x + sx * 44, y: e.y + 30, counted: false });
        else if (k === 1) spawn({ type: 'diver', x: e.x, y: e.y + 40, counted: false });
        else for (let i = 0; i < 3; i++) spawn({ type: 'mini', x: e.x, y: e.y + 40, counted: false, vx: rand(-160, 160), vy: 40 });
      }
      break;
    case 'heli': // attack helicopter: drops to a station, sidesteps to new spots, then pulls out
      if (e.t > 11) { e.y -= 130 * dt; e.vx *= Math.pow(.2, dt); if (e.y < -60) { e.dead = true; return; } }
      else {
        e.y += (e.ty - e.y) * Math.min(1, dt * 1.8);
        if ((e.retT = (e.retT ?? .8) - dt) <= 0) { e.retT = rand(1.4, 2.4); e.tx = clamp(e.x0 + rand(-170, 170), XL + 40, XR - 40); }
        e.vx = clamp(((e.tx ?? e.x) - e.x) * 1.6, -150, 150); e.x += e.vx * dt;
      }
      break;
    case 'lift': // twin-rotor lifter: crawls down the screen and sets turrets down on the ground
      e.y += 52 * dt; e.x = e.x0 + Math.sin(e.t * .5) * 30;
      e.drops = e.drops || 0;
      if (e.drops < 2 && e.y > 170 && e.y < H * .6 && e.t > 3 + e.drops * 2.4) { e.drops++; spawn({ type: 'turret', x: e.x, y: e.y + 10, counted: false }); texts.push({ x: e.x, y: e.y + 40, s: 'TURRET DROPPED', c: '#ff8a6a', t: .8, sz: 12 }); }
      break;
    case 'carrier':
      e.y += (e.y < 190 ? 55 : 9) * dt; e.x = W / 2 + Math.sin(e.t * .5) * 120;
      e.spawnT -= dt;
      if (e.spawnT <= 0 && e.y > 0 && e.y < H * .6) { e.spawnT = 3.2; for (const s of [-1, 1]) spawn({ type: 'scout', x: e.x + s * 40, y: e.y + 20, counted: false }); }
      break;
  }
  if (e.type === 'turret' || e.type === 'tank' || e.type === 'sniper') e.ang = e.aiming > 0 || e.burst > 0 ? e.lockA : aim(e);
  // telegraphed bursts (sniper aim line, tank double-tap)
  if (e.aiming > 0) { e.aiming -= dt; if (e.aiming <= 0) { e.burst = 3; e.burstT = 0; SND.snipe(); } }
  if (e.burst > 0) { e.burstT -= dt; if (e.burstT <= 0) { e.burstT = e.type === 'tank' ? .18 : e.type === 'heli' ? .13 : .09; e.burst--; eShoot(e.x, e.y + 10, e.lockA, e.burstSp || 330); if (e.type !== 'sniper') SND.eshot(); } }
  // mines arm when you get close, then burst
  if (e.type === 'mine' && !P.dead) {
    if (e.arm < 0 && Math.hypot(P.x - e.x, P.y - e.y) < 85) { e.arm = .7; SND.mine(); }
    if (e.arm >= 0) {
      e.arm -= dt;
      if (e.arm <= 0) {
        e.dead = true; boom(e.x, e.y, 18);
        for (let i = 0; i < 8; i++) eShoot(e.x, e.y, i / 8 * Math.PI * 2, 150);
        if (Math.hypot(P.x - e.x, P.y - e.y) < 46) hurtPlayer(14);
        return;
      }
    }
  }
  // firing
  if (e.fireRate && e.y > 20 && e.y < H * .72 && !P.dead && run.endT <= 0) {
    e.fire -= dt;
    if (e.fire <= 0) {
      e.fire = e.fireRate * (.8 + Math.random() * .4);
      const a = aim(e);
      switch (e.type) {
        case 'fighter': case 'turret': eShoot(e.x, e.y + 10, a, 200); break;
        case 'gunship': for (let i = -1; i <= 1; i++) eShoot(e.x, e.y + 20, a + i * .22, 180); break;
        case 'bomber': eShoot(e.x, e.y + 12, Math.PI / 2, 160); break;
        case 'carrier': for (let i = 0; i < 10; i++) eShoot(e.x, e.y, i / 10 * Math.PI * 2 + e.t, 150); break;
        case 'sniper': e.aiming = .9; e.lockA = a; e.burstSp = 330; SND.aim(); break;
        case 'tank': e.lockA = a; e.burst = 2; e.burstT = 0; e.burstSp = 190; break;
        case 'heli': e.lockA = a; e.burst = 3; e.burstT = 0; e.burstSp = 230; break;
        case 'lifter': for (const sx of [-1, 1]) eShoot(e.x + sx * 16, e.y, a + sx * .14, 170); break;
        case 'hive': if (!e.loyal || !boss) for (let i = 0; i < 6; i++) eShoot(e.x, e.y + 30, a + (i - 2.5) * .22, 140); break;
      }
      if (e.type !== 'sniper') SND.eshot();
    }
  }
  // rescue
  if (e.type === 'survivor' && !P.dead) {
    const near = Math.hypot(P.x - e.x, P.y - e.y) < 46;
    if (near) {
      e.prog += dt / 1.1 * ST.rescue;
      if (e.prog >= 1) {
        e.dead = true; run.rescued++; save.stats.rescues++; SND.rescue();
        const v = Math.round((30 + LV.L * 6) * DIFFS[save.diff].stars * TM.stars * ST.rescueStars);
        run.stars += v; run.rescueStars += v;
        texts.push({ x: e.x, y: e.y - 24, s: `SURVIVOR RESCUED +${v}★`, c: '#4cdf8a', t: 1.4, sz: 16 });
        sparks(e.x, e.y, '#4cdf8a', 16);
      }
    } else e.prog = Math.max(0, e.prog - dt * .6);
  }
  // body collision
  if (!e.ground && !e.neutral && !P.dead && (e.x - P.x) ** 2 + (e.y - P.y) ** 2 < (e.r * .75 + P.r) ** 2) {
    hurtPlayer(18); hurtEnemy(e, 60, true);
  }
  if (e.y > H + 70 || e.x < XL - 130 || e.x > XR + 130) e.dead = true;
}

function updBoss(e, dt) {
  e.spin += dt;
  if (e.beam) { // telegraph, then a column of light down from the boss
    const b = e.beam;
    if (b.tele > 0) { b.tele -= dt; if (b.tele <= 0) { b.on = .9; shake = 6; SND.strike(); } }
    else if (b.on > 0) { b.on -= dt; if (b.on <= 0) e.beam = null; }
  }
  if (e.y < 190) { e.y += 90 * dt; return; }
  // sway clock starts on arrival (it used to reuse e.t, which made the boss jump sideways), and x eases toward it
  e.mt = (e.mt || 0) + dt;
  e.x += (W / 2 + Math.sin(e.mt * .45) * (W / 2 + PAN * .6 - e.r - 30) - e.x) * Math.min(1, dt * 4);
  if (e.phases) {
    const ph = e.hp < e.maxHp / 3 ? 2 : e.hp < e.maxHp * 2 / 3 ? 1 : 0;
    if (ph !== e.phase) {
      e.phase = ph; e.pats = e.phases[ph]; e.pat = -1; e.rest = 1.2; e.beam = null; eb = []; flash = .4; shake = 12;
      SND.warn(); banner = { a: `PHASE ${ph + 1}`, b: ph === 2 ? 'The Overseer is desperate' : 'The Overseer adapts', t: 2.2, warn: true };
      if (ph === 1) spawn({ type: 'hive', x: W / 2, y: -60, counted: false, loyal: true });
    }
  }
  const rage = (e.hp < e.maxHp * .5 ? .82 : 1) / Math.sqrt(TM.fire);
  const pats = e.pats;
  if (e.rest > 0) { e.rest -= dt; if (e.rest <= 0) { e.pat = (e.pat + 1) % pats.length; e.pt = 0; e.fireT = 0; } return; }
  e.pt += dt; e.fireT -= dt;
  const p = pats[e.pat], s = LV.s;
  if (e.fireT <= 0) {
    // Every boss must be beatable without taking a hit. Each pattern is built from fixed geometry with a
    // guaranteed way through: a gap needs >24px between bullet centres (hitbox 7 + bullet 6, both sides), so rings
    // and fans keep that from ~200px out; walls and the rain carry an open lane that moves slower than the ship;
    // nothing random lands on top of you; and telegraphed hits (beam, lightning) give you time and a clear exit.
    // Checked with a dodge bot that reacts only every 0.2s and moves at 320px/s (see README).
    switch (p) {
      case 'radial': { // rings, each turned half a step from the last
        e.fireT = .9 * rage; const n = 14 + s * 2; e.ring = (e.ring || 0) + Math.PI / n;
        for (let i = 0; i < n; i++) eShoot(e.x, e.y + 20, e.ring + i / n * Math.PI * 2, 135); SND.volley(); break; }
      case 'fan': { e.fireT = .6 * rage; const a = aim(e); for (let i = -2; i <= 2; i++) eShoot(e.x, e.y + 30, a + i * .2, 185); SND.volley(); break; }
      case 'spiral': { // two arms, alternating direction each time the pattern comes round
        e.fireT = .1 * rage; if (e.pt < .1) e.sdir = -(e.sdir || 1);
        const a = e.pt * 2.6 * e.sdir; eShoot(e.x, e.y, a, 145); eShoot(e.x, e.y, a + Math.PI, 145); break; }
      case 'minions': { e.fireT = 99; for (let i = 0; i < 4; i++) spawn({ type: 'diver', x: XL + 80 + i * (WW - 160) / 3, y: -30, counted: false }); break; }
      case 'rain': { // straight lanes falling from the sky with one drifting open stretch; you can also sit between lanes
        e.fireT = .5 * rage;
        const amp = WW / 2 - 130; if (e.pt < .1) e.gseed = Math.asin(clamp((P.x - W / 2) / amp, -1, 1)); // the gap opens where you are
        const gc = W / 2 + Math.sin(e.pt * .7 + e.gseed) * amp;
        for (let x = XL + 30; x < XR - 10; x += 72) if (Math.abs(x - gc) > 80) eShoot(x, -10, Math.PI / 2, 150);
        break; }
      case 'wave': { // walls with a three-lane gap that only ever shifts one lane
        e.fireT = .9 * rage; const n = 15;
        e.gap = e.gap == null ? 6 : clamp(e.gap + Math.round(rand(-1, 1)), 1, n - 4);
        for (let i = 0; i < n; i++) if (i < e.gap || i > e.gap + 2) eShoot(XL + 20 + i * (WW - 40) / (n - 1), e.y + 30, Math.PI / 2, 120);
        SND.volley(); break; }
      case 'cone': { // flame tongues: aim locks for each four-arc burst, so the lanes between the rays stay straight
        e.fireT = .16 * rage; e.fc = (e.fc || 0) + 1;
        if (e.fc % 8 < 4) { if (e.fc % 8 === 0) e.ca = aim(e); break; } // breath
        for (let i = -3; i <= 3; i++) eShoot(e.x, e.y + e.r * .6, e.ca + i * .16, 170);
        if (e.fc % 8 === 4) SND.flame(); break; }
      case 'mines': { e.fireT = 99; for (let i = 0; i < 3; i++) spawn({ type: 'mine', x: XL + 110 + i * (WW - 220) / 2, y: e.y + 20, counted: false }); break; }
      case 'shards': { e.fireT = 1.1 * rage; const a = aim(e); for (let i = -1; i <= 1; i++) { const b = eShoot(e.x, e.y + 30, a + i * .4, 130); b.r = 11; b.split = .9; } SND.volley(); break; }
      case 'beam': { e.fireT = 99; e.beam = { x: clamp(P.x, XL + 30, XR - 30), tele: 1.3, on: 0 }; SND.charge(); break; }
      case 'cross': { // four rotating arms that reverse each time
        e.fireT = .14 * rage; if (e.pt < .1) e.sdir = -(e.sdir || 1);
        for (let k = 0; k < 4; k++) eShoot(e.x, e.y, e.pt * 1.3 * e.sdir + k * Math.PI / 2, 145); break; }
      case 'bolts': { // one strike on you and two flanking it, so stepping up or down is always clear
        e.fireT = 1.35;
        const bx = clamp(P.x, XL + 30, XR - 30), by = clamp(P.y, 140, H - 60);
        for (const dx of [0, -105, 105]) strikes.push({ x: clamp(bx + dx, XL + 30, XR - 30), y: by, tele: 1, on: 0 });
        break; }
      case 'summon': { e.fireT = 99; for (const sx of [-1, 1]) spawn({ type: 'splitter', x: e.x + sx * 120, y: e.y, counted: false }); break; }
    }
  }
  const dur = { minions: 1.5, mines: 1.5, summon: 1.5, beam: 2.8, rain: 4 }[p] || 3.2;
  if (e.pt > dur) e.rest = 1.1 * rage;
  if (!P.dead && (e.x - P.x) ** 2 + (e.y - P.y) ** 2 < (e.r * .7 + P.r) ** 2) hurtPlayer(25);
}

/* ------------------------------ RENDER ------------------------------ */
function star(x, y, r, rot) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = rot + i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * .45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath();
}
function poly(pts) { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); }

const SHAPES = {
  delta:   [[0, -32], [7, -12], [9, -2], [32, 12], [32, 19], [9, 14], [6, 20], [-6, 20], [-9, 14], [-32, 19], [-32, 12], [-9, -2], [-7, -12]],
  swept:   [[0, -34], [6, -10], [10, 0], [30, 20], [26, 24], [8, 14], [5, 20], [-5, 20], [-8, 14], [-26, 24], [-30, 20], [-10, 0], [-6, -10]],
  wide:    [[0, -28], [8, -10], [12, -4], [36, 4], [36, 14], [12, 14], [7, 20], [-7, 20], [-12, 14], [-36, 14], [-36, 4], [-12, -4], [-8, -10]],
  heavy:   [[0, -30], [10, -16], [14, -2], [30, 6], [34, 20], [14, 18], [10, 24], [-10, 24], [-14, 18], [-34, 20], [-30, 6], [-14, -2], [-10, -16]],
  forward: [[0, -32], [7, -12], [10, 4], [30, -6], [32, 2], [12, 16], [6, 22], [-6, 22], [-12, 16], [-32, 2], [-30, -6], [-10, 4], [-7, -12]],
};
SHAPES.ring = SHAPES.delta;
function drawPlayerShip(x, y, tilt, scale = 1, id = save.ship) {
  const S = shipById(id), pts = SHAPES[S.shape] || SHAPES.delta;
  ctx.save(); ctx.translate(x, y); ctx.scale(scale * (1 - Math.abs(tilt) * .25), scale);
  const fl = 16 + Math.random() * 10;
  ctx.globalAlpha = .85; ctx.fillStyle = S.col[2]; poly([[-7, 16], [0, 16 + fl], [7, 16]]); ctx.fill(); ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(255,255,255,.9)'; poly([[-3, 16], [0, 12 + fl * .6], [3, 16]]); ctx.fill();
  const lx = -32 - tilt * 24, hull = SHADOW ? '#000' : ctx.createLinearGradient(lx, -30, lx + 64, 24);
  if (!SHADOW) { hull.addColorStop(0, shade(S.col[0], 1.3)); hull.addColorStop(.5, S.col[0]); hull.addColorStop(1, shade(S.col[0], .55)); }
  ctx.fillStyle = hull; poly(pts); ctx.fill();
  ctx.fillStyle = SHADOW ? '#000' : bodyGrad(26, S.col[1]); poly(pts.map(([px, py]) => [px * .55, py * .7 + 6])); ctx.fill();
  if (!SHADOW) { ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(0, 10); ctx.stroke(); }
  ctx.fillStyle = S.col[2];
  for (const sx of [-1, 1]) { const tip = pts.reduce((a, q) => q[0] * sx > a[0] * sx ? q : a); ctx.beginPath(); ctx.arc(tip[0] - sx * 4, tip[1] - 1, 3, 0, 7); ctx.fill(); }
  ctx.fillStyle = '#ff9a3d'; ctx.fillRect(-2, 4, 4, 12);
  if (S.shape === 'ring') { ctx.strokeStyle = S.col[2]; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(0, 6, 27, 9, 0, 0, 7); ctx.stroke(); }
  const g = ctx.createLinearGradient(0, -24, 0, -4); g.addColorStop(0, '#ffffff'); g.addColorStop(1, S.col[2]);
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -13, 4.5, 10, 0, 0, 7); ctx.fill();
  ctx.restore();
}
const iconCache = {};
function shipIcon(id) {
  if (iconCache[id]) return iconCache[id];
  const c = document.createElement('canvas'); c.width = c.height = 144;
  const old = ctx; ctx = c.getContext('2d');
  try { drawPlayerShip(72, 70, 0, 1.75, id); } finally { ctx = old; }
  return (iconCache[id] = c.toDataURL());
}
// lit from the top-left: a light edge, the base colour, then a dark edge
function bodyGrad(r, c) {
  if (SHADOW) return '#000';
  const g = ctx.createLinearGradient(-r, -r, r, r);
  g.addColorStop(0, shade(c, 1.4)); g.addColorStop(.45, c); g.addColorStop(1, shade(c, .5));
  return g;
}
function hex(r) { ctx.beginPath(); for (let i = 0; i < 6; i++) ctx.lineTo(Math.cos(i * Math.PI / 3) * r, Math.sin(i * Math.PI / 3) * r); ctx.closePath(); }

function drawEnemy(e) {
  const S = SECTORS[LV ? LV.s : 0], col = e.flash > 0 ? '#fff' : bodyGrad(e.r, S.enemy);
  ctx.save(); ctx.translate(e.x, e.y);
  if (e.ground && BIOMES[curSector] === 'seas' && e.type !== 'survivor') { // floating platform
    const bob = Math.sin(bgT * 1.4 + e.x0) * 2;
    ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.ellipse(0, 6 + bob, 32, 26, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#2a323c'; rr(-26, -22 + bob, 52, 48, 8); ctx.fill();
    ctx.fillStyle = '#4a5562'; rr(-26, -26 + bob, 52, 46, 8); ctx.fill();
    ctx.translate(0, bob - 3);
  }
  switch (e.type) {
    case 'heli': {
      ctx.rotate(clamp(e.vx / 600, -.25, .25));
      ctx.fillStyle = col; ctx.fillRect(-2.5, -38, 5, 30); // tail boom
      ctx.fillRect(-9, -40, 18, 4);
      ctx.fillStyle = '#3a3f4a'; ctx.fillRect(-19, -2, 38, 6); // stub wings and rocket pods
      for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * 18, 1, 4, 0, 7); ctx.fill(); }
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, 4, 11, 18, 0, 0, 7); ctx.fill();
      ctx.fillStyle = SHADOW ? '#000' : 'rgba(150,220,255,.85)'; ctx.beginPath(); ctx.ellipse(0, 13, 6, 7, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.beginPath(); ctx.arc(0, 2, 32, 0, 7); ctx.fill();
      ctx.strokeStyle = '#1d2027'; ctx.lineWidth = 3;
      const ra = gameT * 28 + e.x0; ctx.beginPath();
      for (const k of [0, Math.PI / 2]) { ctx.moveTo(Math.cos(ra + k) * 32, 2 + Math.sin(ra + k) * 32); ctx.lineTo(-Math.cos(ra + k) * 32, 2 - Math.sin(ra + k) * 32); }
      ctx.stroke();
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-7, -38 + Math.sin(ra * 1.7) * 6); ctx.lineTo(7, -38 - Math.sin(ra * 1.7) * 6); ctx.stroke();
      ctx.fillStyle = '#ff3b2e'; ctx.beginPath(); ctx.arc(0, 2, 3, 0, 7); ctx.fill();
      break; }
    case 'lifter': {
      ctx.fillStyle = '#3a3f4a'; rr(-15, -40, 30, 80, 10); ctx.fill();
      ctx.fillStyle = col; rr(-12, -37, 24, 74, 9); ctx.fill();
      ctx.fillStyle = '#2b2f38'; ctx.fillRect(-8, -6, 16, 14);
      ctx.fillStyle = SHADOW ? '#000' : 'rgba(150,220,255,.8)'; rr(-8, 28, 16, 8, 3); ctx.fill();
      ctx.strokeStyle = '#1d2027'; ctx.lineWidth = 3;
      for (const [cy, dir] of [[-26, 1], [26, -1]]) {
        ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.beginPath(); ctx.arc(0, cy, 30, 0, 7); ctx.fill();
        const ra = gameT * 22 * dir + e.x0; ctx.beginPath();
        for (let k = 0; k < 3; k++) { const q = ra + k * 2.094; ctx.moveTo(0, cy); ctx.lineTo(Math.cos(q) * 30, cy + Math.sin(q) * 30); }
        ctx.stroke();
        ctx.fillStyle = '#ff3b2e'; ctx.beginPath(); ctx.arc(0, cy, 3, 0, 7); ctx.fill();
      }
      break; }
    case 'scout':
      ctx.fillStyle = col; poly([[0, 16], [14, -6], [6, -12], [0, -6], [-6, -12], [-14, -6]]); ctx.fill();
      ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, 7); ctx.fill(); break;
    case 'diver':
      ctx.rotate(e.locked ? Math.atan2(e.vy, e.vx) - Math.PI / 2 : 0);
      ctx.fillStyle = col; poly([[0, 18], [10, -10], [0, -4], [-10, -10]]); ctx.fill();
      ctx.fillStyle = '#ff3b2e'; ctx.beginPath(); ctx.arc(0, 2, 3, 0, 7); ctx.fill(); break;
    case 'fighter':
      ctx.fillStyle = col; poly([[0, 22], [8, 6], [22, 0], [22, -8], [8, -6], [5, -18], [-5, -18], [-8, -6], [-22, -8], [-22, 0], [-8, 6]]); ctx.fill();
      ctx.fillStyle = '#222'; ctx.fillRect(-3, -2, 6, 10); ctx.fillStyle = '#ff3b2e'; ctx.fillRect(-2, 8, 4, 4); break;
    case 'gunship':
      ctx.fillStyle = '#3a3f4a'; ctx.fillRect(-34, -8, 68, 16);
      ctx.fillStyle = col; poly([[0, 36], [18, 18], [20, -26], [-20, -26], [-18, 18]]); ctx.fill();
      ctx.fillStyle = '#2b2f38'; ctx.beginPath(); ctx.arc(0, 4, 10, 0, 7); ctx.fill();
      ctx.fillStyle = '#ff3b2e'; ctx.beginPath(); ctx.arc(0, 4, 4, 0, 7); ctx.fill(); break;
    case 'bomber':
      ctx.rotate(e.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
      ctx.fillStyle = col; poly([[0, 28], [8, 12], [30, 4], [30, -4], [8, -6], [6, -24], [-6, -24], [-8, -6], [-30, -4], [-30, 4], [-8, 12]]); ctx.fill();
      ctx.fillStyle = '#222'; ctx.fillRect(-4, -10, 8, 20); break;
    case 'carrier':
      ctx.fillStyle = '#353a45'; poly([[0, 56], [40, 30], [52, -20], [30, -48], [-30, -48], [-52, -20], [-40, 30]]); ctx.fill();
      ctx.fillStyle = col; poly([[0, 44], [30, 24], [38, -14], [22, -36], [-22, -36], [-38, -14], [-30, 24]]); ctx.fill();
      ctx.fillStyle = '#1b1e25'; ctx.fillRect(-14, -20, 28, 40);
      ctx.fillStyle = '#ff3b2e'; for (let i = 0; i < 3; i++) ctx.fillRect(-10, -14 + i * 12, 20, 4); break;
    case 'turret':
      ctx.fillStyle = '#3c4048'; ctx.beginPath(); ctx.arc(0, 0, 18, 0, 7); ctx.fill();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, 11, 0, 7); ctx.fill();
      ctx.rotate(e.ang - Math.PI / 2); ctx.fillStyle = '#20232a'; ctx.fillRect(-3, 0, 6, 22); break;
    case 'cache':
      ctx.fillStyle = e.flash > 0 ? '#fff' : '#8a6a24'; ctx.fillRect(-16, -16, 32, 32);
      ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 3; ctx.strokeRect(-16, -16, 32, 32);
      ctx.fillStyle = '#ffd34d'; star(0, 0, 9, 0); ctx.fill(); break;
    case 'mine': {
      const blink = e.arm >= 0 && Math.floor(gameT * 16) % 2;
      ctx.fillStyle = blink ? '#fff' : '#454b57'; ctx.beginPath(); ctx.arc(0, 0, 11, 0, 7); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 3;
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + e.t; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 10, Math.sin(a) * 10); ctx.lineTo(Math.cos(a) * 16, Math.sin(a) * 16); ctx.stroke(); }
      ctx.fillStyle = e.arm >= 0 ? '#ff3b2e' : col; ctx.beginPath(); ctx.arc(0, 0, 4, 0, 7); ctx.fill();
      if (e.arm >= 0) { ctx.strokeStyle = 'rgba(255,60,40,.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 46, 0, 7); ctx.stroke(); }
      break; }
    case 'sniper':
      ctx.fillStyle = col; poly([[0, 24], [6, 4], [18, -2], [18, -10], [5, -8], [3, -20], [-3, -20], [-5, -8], [-18, -10], [-18, -2], [-6, 4]]); ctx.fill();
      ctx.save(); ctx.rotate(e.ang - Math.PI / 2); ctx.fillStyle = '#20232a'; ctx.fillRect(-2, 0, 4, 30); ctx.restore();
      ctx.fillStyle = '#7fe3ff'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, 7); ctx.fill(); break;
    case 'splitter':
      ctx.rotate(e.t * 1.2); ctx.fillStyle = col;
      for (let i = 0; i < 3; i++) { ctx.rotate(Math.PI * 2 / 3); poly([[0, 0], [10, -24], [-10, -24]]); ctx.fill(); }
      ctx.fillStyle = '#2b2f38'; ctx.beginPath(); ctx.arc(0, 0, 11, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, 7); ctx.fill(); break;
    case 'mini':
      ctx.rotate(e.t * 6); ctx.fillStyle = col; poly([[0, -10], [9, 6], [-9, 6]]); ctx.fill(); break;
    case 'tank':
      ctx.fillStyle = '#2c3038'; ctx.fillRect(-18, -16, 36, 32);
      ctx.fillStyle = '#4a4f5a'; ctx.fillRect(-22, -18, 7, 36); ctx.fillRect(15, -18, 7, 36);
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, 10, 0, 7); ctx.fill();
      ctx.rotate(e.ang - Math.PI / 2); ctx.fillStyle = '#20232a'; ctx.fillRect(-3, 0, 6, 24); break;
    case 'hive': {
      ctx.rotate(e.t * .3);
      ctx.fillStyle = '#2d313b'; hex(54); ctx.fill(); ctx.fillStyle = col; hex(44); ctx.fill();
      const glow = Math.min(1, .45 + Math.sin(gameT * 5) * .25 + (e.bay > 0 ? .5 : 0));
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3 + Math.PI / 6, bx = Math.cos(a) * 29, by = Math.sin(a) * 29;
        ctx.fillStyle = '#1b1e25'; ctx.beginPath(); ctx.arc(bx, by, 9, 0, 7); ctx.fill();
        ctx.fillStyle = `rgba(255,190,60,${glow})`; ctx.beginPath(); ctx.arc(bx, by, 4.5, 0, 7); ctx.fill();
      }
      ctx.fillStyle = '#1b1e25'; ctx.beginPath(); ctx.arc(0, 0, 14, 0, 7); ctx.fill();
      ctx.fillStyle = '#ff3b2e'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, 7); ctx.fill();
      break; }
    case 'salvage': {
      const pulse = (gameT * 1.2) % 1;
      ctx.strokeStyle = `rgba(127,227,255,${1 - pulse})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 22 + pulse * 22, 0, 7); ctx.stroke();
      ctx.fillStyle = e.flash > 0 ? '#fff' : '#1d4a63'; ctx.fillRect(-19, -19, 38, 38);
      ctx.strokeStyle = '#7fe3ff'; ctx.lineWidth = 3; ctx.strokeRect(-19, -19, 38, 38);
      gear(0, 0, 9, '#7fe3ff', e.t);
      break; }
    case 'survivor': {
      const pulse = (gameT * 1.5) % 1;
      ctx.strokeStyle = `rgba(76,223,138,${1 - pulse})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 18 + pulse * 26, 0, 7); ctx.stroke();
      ctx.fillStyle = '#e46f2b'; ctx.beginPath(); ctx.ellipse(0, 4, 16, 9, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#f2d7b6'; ctx.beginPath(); ctx.arc(0, -8, 4, 0, 7); ctx.fill();
      ctx.strokeStyle = '#f2d7b6'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, 3);
      const wv = Math.sin(gameT * 8) * 4; ctx.moveTo(0, -2); ctx.lineTo(8, -10 + wv); ctx.stroke();
      if (e.prog > 0) { ctx.strokeStyle = '#4cdf8a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 26, -Math.PI / 2, -Math.PI / 2 + e.prog * Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = '#4cdf8a'; ctx.font = '700 11px Orbitron, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('SOS', 0, 26);
      break; }
  }
  ctx.restore();
  if (SHADOW) return;
  if (e.elite) { // armoured elite: rotating gold ring
    ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(gameT * 2);
    ctx.strokeStyle = 'rgba(255,205,70,.9)'; ctx.lineWidth = 2.5; ctx.setLineDash([7, 5]);
    ctx.beginPath(); ctx.arc(0, 0, e.r + 7, 0, 7); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
  }
  if (!e.neutral && !e.boss && e.hp < e.maxHp && e.maxHp > 60) {
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(e.x - 20, e.y - e.r - 10, 40, 4);
    ctx.fillStyle = '#ff6a4a'; ctx.fillRect(e.x - 20, e.y - e.r - 10, 40 * Math.max(0, e.hp / e.maxHp), 4);
  }
}

function gear(x, y, r, c, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0); ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = 3;
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.fillRect(Math.cos(a) * r - 2.5, Math.sin(a) * r - 2.5, 5, 5); }
  ctx.beginPath(); ctx.arc(0, 0, r * .75, 0, 7); ctx.stroke();
  ctx.restore();
}
function drawBoss(e) {
  const S = SECTORS[LV.s], col = e.flash > 0 ? '#fff' : bodyGrad(e.r, S.enemy), R = e.r, dark = bodyGrad(e.r * 1.3, '#3d4250');
  const sc = k => q => [q[0] * R * k, q[1] * R * k];
  ctx.save(); ctx.translate(e.x, e.y);
  let coreR = R * .32;
  switch (e.shape) {
    case 'manta': {
      const body = [[0, .9], [.5, .4], [1.5, -.1], [1.2, -.35], [.4, -.6], [0, -.8], [-.4, -.6], [-1.2, -.35], [-1.5, -.1], [-.5, .4]];
      ctx.fillStyle = dark; ctx.fillRect(-R * .08, -R * 1.35, R * .16, R * .7);
      ctx.fillStyle = dark; poly(body.map(sc(1))); ctx.fill();
      ctx.fillStyle = col; poly(body.map(sc(.8))); ctx.fill();
      ctx.fillStyle = dark; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * R * .85, -R * .05, R * .13, 0, 7); ctx.fill(); }
      break; }
    case 'colossus': {
      ctx.fillStyle = dark; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * R * 1.0, -R * .1, R * .38, 0, 7); ctx.fill(); }
      ctx.fillStyle = dark; ctx.fillRect(-R * .85, -R * .8, R * 1.7, R * 1.55);
      ctx.fillStyle = col; ctx.fillRect(-R * .68, -R * .62, R * 1.36, R * 1.15);
      const heat = .5 + Math.sin(gameT * 7) * .3;
      ctx.fillStyle = `rgba(255,140,40,${heat})`; for (let i = 0; i < 3; i++) ctx.fillRect(-R * .5, R * (.18 + i * .14), R, R * .07);
      ctx.fillStyle = col; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * R * 1.0, -R * .1, R * .24, 0, 7); ctx.fill(); }
      coreR = R * .26; ctx.translate(0, -R * .2);
      break; }
    case 'maw': {
      const n = 14, outer = [], inner = [];
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, k = i % 2 ? .82 : 1.05; outer.push([Math.cos(a) * k, Math.sin(a) * k * .85]); inner.push([Math.cos(a) * k * .78, Math.sin(a) * k * .66]); }
      ctx.fillStyle = dark; poly(outer.map(sc(1))); ctx.fill();
      ctx.fillStyle = col; poly(inner.map(sc(1))); ctx.fill();
      const open = .15 + (Math.sin(gameT * 3) + 1) * .08;
      ctx.fillStyle = '#10131a'; ctx.beginPath(); ctx.ellipse(0, R * .35, R * .55, R * open * 1.4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#e8f6ff'; for (let i = -3; i <= 3; i++) { poly([[i * R * .14 - R * .05, R * .2], [i * R * .14 + R * .05, R * .2], [i * R * .14, R * (.3 + open)]]); ctx.fill(); }
      ctx.translate(0, -R * .2); coreR = R * .24;
      break; }
    case 'thorn': {
      ctx.fillStyle = dark;
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + e.spin * .5; ctx.save(); ctx.rotate(a); poly([[-R * .16, -R * .6], [R * .16, -R * .6], [0, -R * 1.3]]); ctx.fill(); ctx.restore(); }
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, R * .78, 0, 7); ctx.fill();
      ctx.strokeStyle = dark; ctx.lineWidth = 4;
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 - e.spin * .3; ctx.beginPath(); ctx.arc(Math.cos(a) * R * .45, Math.sin(a) * R * .45, R * .2, 0, 7); ctx.stroke(); }
      break; }
    case 'cell': { // a thunderhead with an anemometer crown and arcing coils
      ctx.fillStyle = dark;
      for (const [cx, cy, cr] of [[-.78, -.05, .52], [.78, -.05, .52], [-.38, -.48, .58], [.38, -.48, .58], [0, .3, .68]]) { ctx.beginPath(); ctx.arc(cx * R, cy * R, cr * R, 0, 7); ctx.fill(); }
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, R * .62, 0, 7); ctx.fill();
      ctx.strokeStyle = '#c9d3dc'; ctx.lineWidth = 4; ctx.fillStyle = '#e8eef3';
      for (let i = 0; i < 3; i++) {
        const a = e.spin * 2.2 + i * 2.094, ex = Math.cos(a) * R * .95, ey = Math.sin(a) * R * .95;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.beginPath(); ctx.arc(ex, ey, R * .13, 0, 7); ctx.fill();
      }
      if (!SHADOW && Math.sin(gameT * 11) > .2) {
        const a = Math.random() * 6.3, b = a + rand(1, 2.5);
        ctx.strokeStyle = 'rgba(190,235,255,.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * .9, Math.sin(a) * R * .7);
        for (let k = 1; k <= 4; k++) { const t = a + (b - a) * k / 4; ctx.lineTo(Math.cos(t) * R * rand(.7, 1.05), Math.sin(t) * R * rand(.55, .85)); }
        ctx.stroke();
      }
      coreR = R * .3;
      break; }
    case 'eye': {
      ctx.fillStyle = dark;
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + e.spin * (e.phase === 2 ? 1.6 : .7); ctx.save(); ctx.rotate(a); ctx.fillRect(R * .95, -R * .14, R * .32, R * .28); ctx.restore(); }
      ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.fill();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, R * .84, 0, 7); ctx.fill();
      ctx.fillStyle = '#e9edf5'; ctx.beginPath(); ctx.ellipse(0, 0, R * .66, R * .5, 0, 0, 7); ctx.fill();
      const a = aim(e); ctx.translate(Math.cos(a) * R * .22, Math.sin(a) * R * .16);
      coreR = R * .3;
      break; }
  }
  ctx.fillStyle = '#1b1e25'; ctx.beginPath(); ctx.arc(0, 0, coreR * 1.2, 0, 7); ctx.fill();
  const pulse = .6 + Math.sin(gameT * 6) * .4;
  const eg = ctx.createRadialGradient(0, 0, 2, 0, 0, coreR); eg.addColorStop(0, '#fff'); eg.addColorStop(.3, `rgba(255,60,40,${pulse})`); eg.addColorStop(1, 'rgba(255,40,30,0)');
  ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(0, 0, coreR, 0, 7); ctx.fill();
  ctx.restore();
}

function drawHUD() {
  // hull
  ctx.fillStyle = 'rgba(5,12,24,.7)'; rr(12, 12, 210, ST.shield ? 40 : 28, 8); ctx.fill();
  ctx.fillStyle = '#122437'; ctx.fillRect(22, 20, 190, 12);
  const hp = Math.max(0, P.hp / ST.maxHp);
  ctx.fillStyle = hp > .5 ? '#4cdf8a' : hp > .25 ? '#ffcc33' : '#ff5a4f'; ctx.fillRect(22, 20, 190 * hp, 12);
  if (ST.shield) { ctx.fillStyle = '#122437'; ctx.fillRect(22, 36, 190, 7); ctx.fillStyle = '#3fd8ff'; ctx.fillRect(22, 36, 190 * P.shield / ST.shield, 7); }
  // stars
  ctx.fillStyle = 'rgba(5,12,24,.7)'; rr(236, 12, 150, 34, 8); ctx.fill();
  ctx.fillStyle = '#ffcc33'; star(256, 29, 10, 0); ctx.fill();
  ctx.font = '700 20px Orbitron, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(fmt(run.stars), 272, 37);
  // combo
  if (run.combo > 1) {
    ctx.textAlign = 'center'; ctx.font = '700 15px Orbitron, sans-serif';
    ctx.fillStyle = `rgba(255,${200 - Math.min(run.combo, 60) * 2},80,${.5 + run.comboT / 3.2})`;
    ctx.fillText(`CHAIN ${run.combo}  ×${comboMult().toFixed(2)}`, W / 2, 66);
    ctx.fillStyle = 'rgba(255,200,80,.6)'; ctx.fillRect(W / 2 - 50, 72, 100 * run.comboT / 1.6, 3);
  }
  // pause
  ctx.fillStyle = 'rgba(5,12,24,.7)'; rr(W - 52, 12, 40, 40, 8); ctx.fill();
  ctx.fillStyle = '#dbe9f7'; ctx.fillRect(W - 40, 22, 5, 20); ctx.fillRect(W - 29, 22, 5, 20);
  // survivors / kills
  ctx.font = '600 14px Rajdhani, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#9fb7cf';
  if (!LV.rush) ctx.fillText(`🛟 ${run.rescued}/${LV.survivors}   🎯 ${run.kills}/${run.total}`, 16, H - 18);
  // bomb button
  const bx = W - 62, by = H - 72;
  ctx.fillStyle = run.bombs ? 'rgba(20,90,130,.85)' : 'rgba(30,40,55,.7)'; ctx.beginPath(); ctx.arc(bx, by, 38, 0, 7); ctx.fill();
  ctx.strokeStyle = run.bombs ? '#3fd8ff' : '#33465c'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '900 14px Orbitron, sans-serif'; ctx.fillText('EMP', bx, by + 1);
  ctx.font = '700 13px Orbitron, sans-serif'; ctx.fillStyle = '#ffcc33'; ctx.fillText(`×${run.bombs}`, bx, by + 18);
  // boss bar
  if (boss && !boss.dead && boss.y > 0) {
    ctx.fillStyle = 'rgba(5,12,24,.75)'; rr(40, 88, W - 80, 26, 6); ctx.fill();
    ctx.fillStyle = '#ff5a4f'; ctx.fillRect(48, 104, (W - 96) * Math.max(0, boss.hp / boss.maxHp), 6);
    ctx.fillStyle = '#fff'; ctx.font = '700 11px Orbitron, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(boss.name, W / 2, 99);
  }
  // laser charge
  if (ST.las) {
    const c = P.lasOn > 0 ? 1 : 1 - P.lasT / ST.lasInt;
    ctx.fillStyle = 'rgba(5,12,24,.7)'; ctx.fillRect(12, ST.shield ? 56 : 44, 80, 6);
    ctx.fillStyle = P.lasOn > 0 ? '#fff' : '#b48cff'; ctx.fillRect(12, ST.shield ? 56 : 44, 80 * clamp(c, 0, 1), 6);
  }
}
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }

function render() {
  ctx.setTransform(K, 0, 0, K, 0, 0); viewX = 0;
  if (state !== 'play' && state !== 'pause') {
    // ambient menu background
    updBg(1 / 60);
    drawBg(); drawClouds(); drawGrade();
    const mx = W / 2 + Math.sin(performance.now() / 900) * 30, my = H - 180 + Math.sin(performance.now() / 600) * 8;
    shadowPass(() => drawPlayerShip(mx, my, 0, 1.4), 22, 34, .3);
    drawPlayerShip(mx, my, 0, 1.4);
    drawWeather();
    return;
  }
  ctx.save();
  if (shake > 0) ctx.translate(rand(-shake, shake) * .5, rand(-shake, shake) * .5);
  viewX = camX; ctx.translate(-camX, 0);
  drawBg();
  for (const e of enemies) if (e.ground) drawEnemy(e);
  if (isStorm()) drawStormHaze();
  drawTowers();
  drawClouds(); drawGrade();
  shadowPass(() => {
    for (const e of enemies) if (!e.ground) e.boss ? drawBoss(e) : drawEnemy(e);
    if (!P.dead) drawPlayerShip(P.x, P.y, clamp(P.vx / 900, -1, 1));
  }, 18, 30, .3);
  // pickups
  for (const p of pickups) {
    if (p.kind === 'star') {
      const r = p.v >= 10 ? 11 : p.v >= 5 ? 9 : 6;
      ctx.fillStyle = p.v >= 10 ? '#fff1a8' : '#ffcc33';
      star(p.x, p.y, r, p.spin + p.t * 3); ctx.fill();
    } else if (p.kind === 'part') {
      const bob = Math.sin(p.t * 5) * 3;
      ctx.fillStyle = 'rgba(127,227,255,.25)'; ctx.beginPath(); ctx.arc(p.x, p.y + bob, 22, 0, 7); ctx.fill();
      gear(p.x, p.y + bob, 10, '#bff3ff', p.t * 2);
      ctx.fillStyle = '#bff3ff'; ctx.font = '700 10px Orbitron, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('PART', p.x, p.y + bob + 32);
    } else {
      ctx.fillStyle = '#4cdf8a'; ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(p.x - 6, p.y - 2, 12, 4); ctx.fillRect(p.x - 2, p.y - 6, 4, 12);
    }
  }
  for (const e of enemies) if (!e.ground) e.boss ? drawBoss(e) : drawEnemy(e);
  if (isStorm()) drawBanks(); // cloud banks hide the drones beneath them (their fire stays visible)
  drawStrikes();
  for (const e of enemies) {
    if (e.aiming > 0) {
      ctx.strokeStyle = `rgba(255,80,60,${.3 + .6 * (1 - e.aiming / .9)})`; ctx.lineWidth = 1.5; ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(e.lockA) * 1300, e.y + Math.sin(e.lockA) * 1300); ctx.stroke(); ctx.setLineDash([]);
    }
    if (e.beam) {
      const b = e.beam, top = e.y + e.r * .5;
      if (b.tele > 0) {
        ctx.fillStyle = `rgba(255,70,50,${.08 + .12 * Math.sin(gameT * 30) ** 2})`; ctx.fillRect(b.x - 26, top, 52, H - top);
        ctx.strokeStyle = 'rgba(255,80,60,.8)'; ctx.lineWidth = 2; ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.moveTo(b.x, top); ctx.lineTo(b.x, H); ctx.stroke(); ctx.setLineDash([]);
      } else if (b.on > 0) {
        const g = ctx.createLinearGradient(b.x - 30, 0, b.x + 30, 0);
        g.addColorStop(0, 'rgba(255,80,50,0)'); g.addColorStop(.5, 'rgba(255,230,210,.95)'); g.addColorStop(1, 'rgba(255,80,50,0)');
        ctx.fillStyle = g; ctx.fillRect(b.x - 30, top, 60, H - top);
      }
    }
  }
  // laser
  if (P.lasOn > 0 && !P.dead) {
    const w = 10 + Math.sin(gameT * 50) * 3;
    const g = ctx.createLinearGradient(P.x - w * 2, 0, P.x + w * 2, 0);
    g.addColorStop(0, 'rgba(180,140,255,0)'); g.addColorStop(.5, 'rgba(230,210,255,.95)'); g.addColorStop(1, 'rgba(180,140,255,0)');
    ctx.fillStyle = g; ctx.fillRect(P.x - w * 2, 0, w * 4, P.y - 26);
    ctx.fillStyle = '#fff'; ctx.fillRect(P.x - 2, 0, 4, P.y - 26);
  }
  // player bullets
  for (const b of pb) {
    if (b.kind === 'm') { ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(b.vy, b.vx)); ctx.fillStyle = '#ffd0a0'; ctx.fillRect(-8, -2.5, 14, 5); ctx.fillStyle = '#ff7a2b'; ctx.fillRect(4, -2.5, 4, 5); ctx.restore(); }
    else if (b.kind === 'f') { ctx.fillStyle = '#ffb46a'; ctx.fillRect(b.x - 3, b.y - 3, 6, 6); }
    else { ctx.fillStyle = b.kind === 'w' ? '#9ef0ff' : b.kind === 'd' ? '#b48cff' : '#e8fbff'; ctx.fillRect(b.x - 2, b.y - 9, 4, 18); ctx.fillStyle = 'rgba(63,216,255,.35)'; ctx.fillRect(b.x - 4, b.y - 6, 8, 14); }
  }
  // player
  if (!P.dead && (P.inv <= 0 || Math.floor(gameT * 20) % 2 === 0)) {
    drawPlayerShip(P.x, P.y, clamp(P.vx / 900, -1, 1));
    if (P.bar) { ctx.save(); ctx.translate(P.x, P.y); ctx.rotate(gameT); ctx.strokeStyle = 'rgba(255,224,138,.8)'; ctx.lineWidth = 2; hex(42); ctx.stroke(); ctx.restore(); }
    if (P.shield > 0) { ctx.strokeStyle = `rgba(63,216,255,${.25 + .35 * P.shield / ST.shield})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(P.x, P.y, 36, 0, 7); ctx.stroke(); }
    // hitbox dot
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(P.x, P.y, Math.max(2, P.r * .43), 0, 7); ctx.fill();
    for (const d of dronePos()) { ctx.fillStyle = '#b48cff'; ctx.beginPath(); ctx.arc(d.x, d.y, 7, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(d.x, d.y, 2.5, 0, 7); ctx.fill(); }
  }
  // enemy bullets
  for (const b of eb) {
    ctx.fillStyle = 'rgba(255,70,50,.35)'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 4, 0, 7); ctx.fill();
    ctx.fillStyle = '#ff6a4a'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff3d0'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * .45, 0, 7); ctx.fill();
  }
  // particles
  for (const p of parts) {
    if (p.zap) {
      ctx.globalAlpha = Math.max(0, p.t / p.max); ctx.strokeStyle = '#bfefff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x, p.y);
      for (let k = 1; k < 6; k++) ctx.lineTo(p.x + (p.x2 - p.x) * k / 6 + rand(-9, 9), p.y + (p.y2 - p.y) * k / 6 + rand(-9, 9));
      ctx.lineTo(p.x2, p.y2); ctx.stroke(); continue;
    }
    if (p.ring) { ctx.strokeStyle = p.c; ctx.globalAlpha = Math.max(0, p.t * 2); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.stroke(); }
    else { ctx.globalAlpha = Math.max(0, p.t / p.max); ctx.fillStyle = p.c; ctx.fillRect(p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz); }
  }
  ctx.globalAlpha = 1;
  drawWeather();
  if (storm.bolt) drawBolt(storm.bolt.pts, 2.5);
  // floating text
  ctx.textAlign = 'center';
  for (const t of texts) { ctx.globalAlpha = Math.min(1, t.t * 2); ctx.fillStyle = t.c; ctx.font = `700 ${t.sz || 14}px Orbitron, sans-serif`; ctx.fillText(t.s, t.x, t.y); }
  ctx.globalAlpha = 1;
  ctx.restore(); viewX = 0;
  if (storm.light > 0) { ctx.fillStyle = `rgba(215,228,255,${storm.light * .22})`; ctx.fillRect(0, 0, W, H); }
  if (flash > 0) { ctx.fillStyle = `rgba(200,240,255,${Math.min(.6, flash)})`; ctx.fillRect(0, 0, W, H); }
  drawHUD();
  if (banner) {
    const a = Math.min(1, banner.t, 3 - banner.t + .2);
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.fillStyle = 'rgba(3,8,18,.6)'; ctx.fillRect(0, H * .36, W, 110);
    ctx.textAlign = 'center'; ctx.fillStyle = banner.warn ? '#ff5a4f' : '#3fd8ff'; ctx.font = '900 34px Orbitron, sans-serif';
    ctx.fillText(banner.a, W / 2, H * .36 + 48);
    ctx.fillStyle = '#dbe9f7'; ctx.font = '600 20px Rajdhani, sans-serif'; ctx.fillText(banner.b, W / 2, H * .36 + 82);
    ctx.globalAlpha = 1;
  }
}

/* ------------------------------ RESULTS ------------------------------ */
const MEDALS = [
  { ic: '🎯', n: 'Destroy 70%' }, { ic: '💥', n: 'Destroy 100%' }, { ic: '🛟', n: 'Rescue all' },
  { ic: '🛡️', n: 'No hull damage' }, { ic: '⭐', n: 'Collect 90% stars' },
  { ic: '⚡', n: 'No EMP used', tier: 1 },      // added at Mk II
  { ic: '⛓️', n: '30-kill chain', tier: 2 },    // added at Mk III
];
let lastLevel = null;
function finishLevel(success) {
  run.done = true;
  SND.stopMusic(); SND.ambience(null); setTimeout(() => success ? SND.win() : SND.lose(), 350);
  const lines = [], L = LV.L, tier = LV.tier || 0, nM = tierMedalCount(tier);
  const collected = Math.round(run.stars - run.rescueStars);
  lines.push(['Stars collected', collected]);
  if (run.rescueStars) lines.push([`Survivors rescued (${run.rescued})`, Math.round(run.rescueStars)]);
  let total = collected + Math.round(run.rescueStars);
  const newly = Array(nM).fill(0);
  let title = success ? 'MISSION COMPLETE' : 'MISSION FAILED';
  let story = null, unlockedTier = null;
  save.stats.missions++;
  save.stats.bestCombo = Math.max(save.stats.bestCombo, run.bestCombo);
  if (run.bestCombo >= 10) { const cb = run.bestCombo * 5; lines.push([`Best chain ×${run.bestCombo}`, cb]); total += cb; }

  if (LV.rush) {
    title = success ? 'STAR RUSH CLEARED' : 'STAR RUSH ENDED';
    if (success && !save.bonus[LV.s]) { const b = 500 * (LV.s + 1); save.bonus[LV.s] = 1; lines.push(['First-clear bonus', b]); total += b; }
  } else if (success) {
    const r = rec(L), tm = r.t[tier];
    if (tier) title = `${TIERS[tier].name} COMPLETE`;
    const cb = Math.round((100 + 40 * L) * DIFFS[save.diff].stars * TM.stars);
    lines.push(['Mission bonus', cb]); total += cb;
    const kp = run.total ? run.kills / run.total : 1;
    const all = [kp >= .7, kp >= 1, run.rescued >= LV.survivors, !run.damaged,
      run.baseDropped ? run.baseCollected / run.baseDropped >= .9 : true, !run.usedBomb, run.bestCombo >= 30];
    const mv = (150 + 60 * L) * (1 + tier);
    for (let i = 0; i < nM; i++) if (all[i] && !tm[i]) { tm[i] = 1; newly[i] = 1; lines.push([`Medal: ${MEDALS[i].n}`, mv]); total += mv; }
    if (newly.some(Boolean) && tm.every(Boolean)) {
      const pb = (300 + 100 * L) * (1 + tier); lines.push([`All ${nM} ${TIERS[tier].name} medals!`, pb]); total += pb;
      if (tier + 1 < TIERS.length) unlockedTier = tier + 1;
    }
    const firstClear = !r.done;
    r.done = true;
    if (save.diff === 2) save.stats.vetClears++;
    if (firstClear && L === NLEVELS - 1) story = { title: 'TRANSMISSION · THE END', lines: STORY.ending };
  }
  for (const f of run.found) lines.push([`🔩 Part recovered: ${f}`, null]);
  if (run.newShip) lines.push([`🛩️ New ship assembled: ${run.newShip.name}`, null]);
  save.stars += total; save.total += total;
  persist();
  checkAch();

  $('resTitle').textContent = title;
  const tm = !LV.rush && save.lv[L] ? save.lv[L].t[tier] : [];
  $('resMedals').innerHTML = LV.rush ? '' : MEDALS.slice(0, nM).map((m, i) =>
    `<div class="medal ${tm[i] ? 'on' : ''} ${newly[i] ? 'new' : ''}"><div class="m">${m.ic}</div>${m.n}</div>`).join('');
  $('resLines').innerHTML = lines.map(l => `<div><span>${l[0]}</span><b>${l[1] == null ? '✓' : '+' + fmt(l[1])}</b></div>`).join('') +
    (unlockedTier ? `<div><span style="color:#3fd8ff">🔓 ${TIERS[unlockedTier].name} unlocked for mission ${LV.label.split(' ')[0]}</span><span></span></div>` : '') +
    `<div class="total"><span>Total</span><span>★ ${fmt(total)}</span></div>`;
  $('resHangar').textContent = run.newShip ? 'Fleet' : 'Hangar';
  { let k = 0; newly.forEach((n, i) => { if (n) setTimeout(() => SND.medal(k), 1300 + k++ * 260); }); }
  $('resQuip').textContent = run.newShip ? `I have finished assembling the ${run.newShip.name}. Select it in the Fleet bay. I would test it myself, but, well.` : unlockedTier ? `Every medal. I have prepared ${TIERS[unlockedTier].name}: same mission, nastier Legion, better pay.` : pick(success ? QUIPS.win : QUIPS.lose);
  lastLevel = LV;
  const nextL = !LV.rush && !tier && success && L + 1 < NLEVELS ? L + 1 : null;
  $('resNext').textContent = unlockedTier ? `Fly ${TIERS[unlockedTier].name}` : nextL != null ? 'Next mission' : 'Mission board';
  $('resNext').onclick = () => {
    if (story) { showStory(story.title, story.lines, () => go('map')); return; }
    if (unlockedTier) startLevel(L, unlockedTier);
    else if (nextL != null) startLevel(nextL); else go('map');
  };
  state = 'results';
  showScreen('results');
}

/* ------------------------------ UI ------------------------------ */
const pick = a => a[Math.floor(Math.random() * a.length)];
const SCREENS = ['menu', 'map', 'hangar', 'fleet', 'ach', 'howto', 'story', 'results', 'pause'];
function showScreen(id) { SCREENS.forEach(s => $(s).classList.toggle('hidden', s !== id)); }
function refreshStars() { $('menuStars').textContent = fmt(save.stars); document.querySelectorAll('.starsNow').forEach(e => e.textContent = fmt(save.stars)); }

function go(id) {
  if (id === 'briefing') { showStory('INCOMING TRANSMISSION', STORY.intro, () => go('menu')); return; }
  state = id; curSector = id === 'map' ? curSector : curSector;
  refreshStars();
  if (['menu', 'map', 'hangar', 'fleet', 'ach', 'howto'].includes(id)) { SND.duck(false); SND.ambience(null); SND.music('menu', 1776, 0); }
  if (id === 'menu') $('menuQuip').textContent = pick(QUIPS.menu);
  if (id === 'map') buildMap();
  if (id === 'hangar') { $('hangarQuip').textContent = pick(QUIPS.hangar); buildHangar(); }
  if (id === 'fleet') { const n = SHIPS.filter(x => shipOwned(x.id)).length; $('fleetQuip').textContent = `${n} of ${SHIPS.length} ships assembled. Parts turn up in blue salvage crates on the missions listed.`; buildFleetScreen(); }
  if (id === 'ach') buildAch();
  if (id === 'howto') buildHowto();
  showScreen(id);
}
document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));

let storyQ = null;
function showStory(title, lines, done) {
  storyQ = { lines: lines.slice(), done };
  $('storyTitle').textContent = title;
  state = 'story'; showScreen('story'); nextStory();
}
function nextStory() {
  if (!storyQ.lines.length) { const d = storyQ.done; storyQ = null; d(); return; }
  const [who, txt] = storyQ.lines.shift();
  $('storyBody').innerHTML = `<div class="who">${who}</div>${txt}`;
  $('storyNext').textContent = storyQ.lines.length ? 'Continue' : 'Understood';
}
$('storyNext').addEventListener('click', nextStory);

function unlocked(L) { return L === 0 || !!save.lv[L - 1]?.done || !!save.lv[L]?.done; }
function startLevel(L, tier = 0) {
  $('tierSheet').classList.add('hidden');
  const s = Math.floor(L / LEVELS_PER);
  const lv = genLevel(L, tier);
  const begin = () => newRun(lv);
  if (!tier && L % LEVELS_PER === 0 && !save.seen['s' + s]) {
    save.seen['s' + s] = 1; persist();
    const lines = s === 0 ? STORY.intro : STORY.s[s];
    showStory(s === 0 ? 'INCOMING TRANSMISSION' : `BRIEFING · SECTOR ${s + 1}`, lines, begin);
  } else begin();
}

// highest tier open on a mission (0..2)
const topTier = L => { let k = 0; while (k + 1 < TIERS.length && tierOpen(L, k + 1)) k++; return k; };

function buildMap() {
  $('diffPick').innerHTML = DIFFS.map((d, i) => `<button class="btn ${i === save.diff ? 'on' : ''}" data-d="${i}">${d.name}</button>`).join('');
  let note = document.querySelector('.diff-note');
  if (!note) { note = document.createElement('div'); note.className = 'diff-note'; $('diffPick').after(note); }
  note.textContent = DIFFS[save.diff].note + ' Each mission also has Mk I–III tiers.';
  $('diffPick').querySelectorAll('button').forEach(b => b.onclick = () => { save.diff = +b.dataset.d; persist(); buildMap(); });
  let html = '';
  SECTORS.forEach((S, s) => {
    html += `<div class="sector"><h3>SECTOR ${s + 1} · ${S.name.toUpperCase()}</h3><div class="sub">${S.sub}</div><div class="lvls">`;
    for (let i = 0; i < LEVELS_PER; i++) {
      const L = s * LEVELS_PER + i, r = save.lv[L], ok = unlocked(L), bossL = i === LEVELS_PER - 1, top = ok ? topTier(L) : 0;
      const rows = TIERS.map((_, k) => `<div class="pips ${tierOpen(L, k) ? '' : 'dim'}">${Array.from({ length: tierMedalCount(k) }, (_, m) => `<i class="pip ${r?.t[k][m] ? 'on' : ''}"></i>`).join('')}</div>`).join('');
      const salv = TIERS.some((_, k) => { const pa = partAt(L, k); return pa && !hasPart(pa.ship, pa.idx); });
      html += `<div class="lvl ${ok ? '' : 'locked'} ${r?.done ? 'done' : ''} ${bossL ? 'boss' : ''}" data-l="${ok ? L : ''}">${salv ? '<i class="pd" title="Ship part to find">🔩</i>' : ''}<b>${s + 1}-${i + 1}</b><small class="mk">${bossL ? 'BOSS · ' : ''}${TIERS[top].name}</small><div class="tiers">${rows}</div></div>`;
    }
    html += '</div>';
    const rOk = !!save.lv[s * LEVELS_PER + LEVELS_PER - 1]?.done;
    html += `<button class="btn rush" data-r="${s}" ${rOk ? '' : 'disabled'}>✨ Star Rush ${save.bonus[s] ? '· cleared' : rOk ? '· first clear +' + fmt(500 * (s + 1)) + '★' : '· beat the boss to unlock'}</button></div>`;
  });
  $('mapList').innerHTML = html;
  $('mapList').querySelectorAll('.lvl').forEach(el => el.onclick = () => {
    if (el.dataset.l === '') return;
    const L = +el.dataset.l;
    // nothing beyond Mk I to choose yet: fly straight in
    if (topTier(L) === 0 && !tierCleared(L, 0)) startLevel(L); else openTierSheet(L);
  });
  $('mapList').querySelectorAll('.rush').forEach(el => el.onclick = () => newRun(genRush(+el.dataset.r)));
}

function salvLine(L, k) {
  const pa = partAt(L, k);
  if (!pa) return '';
  const S = shipById(pa.ship), h = hasPart(pa.ship, pa.idx);
  return `<p class="salv">${h ? '✓' : '🔩'} Salvage crate: ${S.name} ${PART_NAMES[pa.idx]}${h ? ' (recovered)' : ''}</p>`;
}
function openTierSheet(L) {
  const s = Math.floor(L / LEVELS_PER), i = L % LEVELS_PER, r = rec(L);
  let html = `<h3>Mission ${s + 1}-${i + 1}</h3><div class="sub">${SECTORS[s].name}${i === LEVELS_PER - 1 ? ' · Boss: ' + SECTORS[s].boss : ''}</div>`;
  const th = threat(L, topTier(L));
  if (th.hp > 1.4) html += `<p class="salv">⚠️ Legion threat ×${th.hp.toFixed(1)} at ${TIERS[topTier(L)].name}: drones up-armour against an over-built jet.</p>`;
  TIERS.forEach((T, k) => {
    const open = tierOpen(L, k), done = tierCleared(L, k);
    const medals = MEDALS.slice(0, tierMedalCount(k)).map((m, j) => `<span class="${r.t[k][j] ? 'on' : ''} ${m.tier === k && k ? 'newm' : ''}" title="${m.n}">${m.ic}</span>`).join('');
    const extra = k ? ` New medal: <b>${MEDALS[BASE_MEDALS + k - 1].n}</b>.` : '';
    html += `<div class="tier ${open ? 'open' : 'locked'} ${done ? 'cleared' : ''}">
      <div class="tier-head"><b>${T.name}${done ? ' ✓' : ''}</b>${open ? `<button class="btn" data-t="${k}">Fly</button>` : '<span class="mk">🔒 LOCKED</span>'}</div>
      <p>${T.desc}${extra}${open ? '' : ` Earn every ${TIERS[k - 1].name} medal to unlock.`}</p>
      <div class="tmedals">${medals}</div>${salvLine(L, k)}</div>`;
  });
  html += `<button class="btn big" id="tierClose">Back</button>`;
  $('tierBody').innerHTML = html;
  $('tierSheet').classList.remove('hidden');
  $('tierBody').querySelectorAll('[data-t]').forEach(b => b.onclick = () => startLevel(L, +b.dataset.t));
  $('tierClose').onclick = () => $('tierSheet').classList.add('hidden');
}

function buildFleet() {
  return SHIPS.map(S => {
    const own = shipOwned(S.id), sel = save.ship === S.id;
    const got = S.id === 'ember' ? 4 : [0, 1, 2, 3].filter(i => hasPart(S.id, i)).length;
    const mods = modList(S.mods).map(([t, good]) => `<span class="${good ? 'up' : 'down'}">${t}</span>`).join('') || '<span>Balanced baseline</span>';
    const parts = S.id === 'ember' ? '' : `<div class="parts">${PART_NAMES.map((n, i) => {
      const h = hasPart(S.id, i);
      return `<span class="${h ? 'got' : ''}">${h ? '✓' : '🔩'} ${n} <small>${spotLabel(PART_SPOTS[S.id][i])}</small></span>`;
    }).join('')}</div>`;
    return `<div class="ship ${own ? '' : 'locked'} ${sel ? 'sel' : ''}"><img src="${shipIcon(S.id)}" alt="${S.name}">
      <div class="info"><h4>${S.name}<small>${S.role}</small></h4><p>${own ? S.desc : 'Find all 4 parts in salvage crates on the missions listed below.'}</p><div class="mods">${mods}</div>${parts}</div>
      <button class="btn small" data-ship="${S.id}" ${own && !sel ? '' : 'disabled'}>${sel ? 'Flying' : own ? 'Select' : got + '/4'}</button></div>`;
  }).join('');
}

function buildFleetScreen() {
  $('fleetList').innerHTML = buildFleet();
  $('fleetList').querySelectorAll('[data-ship]').forEach(b => b.onclick = () => {
    if (!shipOwned(b.dataset.ship)) return;
    save.ship = b.dataset.ship; persist();
    const top = $('fleetList').scrollTop; buildFleetScreen(); $('fleetList').scrollTop = top;
    $('fleetQuip').textContent = `${shipById(save.ship).name} prepped and fuelled. Your upgrades carry over.`;
  });
}

function buildHangar() {
  const cur = shipById(save.ship);
  $('upgList').innerHTML = `<div class="flying"><img src="${shipIcon(cur.id)}" alt=""><span>Flying the <b>${cur.name}</b>. Every upgrade applies to every ship.</span><button class="btn small" data-go2="fleet">Fleet ›</button></div>` + UPG.map(u => {
    const l = ul(u.id), maxed = l >= u.max, c = upCost(u);
    return `<div class="upg"><h4>${u.name}</h4><div class="d">${u.desc}</div>
      <div class="fx">${u.fx(l)}${maxed ? '' : `  →  <span style="color:#fff">${u.fx(l + 1)}</span>`}</div>
      <div class="lvlbar">${Array.from({ length: u.max }, (_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('')}</div>
      <div class="buy"><button class="btn small" data-u="${u.id}" ${maxed || save.stars < c ? 'disabled' : ''}>${maxed ? 'MAX' : 'Upgrade'}</button>${maxed ? '' : `<span>★ ${fmt(c)}</span>`}</div></div>`;
  }).join('');
  $('upgList').querySelector('[data-go2]').onclick = () => go('fleet');
  $('upgList').querySelectorAll('[data-u]').forEach(b => b.onclick = () => {
    const u = UPG.find(x => x.id === b.dataset.u), c = upCost(u);
    if (save.stars < c || ul(u.id) >= u.max) return;
    save.stars -= c; save.up[u.id] = ul(u.id) + 1; persist(); checkAch(); SND.buy();
    const top = $('upgList').scrollTop; buildHangar(); $('upgList').scrollTop = top; refreshStars();
    $('hangarQuip').textContent = `${u.name} upgraded. ${pick(['Lovely.', 'She purrs.', 'Calibrated.', 'Installed, tested, polished.', 'I am rather proud of that one.'])}`;
  });
}

function buildAch() {
  $('achList').innerHTML = ACH.map(a => `<div class="ach ${save.ach[a.id] ? 'got' : ''}"><div class="ic">${a.ic}</div><div><h4>${a.name}</h4><p>${a.desc}</p></div><div class="r">${save.ach[a.id] ? '✓ ' : ''}★ ${fmt(a.r)}</div></div>`).join('');
}

function buildHowto() {
  $('howtoText').innerHTML = `
  <h4>★ Shoot down Legion drones</h4><p>Every drone drops stars. Bigger drones drop more, and later sectors pay better.</p>
  <h4>⛓️ Kill chains</h4><p>Keep destroying drones quickly and your star multiplier climbs to ×3. A chain of 10 or more also pays a bonus at the end.</p>
  <h4>🛟 Rescue survivors</h4><p>Hover over the SOS rafts for about a second. Every survivor you rescue pays stars.</p>
  <h4>📦 Supply caches</h4><p>Shoot the gold crates on the ground. They burst with stars and often hull repairs.</p>
  <h4>🎖️ Five medals per mission</h4><p>Destroy 70%, destroy 100%, rescue everyone, take no hull damage (your shield doesn't count), and collect 90% of the stars. Each medal pays once, and all five pay a jackpot.</p>
  <h4>🛩️ Build new ships</h4><p>Missions marked 🔩 hide a blue salvage crate. Shoot it open and grab the part before it drifts away. Collect all 4 parts (Wings, Engine, Cockpit, Reactor) and Jarvis assembles a new ship for your Fleet. Each ship has its own strengths and trade-offs, and some parts only appear on Mk II or Mk III runs.</p>
  <h4>⚠️ The Legion adapts</h4><p>If your jet is far stronger than a mission expects, the drones up-armour to match, and they load heavier rounds against a very tough hull. Upgrades still win fights faster; they just can't trivialise them. Gold-ringed <b>elite</b> drones are tougher and fire faster, but pay double stars.</p>
  <h4>🔱 Mk II and Mk III tiers</h4><p>Earn every medal on a mission to unlock its next tier. It's the same mission with tougher drones, heavier fire, extra waves and bigger payouts. Each tier adds a new medal: Mk II asks for <b>no EMP used</b>, and Mk III also asks for a <b>30-kill chain</b>. That's 18 medals per mission.</p>
  <h4>✨ Star Rush stages</h4><p>Beat a sector boss to unlock its Star Rush: a bonus stage with no enemy fire and stars everywhere. Replay it as often as you like.</p>
  <h4>📅 Daily check-in</h4><p>Open the game every day for a growing bonus, up to 7 days.</p>
  <h4>🏅 Commendations</h4><p>${ACH.length} one-time achievements with big star rewards.</p>
  <h4>🔧 Salvage Scanner and difficulty</h4><p>Upgrade the Salvage Scanner and fly on Pilot or Ace for bigger multipliers. You keep every star even if you get shot down.</p>`;
}

function toast(html) {
  const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = html;
  $('toasts').appendChild(t); setTimeout(() => t.remove(), 3500);
}

function daily() {
  const d = new Date(), today = d.toISOString().slice(0, 10);
  if (save.daily.last === today) return;
  const y = new Date(d - 864e5).toISOString().slice(0, 10);
  save.daily.streak = save.daily.last === y ? save.daily.streak + 1 : 1;
  save.daily.last = today;
  const v = 100 * Math.min(save.daily.streak, 7);
  save.stars += v; save.total += v; persist();
  setTimeout(() => { toast(`📅 Daily check-in, day ${save.daily.streak}: <b>+${v} ★</b>`); checkAch(); refreshStars(); }, 600);
}

/* ------------------------------ PAUSE ------------------------------ */
function pauseGame() {
  if (state !== 'play' || run.done) return;
  paused = true; state = 'pause'; SND.duck(true);
  $('pauseInfo').textContent = `${LV.rush ? LV.name : 'Mission ' + LV.label}. Stars so far: ${fmt(run.stars)}. Take your time. I am in no hurry. I am software.`;
  showScreen('pause');
}
$('pResume').onclick = () => { paused = false; state = 'play'; showScreen(null); SND.duck(false); };
$('pQuit').onclick = () => { paused = false; state = 'play'; finishLevel(false); };
addEventListener('blur', pauseGame);
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });

/* ------------------------------ INPUT ------------------------------ */
// audio: browsers only allow sound after a real gesture, so the first tap or key starts it
addEventListener('pointerdown', () => SND.unlock(), true);
addEventListener('keydown', () => SND.unlock(), true);
document.addEventListener('click', e => { if (e.target.closest('.btn')) SND.click(); });
function audioLabels() {
  document.querySelectorAll('[data-snd]').forEach(b => {
    const on = SND.opts[b.dataset.snd];
    b.textContent = (b.dataset.snd === 'music' ? '♫ Music: ' : '🔊 Sound: ') + (on ? 'On' : 'Off');
    b.classList.toggle('off', !on);
  });
}
document.querySelectorAll('[data-snd]').forEach(b => b.addEventListener('click', () => { SND.toggle(b.dataset.snd); audioLabels(); }));
audioLabels();

addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space' || e.code === 'KeyB') { useBomb(); e.preventDefault(); }
  if (e.code === 'Escape' || e.code === 'KeyP') { if (state === 'play') pauseGame(); else if (state === 'pause') $('pResume').click(); }
});
addEventListener('keyup', e => { keys[e.code] = false; });

function gp(ev) { const r = cv.getBoundingClientRect(); return { x: (ev.clientX - r.left) * W / r.width, y: (ev.clientY - r.top) * H / r.height }; }
cv.addEventListener('pointerdown', ev => {
  if (state !== 'play') return;
  const p = gp(ev);
  if (Math.hypot(p.x - (W - 62), p.y - (H - 72)) < 44) { useBomb(); return; }
  if (p.x > W - 60 && p.y < 60) { pauseGame(); return; }
  pointer = { id: ev.pointerId, ox: P.x - p.x - camX, oy: P.y - p.y, mouse: ev.pointerType === 'mouse' };
  cv.setPointerCapture(ev.pointerId);
});
cv.addEventListener('pointermove', ev => {
  if (state !== 'play') return;
  const p = gp(ev);
  if (pointer && pointer.id === ev.pointerId) { P.tx = p.x + camX + pointer.ox; P.ty = p.y + pointer.oy; }
  else if (ev.pointerType === 'mouse' && !pointer) {
    if (Math.hypot(p.x - (W - 62), p.y - (H - 72)) < 44 || (p.x > W - 60 && p.y < 60)) return;
    P.tx = p.x + camX; P.ty = p.y;
  }
});
const endPtr = ev => { if (pointer && pointer.id === ev.pointerId) pointer = null; };
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);

/* ------------------------------ BOOT ------------------------------ */
$('resRetry').onclick = () => { if (lastLevel) lastLevel.rush ? newRun(genRush(lastLevel.s)) : startLevel(lastLevel.L, lastLevel.tier || 0); };
$('resHangar').onclick = () => go(run && run.newShip ? 'fleet' : 'hangar');

seedBg();
let last = performance.now();
function frame(now) {
  const dt = Math.min(.033, (now - last) / 1000); last = now;
  if (state === 'play' && !paused) update(dt);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
go('menu');
daily();
if (!save.seen.intro) { save.seen.intro = 1; persist(); }

// debug hook for testing
window.JF = { get save() { return save; }, get run() { return run; }, get P() { return P; }, get enemies() { return enemies; }, startLevel, newRun, genRush, finishLevel, update, get state() { return state; } };
