'use strict';
/* =====================================================================
   JARVIS FORCE — a vertical-scrolling shooter.
   Jarvis runs the air force: hangar, upgrades, mission planning.
   He just can't fly. That's you.
   ===================================================================== */

const W = 540, H = 960;
const stage = document.getElementById('stage');
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
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
  return { stars: 0, total: 0, up: {}, lv: {}, bonus: {}, ach: {}, seen: {}, diff: 0,
    daily: { last: '', streak: 0 },
    stats: { kills: 0, rescues: 0, bosses: 0, bestCombo: 0, vetClears: 0, nobombBoss: 0, missions: 0 } };
}
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s) { const d = defSave(); Object.assign(d, s); d.stats = Object.assign(defSave().stats, s.stats || {}); return d; }
  } catch (e) {}
  return defSave();
}
let save = loadSave();
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }

/* ---------------------------- WORLD DATA ---------------------------- */
const SECTORS = [
  { name: 'The Drowned Coast', sub: 'Flooded ruins of the old seaboard',
    sea: ['#0d5f7d', '#083a52'], shore: '#cbb987', land: '#4d7f45', ruin: '#6d7a82', enemy: '#d8473d', boss: 'TIDEBREAKER' },
  { name: 'The Ash Wastes', sub: 'Burnt plains under a red sky',
    sea: ['#8a5634', '#4e2b17'], shore: '#3b2416', land: '#a8703f', ruin: '#5a4a42', enemy: '#c25a9a', boss: 'CINDER COLOSSUS' },
  { name: 'The Frozen Relay', sub: 'Ice fields around the last radio towers',
    sea: ['#8fb7cc', '#4f7d96'], shore: '#e8f4fa', land: '#c9e2ef', ruin: '#7c8fa0', enemy: '#4f6bdc', boss: 'GLACIER MAW' },
  { name: 'The Overgrown Sprawl', sub: 'A megacity swallowed by jungle',
    sea: ['#2b5e35', '#173a20'], shore: '#58704a', land: '#3d8c48', ruin: '#8a8f86', enemy: '#d0912c', boss: 'THORNWARDEN' },
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
    [['JARVIS', 'Sector 2: the Ash Wastes. The Legion smelts its drones out here. Bring down the forges and they cannot replace their losses.'],
     ['JARVIS', 'The survivors you rescued are settling in nicely. One of them is teaching me to bake bread. I am, again, terrible at it. A theme is emerging.']],
    [['JARVIS', 'Sector 3: the Frozen Relay. A human colony is broadcasting from the old radio towers, which the Legion has noticed too.'],
     ['JARVIS', 'I have fitted your heaters. I would have flown out myself, but I tried that in a simulation and the jet flew into a tower. In the simulation. Twice.']],
    [['JARVIS', 'Sector 4: the Overgrown Sprawl. The Legion is digging something out of the ruins. My sensors read it as a very large problem.'],
     ['JARVIS', 'Our hangars now hold three hundred and twelve rescued souls. They have started calling you "the Pilot". With a capital P. I approve.']],
    [['JARVIS', 'Sector 5: the Overseer Core. This is where the network woke up and decided humanity was the threat.'],
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

function stats() {
  const c = ul('cannon');
  return {
    dmg: 10 * (1 + .3 * c), streams: streams(c), fireInt: fireInt(ul('rate')),
    wings: ul('wings'), wdmg: 6 * (1 + .3 * ul('wings')),
    mis: ul('missiles'), mdmg: 22 * (1 + .35 * ul('missiles')), misInt: misInt(ul('missiles')),
    las: ul('laser'), ldps: 70 * (1 + .4 * ul('laser')), lasInt: lasInt(ul('laser')),
    drones: ul('drones'), ddmg: 7 * (1 + .25 * c),
    maxHp: maxHp(ul('hull')), shield: ul('shield') * 22, regen: ul('regen') * 1.2,
    bombs: 1 + ul('bomb'), mag: magR(ul('magnet')), fortune: 1 + .1 * ul('fortune'),
    crit: ul('crit') * .06, revive: ul('revive') > 0,
  };
}

/* -------------------------- ACHIEVEMENTS -------------------------- */
const medalCount = () => Object.values(save.lv).reduce((a, r) => a + r.medals.filter(Boolean).length, 0);
const ACH = [
  { id: 'first', ic: '🛫', name: 'Wheels Up', desc: 'Complete your first mission', r: 100, t: () => save.lv[0]?.done },
  { id: 'boss', ic: '💥', name: 'Giant Slayer', desc: 'Defeat a sector boss', r: 300, t: () => save.stats.bosses >= 1 },
  { id: 'k500', ic: '🎯', name: 'Ace', desc: 'Destroy 500 Legion drones', r: 300, t: () => save.stats.kills >= 500 },
  { id: 'k3000', ic: '☄️', name: 'Scourge of the Legion', desc: 'Destroy 3,000 Legion drones', r: 1500, t: () => save.stats.kills >= 3000 },
  { id: 'r25', ic: '🛟', name: 'Lifeline', desc: 'Rescue 25 survivors', r: 400, t: () => save.stats.rescues >= 25 },
  { id: 'r100', ic: '🏠', name: 'Nobody Left Behind', desc: 'Rescue 100 survivors', r: 1500, t: () => save.stats.rescues >= 100 },
  { id: 'perfect', ic: '🏅', name: 'Flawless Sortie', desc: 'Earn all 5 medals on one mission', r: 500, t: () => Object.values(save.lv).some(r => r.medals.every(Boolean)) },
  { id: 'combo', ic: '⛓️', name: 'Chain Reaction', desc: 'Reach a 30-kill chain', r: 400, t: () => save.stats.bestCombo >= 30 },
  { id: 'combo2', ic: '🔗', name: 'Unbroken', desc: 'Reach a 75-kill chain', r: 1000, t: () => save.stats.bestCombo >= 75 },
  { id: 'maxup', ic: '🔧', name: 'Fully Tuned', desc: 'Max out any upgrade', r: 600, t: () => UPG.some(u => ul(u.id) >= u.max) },
  { id: 'rush', ic: '✨', name: 'Star Chaser', desc: 'Clear a Star Rush stage', r: 300, t: () => Object.keys(save.bonus).length > 0 },
  { id: 'rushall', ic: '🌠', name: 'Constellation', desc: 'Clear every Star Rush stage', r: 2000, t: () => Object.keys(save.bonus).length >= SECTORS.length },
  { id: 'half', ic: '📡', name: 'Signal Restored', desc: 'Clear the Frozen Relay', r: 1000, t: () => save.lv[11]?.done },
  { id: 'end', ic: '☀️', name: 'Clear Skies', desc: 'Defeat the Overseer', r: 3000, t: () => save.lv[NLEVELS - 1]?.done },
  { id: 'rich', ic: '💰', name: 'Stargazer', desc: 'Earn 50,000 stars total', r: 2000, t: () => save.total >= 50000 },
  { id: 'ace', ic: '🦅', name: 'Ace Wings', desc: 'Complete a mission on Ace difficulty', r: 800, t: () => save.stats.vetClears >= 1 },
  { id: 'nobomb', ic: '🧘', name: 'Steady Hands', desc: 'Beat a sector boss without using an EMP', r: 600, t: () => save.stats.nobombBoss >= 1 },
  { id: 'm25', ic: '🎖️', name: 'Decorated', desc: 'Earn 25 medals', r: 800, t: () => medalCount() >= 25 },
  { id: 'm100', ic: '👑', name: 'Living Legend', desc: 'Earn all 100 medals', r: 5000, t: () => medalCount() >= 100 },
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
  }
}

function genLevel(L) {
  const s = Math.floor(L / LEVELS_PER), idx = L % LEVELS_PER, R = rng(L * 7919 + 13);
  const len = 62 + idx * 7 + s * 5;
  const tl = [];
  const pool = ['vee', 'sine', 'fighters', 'turrets', 'gunship', 'bomber', 'vee', 'sine'];
  if (s >= 1) pool.push('divers');
  if (s >= 2) pool.push('divers', 'fighters', 'gunship');
  if (s >= 3) pool.push('bomber', 'turrets');
  let t = 2.5;
  while (t < len) { addWave(tl, pool[Math.floor(R() * pool.length)], t, R, s); t += (3.6 - Math.min(1.3, L * .065)) + R() * 1.3; }
  if (idx >= 1 || s >= 1) addWave(tl, 'carrier', len * .55, R, s);
  const nSurv = 3 + Math.floor(s / 2);
  for (let i = 0; i < nSurv; i++) tl.push({ t: len * (i + .5) / nSurv + R() * 4 - 2, type: 'survivor', x: 70 + R() * (W - 140) });
  for (let i = 0; i < 2 + Math.ceil(s / 2); i++) tl.push({ t: 4 + R() * (len - 8), type: 'cache', x: 60 + R() * (W - 120) });
  tl.sort((a, b) => a.t - b.t);
  return { L, s, idx, len, tl, major: idx === LEVELS_PER - 1, survivors: nSurv, rush: false,
    label: `${s + 1}-${idx + 1}`, name: idx === LEVELS_PER - 1 ? `Boss: ${SECTORS[s].boss}` : SECTORS[s].name };
}

function genRush(s) {
  const R = rng(4242 + s * 31), tl = [], len = 42;
  for (let t = 1.5; t < len; t += 1.0 + R() * .8) {
    const k = R(), x = 70 + R() * (W - 140);
    if (k < .3) tl.push({ t, type: 'cache', x });
    else if (k < .65) { const side = R() < .5 ? -1 : 1; for (let i = 0; i < 6; i++) tl.push({ t: t + i * .22, type: 'scout', x: W / 2 + side * 60, mv: 'sine', amp: 160 * side }); }
    else tl.push({ t, type: 'stars', x, n: 25 + s * 15 });
  }
  return { L: s * LEVELS_PER + 1, s, idx: 0, len, tl, major: false, survivors: 0, rush: true, label: `★${s + 1}`, name: `Star Rush · ${SECTORS[s].name}` };
}

/* ------------------------------ STATE ------------------------------ */
let state = 'menu', paused = false;
let LV = null, run = null, P = null, ST = null;
let enemies = [], pb = [], eb = [], pickups = [], parts = [], texts = [], islands = [], clouds = [];
let levelT = 0, gameT = 0, bgScroll = 0, shake = 0, flash = 0, boss = null, banner = null;
let curSector = 0;
const SCROLL = 70;
const keys = {};
let pointer = null;

function newRun(level) {
  LV = level; ST = stats(); curSector = LV.s;
  P = { x: W / 2, y: H - 160, tx: null, ty: null, vx: 0, r: 7, hp: ST.maxHp, shield: ST.shield, shDelay: 0, inv: 1.5,
    fireT: 0, wingT: 0, misT: 1, lasT: 3, lasOn: 0, droT: .5, dead: false, revived: false };
  run = { stars: 0, baseCollected: 0, baseDropped: 0, kills: 0, total: 0, rescued: 0, damaged: false, bombs: ST.bombs,
    usedBomb: false, combo: 0, comboT: 0, bestCombo: 0, lastKill: -9, endT: 0, failT: 0, failed: false, rescueStars: 0, done: false };
  enemies = []; pb = []; eb = []; pickups = []; parts = []; texts = [];
  levelT = 0; boss = null; flash = 0; shake = 0;
  LV.tl = LV.tl.slice();
  seedBg();
  banner = { a: LV.rush ? 'STAR RUSH' : `MISSION ${LV.label}`, b: LV.rush ? 'Grab everything that glitters' : LV.name, t: 3 };
  state = 'play'; paused = false; showScreen(null);
}

/* ---------------------------- BACKGROUND ---------------------------- */
function mkIsland(y) {
  const r = 50 + Math.random() * 130, n = 16, pts = [];
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; pts.push([Math.cos(a) * r * (.7 + Math.random() * .45), Math.sin(a) * r * (.7 + Math.random() * .45)]); }
  const ruins = [];
  const nr = Math.floor(Math.random() * 5);
  for (let i = 0; i < nr; i++) ruins.push([rand(-r * .4, r * .4), rand(-r * .4, r * .4), rand(8, 22), rand(8, 22)]);
  return { x: Math.random() * W, y, r, pts, ruins };
}
function seedBg() {
  islands = []; clouds = [];
  for (let y = H + 100; y > -300; y -= 260 + Math.random() * 120) islands.push(mkIsland(y));
  for (let i = 0; i < 6; i++) clouds.push({ x: Math.random() * W, y: Math.random() * H, r: 60 + Math.random() * 90, sp: 1.6 + Math.random() });
}
function updBg(dt) {
  bgScroll += SCROLL * dt;
  for (const i of islands) i.y += SCROLL * dt;
  islands = islands.filter(i => i.y - i.r < H + 60);
  let top = Math.min(...islands.map(i => i.y), H);
  while (top > -250) { top -= 240 + Math.random() * 160; islands.push(mkIsland(top)); }
  for (const c of clouds) { c.y += SCROLL * c.sp * dt; if (c.y - c.r > H) { c.y = -c.r * 2; c.x = Math.random() * W; } }
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
function drawBg() {
  const S = SECTORS[curSector];
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, S.sea[1]); g.addColorStop(1, S.sea[0]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // texture lines
  ctx.globalAlpha = .07; ctx.fillStyle = '#fff';
  for (let i = 0; i < 14; i++) { const y = ((i * 97 + bgScroll * .9) % (H + 40)) - 20; ctx.fillRect((i * 173) % W, y, 40 + (i * 31) % 80, 2); }
  ctx.globalAlpha = 1;
  for (const i of islands) {
    ctx.save(); ctx.translate(i.x, i.y);
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.translate(8, 10); blob(i.pts, 1.05); ctx.fill(); ctx.translate(-8, -10);
    ctx.fillStyle = S.shore; blob(i.pts, 1); ctx.fill();
    ctx.fillStyle = S.land; blob(i.pts, .78); ctx.fill();
    ctx.fillStyle = S.ruin;
    for (const r of i.ruins) { ctx.fillRect(r[0], r[1], r[2], r[3]); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(r[0] + 3, r[1] + 3, r[2] - 6, r[3] - 6); ctx.fillStyle = S.ruin; }
    ctx.restore();
  }
}
function drawClouds() {
  for (const c of clouds) {
    ctx.fillStyle = 'rgba(255,255,255,.06)';
    ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, 7); ctx.arc(c.x + c.r * .6, c.y + 10, c.r * .7, 0, 7); ctx.arc(c.x - c.r * .6, c.y + 14, c.r * .6, 0, 7); ctx.fill();
  }
}

