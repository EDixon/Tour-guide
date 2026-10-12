// Dynamic tour planner. Pure functions, no DOM, so it runs in the browser and in Node tests.
//
// Model in one paragraph: every stop has an ordered list of bullet points. Each bullet has a
// value (importance x how well its topics match the family's interests) and a cost (seconds to
// read aloud and chat about it). Walking legs have a scenic value. The family's engagement
// drains with time and is restored by a café break; there is also a small chance of having to
// leave early at any moment, so value later in the day is discounted. Given "now", where we
// are and the deadline, the planner picks which stops to visit, in what order, which bullets
// to read at each (always keeping their original order), which walking route to take, and
// whether a café break is worth it. Everything competes against "going home", so when energy
// is low it will happily finish early.

export const IMP_WEIGHT = [0, 0.35, 0.55, 0.8, 1.0, 1.25];
// Weights for the sight itself rather than its story: how striking it is to look at (`wow` 0-5)
// and how often visitors single it out in reviews and guides (`popular` 0-5). They sit alongside
// the topic weights but apply to whole stops, not bullets.
export const SIGHT_WEIGHTS = { looks: 0.8, popular: 0.6 };
export const BREAK_ID = '__break__';
const MUST_BONUS = 50;
const EARTH = 6371000;

export function defaultSettings(tour) {
  return {
    weights: { ...SIGHT_WEIGHTS, ...(tour.defaultWeights || {}) },
    siteInterest: tour.significance ?? 0.5, // 0..1: how much this place grips the family
    wpm: 150,              // reading-aloud speed
    talkFactor: 1.5,       // reading + chatting about it
    speed: 0.85,           // walking m/s with a toddler
    volatility: 'normal',  // calm | normal | chaotic: chance of having to leave early
    chrono: false,         // prefer visiting in order of development
    scenicRate: 0.35,      // value per minute of fully scenic walking, at views weight 1
    leaveRate: 0.25,       // value per minute of "doing something else" (scaled down for gripping sites)
    allowBreaks: true,
    avoidSteps: false,     // pushchair mode: no stepped paths, no stops that need steps
    detail: 'light',       // facts per stop: light | normal | full
  };
}

// How many facts per stop. `mult` raises the bar a fact must clear (relative to the value of
// time); `attn` is the attention span (each further fact at a stop is worth this much less).
export const DETAIL = {
  light: { mult: 2.8, attn: 0.6, route: 0.7 },
  normal: { mult: 1.6, attn: 0.72, route: 0.85 },
  full: { mult: 0.7, attn: 0.86, route: 1 },
};

const HAZARD = { calm: 0.001, normal: 0.0025, chaotic: 0.006 }; // per minute
export const ENERGY_MIN = 0.25;

export function drainPerMin(settings, drainMult = 1) {
  return 0.0035 * (1.7 - settings.siteInterest) * drainMult;
}

export function energyAt(energy, nowMs, settings) {
  const mins = Math.max(0, (nowMs - energy.at) / 60000);
  return Math.max(ENERGY_MIN, Math.min(1, energy.E - drainPerMin(settings, energy.drainMult || 1) * mins));
}

