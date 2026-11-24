// No-hit boss check (the owner's rule: every boss beatable without taking a hit).
// Load in the local preview, then e.g.:  BOT(23, 2, 60, .5, { react: .3, spd: 260 })  -> "L23 hp0.5 hits0 {}"
// (mission index, tier 2 = Mk III, seconds, boss HP fraction to pin, human-ish reaction 0.3 s at 260 px/s; diff defaults to Ace).
// Pass { render: N } to draw every Nth frame. Saves and restores the save. Hits are logged by the boss pattern running at the time.
// Human-ish dodge bot: re-decides only every `react` s (reaction time), moves at `spd` px/s, plans 1s ahead.
window.BOT = function (L, tier, secs, hpFrac, o = {}) {
  const react = o.react ?? .2, spd = o.spd ?? 320, HZ = o.hz ?? 1, diff = o.diff ?? 2;
  const saveBak = JSON.stringify(JF.save);
  for (let s = 0; s < 6; s++) JF.save.seen['s' + s] = 1;
  JF.save.diff = diff;
  let hits = 0; const by = {};
  const realHurt = window.hurtPlayer;
  window.hurtPlayer = d => { if (P.inv > 0) return; hits++; const k = boss ? boss.pats[boss.pat] + (boss.rest > 0 ? '(rest)' : '') : '-'; by[k] = (by[k] || 0) + 1; P.inv = .5; };
  try {
    JF.startLevel(L, tier);
    state = 'play'; paused = false;
    LV.tl = []; enemies = []; eb = []; levelT = LV.len + 3;
    spawnBoss();
    const dt = 1 / 60;
    let mv = [0, 0], nextDec = 0;
    for (let f = 0; f < secs * 60; f++) {
      if (boss) boss.hp = boss.maxHp * hpFrac;
      if ((nextDec -= dt) <= 0) {
        nextDec = react;
        const thr = eb.map(b => [b.x, b.y, b.vx, b.vy, b.r + P.r + 1]);
        for (const e of enemies) if (!e.ground && !e.neutral && !e.dead && e.y > -60) {
          const v = e.mv === 'fling' ? [e.vx * .55, (e.vy + 170) / 2] : (e.mv === 'dive' && e.locked) ? [e.vx, e.vy] : e.mv === 'dive' ? [0, 130] : [0, e.boss ? 0 : e.mv === 'down' ? 170 : 70];
          thr.push([e.x, e.y, v[0], v[1], (e.boss ? e.r * .7 : e.r * .75) + P.r + 6]);
          if (e.mv === 'dive' && !e.locked) { const a = Math.atan2(P.y - e.y, P.x - e.x); thr.push([e.x + Math.cos(a) * 60, e.y + Math.sin(a) * 60, Math.cos(a) * 340, Math.sin(a) * 340, e.r * .75 + P.r + 6]); } // about to lunge at you
        }
        let bs = -1e9, N = 10;
        for (let c = 0; c < 33; c++) {
          let vx = 0, vy = 0;
          if (c) { const a = ((c - 1) % 16) / 16 * Math.PI * 2, k = c <= 16 ? 1 : .45; vx = Math.cos(a) * spd * k; vy = Math.sin(a) * spd * k; }
          let mc = 1e9, px, py;
          for (let s = 1; s <= N; s++) {
            const t = s * HZ / N, tm = Math.min(t, react * 1.5); // commit to this move for the reaction window, then hold
            px = clamp(P.x + vx * tm, XL + 20, XR - 20); py = clamp(P.y + vy * tm, 60, H - 40);
            const disc = Math.max(0, t - react) * 14;
            for (const b of thr) { const d = Math.hypot(b[0] + b[2] * t - px, b[1] + b[3] * t - py) - b[4] + disc; if (d < mc) mc = d; }
            for (const e of enemies) if (e.type === 'mine' && e.arm >= 0 && e.arm < t + .15) { const d = Math.hypot(e.x - px, e.y + 75 * t - py) - 52 + disc; if (d < mc) mc = d; }
            for (const st of strikes) if (st.tele > 0 && st.tele < t + .15) { const d = Math.hypot(st.x - px, st.y - py) - 46 + disc; if (d < mc) mc = d; }
            for (const e of enemies) if (e.beam && py > e.y) { const bm = e.beam; if ((bm.tele > 0 && bm.tele < t + .15) || bm.on > 0) { const d = Math.abs(px - bm.x) - 32 + disc; if (d < mc) mc = d; } }
          }
          const sc = Math.min(mc, 40) - .012 * Math.abs(px - W / 2) - .02 * Math.abs(py - (H - 230));
          if (sc > bs) { bs = sc; mv = [vx, vy]; }
        }
      }
      P.tx = null; P.x += mv[0] * dt; P.y += mv[1] * dt;
      JF.update(dt); if (o.render && f % o.render === 0) render();
    }
  } finally {
    window.hurtPlayer = realHurt;
    const keep = JSON.parse(saveBak); for (const k in JF.save) delete JF.save[k]; Object.assign(JF.save, keep); persist();
    state = 'menu';
  }
  return `L${L} hp${hpFrac} hits${hits} ${JSON.stringify(by)}`;
};