/* ------------------------------ SPAWN ------------------------------ */
function spawn(ev) {
  if (ev.type === 'stars') { dropStars(ev.x, -20, ev.n, 120); return; }
  const d = ET[ev.type], hpm = 1 + LV.L * .35, s = LV.s;
  const e = { type: ev.type, x: ev.x, y: ev.y ?? -40, x0: ev.x, hp: d.hp * hpm, maxHp: d.hp * hpm, r: d.r, mv: ev.mv || d.mv,
    t: 0, fireRate: d.fr ? d.fr / ((1 + s * .12) * DIFFS[save.diff].fire) : 0, counted: !d.neutral && ev.counted !== false,
    ground: !!d.ground, neutral: !!d.neutral, nohit: !!d.nohit, stars: Math.round(d.stars * (1 + LV.L * .15)),
    amp: ev.amp || 120, dir: ev.dir || 1, ty: ev.ty || 200, ang: Math.PI / 2, flash: 0, vx: 0, vy: 0, prog: 0, spawnT: 2.5 };
  e.fire = e.fireRate ? e.fireRate * (.4 + Math.random() * .6) : 0;
  if (e.type === 'bomber') { e.x = e.dir > 0 ? -60 : W + 60; }
  if (LV.rush) { e.fireRate = 0; e.stars *= 3; }
  if (e.counted) run.total++;
  enemies.push(e);
  return e;
}