// ---------- geometry ----------
export function haversine(a, b) {
  const toR = Math.PI / 180;
  const dLat = (b[0] - a[0]) * toR, dLon = (b[1] - a[1]) * toR;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH * Math.asin(Math.sqrt(s));
}
export function bearing(a, b) {
  const toR = Math.PI / 180;
  const y = Math.sin((b[1] - a[1]) * toR) * Math.cos(b[0] * toR);
  const x = Math.cos(a[0] * toR) * Math.sin(b[0] * toR) - Math.sin(a[0] * toR) * Math.cos(b[0] * toR) * Math.cos((b[1] - a[1]) * toR);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
export function compassWord(deg) {
  const w = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  return w[Math.round(deg / 45) % 8];
}

// ---------- content valuation ----------
export function interestOf(tags, weights) {
  let max = 0, sum = 0, n = 0;
  for (const [t, s] of Object.entries(tags || {})) {
    const w = weights[t] ?? 0.5;
    max = Math.max(max, s * w);
    sum += s * w; n += s;
  }
  if (!n) return 0.5;
  return 0.6 * max + 0.4 * (sum / n);
}
export function bulletValue(b, weights) {
  // Convex in interest: topics you don't care about (furniture, fabrics…) are worth very little.
  return (IMP_WEIGHT[b.imp] ?? 0.5) * (0.05 + 0.95 * Math.pow(interestOf(b.tags, weights), 1.5));
}
export function wordCount(text) { return (text.match(/\S+/g) || []).length; }
export function bulletSeconds(b, settings) {
  return (4 + wordCount(b.t) / (settings.wpm / 60)) * settings.talkFactor; // 4 s to get everyone's attention
}

// Per-stop value curve: the lead bullet is always read if the stop is visited. The rest are
// grouped greedily by value/time, where picking a bullet also picks any unpicked bullets it
// `needs`. Ratios are then "ironed" to be non-increasing so a stop's groups are always
// taken in sequence (keeps prerequisite chains intact).
export function stopCurve(stop, weights, settings) {
  const bs = stop.bullets || [];
  const byId = new Map(bs.map(b => [b.id, b]));
  const val = new Map(bs.map(b => [b.id, bulletValue(b, weights)]));
  const sec = new Map(bs.map(b => [b.id, bulletSeconds(b, settings)]));
  const lead = bs[0];
  const picked = new Set(lead ? [lead.id] : []);
  const chain = (b) => {
    const out = [];
    let cur = b, guard = 0;
    while (cur && !picked.has(cur.id) && guard++ < 50) {
      out.push(cur.id);
      cur = cur.needs != null ? byId.get(cur.needs) : null;
    }
    return out;
  };
  const groups = [];
  for (;;) {
    let best = null;
    for (const b of bs) {
      if (picked.has(b.id)) continue;
      const ids = chain(b);
      const v = ids.reduce((s, id) => s + val.get(id), 0);
      const t = ids.reduce((s, id) => s + sec.get(id), 0);
      const r = v / t;
      if (!best || r > best.r) best = { ids, v, t, r };
    }
    if (!best) break;
    best.ids.forEach(id => picked.add(id));
    groups.push(best);
  }
  // Attention span: each extra bullet at the same stop is worth a bit less than the last.
  // A stop can ask for a longer attention span (e.g. the introduction, which sets the context).
  const attn = Math.min(0.95, (DETAIL[settings.detail] || DETAIL.light).attn + (stop.attnBoost ?? 0) + 0.1 * ((settings.siteInterest ?? 0.5) - 0.5));
  let before = 1;
  for (const g of groups) {
    const f = Math.pow(attn, before);
    g.v *= f; g.r *= f; before += g.ids.length;
  }
  for (let i = 1; i < groups.length; i++) groups[i].r = Math.min(groups[i].r, groups[i - 1].r);
  // Just seeing the place is worth something too: how striking it is ("wow", scaled by the
  // "looks" weighting) and how often other visitors rate it ("popular", scaled by "popular").
  const looks = (IMP_WEIGHT[stop.wow ?? 0] ?? 0) * (0.3 + 0.7 * (weights.looks ?? SIGHT_WEIGHTS.looks)) * 0.8;
  const crowd = (IMP_WEIGHT[stop.popular ?? 0] ?? 0) * (0.1 + 0.9 * (weights.popular ?? SIGHT_WEIGHTS.popular)) * 0.6;
  const sight = looks + crowd;
  return {
    id: stop.id,
    sight,
    lead: lead ? { ids: [lead.id], v: val.get(lead.id), t: sec.get(lead.id) } : { ids: [], v: 0, t: 0 },
    groups,
    dwell: stop.dwell ?? 60,
    date: stop.date ?? 0,
    order: bs.map(b => b.id),
  };
}

// ---------- graph & legs ----------
export function buildModel(tour) {
  const nodes = new Map();
  for (const w of tour.waypoints || []) nodes.set(w.id, { id: w.id, pos: w.pos, name: w.name, waypoint: true });
  for (const s of tour.stops) nodes.set(s.id, { id: s.id, pos: s.pos, name: s.name, stop: s, building: s.building || null });
  const adj = new Map([...nodes.keys()].map(k => [k, []]));
  const edges = [];
  for (const p of tour.paths || []) {
    const [a, b, scenic = 0.3, name = '', door = null, opts = null] = p;
    if (!nodes.has(a) || !nodes.has(b)) throw new Error(`path refers to unknown node ${a}-${b}`);
    const e = { a, b, scenic, name, door, steps: !!opts?.steps, len: haversine(nodes.get(a).pos, nodes.get(b).pos) };
    edges.push(e);
    adj.get(a).push({ to: b, e });
    adj.get(b).push({ to: a, e });
  }
  return { tour, nodes, adj, edges, stopsById: new Map(tour.stops.map(s => [s.id, s])), legCache: new Map(), legKey: '' };
}

function edgeSeconds(model, from, to, e, settings) {
  if (settings.avoidSteps && e.steps) return Infinity; // Dijkstra never relaxes an infinite edge
  const walk = model.tour.walk || {};
  const A = model.nodes.get(from), B = model.nodes.get(to);
  const inA = !!A.building, inB = !!B.building;
  if (inA && inB) return (e.len * (walk.indoorFactor ?? 1.4)) / settings.speed + 8;
  let t = (e.len * (walk.detour ?? 1.15)) / settings.speed;
  const bld = model.tour.buildings || {};
  if (!inA && inB) t += (bld[B.building]?.entrySeconds ?? 90);
  if (inA && !inB) t += (bld[A.building]?.exitSeconds ?? 45);
  return t;
}

// Dijkstra from `src` with a cost that can favour scenic edges.
function dijkstra(model, src, settings, scenicBias) {
  const dist = new Map(), time = new Map(), scen = new Map(), prev = new Map();
  const done = new Set();
  dist.set(src, 0); time.set(src, 0); scen.set(src, 0);
  for (;;) {
    let u = null, best = Infinity;
    for (const [k, d] of dist) if (!done.has(k) && d < best) { best = d; u = k; }
    if (u == null) break;
    done.add(u);
    for (const { to, e } of model.adj.get(u)) {
      const t = edgeSeconds(model, u, to, e, settings);
      const cost = t * (1 - scenicBias * e.scenic);
      const nd = best + cost;
      if (nd < (dist.get(to) ?? Infinity)) {
        dist.set(to, nd); time.set(to, time.get(u) + t); scen.set(to, scen.get(u) + t * e.scenic); prev.set(to, u);
      }
    }
  }
  return { time, scen, prev };
}

function pathTo(prev, src, dst) {
  const out = [dst];
  let cur = dst, guard = 0;
  while (cur !== src && guard++ < 500) { cur = prev.get(cur); if (cur == null) return null; out.push(cur); }
  return out.reverse();
}

export function legs(model, settings) {
  const key = `${settings.speed}|${settings.avoidSteps ? 'nostep' : ''}`;
  if (model.legKey !== key) { model.legCache = new Map(); model.legKey = key; }
  return function leg(a, b) {
    const k = a + '>' + b;
    let L = model.legCache.get(k);
    if (L) return L;
    if (a === b) {
      L = { fast: { time: 0, scenicSec: 0, path: [a] }, scenic: null };
    } else {
      const f = model._dj?.[key]?.[a] ?? cacheDj(model, key, a, settings);
      const ft = f.fast.time.get(b), st = f.scenic.time.get(b);
      if (ft == null && settings.avoidSteps) {
        // No step-free way: don't fall back to a straight line, which would cross the steps.
        L = { fast: { time: Infinity, scenicSec: 0, path: [a, b] }, scenic: null, noStepFree: true };
      } else if (ft == null) {
        const d = haversine(model.nodes.get(a).pos, model.nodes.get(b).pos) * 1.4 / settings.speed;
        L = { fast: { time: d, scenicSec: 0, path: [a, b] }, scenic: null };
      } else {
        const fast = { time: ft, scenicSec: f.fast.scen.get(b), path: pathTo(f.fast.prev, a, b) };
        let scenic = { time: st, scenicSec: f.scenic.scen.get(b), path: pathTo(f.scenic.prev, a, b) };
        if (scenic.path.join() === fast.path.join() || scenic.time <= fast.time + 1) scenic = null;
        L = { fast, scenic };
      }
    }
    model.legCache.set(k, L);
    return L;
  };
}
function cacheDj(model, key, a, settings) {
  model._dj = model._dj || {};
  model._dj[key] = model._dj[key] || {};
  const r = { fast: dijkstra(model, a, settings, 0), scenic: dijkstra(model, a, settings, 0.75) };
  model._dj[key][a] = r;
  return r;
}

// "We're here": a temporary node at an arbitrary position, joined to the nearest outdoor nodes,
// so the planner can route from wherever the family has wandered to.
export const HERE_ID = '__here__';
export function setHere(model, pos) {
  if (model.nodes.has(HERE_ID)) {
    for (const { to } of model.adj.get(HERE_ID)) model.adj.set(to, model.adj.get(to).filter(x => x.to !== HERE_ID));
    model.edges = model.edges.filter(e => e.a !== HERE_ID && e.b !== HERE_ID);
    model.nodes.delete(HERE_ID); model.adj.delete(HERE_ID);
  }
  model._dj = {}; model.legCache = new Map(); model.legKey = '';
  if (!pos) return;
  model.nodes.set(HERE_ID, { id: HERE_ID, pos, name: 'Where you are', waypoint: true });
  model.adj.set(HERE_ID, []);
  const near = [...model.nodes.values()]
    .filter(n => n.id !== HERE_ID && !n.building && n.stop?.kind !== 'intro')
    .map(n => ({ n, d: haversine(pos, n.pos) }))
    .sort((a, b) => a.d - b.d).slice(0, 3);
  for (const { n, d } of near) {
    const e = { a: HERE_ID, b: n.id, scenic: 0.3, name: `Head for ${n.name}`, door: null, len: d, temp: true };
    model.edges.push(e);
    model.adj.get(HERE_ID).push({ to: n.id, e });
    model.adj.get(n.id).push({ to: HERE_ID, e });
  }
}

// Distance (m) from a point to a path given as node ids: used to spot "we've wandered off".
export function distanceToPath(model, pos, path) {
  const lat0 = pos[0] * Math.PI / 180;
  const xy = p => [(p[1] - pos[1]) * Math.cos(lat0) * 111320, (p[0] - pos[0]) * 110574];
  const pts = path.map(id => xy(model.nodes.get(id).pos));
  if (pts.length === 1) return Math.hypot(...pts[0]);
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L));
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

// ---------- evaluation ----------
// ctx: t0 (s), from, deadline (s), exit, E0, drain (/s), hazard (/s), lambda (value/s), leg(),
//      curves{id:curve}, chrono, chronoMax, mustSee:Set, scenicPerSec, breakSec, breakAt, breakRestore
export function evaluate(route, ctx, detail = false) {
  let t = ctx.t0, at = ctx.from, E0 = ctx.E0, eT = ctx.t0;
  const E = (time) => Math.max(ENERGY_MIN, E0 - ctx.drain * (time - eT));
  const S = (time) => Math.exp(-ctx.hazard * (time - ctx.t0));
  const M = (time) => (0.6 + 0.4 * E(time)) * S(time); // value multiplier: tired families get less from each stop
  let base = 0, chronoMax = ctx.chronoMax;
  const items = [];
  const steps = detail ? [] : null;
  const legAt = (i, a, b, time) => {
    const L = ctx.leg(a, b);
    const m = M(time);
    base += L.fast.scenicSec * ctx.scenicPerSec * m;
    if (L.scenic) {
      const dv = (L.scenic.scenicSec - L.fast.scenicSec) * ctx.scenicPerSec * m;
      const dt = L.scenic.time - L.fast.time;
      if (dv > 0 && dt > 0) items.push({ kind: 'leg', i, seq: 0, v: dv, t: dt, r: dv / dt });
    }
    return L;
  };
  for (let i = 0; i < route.length; i++) {
    const id = route[i];
    const stopNode = id === BREAK_ID ? ctx.breakAt : id;
    const L = legAt(i, at, stopNode, t);
    const leaveFrom = t;
    t += L.fast.time; at = stopNode;
    if (id === BREAK_ID) {
      const arrive = t;
      // A break is worth more the more tired you are, but only if there's touring after it.
      if (route.slice(i + 1).some(x => x !== BREAK_ID)) base += ctx.breakValue * (1 - E(arrive)) * S(arrive);
      t += ctx.breakSec;
      E0 = Math.min(1, Math.max(E(arrive), ctx.breakRestore)); eT = t;
      if (detail) steps.push({ id, node: stopNode, leg: L, legStart: leaveFrom, arrive, leave: t });
      continue;
    }
    const c = ctx.curves[id];
    let m = M(t);
    if (ctx.chrono) {
      if (c.date < chronoMax - 10) m *= 0.7;
      chronoMax = Math.max(chronoMax, c.date);
    }
    base += (c.lead.v + c.sight) * m + (ctx.mustSee.has(id) ? MUST_BONUS : 0);
    const arrive = t;
    t += c.dwell + c.lead.t;
    c.groups.forEach((g, k) => items.push({ kind: 'b', i, seq: k, v: g.v * m, t: g.t, r: g.r * m, ids: g.ids }));
    if (detail) steps.push({ id, node: id, leg: L, legStart: leaveFrom, arrive, mult: m, energy: E(arrive) });
  }
  const back = legAt(route.length, at, ctx.exit, t);
  const backStart = t;
  t += back.fast.time;
  let slack = ctx.deadline - t;
  if (slack < 0) {
    return { feasible: false, score: base - 1000 + slack * 0.05 - ctx.lambda * (t - ctx.t0), finish: t, slack, steps, back };
  }
  items.sort((a, b) => b.r - a.r || a.i - b.i || a.seq - b.seq);
  const nextSeq = new Map(), blocked = new Set();
  let gained = 0, extra = 0;
  const chosen = [];
  for (const it of items) {
    // A fact must clear a higher bar than a scenic detour: "fewer facts" never means "fewer stops".
    if (it.r <= (it.kind === 'b' ? ctx.bulletLambda : ctx.lambda)) continue;
    const key = it.kind + it.i;
    if (it.kind === 'b' && (blocked.has(key) || (nextSeq.get(key) ?? 0) !== it.seq)) continue;
    if (it.t > slack) { if (it.kind === 'b') blocked.add(key); continue; }
    slack -= it.t; extra += it.t; gained += it.v;
    if (it.kind === 'b') nextSeq.set(key, it.seq + 1);
    chosen.push(it);
  }
  const finish = t + extra;
  const score = base + gained - ctx.lambda * (finish - ctx.t0);
  return { feasible: true, score, finish, slack, chosen, steps, back, backStart };
}