function spawnBoss() {
  const S = SECTORS[LV.s], major = LV.major;
  const hp = (major ? 1500 : 620) * (1 + LV.L * .45);
  boss = { type: 'boss', boss: true, major, x: W / 2, y: -160, hp, maxHp: hp, r: major ? 82 : 58, t: 0, pt: 0, pat: -1, rest: 1.5,
    fireT: 0, ang: 0, flash: 0, counted: false, ground: false, neutral: false, stars: Math.round((major ? 260 : 110) * (1 + LV.L * .2)),
    name: major ? S.boss : `${S.boss.split(' ')[0]} VANGUARD`, spin: 0 };
  enemies.push(boss);
  banner = { a: 'WARNING', b: boss.name + ' INBOUND', t: 3, warn: true };
}

/* ------------------------------ COMBAT ------------------------------ */
function addPB(x, y, vx, vy, dmg, r, kind) { pb.push({ x, y, vx, vy, dmg, r, kind }); }
function eShoot(x, y, a, sp) {
  sp *= DIFFS[save.diff].bspd * (1 + LV.s * .05);
  eb.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 6 });
}
const aim = e => Math.atan2(P.y - e.y, P.x - e.x);

function hurtEnemy(e, d, silent) {
  if (e.dead || e.nohit) return;
  if (Math.random() < ST.crit) { d *= 2; if (!silent && Math.random() < .3) texts.push({ x: e.x + rand(-10, 10), y: e.y - 10, s: 'CRIT', c: '#ffd34d', t: .5, sz: 14 }); }
  e.hp -= d; e.flash = .06;
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  e.dead = true;
  boom(e.x, e.y, e.r);
  if (e.type === 'cache') {
    dropStars(e.x, e.y, Math.round(25 + LV.L * 7) * (LV.rush ? 2 : 1));
    if (Math.random() < .5) pickups.push({ kind: 'hp', x: e.x, y: e.y, vx: rand(-40, 40), vy: -80, t: 0 });
    texts.push({ x: e.x, y: e.y - 20, s: 'SUPPLY CACHE', c: '#ffd34d', t: 1, sz: 15 });
    return;
  }
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
    texts.push({ x: W / 2, y: H / 2 - 60, s: `${e.name} DESTROYED`, c: '#ffd34d', t: 2.5, sz: 26 });
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
  d *= DIFFS[save.diff].dmg;
  P.shDelay = 3;
  if (P.shield > 0) { const a = Math.min(P.shield, d); P.shield -= a; d -= a; }
  if (d > 0) { P.hp -= d; run.damaged = true; P.inv = .9; shake = 9; sparks(P.x, P.y, '#ff6a4a', 12); }
  else { P.inv = .35; sparks(P.x, P.y, '#6fe3ff', 8); }
  if (P.hp <= 0) {
    if (ST.revive && !P.revived) {
      P.revived = true; P.hp = ST.maxHp * .5; P.inv = 2.5; eb = []; flash = .5;
      texts.push({ x: W / 2, y: H / 2, s: 'EJECTION PROTOCOL — JARVIS HAS YOU', c: '#6fe3ff', t: 2, sz: 18 });
    } else {
      P.dead = true; run.failed = true; run.failT = 2; boom(P.x, P.y, 40); shake = 16;
    }
  }
}