// ---------- search ----------
export function buildContext(model, state, settings, nowS) {
  const tour = model.tour;
  const curves = {};
  for (const s of tour.stops) if (s.kind !== 'facility') curves[s.id] = stopCurve(s, settings.weights, settings);
  const brk = tour.breaks?.cafe || { minutes: 20, restore: 1, at: tour.exit };
  const visitedDates = Object.keys(state.visited || {}).map(id => model.stopsById.get(id)?.date ?? 0);
  return {
    t0: nowS,
    from: state.from || tour.start,
    deadline: state.deadlineS,
    exit: tour.exit,
    E0: state.E0 ?? 1,
    drain: drainPerMin(settings, state.drainMult || 1) / 60,
    hazard: (HAZARD[settings.volatility] ?? HAZARD.normal) / 60,
    // Fewer facts per stop frees time, so the bar for adding a stop drops: depth changes, breadth doesn't.
    lambda: settings.leaveRate * (1.2 - settings.siteInterest) / 60 * (DETAIL[settings.detail] || DETAIL.light).route,
    bulletLambda: settings.leaveRate * (1.2 - settings.siteInterest) / 60
      * (DETAIL[settings.detail] || DETAIL.light).mult * (state.depthMult || 1),
    scenicPerSec: settings.scenicRate * (settings.weights.views ?? 0.5) / 60,
    leg: legs(model, settings),
    curves,
    chrono: !!settings.chrono,
    chronoMax: visitedDates.length ? Math.max(...visitedDates) : 0,
    mustSee: new Set(tour.stops.filter(s => (state.pinned || {})[s.id] ?? s.mustSee).map(s => s.id)),
    breakSec: (brk.minutes ?? 20) * 60,
    breakAt: brk.at || tour.exit,
    breakRestore: brk.restore ?? 1,
    breakValue: settings.breakValue ?? 9,
  };
}

// Does this stop need steps (its own flag, or the building it's in)? Used in pushchair mode.
export function needsSteps(model, s) {
  return !!(s.steps || (s.building && model.tour.buildings?.[s.building]?.steps));
}
export function candidates(model, state, settings = {}) {
  return model.tour.stops
    .filter(s => s.kind !== 'facility' && s.kind !== 'intro')
    .filter(s => !(state.visited || {})[s.id] && !(state.skipped || {})[s.id])
    .filter(s => !(settings.avoidSteps && needsSteps(model, s)))
    .map(s => s.id);
}

// Local search. Phase A builds the route by best insertion (stops, or whole building blocks so
// the one-off cost of entering the house is shared). Phase B polishes with first-improvement
// moves (remove, swap-in, relocate, 2-opt, insert) until nothing helps or time runs out.
function improve(route, pool, ctx, fixedPrefix, deadlineMs, blocks) {
  let cur = evaluate(route, ctx);
  const free = () => { const s = new Set(route); return pool.filter(id => !s.has(id)); };
  const insertMoves = function* () {
    const f = free();
    for (const c of f) for (let p = fixedPrefix; p <= route.length; p++) yield [...route.slice(0, p), c, ...route.slice(p)];
    for (const blk of blocks) {
      const b = blk.filter(id => f.includes(id));
      if (b.length < 2) continue;
      for (let p = fixedPrefix; p <= route.length; p++) yield [...route.slice(0, p), ...b, ...route.slice(p)];
    }
  };
  // Phase A: best insertion until no gain
  for (let guard = 0; guard < 60 && Date.now() < deadlineMs; guard++) {
    let best = null, bestR = null;
    for (const r of insertMoves()) {
      const e = evaluate(r, ctx);
      if (e.score > cur.score + 1e-6 && (!best || e.score > best.score)) { best = e; bestR = r; }
    }
    if (!best) break;
    route = bestR; cur = best;
  }
  // Phase B: first improvement over a wider neighbourhood
  const moves = function* () {
    const n = route.length, f = free();
    for (let i = fixedPrefix; i < n; i++) yield [...route.slice(0, i), ...route.slice(i + 1)];
    for (let i = fixedPrefix; i < n; i++) for (let j = fixedPrefix; j < n; j++) {
      if (i === j) continue;
      const r = route.slice(); const [x] = r.splice(i, 1); r.splice(j, 0, x); yield r;
    }
    for (let i = fixedPrefix; i < n - 1; i++) for (let j = i + 1; j < n; j++)
      yield [...route.slice(0, i), ...route.slice(i, j + 1).reverse(), ...route.slice(j + 1)];
    for (let i = fixedPrefix; i < n; i++) for (const c of f) { const r = route.slice(); r[i] = c; yield r; }
    yield* insertMoves();
  };
  let improved = true, rounds = 0;
  while (improved && rounds++ < 400 && Date.now() < deadlineMs) {
    improved = false;
    for (const r of moves()) {
      const e = evaluate(r, ctx);
      if (e.score > cur.score + 1e-6) { route = r; cur = e; improved = true; break; }
    }
  }
  return { route, ev: cur };
}