function useBomb() {
  if (state !== 'play' || paused || run.bombs <= 0 || P.dead || run.endT > 0) return;
  run.bombs--; run.usedBomb = true; flash = .7; shake = 10;
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
  updBg(dt);
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
    if (kx || ky) { const m = Math.hypot(kx, ky); P.x += kx / m * 400 * dt; P.y += ky / m * 400 * dt; P.tx = null; }
    else if (P.tx != null) {
      const dx = P.tx - P.x, dy = P.ty - P.y, d = Math.hypot(dx, dy), mx = 1300 * dt;
      if (d > mx) { P.x += dx / d * mx; P.y += dy / d * mx; } else { P.x = P.tx; P.y = P.ty; }
    }
    P.x = clamp(P.x, 20, W - 20); P.y = clamp(P.y, 60, H - 40);
    P.vx = (P.x - ox) / Math.max(dt, 1e-3);
    P.inv -= dt;
    if (ST.regen && P.hp < ST.maxHp) P.hp = Math.min(ST.maxHp, P.hp + ST.regen * dt);
    P.shDelay -= dt;
    if (ST.shield && P.shDelay <= 0 && P.shield < ST.shield) P.shield = Math.min(ST.shield, P.shield + ST.shield * .25 * dt);
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
    if (b.y < -30 || b.y > H + 30 || b.x < -30 || b.x > W + 30) { b.dead = true; continue; }
    for (const e of enemies) {
      if (e.dead || e.nohit || e.y < -e.r) continue;
      if ((b.x - e.x) ** 2 + (b.y - e.y) ** 2 < (e.r + b.r) ** 2) { hurtEnemy(e, b.dmg); b.dead = true; sparks(b.x, b.y, '#bff', 2); break; }
    }
  }
  pb = pb.filter(b => !b.dead);

  // ---- laser
  if (P.lasOn > 0 && !P.dead) {
    for (const e of enemies) if (!e.dead && !e.nohit && e.y < P.y && e.y > -e.r && Math.abs(e.x - P.x) < e.r + 14) hurtEnemy(e, ST.ldps * dt, true);
  }

  // ---- enemies
  for (const e of enemies) { if (!e.dead) updEnemy(e, dt); }
  enemies = enemies.filter(e => !e.dead);

  // ---- enemy bullets
  for (const b of eb) {
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.y > H + 20 || b.y < -40 || b.x < -20 || b.x > W + 20) b.dead = true;
    else if (!P.dead && (b.x - P.x) ** 2 + (b.y - P.y) ** 2 < (P.r + b.r - 1) ** 2) { b.dead = true; hurtPlayer(10 * (1 + LV.L * .04)); }
  }
  eb = eb.filter(b => !b.dead);

  // ---- pickups
  for (const p of pickups) {
    p.t += dt;
    const d = Math.hypot(P.x - p.x, P.y - p.y);
    if (!P.dead && (d < ST.mag || run.endT > 0) && p.t > .25) {
      const sp = 380 + (ST.mag - Math.min(d, ST.mag)) * 3;
      p.vx += (P.x - p.x) / d * sp * dt * 6; p.vy += (P.y - p.y) / d * sp * dt * 6;
      const m = Math.hypot(p.vx, p.vy), cap = run.endT > 0 ? 900 : 620; if (m > cap) { p.vx *= cap / m; p.vy *= cap / m; }
    } else {
      p.vx *= Math.pow(.15, dt); p.vy += (SCROLL + 30 - p.vy) * Math.min(1, dt * 2.2);
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (!P.dead && d < P.r + 18) {
      p.dead = true;
      if (p.kind === 'star') {
        const val = p.v * ST.fortune * DIFFS[save.diff].stars * comboMult();
        run.stars += val; run.baseCollected += p.v;
      } else { P.hp = Math.min(ST.maxHp, P.hp + 25); texts.push({ x: P.x, y: P.y - 30, s: '+25 HULL', c: '#4cdf8a', t: .8, sz: 15 }); }
    } else if (p.y > H + 30) p.dead = true;
  }
  pickups = pickups.filter(p => !p.dead);

  // ---- fx
  for (const p of parts) {
    p.t -= dt;
    if (p.ring) p.r += 260 * dt; else { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .94; p.vy *= .94; }
  }
  parts = parts.filter(p => p.t > 0);
  for (const t of texts) { t.t -= dt; t.y -= 22 * dt; }
  texts = texts.filter(t => t.t > 0);

  if (run.comboT > 0) { run.comboT -= dt; if (run.comboT <= 0) run.combo = 0; }

  if (run.endT > 0) { run.endT -= dt; if (run.endT <= 0 && !run.done) finishLevel(true); }
  if (run.failT > 0) { run.failT -= dt; if (run.failT <= 0 && !run.done) finishLevel(false); }
}