// Trim a route that overruns the time, dropping whichever stop costs most each time, rather than
// throwing it away: on a big site a visit-everything seed rarely fits, and a search started from
// an empty route can settle on a few far-apart stops. Breaks are kept.
function fit(route, ctx, fixed) {
  let ev = evaluate(route, ctx);
  while (!ev.feasible && route.length > fixed) {
    let bestR = null, bestE = null;
    for (let i = fixed; i < route.length; i++) {
      if (route[i] === BREAK_ID) continue;
      const r = [...route.slice(0, i), ...route.slice(i + 1)];
      const e = evaluate(r, ctx);
      if (!bestE || e.score > bestE.score) { bestR = r; bestE = e; }
    }
    if (!bestR) break;
    route = bestR; ev = bestE;
  }
  return { route, ev };
}

function buildingBlocks(model, pool) {
  const by = new Map();
  for (const s of model.tour.stops) {
    if (!s.building || !pool.includes(s.id)) continue;
    if (!by.has(s.building)) by.set(s.building, []);
    by.get(s.building).push(s.id);
  }
  return [...by.values()];
}

// Main entry. state: { from, deadlineS, E0, drainMult, visited, skipped, pinned, forceFirst, onBreak, noBreak }
export function plan(model, state, settings, nowS, opts = {}) {
  const t0 = Date.now();
  const budget = opts.budgetMs ?? 1200;
  const ctx = buildContext(model, state, settings, nowS);
  // In pushchair mode, leave out stops with no step-free way to them (they are listed as dropped).
  const pool = candidates(model, state, settings).filter(id => !(settings.avoidSteps && ctx.leg(state.from, id).noStepFree));
  if (state.forceFirst && !pool.includes(state.forceFirst) && model.stopsById.get(state.forceFirst)?.kind === 'intro') pool.unshift(state.forceFirst);
  const blocks = buildingBlocks(model, pool);
  let fixed = 0, route = [];
  if (state.forceFirst && pool.includes(state.forceFirst)) { route = [state.forceFirst]; fixed = 1; }

  let { route: r1, ev: e1 } = improve(route, pool, ctx, fixed, t0 + budget * 0.45, blocks);
  // Warm start from earlier plans (e.g. the plan before the last tap): keeps plans stable and
  // stops the search getting stuck in a poorer local optimum.
  // Second construction: visit everything nearest-neighbour style, then let the search prune.
  const nn = (() => {
    const left = new Set(pool.filter(id => id !== route[0]));
    const out = fixed ? [route[0]] : [];
    let at = fixed ? route[0] : ctx.from;
    while (left.size) {
      let best = null, bt = Infinity;
      for (const id of left) { const tt = ctx.leg(at, id).fast.time; if (tt < bt) { bt = tt; best = id; } }
      if (best == null) break;
      out.push(best); left.delete(best); at = best;
    }
    return out;
  })();
  for (const seedRaw of [nn, ...(opts.seeds || [])]) {
    if (Date.now() > t0 + budget * 0.6) break;
    const allowed = new Set(pool);
    let seed = seedRaw.filter(id => allowed.has(id) && id !== state.forceFirst);
    seed = fixed ? [route[0], ...seed] : seed;
    let sEv;
    ({ route: seed, ev: sEv } = fit(seed, ctx, fixed));
    if (!sEv.feasible && sEv.score < e1.score) continue;
    const { route: r, ev } = improve(seed, pool, ctx, fixed, t0 + budget * 0.6, blocks);
    if (ev.score > e1.score + 1e-6) { r1 = r; e1 = ev; }
  }
  let bestRoute = r1, bestEv = e1;

  if (settings.allowBreaks && !state.onBreak && !state.noBreak) {
    // Put a break at its best position in the current route, then let the search rebuild around it.
    let seed = null, seedEv = null;
    for (let p = fixed; p <= r1.length; p++) {
      const { route: r, ev: e } = fit([...r1.slice(0, p), BREAK_ID, ...r1.slice(p)], ctx, fixed);
      if (!seedEv || e.score > seedEv.score) { seed = r; seedEv = e; }
    }
    if (seed) {
      const { route: r2, ev: e2 } = improve(seed, [...pool, BREAK_ID], ctx, fixed, t0 + budget, blocks);
      if (e2.score > bestEv.score + 1e-6) { bestRoute = r2; bestEv = e2; }
    }
    for (const seedRaw of (opts.seeds || []).filter(r => r.includes(BREAK_ID))) {
      const allowed = new Set([...pool, BREAK_ID]);
      let sd = seedRaw.filter(id => allowed.has(id) && id !== state.forceFirst);
      sd = fixed ? [route[0], ...sd] : sd;
      const { route: r3, ev: e3 } = improve(sd, [...pool, BREAK_ID], ctx, fixed, t0 + budget * 1.2, blocks);
      if (e3.score > bestEv.score + 1e-6) { bestRoute = r3; bestEv = e3; }
    }
  }
  return describe(model, bestRoute, ctx, settings, state, pool);
}

function describe(model, route, ctx, settings, state, pool) {
  const ev = evaluate(route, ctx, true);
  const chosenBy = new Map();
  const scenicLegs = new Set();
  for (const it of ev.chosen || []) {
    if (it.kind === 'leg') scenicLegs.add(it.i);
    else { if (!chosenBy.has(it.i)) chosenBy.set(it.i, []); chosenBy.get(it.i).push(...it.ids); }
  }
  // Rebuild an accurate timeline with the chosen bullets and scenic legs.
  let t = ctx.t0;
  const steps = [];
  (ev.steps || []).forEach((s, i) => {
    const useScenic = scenicLegs.has(i) && s.leg.scenic;
    const leg = useScenic ? s.leg.scenic : s.leg.fast;
    const legStart = t;
    t += leg.time;
    if (s.id === BREAK_ID) {
      const arrive = t; t += ctx.breakSec;
      steps.push({ type: 'break', id: BREAK_ID, node: s.node, legStart, arrive, leave: t, leg: { ...leg, scenic: !!useScenic } });
      return;
    }
    const c = ctx.curves[s.id];
    const ids = new Set([...c.lead.ids, ...(chosenBy.get(i) || [])]);
    const stop = model.stopsById.get(s.id);
    const bullets = c.order.filter(id => ids.has(id));
    const readSec = bullets.reduce((sum, id) => sum + bulletSeconds(stop.bullets.find(b => b.id === id), settings), 0);
    const arrive = t;
    t += c.dwell + readSec;
    steps.push({ type: 'stop', id: s.id, node: s.id, legStart, arrive, leave: t, bullets, total: c.order.length, energy: s.energy, leg: { ...leg, scenic: !!useScenic } });
  });
  const backScenic = scenicLegs.has(route.length) && ev.back?.scenic;
  const backLeg = backScenic ? ev.back.scenic : ev.back?.fast;
  const backStart = t;
  if (backLeg) t += backLeg.time;

  // Why were things left out?
  const inRoute = new Set(route);
  const dropped = [];
  if (settings.avoidSteps) {
    for (const id of candidates(model, state, settings)) if (!pool.includes(id)) dropped.push({ id, reason: 'No step-free way there' });
  }
  for (const id of pool) {
    if (inRoute.has(id)) continue;
    let bestIns = null;
    for (let p = state.forceFirst ? 1 : 0; p <= route.length; p++) {
      const e = evaluate([...route.slice(0, p), id, ...route.slice(p)], ctx);
      if (!bestIns || e.score > bestIns.score) bestIns = e;
    }
    const reason = !bestIns || !bestIns.feasible ? 'No time left for it' : 'Not worth the time for your interests and energy';
    dropped.push({ id, reason });
  }
  if (settings.avoidSteps) {
    for (const s of model.tour.stops) {
      if (needsSteps(model, s) && s.kind !== 'facility' && !(state.visited || {})[s.id] && !(state.skipped || {})[s.id]) dropped.push({ id: s.id, reason: 'Needs steps (avoiding steps)' });
    }
  }
  return {
    feasible: ev.feasible,
    route,
    steps,
    back: { leg: backLeg ? { ...backLeg, scenic: !!backScenic } : null, legStart: backStart, arrive: t },
    finish: t,
    slack: ctx.deadline - t,
    score: ev.score,
    dropped,
    energyNow: ctx.E0,
  };
}

// Convenience: choose which bullets to show at a stop we've just arrived at.
export function bulletsForArrival(planResult, stopId) {
  const s = planResult.steps.find(x => x.type === 'stop' && x.id === stopId);
  return s ? s.bullets : null;
}