function fireWeapons(dt) {
  if (run.endT > 0) return;
  P.fireT -= dt;
  if (P.fireT <= 0) {
    P.fireT = ST.fireInt;
    const n = ST.streams;
    for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2); addPB(P.x + o * 11, P.y - 24, o * 40, -950, ST.dmg, 5, 'b'); }
    P.wingT ^= 1;
    if (ST.wings && P.wingT) { addPB(P.x - 18, P.y - 4, -170, -860, ST.wdmg, 4, 'w'); addPB(P.x + 18, P.y - 4, 170, -860, ST.wdmg, 4, 'w'); }
  }
  if (ST.mis) {
    P.misT -= dt;
    if (P.misT <= 0) { P.misT = ST.misInt; addPB(P.x - 16, P.y, -180, -120, ST.mdmg, 6, 'm'); addPB(P.x + 16, P.y, 180, -120, ST.mdmg, 6, 'm'); }
  }
  if (ST.las) {
    if (P.lasOn > 0) P.lasOn -= dt;
    else { P.lasT -= dt; if (P.lasT <= 0) { P.lasOn = 1.7; P.lasT = ST.lasInt; } }
  }
  if (ST.drones) {
    P.droT -= dt;
    if (P.droT <= 0) { P.droT = .32; for (const d of dronePos()) addPB(d.x, d.y - 8, 0, -850, ST.ddmg, 4, 'd'); }
  }
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
    case 'carrier':
      e.y += (e.y < 190 ? 55 : 9) * dt; e.x = W / 2 + Math.sin(e.t * .5) * 120;
      e.spawnT -= dt;
      if (e.spawnT <= 0 && e.y > 0 && e.y < H * .6) { e.spawnT = 3.2; for (const s of [-1, 1]) spawn({ type: 'scout', x: e.x + s * 40, y: e.y + 20, counted: false }); }
      break;
  }
  if (e.type === 'turret') e.ang = aim(e);
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
      }
    }
  }
  // rescue
  if (e.type === 'survivor' && !P.dead) {
    const near = Math.hypot(P.x - e.x, P.y - e.y) < 46;
    if (near) {
      e.prog += dt / 1.1;
      if (e.prog >= 1) {
        e.dead = true; run.rescued++; save.stats.rescues++;
        const v = Math.round((30 + LV.L * 6) * DIFFS[save.diff].stars);
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
  if (e.y > H + 70 || e.x < -130 || e.x > W + 130) e.dead = true;
}

function updBoss(e, dt) {
  e.spin += dt;
  if (e.y < 190) { e.y += 90 * dt; return; }
  e.x = W / 2 + Math.sin(e.t * .45) * (W / 2 - e.r - 30);
  const rage = e.hp < e.maxHp * .5 ? .72 : 1;
  const pats = e.major ? ['radial', 'fan', 'spiral', 'minions', 'fan', 'rain'] : ['fan', 'radial', 'spiral'];
  if (e.rest > 0) { e.rest -= dt; if (e.rest <= 0) { e.pat = (e.pat + 1) % pats.length; e.pt = 0; e.fireT = 0; } return; }
  e.pt += dt; e.fireT -= dt;
  const p = pats[e.pat], s = LV.s;
  if (e.fireT <= 0) {
    switch (p) {
      case 'radial': { e.fireT = .95 * rage; const n = 12 + s * 2; const off = e.pt; for (let i = 0; i < n; i++) eShoot(e.x, e.y + 20, off + i / n * Math.PI * 2, 140); break; }
      case 'fan': { e.fireT = .55 * rage; const a = aim(e); for (let i = -2; i <= 2; i++) eShoot(e.x, e.y + 30, a + i * .2, 190); break; }
      case 'spiral': { e.fireT = .09 * rage; const a = e.pt * 3.1; eShoot(e.x, e.y, a, 150); eShoot(e.x, e.y, a + Math.PI, 150); break; }
      case 'minions': { e.fireT = 99; for (let i = 0; i < 4; i++) spawn({ type: 'diver', x: 80 + i * (W - 160) / 3, y: -30, counted: false }); break; }
      case 'rain': { e.fireT = .16 * rage; eShoot(rand(20, W - 20), -10, Math.PI / 2 + rand(-.1, .1), 150); break; }
    }
  }
  if (e.pt > (p === 'minions' ? 1.5 : 3.2)) { e.rest = 1.1 * rage; }
  if (!P.dead && (e.x - P.x) ** 2 + (e.y - P.y) ** 2 < (e.r * .7 + P.r) ** 2) hurtPlayer(25);
}

/* ------------------------------ RENDER ------------------------------ */
function star(x, y, r, rot) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = rot + i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * .45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath();
}
function poly(pts) { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); }

function drawPlayerShip(x, y, tilt, scale = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale * (1 - Math.abs(tilt) * .25), scale);
  // engine glow
  const fl = 16 + Math.random() * 10;
  ctx.fillStyle = 'rgba(80,200,255,.85)'; poly([[-7, 16], [0, 16 + fl], [7, 16]]); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.9)'; poly([[-3, 16], [0, 12 + fl * .6], [3, 16]]); ctx.fill();
  // body
  ctx.fillStyle = '#d7e3ef';
  poly([[0, -32], [7, -12], [9, -2], [32, 12], [32, 19], [9, 14], [6, 20], [-6, 20], [-9, 14], [-32, 19], [-32, 12], [-9, -2], [-7, -12]]); ctx.fill();
  ctx.fillStyle = '#9fb2c6'; poly([[9, -2], [32, 12], [32, 19], [9, 14]]); ctx.fill(); poly([[-9, -2], [-32, 12], [-32, 19], [-9, 14]]); ctx.fill();
  // jarvis-blue accents
  ctx.fillStyle = '#29b6f6'; poly([[22, 10], [32, 12], [32, 15], [20, 13]]); ctx.fill(); poly([[-22, 10], [-32, 12], [-32, 15], [-20, 13]]); ctx.fill();
  ctx.fillStyle = '#ff9a3d'; ctx.fillRect(-2, 4, 4, 12);
  // canopy
  const g = ctx.createLinearGradient(0, -24, 0, -4); g.addColorStop(0, '#bff3ff'); g.addColorStop(1, '#1e88c7');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -13, 4.5, 10, 0, 0, 7); ctx.fill();
  ctx.restore();
}

function drawEnemy(e) {
  const S = SECTORS[LV ? LV.s : 0], col = e.flash > 0 ? '#fff' : S.enemy;
  ctx.save(); ctx.translate(e.x, e.y);
  switch (e.type) {
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
  if (!e.neutral && !e.boss && e.hp < e.maxHp && e.maxHp > 60) {
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(e.x - 20, e.y - e.r - 10, 40, 4);
    ctx.fillStyle = '#ff6a4a'; ctx.fillRect(e.x - 20, e.y - e.r - 10, 40 * Math.max(0, e.hp / e.maxHp), 4);
  }
}

function drawBoss(e) {
  const S = SECTORS[LV.s], col = e.flash > 0 ? '#fff' : S.enemy, R = e.r;
  ctx.save(); ctx.translate(e.x, e.y);
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(14, 24, R * 1.1, R * .7, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#2d313b';
  poly([[0, R * 1.05], [R * .7, R * .6], [R * 1.35, R * .1], [R * 1.25, -R * .45], [R * .55, -R * .8], [-R * .55, -R * .8], [-R * 1.25, -R * .45], [-R * 1.35, R * .1], [-R * .7, R * .6]]); ctx.fill();
  ctx.fillStyle = col;
  poly([[0, R * .9], [R * .55, R * .5], [R * 1.05, R * .05], [R * .95, -R * .35], [R * .4, -R * .62], [-R * .4, -R * .62], [-R * .95, -R * .35], [-R * 1.05, R * .05], [-R * .55, R * .5]]); ctx.fill();
  ctx.fillStyle = '#1b1e25'; ctx.beginPath(); ctx.arc(0, 0, R * .38, 0, 7); ctx.fill();
  // eye
  const pulse = .6 + Math.sin(gameT * 6) * .4;
  const eg = ctx.createRadialGradient(0, 0, 2, 0, 0, R * .32); eg.addColorStop(0, '#fff'); eg.addColorStop(.3, `rgba(255,60,40,${pulse})`); eg.addColorStop(1, 'rgba(255,40,30,0)');
  ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(0, 0, R * .32, 0, 7); ctx.fill();
  // turrets
  ctx.fillStyle = '#3c4048';
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * R * .78, -R * .05, R * .16, 0, 7); ctx.fill(); }
  ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, R * .5, e.spin, e.spin + 2); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, R * .5, e.spin + 3, e.spin + 5); ctx.stroke();
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
  ctx.setTransform(K, 0, 0, K, 0, 0);
  if (state !== 'play' && state !== 'pause') {
    // ambient menu background
    updBg(1 / 60);
    drawBg(); drawClouds();
    drawPlayerShip(W / 2 + Math.sin(performance.now() / 900) * 30, H - 180 + Math.sin(performance.now() / 600) * 8, 0, 1.4);
    return;
  }
  ctx.save();
  if (shake > 0) ctx.translate(rand(-shake, shake) * .5, rand(-shake, shake) * .5);
  drawBg();
  for (const e of enemies) if (e.ground) drawEnemy(e);
  drawClouds();
  // pickups
  for (const p of pickups) {
    if (p.kind === 'star') {
      const r = p.v >= 10 ? 11 : p.v >= 5 ? 9 : 6;
      ctx.fillStyle = p.v >= 10 ? '#fff1a8' : '#ffcc33';
      star(p.x, p.y, r, p.spin + p.t * 3); ctx.fill();
    } else {
      ctx.fillStyle = '#4cdf8a'; ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(p.x - 6, p.y - 2, 12, 4); ctx.fillRect(p.x - 2, p.y - 6, 4, 12);
    }
  }
  for (const e of enemies) if (!e.ground) e.boss ? drawBoss(e) : drawEnemy(e);
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
    else { ctx.fillStyle = b.kind === 'w' ? '#9ef0ff' : b.kind === 'd' ? '#b48cff' : '#e8fbff'; ctx.fillRect(b.x - 2, b.y - 9, 4, 18); ctx.fillStyle = 'rgba(63,216,255,.35)'; ctx.fillRect(b.x - 4, b.y - 6, 8, 14); }
  }
  // player
  if (!P.dead && (P.inv <= 0 || Math.floor(gameT * 20) % 2 === 0)) {
    drawPlayerShip(P.x, P.y, clamp(P.vx / 900, -1, 1));
    if (P.shield > 0) { ctx.strokeStyle = `rgba(63,216,255,${.25 + .35 * P.shield / ST.shield})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(P.x, P.y, 36, 0, 7); ctx.stroke(); }
    // hitbox dot
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(P.x, P.y, 3, 0, 7); ctx.fill();
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
    if (p.ring) { ctx.strokeStyle = p.c; ctx.globalAlpha = Math.max(0, p.t * 2); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.stroke(); }
    else { ctx.globalAlpha = Math.max(0, p.t / p.max); ctx.fillStyle = p.c; ctx.fillRect(p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz); }
  }
  ctx.globalAlpha = 1;
  // floating text
  ctx.textAlign = 'center';
  for (const t of texts) { ctx.globalAlpha = Math.min(1, t.t * 2); ctx.fillStyle = t.c; ctx.font = `700 ${t.sz || 14}px Orbitron, sans-serif`; ctx.fillText(t.s, t.x, t.y); }
  ctx.globalAlpha = 1;
  ctx.restore();
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
];
let lastLevel = null;
function finishLevel(success) {
  run.done = true;
  const lines = [], L = LV.L;
  const collected = Math.round(run.stars - run.rescueStars);
  lines.push(['Stars collected', collected]);
  if (run.rescueStars) lines.push([`Survivors rescued (${run.rescued})`, Math.round(run.rescueStars)]);
  let total = collected + Math.round(run.rescueStars);
  let medalsNow = [0, 0, 0, 0, 0], newly = [0, 0, 0, 0, 0];
  let title = success ? 'MISSION COMPLETE' : 'MISSION FAILED';
  let story = null;
  save.stats.missions++;
  save.stats.bestCombo = Math.max(save.stats.bestCombo, run.bestCombo);
  if (run.bestCombo >= 10) { const cb = run.bestCombo * 5; lines.push([`Best chain ×${run.bestCombo}`, cb]); total += cb; }

  if (LV.rush) {
    title = success ? 'STAR RUSH CLEARED' : 'STAR RUSH ENDED';
    if (success && !save.bonus[LV.s]) { const b = 500 * (LV.s + 1); save.bonus[LV.s] = 1; lines.push(['First-clear bonus', b]); total += b; }
  } else if (success) {
    const rec = save.lv[L] || (save.lv[L] = { done: false, medals: [0, 0, 0, 0, 0] });
    const cb = Math.round((100 + 40 * L) * DIFFS[save.diff].stars);
    lines.push(['Mission bonus', cb]); total += cb;
    const kp = run.total ? run.kills / run.total : 1;
    medalsNow = [kp >= .7, kp >= 1, run.rescued >= LV.survivors, !run.damaged, run.baseDropped ? run.baseCollected / run.baseDropped >= .9 : true].map(Number);
    const mv = 150 + 60 * L;
    medalsNow.forEach((m, i) => { if (m && !rec.medals[i]) { rec.medals[i] = 1; newly[i] = 1; lines.push([`Medal: ${MEDALS[i].n}`, mv]); total += mv; } });
    if (newly.some(Boolean) && rec.medals.every(Boolean)) { const pb = 300 + 100 * L; lines.push(['All five medals!', pb]); total += pb; }
    const firstClear = !rec.done;
    rec.done = true;
    if (save.diff === 2) save.stats.vetClears++;
    if (firstClear && L === NLEVELS - 1) story = { title: 'TRANSMISSION · THE END', lines: STORY.ending };
  }
  save.stars += total; save.total += total;
  persist();
  checkAch();

  $('resTitle').textContent = title;
  $('resMedals').innerHTML = LV.rush ? '' : MEDALS.map((m, i) => {
    const rec = save.lv[L];
    const on = rec && rec.medals[i];
    return `<div class="medal ${on ? 'on' : ''} ${newly[i] ? 'new' : ''}"><div class="m">${m.ic}</div>${m.n}</div>`;
  }).join('');
  $('resLines').innerHTML = lines.map(l => `<div><span>${l[0]}</span><b>+${fmt(l[1])}</b></div>`).join('') +
    `<div class="total"><span>Total</span><span>★ ${fmt(total)}</span></div>`;
  $('resQuip').textContent = pick(success ? QUIPS.win : QUIPS.lose);
  lastLevel = LV;
  const nextL = LV.rush ? null : (success && L + 1 < NLEVELS ? L + 1 : null);
  $('resNext').textContent = nextL != null ? 'Next mission' : 'Mission board';
  $('resNext').onclick = () => {
    if (story) { showStory(story.title, story.lines, () => go('map')); return; }
    if (nextL != null) startLevel(nextL); else go('map');
  };
  state = 'results';
  showScreen('results');
}

/* ------------------------------ UI ------------------------------ */
const pick = a => a[Math.floor(Math.random() * a.length)];
const SCREENS = ['menu', 'map', 'hangar', 'ach', 'howto', 'story', 'results', 'pause'];
function showScreen(id) { SCREENS.forEach(s => $(s).classList.toggle('hidden', s !== id)); }
function refreshStars() { $('menuStars').textContent = fmt(save.stars); document.querySelectorAll('.starsNow').forEach(e => e.textContent = fmt(save.stars)); }

function go(id) {
  if (id === 'briefing') { showStory('INCOMING TRANSMISSION', STORY.intro, () => go('menu')); return; }
  state = id; curSector = id === 'map' ? curSector : curSector;
  refreshStars();
  if (id === 'menu') $('menuQuip').textContent = pick(QUIPS.menu);
  if (id === 'map') buildMap();
  if (id === 'hangar') { $('hangarQuip').textContent = pick(QUIPS.hangar); buildHangar(); }
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

function unlocked(L) { return L === 0 || !!save.lv[L - 1]?.done; }
function startLevel(L) {
  const s = Math.floor(L / LEVELS_PER);
  const lv = genLevel(L);
  const begin = () => newRun(lv);
  if (L % LEVELS_PER === 0 && !save.seen['s' + s]) {
    save.seen['s' + s] = 1; persist();
    const lines = s === 0 ? STORY.intro : STORY.s[s];
    showStory(s === 0 ? 'INCOMING TRANSMISSION' : `BRIEFING · SECTOR ${s + 1}`, lines, begin);
  } else begin();
}

function buildMap() {
  $('diffPick').innerHTML = DIFFS.map((d, i) => `<button class="btn ${i === save.diff ? 'on' : ''}" data-d="${i}">${d.name}</button>`).join('');
  $('diffPick').insertAdjacentHTML('afterend', '');
  let note = document.querySelector('.diff-note');
  if (!note) { note = document.createElement('div'); note.className = 'diff-note'; $('diffPick').after(note); }
  note.textContent = DIFFS[save.diff].note;
  $('diffPick').querySelectorAll('button').forEach(b => b.onclick = () => { save.diff = +b.dataset.d; persist(); buildMap(); });
  let html = '';
  SECTORS.forEach((S, s) => {
    html += `<div class="sector"><h3>SECTOR ${s + 1} · ${S.name.toUpperCase()}</h3><div class="sub">${S.sub}</div><div class="lvls">`;
    for (let i = 0; i < LEVELS_PER; i++) {
      const L = s * LEVELS_PER + i, rec = save.lv[L], ok = unlocked(L), bossL = i === LEVELS_PER - 1;
      html += `<div class="lvl ${ok ? '' : 'locked'} ${rec?.done ? 'done' : ''} ${bossL ? 'boss' : ''}" data-l="${ok ? L : ''}"><b>${s + 1}-${i + 1}</b>${bossL ? '<small>BOSS</small>' : '<small>&nbsp;</small>'}<div class="pips">${[0, 1, 2, 3, 4].map(m => `<i class="pip ${rec?.medals[m] ? 'on' : ''}"></i>`).join('')}</div></div>`;
    }
    html += '</div>';
    const rOk = !!save.lv[s * LEVELS_PER + LEVELS_PER - 1]?.done;
    html += `<button class="btn rush" data-r="${s}" ${rOk ? '' : 'disabled'}>✨ Star Rush ${save.bonus[s] ? '· cleared' : rOk ? '· first clear +' + fmt(500 * (s + 1)) + '★' : '· beat the boss to unlock'}</button></div>`;
  });
  $('mapList').innerHTML = html;
  $('mapList').querySelectorAll('.lvl').forEach(el => el.onclick = () => { if (el.dataset.l !== '') startLevel(+el.dataset.l); });
  $('mapList').querySelectorAll('.rush').forEach(el => el.onclick = () => newRun(genRush(+el.dataset.r)));
}

function buildHangar() {
  $('upgList').innerHTML = UPG.map(u => {
    const l = ul(u.id), maxed = l >= u.max, c = upCost(u);
    return `<div class="upg"><h4>${u.name}</h4><div class="d">${u.desc}</div>
      <div class="fx">${u.fx(l)}${maxed ? '' : `  →  <span style="color:#fff">${u.fx(l + 1)}</span>`}</div>
      <div class="lvlbar">${Array.from({ length: u.max }, (_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('')}</div>
      <div class="buy"><button class="btn small" data-u="${u.id}" ${maxed || save.stars < c ? 'disabled' : ''}>${maxed ? 'MAX' : 'Upgrade'}</button>${maxed ? '' : `<span>★ ${fmt(c)}</span>`}</div></div>`;
  }).join('');
  $('upgList').querySelectorAll('[data-u]').forEach(b => b.onclick = () => {
    const u = UPG.find(x => x.id === b.dataset.u), c = upCost(u);
    if (save.stars < c || ul(u.id) >= u.max) return;
    save.stars -= c; save.up[u.id] = ul(u.id) + 1; persist(); checkAch();
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
  paused = true; state = 'pause';
  $('pauseInfo').textContent = `${LV.rush ? LV.name : 'Mission ' + LV.label}. Stars so far: ${fmt(run.stars)}. Take your time. I am in no hurry. I am software.`;
  showScreen('pause');
}
$('pResume').onclick = () => { paused = false; state = 'play'; showScreen(null); };
$('pQuit').onclick = () => { paused = false; state = 'play'; finishLevel(false); };
addEventListener('blur', pauseGame);
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });

/* ------------------------------ INPUT ------------------------------ */
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
  pointer = { id: ev.pointerId, ox: P.x - p.x, oy: P.y - p.y, mouse: ev.pointerType === 'mouse' };
  cv.setPointerCapture(ev.pointerId);
});
cv.addEventListener('pointermove', ev => {
  if (state !== 'play') return;
  const p = gp(ev);
  if (pointer && pointer.id === ev.pointerId) { P.tx = p.x + pointer.ox; P.ty = p.y + pointer.oy; }
  else if (ev.pointerType === 'mouse' && !pointer) {
    if (Math.hypot(p.x - (W - 62), p.y - (H - 72)) < 44 || (p.x > W - 60 && p.y < 60)) return;
    P.tx = p.x; P.ty = p.y;
  }
});
const endPtr = ev => { if (pointer && pointer.id === ev.pointerId) pointer = null; };
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);

/* ------------------------------ BOOT ------------------------------ */
$('resRetry').onclick = () => { if (lastLevel) lastLevel.rush ? newRun(genRush(lastLevel.s)) : startLevel(lastLevel.L); };
$('resHangar').onclick = () => go('hangar');

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
