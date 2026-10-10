import * as P from './planner.js';

// ---------------------------------------------------------------- state
const LS = 'tourguide:v1';
let tour = null, model = null, state = null, plan = null;
let tab = 'now', heading = null, wakeLock = null, mapView = null, reviewMode = false;
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const now = () => Date.now() + (state?.clockOffset || 0);

function freshState(t) {
  const d = P.defaultSettings(t);
  return {
    v: 1, tourId: t.id, phase: 'setup',
    deadline: null, target: null, purpose: null, at: null, from: t.start,
    leftAt: null, arrivedAt: null, breakEnds: null, breakKind: null,
    visited: {}, skipped: {}, pinned: {},
    shown: [], extra: [],
    energy: { E: 1, at: Date.now(), drainMult: 1 }, impatience: 1,
    prefs: {
      weights: d.weights, siteInterest: d.siteInterest, chrono: false, volatility: 'normal',
      speed: d.speed, talkFactor: d.talkFactor, allowBreaks: true, recordTrack: true, useGps: true,
    },
    clockOffset: 0, track: [], gps: null, log: [],
  };
}
function save() { try { localStorage.setItem(LS + ':' + tour.id, JSON.stringify(state)); } catch (e) { /* storage full or blocked */ } }
function load(id) { try { return JSON.parse(localStorage.getItem(LS + ':' + id)); } catch (e) { return null; } }

function settings() {
  const d = P.defaultSettings(tour);
  const p = state.prefs;
  return { ...d, weights: { ...d.weights, ...p.weights }, siteInterest: p.siteInterest, chrono: p.chrono, volatility: p.volatility, speed: p.speed, talkFactor: p.talkFactor, allowBreaks: p.allowBreaks };
}
const energyNow = () => P.energyAt(state.energy, now(), settings());
function setEnergy(E, drainMult = state.energy.drainMult) { state.energy = { E: clamp(E, P.ENERGY_MIN, 1), at: now(), drainMult: clamp(drainMult, 0.5, 3) }; }
const stop = (id) => model.stopsById.get(id);
const nodePos = (id) => model.nodes.get(id)?.pos;
const era = (id) => tour.eras.find(e => e.id === id);
const breakCfg = () => tour.breaks?.cafe || { minutes: 20, at: tour.exit, restore: 1, label: 'Café' };
const logEv = (type, data = {}) => { state.log.push({ t: now(), type, ...data }); if (state.log.length > 400) state.log.shift(); };

// ---------------------------------------------------------------- formatting
const fmtClock = (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
function fmtDur(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}
const fmtDist = (m) => m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
function chip(eraId, label) {
  const e = era(eraId);
  return `<span class="chip" style="background:${e?.colour || '#666'}">${esc(label || e?.name || '')}</span>`;
}
function stopDate(s) { return s.dateLabel || (s.date ? String(s.date) : ''); }

// ---------------------------------------------------------------- planning
function replan({ keepTarget = true, quiet = false } = {}) {
  const prev = plan;
  const st = settings();
  let nowS = now() / 1000, from = state.from, E0 = energyNow(), onBreak = false, forceFirst = null;
  if (state.phase === 'stop') { from = state.at; forceFirst = state.at; }
  else if (state.phase === 'break') {
    from = state.at; onBreak = true;
    nowS = Math.max(nowS, state.breakEnds / 1000);
    E0 = state.breakKind === 'cafe' ? Math.max(E0, breakCfg().restore ?? 1) : clamp(E0 + 0.08, 0, 1);
  } else if (state.phase === 'walking' && (state.purpose === 'cafe' || state.purpose === 'loo')) {
    const L = P.legs(model, st)(state.from, state.target);
    from = state.target; onBreak = true;
    const mins = state.purpose === 'cafe' ? breakCfg().minutes : (tour.breaks?.loo?.minutes ?? 6);
    nowS += L.fast.time + mins * 60;
    E0 = state.purpose === 'cafe' ? 1 : clamp(E0 + 0.08, 0, 1);
  } else if (state.phase === 'walking' && keepTarget && state.purpose === 'stop' && state.target) {
    forceFirst = state.target;
  }
  plan = P.plan(model, {
    from, deadlineS: state.deadline / 1000, E0, drainMult: state.energy.drainMult, lambdaMult: state.impatience || 1,
    visited: state.visited, skipped: state.skipped, pinned: state.pinned, forceFirst, onBreak,
  }, st, nowS);
  if (state.phase === 'walking' && !forceFirst && state.purpose !== 'cafe' && state.purpose !== 'loo') setTargetFromPlan();
  if (!quiet && prev) diffToast(prev, plan);
  save();
}

function setTargetFromPlan() {
  const first = plan.steps[0];
  if (!first) { state.target = tour.exit; state.purpose = 'exit'; return; }
  if (first.type === 'break') { state.target = first.node; state.purpose = 'cafe'; return; }
  state.target = first.id; state.purpose = 'stop';
}

function diffToast(a, b) {
  const sa = new Set(a.route), sb = new Set(b.route);
  const dropped = [...sa].filter(id => id !== P.BREAK_ID && !sb.has(id) && !state.visited[id] && id !== state.at);
  const added = [...sb].filter(id => id !== P.BREAK_ID && !sa.has(id));
  const msgs = [];
  if (dropped.length) msgs.push(`dropping ${dropped.map(id => stop(id).name).join(', ')}`);
  if (added.length) msgs.push(`adding ${added.map(id => stop(id).name).join(', ')}`);
  if (!sa.has(P.BREAK_ID) && sb.has(P.BREAK_ID)) msgs.push('a café break now looks worthwhile');
  if (sa.has(P.BREAK_ID) && !sb.has(P.BREAK_ID)) msgs.push('no café break needed');
  if (msgs.length) toast('Plan updated: ' + msgs.join('; ') + '.');
}

// ---------------------------------------------------------------- actions
function startTour(deadlineMs) {
  state.deadline = deadlineMs;
  state.phase = 'walking';
  state.from = tour.start;
  state.leftAt = now();
  setEnergy(1, 1); state.impatience = 1;
  logEv('start', { deadline: deadlineMs });
  replan({ keepTarget: false, quiet: true });
  requestWake();
  startGps();
  render();
}

function arrive() {
  const target = state.target, purpose = state.purpose;
  state.from = target; state.arrivedAt = now();
  logEv('arrive', { id: target, purpose });
  if (purpose === 'stop') {
    state.phase = 'stop'; state.at = target;
    replan({ quiet: true });
    const step = plan.steps.find(s => s.type === 'stop' && s.id === target);
    state.shown = step ? step.bullets : [stop(target).bullets[0]?.id].filter(x => x != null);
    state.extra = [];
  } else if (purpose === 'cafe' || purpose === 'loo') {
    state.phase = 'break'; state.at = target; state.breakKind = purpose;
    const mins = purpose === 'cafe' ? breakCfg().minutes : (tour.breaks?.loo?.minutes ?? 6);
    state.breakEnds = now() + mins * 60000;
    replan({ quiet: true });
  } else {
    state.phase = 'done'; state.at = target;
  }
  save(); render();
  $('#view').scrollTop = 0;
}

function finishStop() {
  if (state.phase !== 'stop') return;
  state.visited[state.at] = { arrived: state.arrivedAt, left: now(), shown: state.shown, extra: state.extra };
  logEv('leave', { id: state.at, shown: state.shown.length, extra: state.extra.length });
  state.from = state.at; state.at = null; state.phase = 'walking'; state.leftAt = now();
  state.shown = []; state.extra = []; state.purpose = null;
  replan({ keepTarget: false });
  render();
  $('#view').scrollTop = 0;
}

function endBreak() {
  const kind = state.breakKind;
  if (kind === 'cafe') { setEnergy(Math.max(energyNow(), breakCfg().restore ?? 1), Math.max(1, state.energy.drainMult * 0.85)); state.impatience = Math.max(1, (state.impatience || 1) * 0.75); }
  else setEnergy(energyNow() + 0.08);
  logEv('break-end', { kind });
  state.from = state.at; state.at = null; state.phase = 'walking'; state.leftAt = now();
  state.breakKind = null; state.breakEnds = null; state.purpose = null; state._breakNudged = false;
  replan({ keepTarget: false });
  render();
}

function skipTarget() {
  if (state.purpose !== 'stop') { state.purpose = null; replan({ keepTarget: false }); render(); return; }
  state.skipped[state.target] = true;
  logEv('skip', { id: state.target });
  replan({ keepTarget: false });
  render();
}

function goTo(id, purpose = 'stop') {
  if (state.phase === 'setup') return;
  if (state.phase === 'stop' && state.at !== id) finishStopSilently();
  if (state.phase === 'break') { state.from = state.at; state.at = null; state.breakKind = null; }
  if (state.skipped[id]) delete state.skipped[id];
  state.phase = 'walking'; state.target = id; state.purpose = purpose; state.leftAt = now();
  replan({ keepTarget: true });
  closeSheet(); tab = 'now'; render();
}
function finishStopSilently() {
  state.visited[state.at] = { arrived: state.arrivedAt, left: now(), shown: state.shown, extra: state.extra };
  state.from = state.at; state.at = null; state.shown = []; state.extra = [];
}

function nudgeWeights(id, delta) {
  const s = stop(id); if (!s) return;
  const tally = {};
  for (const b of s.bullets) for (const [t, v] of Object.entries(b.tags)) tally[t] = (tally[t] || 0) + v * b.imp;
  const top = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 2).map(x => x[0]);
  for (const t of top) state.prefs.weights[t] = clamp((state.prefs.weights[t] ?? 0.5) + delta, 0, 1);
}

function bored() {
  setEnergy(energyNow() - 0.2, state.energy.drainMult * 1.15);
  state.impatience = clamp((state.impatience || 1) * 1.4, 0.5, 5);
  state.prefs.siteInterest = clamp(state.prefs.siteInterest - 0.05, 0, 1);
  const here = state.at || (state.purpose === 'stop' ? state.target : null);
  if (here) nudgeWeights(here, -0.05);
  logEv('bored', { at: here });
  if (state.phase === 'stop') {
    // Trim this stop hard (they want to move on now), then plan the rest with the new mood.
    const keep = state.impatience;
    state.impatience = keep * 2.5;
    replan({ quiet: true });
    const step = plan.steps.find(s => s.type === 'stop' && s.id === state.at);
    if (step) state.shown = state.shown.filter(id => step.bullets.includes(id));
    state.extra = [];
    state.impatience = keep;
    replan({ quiet: true });
    toast('Got it. Trimmed this stop to the essentials and shortened the rest.');
  } else {
    replan({ keepTarget: false });
    toast('Got it. Shortened the plan.');
  }
  render();
}

function loving() {
  setEnergy(energyNow() + 0.1, state.energy.drainMult * 0.9);
  state.impatience = clamp((state.impatience || 1) * 0.8, 0.5, 4);
  state.prefs.siteInterest = clamp(state.prefs.siteInterest + 0.05, 0, 1);
  const here = state.at || (state.purpose === 'stop' ? state.target : null);
  if (here) nudgeWeights(here, 0.03);
  logEv('loving', { at: here });
  replan({ quiet: false });
  toast('Noted. More of this kind of thing.');
  render();
}

function moreBullet() {
  const s = stop(state.at);
  const seen = new Set([...state.shown, ...state.extra]);
  const next = s.bullets.find(b => !seen.has(b.id) && (b.needs == null || seen.has(b.needs)));
  if (!next) return;
  state.extra.push(next.id);
  for (const [t, v] of Object.entries(next.tags)) state.prefs.weights[t] = clamp((state.prefs.weights[t] ?? 0.5) + 0.015 * v, 0, 1);
  setEnergy(energyNow() + 0.02);
  logEv('more', { id: state.at, b: next.id });
  save(); render();
}

function setDeadline(ms) {
  state.deadline = ms;
  logEv('deadline', { deadline: ms });
  replan({ keepTarget: false });
  render();
}

// ---------------------------------------------------------------- GPS, compass, wake lock
let gpsWatch = null;
function startGps() {
  if (gpsWatch != null || !('geolocation' in navigator)) return;
  gpsWatch = navigator.geolocation.watchPosition((p) => {
    const g = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, t: Date.now() };
    state.gps = g;
    if (state.prefs.recordTrack && g.acc <= 50) {
      const last = state.track[state.track.length - 1];
      if (!last || P.haversine([last[0], last[1]], [g.lat, g.lon]) > 8 || g.t - last[2] > 60000) {
        state.track.push([+g.lat.toFixed(6), +g.lon.toFixed(6), g.t, Math.round(g.acc)]);
        if (state.track.length > 6000) state.track.shift();
      }
    }
    if (tab === 'now' && state.phase === 'walking') renderNowLight();
    if (tab === 'map') renderMap();
  }, () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
}
function onOrientation(e) {
  if (e.absolute === false && e.webkitCompassHeading == null) return;
  const h = e.webkitCompassHeading ?? (e.alpha != null ? 360 - e.alpha : null);
  if (h == null) return;
  heading = h;
  const a = $('#arrow');
  if (a) a.style.transform = `rotate(${(+a.dataset.bearing - heading + 360) % 360}deg)`;
}
window.addEventListener('deviceorientationabsolute', onOrientation);
window.addEventListener('deviceorientation', (e) => { if (e.absolute || e.webkitCompassHeading != null) onOrientation(e); });
async function requestWake() {
  try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* not allowed */ }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state && state.phase !== 'setup' && state.phase !== 'done') requestWake(); });

function gpsFresh() {
  if (state.prefs.useGps === false) return null;
  const g = state.gps;
  return g && Date.now() - g.t < 30000 && g.acc <= 35 ? g : null;
}
function currentLeg() {
  if (state.phase !== 'walking' || !state.target) return null;
  if (state.purpose === 'stop' && plan?.steps[0]?.id === state.target) return plan.steps[0].leg;
  return P.legs(model, settings())(state.from, state.target).fast;
}
function alongPath(path, frac) {
  const pts = path.map(nodePos);
  const segs = []; let total = 0;
  for (let i = 1; i < pts.length; i++) { const d = P.haversine(pts[i - 1], pts[i]); segs.push(d); total += d; }
  let want = total * frac;
  for (let i = 0; i < segs.length; i++) {
    if (want <= segs[i] || i === segs.length - 1) {
      const f = segs[i] ? clamp(want / segs[i], 0, 1) : 1;
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f];
    }
    want -= segs[i];
  }
  return pts[pts.length - 1];
}
function whereAmI() {
  const g = gpsFresh();
  if (g) return { pos: [g.lat, g.lon], kind: 'gps', acc: g.acc };
  if (state.phase === 'walking') {
    const leg = currentLeg();
    if (leg && leg.path && leg.time > 0) {
      const frac = clamp((now() - state.leftAt) / 1000 / leg.time, 0, 1);
      return { pos: alongPath(leg.path, frac), kind: 'est' };
    }
  }
  const id = state.at || state.from;
  return { pos: nodePos(id), kind: 'est' };
}

// ---------------------------------------------------------------- rendering: shell
function render() {
  if (!tour) return;
  $('#title').textContent = tour.name;
  renderStatus();
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const v = $('#view');
  v.classList.toggle('map-mode', tab === 'map');
  const actionsOn = state.phase !== 'setup';
  $('#actions').style.display = actionsOn ? 'flex' : 'none';
  if (tab === 'now') v.innerHTML = renderNow();
  else if (tab === 'map') { v.innerHTML = '<div class="map-wrap" id="mapwrap"></div>'; renderMap(true); }
  else if (tab === 'time') v.innerHTML = renderTimeline();
  else if (tab === 'plan') v.innerHTML = renderPlan();
  bindView();
}
function renderStatus() {
  const el = $('#status');
  if (state.phase === 'setup') { el.innerHTML = `<span>${esc(tour.subtitle || '')}</span>`; return; }
  const left = (state.deadline - now()) / 1000;
  const E = energyNow();
  el.innerHTML = `
    <span class="pill">⏱ ${left > 0 ? fmtDur(left) + ' left' : 'past time!'}</span>
    <span>car by ${fmtClock(state.deadline)}</span>
    <span class="energy" title="Family energy (model)">⚡<span class="bar"><i style="width:${Math.round(E * 100)}%"></i></span></span>`;
}

// ---------------------------------------------------------------- Now tab
function renderNow() {
  switch (state.phase) {
    case 'setup': return renderSetup();
    case 'walking': return renderWalking();
    case 'stop': return renderStop();
    case 'break': return renderBreak();
    case 'done': return renderDone();
  }
  return '';
}

function defaultDeadline() {
  const close = tour.hours?.close;
  let d = new Date(now() + 2 * 3600e3);
  if (close) {
    const [h, m] = close.split(':').map(Number);
    const c = new Date(now()); c.setHours(h, m, 0, 0);
    if (c.getTime() > now() + 30 * 60e3 && c < d) d = c;
  }
  d.setMinutes(Math.round(d.getMinutes() / 5) * 5, 0, 0);
  return d;
}
function timeInputValue(d) { return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function timeFromInput(v) {
  const [h, m] = v.split(':').map(Number);
  const d = new Date(now()); d.setHours(h, m, 0, 0);
  if (d.getTime() < now() - 60e3) d.setDate(d.getDate() + 1);
  return d.getTime();
}

function renderSetup() {
  const p = state.prefs;
  const nStops = tour.stops.filter(s => s.kind !== 'facility').length;
  const nBul = tour.stops.reduce((n, s) => n + s.bullets.length, 0);
  return `
  <div class="card">
    <h1>${esc(tour.name)}</h1>
    <p class="muted">${esc(tour.subtitle || '')}. ${nStops} stops, ${nBul} points, re-planned live as the day changes.</p>
    ${tour.hours?.note ? `<p class="note">${esc(tour.hours.note)}</p>` : ''}
    <div class="field">
      <label for="dl">Back at the car by</label>
      <input type="time" id="dl" value="${timeInputValue(defaultDeadline())}">
    </div>
    <div class="field">
      <label for="si">How gripping is this place for us today?</label>
      <div class="slider-row"><input type="range" id="si" min="0" max="1" step="0.05" value="${p.siteInterest}"><output>${Math.round(p.siteInterest * 100)}</output></div>
      <div class="hint">Low = happy to skim and leave early. High = willing to linger and hear more.</div>
    </div>
    <div class="field switch"><label for="chrono">Follow the story in time order where it's not much further</label><input type="checkbox" id="chrono" ${p.chrono ? 'checked' : ''}></div>
    <button class="btn block" id="go">Start at the ${esc(stop(tour.start)?.name || 'start')}</button>
  </div>
  <div class="card small muted">
    Tip: try it at home first. Settings has a simulated clock (+5 / +15 min) so you can walk through a day on the sofa.
    Interests (engineering, space, Habsburgs, views…) are in Settings too.
  </div>`;
}

function upNext(skipFirst = true) {
  if (!plan) return '';
  const steps = plan.steps.slice(skipFirst ? 1 : 0, (skipFirst ? 1 : 0) + 4);
  if (!steps.length) return '';
  return `<div class="upnext">${steps.map(s => s.type === 'break'
    ? '<span class="chip outline">☕ café</span>'
    : `<span class="chip outline">${esc(stop(s.id).name)}</span>`).join('')}</div>`;
}

function legDirections(leg) {
  if (!leg?.path || leg.path.length < 2) return '';
  const parts = [];
  for (let i = 1; i < leg.path.length; i++) {
    const a = leg.path[i - 1], b = leg.path[i];
    const e = model.adj.get(a).find(x => x.to === b)?.e;
    const name = e?.name || `To ${model.nodes.get(b).name}`;
    const secs = e ? (e.len * 1.15) / settings().speed : 0;
    const last = parts[parts.length - 1];
    if (last && last.name === name) last.secs += secs; else parts.push({ name, secs, scenic: e?.scenic ?? 0 });
  }
  return `<ol class="dirs">${parts.filter(p => p.name).map(p => `<li>${esc(p.name)}${p.scenic >= 0.8 ? ' 🌿' : ''} <span class="small">(${Math.max(1, Math.round(p.secs / 60))} min)</span></li>`).join('')}</ol>`;
}

function navInfo() {
  const leg = currentLeg();
  const me = whereAmI();
  const tpos = nodePos(state.target);
  let aim = tpos;
  if (leg?.path?.length > 1) {
    const pts = leg.path.map(nodePos);
    let best = 0, bd = Infinity;
    pts.forEach((p, i) => { const d = P.haversine(me.pos, p); if (d < bd) { bd = d; best = i; } });
    aim = bd < 20 && best < pts.length - 1 ? pts[best + 1] : pts[Math.max(best, 1)];
    if (me.kind === 'est') aim = pts[Math.min(pts.length - 1, best + 1)];
  }
  const brg = P.bearing(me.pos, aim);
  const remaining = me.kind === 'gps' ? P.haversine(me.pos, tpos) * 1.15 : null;
  const legLeft = leg ? Math.max(0, leg.time - (now() - state.leftAt) / 1000) : 0;
  return { leg, me, brg, remaining, legLeft, near: me.kind === 'gps' && P.haversine(me.pos, tpos) < 25 && !stop(state.target)?.indoor };
}

function renderWalking() {
  const tgt = state.target;
  if (!tgt) return `<div class="card">Working out the plan…</div>`;
  const purpose = state.purpose;
  const s = stop(tgt);
  const nav = navInfo();
  const title = purpose === 'cafe' ? `☕ ${breakCfg().label || 'Café'}` : purpose === 'loo' ? `🚻 Loo: ${s.name}` : purpose === 'exit' ? 'Head back to the car' : s.name;
  const step0 = plan?.steps[0];
  const scenicNote = purpose === 'stop' && step0?.leg?.scenic ? '<div class="small scenic-tag">🌿 Taking the scenic way: worth the extra minutes today.</div>' : '';
  const indoor = s?.indoor ? `<div class="note">${esc(tour.buildings?.[s.building]?.note || 'Indoors: GPS won’t help here; tap “We’re here” when you arrive.')}</div>` : '';
  const bullets = purpose === 'stop' && step0 ? `<div class="small muted">${step0.bullets.length} of ${step0.total} points planned here · arrive ~${fmtClock(step0.arrive * 1000)}</div>` : '';
  return `
  ${nav.near ? `<div class="banner"><span>You look to be at <b>${esc(s.name)}</b></span><button class="btn secondary" style="background:#fff" data-do="arrive">Start</button></div>` : ''}
  <div class="card">
    <div class="small muted">${purpose === 'exit' ? 'Tour complete' : 'Next'}</div>
    <h1>${esc(title)}</h1>
    ${purpose === 'stop' ? `<div>${chip(s.era, stopDate(s))}${s.approx ? '<span class="chip outline">approx. position</span>' : ''}</div>` : ''}
    <div class="nav-card" style="margin-top:12px">
      <div class="arrow-wrap"><svg class="arrow" id="arrow" data-bearing="${nav.brg.toFixed(0)}" viewBox="0 0 24 24" style="transform:rotate(${((nav.brg - (heading ?? 0)) + 360) % 360}deg)"><path d="M12 2 L19 21 L12 17 L5 21 Z" fill="var(--route)"/></svg></div>
      <div>
        <div class="dist" id="dist">${nav.remaining != null ? fmtDist(nav.remaining) : `~${fmtDur(nav.legLeft)}`}</div>
        <div class="muted" id="dirword">head ${P.compassWord(nav.brg)}${heading == null ? ' <span class="small">(compass off; arrow is north-up)</span>' : ''}</div>
        <div class="small muted" id="gpsline">${nav.me.kind === 'gps' ? `GPS ±${Math.round(nav.me.acc)} m` : 'Position estimated from walking time'}</div>
      </div>
    </div>
    ${scenicNote}
    ${legDirections(nav.leg)}
    ${indoor}
    ${bullets}
    <div class="btn-row">
      <button class="btn" data-do="arrive">${purpose === 'exit' ? 'We’re back' : 'We’re here'}</button>
      ${purpose === 'stop' ? '<button class="btn ghost" data-do="skip">Skip it</button>' : ''}
      ${purpose === 'cafe' || purpose === 'loo' ? '<button class="btn ghost" data-do="cancel-detour">Cancel</button>' : ''}
    </div>
  </div>
  ${purpose === 'stop' ? `<div class="small muted">Coming up</div>${upNext()}` : ''}`;
}
function renderNowLight() {
  if (state.phase !== 'walking') return;
  const nav = navInfo();
  const d = $('#dist'); if (!d) return;
  d.textContent = nav.remaining != null ? fmtDist(nav.remaining) : `~${fmtDur(nav.legLeft)}`;
  const a = $('#arrow');
  if (a) { a.dataset.bearing = nav.brg.toFixed(0); a.style.transform = `rotate(${((nav.brg - (heading ?? 0)) + 360) % 360}deg)`; }
  const w = $('#dirword'); if (w) w.innerHTML = `head ${P.compassWord(nav.brg)}${heading == null ? ' <span class="small">(compass off; arrow is north-up)</span>' : ''}`;
  const g = $('#gpsline'); if (g) g.textContent = nav.me.kind === 'gps' ? `GPS ±${Math.round(nav.me.acc)} m` : 'Position estimated from walking time';
  if (nav.near && !$('.banner')) render();
}

function bulletHtml(s, id, extra) {
  const b = s.bullets.find(x => x.id === id);
  if (!b) return '';
  const flag = reviewMode && (b.verify || (b.src || []).includes('gk')) ? `<span class="flag">${b.verify ? 'check' : 'general knowledge'}</span>` : '';
  const src = reviewMode ? `<span class="src">${(b.src || []).map(k => esc(tour.sources[k]?.[0] || k)).join(' · ')}</span>` : '';
  return `<li class="${extra ? 'extra' : ''}">${esc(b.t)}${flag}${src}</li>`;
}

function renderStop() {
  const s = stop(state.at);
  const shownSet = new Set([...state.shown, ...state.extra]);
  const ordered = s.bullets.filter(b => shownSet.has(b.id));
  const remaining = s.bullets.filter(b => !shownSet.has(b.id)).length;
  const nextStep = plan?.steps[1];
  const nextTxt = nextStep ? (nextStep.type === 'break' ? '☕ café break' : stop(nextStep.id).name) : 'back to the car';
  const leaveBy = plan?.steps[0]?.leave ? fmtClock(plan.steps[0].leave * 1000) : null;
  return `
  <div class="card">
    <div>${chip(s.era, stopDate(s))}</div>
    <h1>${esc(s.name)}</h1>
    ${s.look ? `<p class="look">${esc(s.look)}</p>` : ''}
    ${s.note ? `<div class="note">ⓘ ${esc(s.note)}</div>` : ''}
    ${(s.kids || []).length ? `<div class="kid"><b>For the little one</b>${esc(s.kids[0])}</div>` : ''}
    <ul class="bullets">${ordered.map(b => bulletHtml(s, b.id, state.extra.includes(b.id))).join('')}</ul>
    ${remaining ? `<button class="btn ghost block" style="margin-top:10px" data-do="more">More (${remaining} left)</button>` : ''}
    <button class="btn block" style="margin-top:12px" data-do="done">Done: next is ${esc(nextTxt)}</button>
    ${leaveBy ? `<div class="small muted center" style="margin-top:8px">Plan has you moving on about ${leaveBy}</div>` : ''}
  </div>`;
}

function renderBreak() {
  const label = state.breakKind === 'cafe' ? (breakCfg().label || 'Café break') : 'Loo stop';
  const s = stop(state.at);
  const nextStep = plan?.steps[0];
  return `
  <div class="card">
    <div class="small muted">${esc(s?.name || '')}</div>
    <h1>${state.breakKind === 'cafe' ? '☕' : '🚻'} ${esc(label)}</h1>
    <p>Planned back on tour by <b>${fmtClock(state.breakEnds)}</b>. Take longer if you need to: the plan adapts when you tap the button.</p>
    ${s?.facilities?.includes('play') && state.breakKind === 'cafe' ? '<div class="kid"><b>For the little one</b>Play area time!</div>' : ''}
    <button class="btn block" data-do="endbreak">Back on tour</button>
    ${nextStep ? `<div class="small muted center" style="margin-top:8px">Then: ${esc(nextStep.type === 'break' ? 'café' : stop(nextStep.id).name)}</div>` : ''}
  </div>`;
}

function renderDone() {
  const v = Object.entries(state.visited);
  const pts = v.reduce((n, [, x]) => n + (x.shown?.length || 0) + (x.extra?.length || 0), 0);
  const left = (state.deadline - now()) / 1000;
  return `
  <div class="card">
    <h1>That’s the tour</h1>
    <p>${v.length} stops and ${pts} points. ${left > 600 ? `You still have ${fmtDur(left)} if anyone fancies more.` : ''}</p>
    ${left > 600 ? '<button class="btn secondary block" data-do="resume">Carry on after all</button>' : ''}
  </div>`;
}

// ---------------------------------------------------------------- Plan tab
function renderPlan() {
  if (state.phase === 'setup' || !plan) return `<div class="card">Start the tour to see the plan.</div>`;
  const rows = [];
  if (state.phase === 'stop') rows.push(`<li><span class="t">now</span><span><span class="n">${esc(stop(state.at).name)}</span><div class="meta">you are here</div></span><span></span></li>`);
  plan.steps.forEach((s, i) => {
    if (state.phase === 'stop' && i === 0) return;
    if (s.type === 'break') {
      rows.push(`<li class="break"><span class="t">${fmtClock(s.arrive * 1000)}</span><span><span class="n">☕ Café & play break</span><div class="meta">${Math.round((s.leave - s.arrive) / 60)} min · restores energy</div></span><span></span></li>`);
      return;
    }
    const st = stop(s.id);
    rows.push(`<li><span class="t">${fmtClock(s.arrive * 1000)}</span><span><span class="n">${esc(st.name)}</span><div class="meta">${chip(st.era, stopDate(st))} ${s.bullets.length}/${s.total} points · ${Math.max(1, Math.round(s.leg.time / 60))} min walk${s.leg.scenic ? ' 🌿' : ''}${state.pinned[s.id] ?? st.mustSee ? ' · ★' : ''}</div></span><button data-sheet="${s.id}">⋯</button></li>`);
  });
  if (plan.back?.leg) rows.push(`<li><span class="t">${fmtClock(plan.finish * 1000)}</span><span><span class="n">Back at the car</span><div class="meta">${Math.max(1, Math.round(plan.back.leg.time / 60))} min walk${plan.back.leg.scenic ? ' 🌿' : ''}</div></span><span></span></li>`);
  const dropped = plan.dropped.map(d => `<li class="dropped"><span class="t">–</span><span><span class="n">${esc(stop(d.id).name)}</span><div class="meta">${esc(d.reason)}</div></span><button data-sheet="${d.id}">⋯</button></li>`);
  const skipped = Object.keys(state.skipped).map(id => `<li class="dropped"><span class="t">–</span><span><span class="n">${esc(stop(id).name)}</span><div class="meta">Skipped by you</div></span><button data-sheet="${id}">⋯</button></li>`);
  const visited = Object.keys(state.visited).map(id => `<li class="visited"><span class="t">${fmtClock(state.visited[id].arrived)}</span><span><span class="n">${esc(stop(id).name)}</span></span><span>✓</span></li>`);
  const slack = plan.slack;
  return `
  <div class="card">
    <div class="kv">
      <span class="muted">Plan finishes</span><span><b>${fmtClock(plan.finish * 1000)}</b> (${slack >= 60 ? fmtDur(slack) + ' spare' : slack < -60 ? 'over by ' + fmtDur(-slack) : 'right on time'})</span>
      <span class="muted">Energy now</span><span>${Math.round(energyNow() * 100)}%</span>
      <span class="muted">Order</span><span>${state.prefs.chrono ? 'following the timeline where sensible' : 'shortest sensible route'}</span>
    </div>
    ${plan.slack > 15 * 60 ? '<p class="small muted">Finishing early on purpose: at your current interest and energy, the remaining stops aren’t worth the time. Tap “Loving it” or raise interest in Settings to stretch it.</p>' : ''}
    <ul class="plan-list">${rows.join('')}</ul>
  </div>
  ${dropped.length + skipped.length ? `<h3>Left out</h3><div class="card"><ul class="plan-list">${dropped.join('')}${skipped.join('')}</ul></div>` : ''}
  ${visited.length ? `<h3>Done</h3><div class="card"><ul class="plan-list">${visited.join('')}</ul></div>` : ''}`;
}

function stopSheet(id) {
  const s = stop(id);
  const pinned = state.pinned[id] ?? s.mustSee;
  const statusTxt = state.visited[id] ? 'Visited' : state.skipped[id] ? 'Skipped' : plan?.route.includes(id) ? 'In the plan' : 'Not in the plan';
  openSheet(`
    <div>${chip(s.era, stopDate(s))}<span class="chip outline">${statusTxt}</span></div>
    <h2 style="margin-top:8px">${esc(s.name)}</h2>
    ${s.look ? `<p class="look">${esc(s.look)}</p>` : ''}
    <p class="small muted">${s.bullets.length} points · about ${Math.round((s.dwell + s.bullets.reduce((n, b) => n + P.bulletSeconds(b, settings()), 0)) / 60)} min for everything</p>
    ${state.phase !== 'setup' && !state.visited[id] ? `<button class="btn block" data-do="goto" data-id="${id}">Go here next</button>` : ''}
    <div class="btn-row">
      <button class="btn secondary" data-do="pin" data-id="${id}">${pinned ? '★ Must-see (on)' : '☆ Make must-see'}</button>
      ${state.skipped[id] ? `<button class="btn ghost" data-do="unskip" data-id="${id}">Un-skip</button>` : `<button class="btn ghost" data-do="skipid" data-id="${id}">Skip</button>`}
    </div>
    <details style="margin-top:12px"><summary>Preview the points</summary><ul class="bullets">${s.bullets.map(b => bulletHtml(s, b.id)).join('')}</ul></details>
    <button class="btn ghost block" style="margin-top:12px" data-do="close">Close</button>`);
}

// ---------------------------------------------------------------- Timeline tab
function renderTimeline() {
  const here = state.at || (state.purpose === 'stop' ? state.target : null);
  const hereEra = here ? stop(here).era : null;
  const order = new Map((plan?.route || []).filter(x => x !== P.BREAK_ID).map((id, i) => [id, i + 1]));
  const status = (id) => {
    if (id === state.at) return '<span class="tl-status" style="color:var(--accent)">● here now</span>';
    if (state.visited[id]) return '<span class="tl-status" style="color:var(--good)">✓ seen</span>';
    if (id === state.target && state.phase === 'walking') return '<span class="tl-status" style="color:var(--accent)">→ heading there</span>';
    if (order.has(id)) return `<span class="tl-status muted">#${order.get(id)} in plan</span>`;
    return '<span class="tl-status muted">not planned</span>';
  };
  const html = tour.eras.map(e => {
    const evs = tour.events.filter(x => x.year >= e.from && x.year <= e.to).map(x => ({ y: x.year, label: x.label, stop: x.stop }));
    const stops = tour.stops.filter(s => s.era === e.id && s.kind !== 'facility');
    const items = [
      ...evs.map(x => `<div class="tl-ev ${x.stop && x.stop === here ? 'here' : ''}"><span class="y">${x.y}</span><span>${esc(x.label)}</span></div>`),
      ...stops.map(s => `<div class="tl-ev stop ${s.id === here ? 'here' : ''}" data-sheet="${s.id}"><span class="y">${s.date || ''}</span><span>📍 ${esc(s.name)} ${status(s.id)}</span></div>`),
    ];
    return `<section class="tl-era ${e.id === hereEra ? 'here' : ''}" style="border-color:${e.colour}">
      <h2>${esc(e.name)}</h2><div class="years">${e.from}–${e.to === 2026 ? 'today' : e.to}</div>
      <p>${esc(e.summary)}</p>${items.join('')}</section>`;
  }).join('');
  return `<p class="small muted">How the place developed. 📍 = stops; tap one for details.</p>${html}`;
}

// ---------------------------------------------------------------- Map tab
const LAT0 = () => tour.map?.centre?.[0] ?? model.nodes.get(tour.start).pos[0];
function proj(p) {
  const lat0 = LAT0(), lon0 = model.nodes.get(tour.start).pos[1];
  return [(p[1] - lon0) * Math.cos(lat0 * Math.PI / 180) * 111320, -(p[0] - lat0) * 110574];
}
function fitView() {
  const pts = [...model.nodes.values()].map(n => proj(n.pos));
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  pts.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
  const pad = 60;
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
}
function renderMap(fresh = false) {
  const wrap = $('#mapwrap');
  if (!wrap) return;
  if (!mapView) mapView = fitView();
  const W = wrap.clientWidth || 360, H = wrap.clientHeight || 600;
  // keep aspect ratio of the screen
  const vb = { ...mapView };
  const ar = W / H;
  if (vb.w / vb.h > ar) { const nh = vb.w / ar; vb.y -= (nh - vb.h) / 2; vb.h = nh; } else { const nw = vb.h * ar; vb.x -= (nw - vb.w) / 2; vb.w = nw; }
  const k = vb.w / W; // metres per pixel
  const pt = (p) => proj(p).map(v => v.toFixed(1)).join(',');
  const parts = [];
  for (const f of tour.map?.features || []) {
    const fill = { wood: 'var(--wood)', garden: 'var(--garden)', lawn: 'var(--lawn)', building: 'var(--building)', water: 'var(--water)' }[f.kind];
    if (f.poly) parts.push(`<polygon points="${f.poly.map(pt).join(' ')}" fill="${fill}" stroke="${f.kind === 'building' ? '#8c7b5e' : 'none'}" stroke-width="${1.5 * k}"/>`);
    if (f.line) parts.push(`<polyline points="${f.line.map(pt).join(' ')}" fill="none" stroke="${fill}" stroke-width="${f.width || 10}" stroke-linecap="round" stroke-linejoin="round"/>`);
    if (f.circle) { const [cx, cy] = proj(f.circle); parts.push(`<circle cx="${cx}" cy="${cy}" r="${f.r}" fill="${fill}"/>`); }
    if (f.label && k < 2.2) {
      const c = f.poly ? f.poly.reduce((a, p) => [a[0] + p[0] / f.poly.length, a[1] + p[1] / f.poly.length], [0, 0]) : f.line[Math.floor(f.line.length / 2)];
      const [x, y] = proj(c);
      parts.push(`<text class="lbl" x="${x}" y="${y}" font-size="${11 * k}" stroke-width="${3 * k}" text-anchor="middle" fill-opacity="0.7" font-style="italic">${esc(f.label)}</text>`);
    }
  }
  // paths
  for (const e of model.edges) {
    if (model.nodes.get(e.a).building && model.nodes.get(e.b).building) continue;
    const col = e.scenic >= 0.8 ? '#5a9e7a' : '#b9ad92';
    parts.push(`<line x1="${proj(model.nodes.get(e.a).pos)[0]}" y1="${proj(model.nodes.get(e.a).pos)[1]}" x2="${proj(model.nodes.get(e.b).pos)[0]}" y2="${proj(model.nodes.get(e.b).pos)[1]}" stroke="${col}" stroke-width="${2 * k}" stroke-dasharray="${e.scenic >= 0.8 ? 'none' : `${4 * k},${3 * k}`}" opacity="0.9"/>`);
  }
  // planned route
  if (plan && state.phase !== 'setup') {
    const legsList = [];
    if (state.phase === 'walking' && (state.purpose === 'cafe' || state.purpose === 'loo' || state.purpose === 'exit')) legsList.push({ path: currentLeg()?.path, cur: true });
    plan.steps.forEach((s, i) => legsList.push({ path: s.leg.path, cur: i === 0 && state.phase === 'walking' }));
    if (plan.back?.leg) legsList.push({ path: plan.back.leg.path });
    for (const L of legsList) {
      if (!L.path || L.path.length < 2) continue;
      parts.push(`<polyline points="${L.path.map(id => pt(nodePos(id))).join(' ')}" fill="none" stroke="var(--route)" stroke-width="${(L.cur ? 5 : 3) * k}" stroke-linecap="round" stroke-linejoin="round" opacity="${L.cur ? 0.9 : 0.45}"/>`);
    }
  }
  // stops
  const order = new Map((plan?.route || []).filter(x => x !== P.BREAK_ID).map((id, i) => [id, i + 1]));
  const r = 9 * k;
  for (const s of tour.stops) {
    const [x, y] = proj(s.pos);
    const visited = !!state.visited[s.id];
    const isTarget = state.phase === 'walking' && s.id === state.target;
    const isHere = s.id === state.at;
    const n = order.get(s.id);
    const fill = s.kind === 'facility' ? '#555' : visited ? '#8a8f8c' : (isTarget || isHere) ? 'var(--accent)' : n ? 'var(--brand)' : 'var(--card)';
    const stroke = n || visited || isTarget || isHere || s.kind === 'facility' ? '#fff' : '#8a8f8c';
    const small = s.indoor && k > 1.2;
    const rr = small ? r * 0.55 : r;
    if (isTarget || isHere) parts.push(`<circle class="pulse" cx="${x}" cy="${y}" r="${rr * 2}" fill="var(--accent)" opacity="0.4"/>`);
    parts.push(`<g data-sheet="${s.kind === 'facility' ? '' : s.id}"><circle cx="${x}" cy="${y}" r="${rr}" fill="${fill}" stroke="${stroke}" stroke-width="${2 * k}"/>`);
    if (!small) parts.push(`<text class="num" x="${x}" y="${y}" font-size="${10 * k}">${s.kind === 'facility' ? 'i' : visited ? '✓' : n ?? ''}</text>`);
    const soon = n != null && n <= (state.phase === 'stop' ? 3 : 2);
    const showLbl = k < 0.95 ? (!small || k < 0.45) : (isTarget || isHere || soon || s.kind === "facility");
    if (showLbl) parts.push(`<text class="lbl" x="${x + rr + 3 * k}" y="${y + 4 * k}" font-size="${12 * k}" stroke-width="${3 * k}">${esc(k < 0.6 ? s.name : (s.short || s.name))}</text>`);
    parts.push('</g>');
  }
  // me
  if (state.phase !== 'setup') {
    const me = whereAmI();
    const [mx, my] = proj(me.pos);
    if (me.kind === 'gps') parts.push(`<circle cx="${mx}" cy="${my}" r="${me.acc}" fill="#1a73e8" opacity="0.12"/><circle cx="${mx}" cy="${my}" r="${7 * k}" fill="#1a73e8" stroke="#fff" stroke-width="${2.5 * k}"/>`);
    else parts.push(`<circle cx="${mx}" cy="${my}" r="${7 * k}" fill="none" stroke="#1a73e8" stroke-width="${3 * k}" stroke-dasharray="${3 * k},${2 * k}"/>`);
  }
  const svg = `<svg id="map" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`;
  if (fresh || !$('#map')) {
    wrap.innerHTML = svg + `<div class="map-ctrl"><button data-map="in">＋</button><button data-map="out">－</button><button data-map="fit">⤢</button><button data-map="me">◎</button></div>
      <div class="map-legend">● planned &nbsp;✓ seen &nbsp;<span style="color:#5a9e7a">━</span> waterside &nbsp;<span style="color:#1a73e8">◉</span> you</div>
      <div class="map-note">${esc(tour.map?.note || '')}</div>`;
    bindMap(wrap);
  } else {
    $('#map').outerHTML = svg;
  }
}
function bindMap(wrap) {
  const ptrs = new Map();
  let startView = null, startPts = null;
  const toWorld = (cx, cy, v) => {
    const r = wrap.getBoundingClientRect();
    return [v.x + (cx - r.left) / r.width * v.w, v.y + (cy - r.top) / r.height * v.h];
  };
  let raf = 0;
  const redraw = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; renderMap(); }); };
  wrap.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.map-ctrl')) return;
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    startView = { ...mapView }; startPts = new Map(ptrs);
    wrap.setPointerCapture?.(e.pointerId);
  });
  wrap.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    const r = wrap.getBoundingClientRect();
    if (ptrs.size === 1 && startPts.size === 1) {
      const [sx, sy] = [...startPts.values()][0];
      mapView = { ...startView, x: startView.x - (e.clientX - sx) / r.width * startView.w, y: startView.y - (e.clientY - sy) / r.height * startView.h };
      redraw();
    } else if (ptrs.size === 2 && startPts.size === 2) {
      const [a0, b0] = [...startPts.values()], [a1, b1] = [...ptrs.values()];
      const d0 = Math.hypot(a0[0] - b0[0], a0[1] - b0[1]), d1 = Math.hypot(a1[0] - b1[0], a1[1] - b1[1]);
      const s = clamp(d0 / d1, 0.2, 5);
      const cx = (a0[0] + b0[0]) / 2, cy = (a0[1] + b0[1]) / 2;
      const [wx, wy] = toWorld(cx, cy, startView);
      mapView = { x: wx - (wx - startView.x) * s, y: wy - (wy - startView.y) * s, w: startView.w * s, h: startView.h * s };
      redraw();
    }
  });
  const up = (e) => {
    const was = ptrs.get(e.pointerId), st = startPts?.get(e.pointerId);
    ptrs.delete(e.pointerId);
    startView = { ...mapView }; startPts = new Map(ptrs);
    if (was && st && Math.hypot(was[0] - st[0], was[1] - st[1]) < 6) {
      const g = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-sheet]');
      if (g && g.dataset.sheet) stopSheet(g.dataset.sheet);
    }
  };
  wrap.addEventListener('pointerup', up);
  wrap.addEventListener('pointercancel', up);
  wrap.addEventListener('wheel', (e) => {
    e.preventDefault();
    const s = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    const [wx, wy] = toWorld(e.clientX, e.clientY, mapView);
    mapView = { x: wx - (wx - mapView.x) * s, y: wy - (wy - mapView.y) * s, w: mapView.w * s, h: mapView.h * s };
    redraw();
  }, { passive: false });
  wrap.querySelector('.map-ctrl').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const zoom = (s) => { const cx = mapView.x + mapView.w / 2, cy = mapView.y + mapView.h / 2; mapView = { x: cx - mapView.w * s / 2, y: cy - mapView.h * s / 2, w: mapView.w * s, h: mapView.h * s }; };
    if (b.dataset.map === 'in') zoom(0.7);
    if (b.dataset.map === 'out') zoom(1.4);
    if (b.dataset.map === 'fit') mapView = fitView();
    if (b.dataset.map === 'me' && state.phase !== 'setup') { const [x, y] = proj(whereAmI().pos); mapView = { x: x - 150, y: y - 150, w: 300, h: 300 }; }
    renderMap();
  });
}

// ---------------------------------------------------------------- Settings & review
function seg(name, opts, cur) {
  return `<div class="seg" data-seg="${name}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(v) === String(cur) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}
function openSettings() {
  const p = state.prefs;
  const weights = Object.entries(tour.topics).map(([k, label]) => `
    <div class="field" style="margin:8px 0"><label for="w-${k}" style="font-weight:500">${esc(label)}</label>
    <div class="slider-row"><input type="range" min="0" max="1" step="0.05" id="w-${k}" data-w="${k}" value="${p.weights[k] ?? 0.5}"><output>${Math.round((p.weights[k] ?? 0.5) * 100)}</output></div></div>`).join('');
  openSheet(`
    <h2>Settings</h2>
    ${state.phase !== 'setup' ? `<div class="field"><label for="s-dl">Back at the car by</label><input type="time" id="s-dl" value="${timeInputValue(new Date(state.deadline))}"></div>` : ''}
    <div class="field"><label>How gripping is this place today?</label>
      <div class="slider-row"><input type="range" id="s-si" min="0" max="1" step="0.05" value="${p.siteInterest}"><output>${Math.round(p.siteInterest * 100)}</output></div></div>
    <div class="field switch"><label for="s-chrono">Follow the story in time order</label><input type="checkbox" id="s-chrono" ${p.chrono ? 'checked' : ''}></div>
    <div class="field switch"><label for="s-breaks">Suggest café breaks</label><input type="checkbox" id="s-breaks" ${p.allowBreaks ? 'checked' : ''}></div>
    <div class="field"><label>Walking pace</label>${seg('speed', [[0.7, 'Toddler'], [0.85, 'Family'], [1.1, 'Brisk']], p.speed)}</div>
    <div class="field"><label>Time per point</label>${seg('talk', [[1.1, 'Read only'], [1.5, 'Some chat'], [2.2, 'Lots of chat']], p.talkFactor)}</div>
    <div class="field"><label>How likely are we to have to leave early?</label>${seg('vol', [['calm', 'Unlikely'], ['normal', 'Normal'], ['chaotic', 'Very']], p.volatility)}</div>
    <h3>Interests</h3>
    <p class="small muted">The app nudges these when you tap More, Bored or Loving it.</p>
    ${weights}
    <h3>Tools</h3>
    <div class="field switch"><label for="s-gps">Use GPS (turn off for testing at home)</label><input type="checkbox" id="s-gps" ${p.useGps !== false ? 'checked' : ''}></div>
    <div class="field switch"><label for="s-track">Record GPS track (to correct paths later)</label><input type="checkbox" id="s-track" ${p.recordTrack ? 'checked' : ''}></div>
    <div class="btn-row"><button class="btn ghost" data-do="gpx">Export track (${state.track.length} pts)</button><button class="btn ghost" data-do="review">Review content</button></div>
    <div class="field"><label>Simulated clock ${state.clockOffset ? `(+${Math.round(state.clockOffset / 60000)} min)` : ''}</label>
      <div class="btn-row"><button class="btn ghost" data-do="clock5">+5 min</button><button class="btn ghost" data-do="clock15">+15 min</button><button class="btn ghost" data-do="clock0">Real time</button></div></div>
    <div class="btn-row"><button class="btn" data-do="apply">Apply</button><button class="btn danger" data-do="reset">Reset tour</button></div>
    <p class="small muted" style="margin-top:14px">Content compiled from public sources (listings, English Heritage, Wikipedia and others). Check “Review content” for sources and items flagged to verify.</p>`);
}
function applySettings() {
  const p = state.prefs;
  const sheet = $('#sheet-body');
  sheet.querySelectorAll('[data-w]').forEach(i => { p.weights[i.dataset.w] = +i.value; });
  p.siteInterest = +$('#s-si', sheet).value;
  p.chrono = $('#s-chrono', sheet).checked;
  p.allowBreaks = $('#s-breaks', sheet).checked;
  p.recordTrack = $('#s-track', sheet).checked;
  p.useGps = $('#s-gps', sheet).checked;
  const segv = (n) => sheet.querySelector(`[data-seg="${n}"] .on`)?.dataset.v;
  p.speed = +(segv('speed') ?? p.speed); p.talkFactor = +(segv('talk') ?? p.talkFactor); p.volatility = segv('vol') ?? p.volatility;
  const dl = $('#s-dl', sheet);
  if (dl && dl.value) state.deadline = timeFromInput(dl.value);
  if (state.phase !== 'setup') replan({ keepTarget: state.phase === 'walking' });
  save(); closeSheet(); render();
}
function openReview() {
  reviewMode = true;
  const html = tour.stops.map(s => `
    <div class="review-stop"><h2>${esc(s.name)} ${chip(s.era, stopDate(s))}</h2>
    <ul class="bullets">${s.bullets.map(b => bulletHtml(s, b.id)).join('')}</ul></div>`).join('');
  const srcs = Object.entries(tour.sources).map(([k, [name, url]]) => `<li>[${esc(k)}] ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(name)}</a>` : esc(name)}</li>`).join('');
  openSheet(`<h2>Content review</h2>
    <p class="small muted">Items marked <span style="color:var(--warn)">check</span> or <span style="color:var(--warn)">general knowledge</span> aren’t from a Wrest-specific source. Review mode also shows sources on stop pages until you close this.</p>
    ${html}<h3>Sources</h3><ol class="small">${srcs}</ol>
    <button class="btn block" data-do="close-review">Close</button>`);
}
function exportGpx() {
  const pts = state.track.map(([la, lo, t]) => `<trkpt lat="${la}" lon="${lo}"><time>${new Date(t).toISOString()}</time></trkpt>`).join('');
  const gpx = `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Tour Guide" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${esc(tour.name)}</name><trkseg>${pts}</trkseg></trk></gpx>`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([gpx], { type: 'application/gpx+xml' }));
  a.download = `${tour.id}-${new Date().toISOString().slice(0, 10)}.gpx`;
  a.click();
}

// ---------------------------------------------------------------- sheets for live buttons
function looSheet() {
  const L = P.legs(model, settings());
  const from = state.at || state.from;
  const opts = tour.stops.filter(s => (s.facilities || []).includes('toilet')).map(s => ({ s, t: L(from, s.id).fast.time })).sort((a, b) => a.t - b.t);
  openSheet(`<h2>🚻 Nearest loos</h2>${opts.map(o => `<button class="btn secondary block" style="margin-top:10px" data-do="loo-go" data-id="${o.s.id}">${esc(o.s.name)} · ${Math.max(1, Math.round(o.t / 60))} min</button>`).join('')}
    <button class="btn ghost block" style="margin-top:10px" data-do="close">Cancel</button>`);
}
function coffeeSheet() {
  const L = P.legs(model, settings());
  const at = breakCfg().at;
  const t = L(state.at || state.from, at).fast.time;
  openSheet(`<h2>☕ ${esc(breakCfg().label || 'Café')}</h2>
    <p>${Math.max(1, Math.round(t / 60))} min walk, planned ${breakCfg().minutes} min break. The rest of the plan re-fits around it.</p>
    <button class="btn block" data-do="coffee-go">Head there now</button>
    <button class="btn ghost block" style="margin-top:10px" data-do="close">Cancel</button>`);
}
function leaveSheet() {
  const quick = [30, 60, 90, 120].map(m => `<button class="btn ghost" data-do="leave-in" data-min="${m}">in ${m < 60 ? m + ' min' : m / 60 + ' h'}</button>`).join('');
  openSheet(`<h2>🕒 Need to be back at the car by…</h2>
    <div class="field"><input type="time" id="lv" value="${timeInputValue(new Date(state.deadline))}"></div>
    <div class="btn-row" style="flex-wrap:wrap">${quick}</div>
    <button class="btn block" style="margin-top:12px" data-do="leave-set">Set</button>
    <button class="btn ghost block" style="margin-top:10px" data-do="close">Cancel</button>`);
}

// ---------------------------------------------------------------- sheet & toast plumbing
function openSheet(html) { const b = $('#sheet-body'); b.innerHTML = html; b.scrollTop = 0; $('#sheet').classList.remove('hidden'); }
function closeSheet() { $('#sheet').classList.add('hidden'); $('#sheet-body').innerHTML = ''; }
let toastTimer = 0;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 4500);
}

// ---------------------------------------------------------------- events
function bindView() {
  const v = $('#view');
  const si = $('#si', v);
  if (si) si.oninput = () => { si.nextElementSibling.textContent = Math.round(si.value * 100); };
  const go = $('#go', v);
  if (go) go.onclick = () => {
    state.prefs.siteInterest = +$('#si', v).value;
    state.prefs.chrono = $('#chrono', v).checked;
    startTour(timeFromInput($('#dl', v).value));
  };
}

function handleDo(el) {
  const d = el.dataset.do, id = el.dataset.id;
  switch (d) {
    case 'arrive': return arrive();
    case 'skip': return skipTarget();
    case 'cancel-detour': state.purpose = null; replan({ keepTarget: false }); return render();
    case 'more': return moreBullet();
    case 'done': return finishStop();
    case 'endbreak': return endBreak();
    case 'resume': state.phase = 'walking'; state.from = state.at || tour.exit; state.leftAt = now(); replan({ keepTarget: false }); return render();
    case 'goto': return goTo(id);
    case 'pin': state.pinned[id] = !(state.pinned[id] ?? stop(id).mustSee); if (state.phase !== 'setup') replan({ keepTarget: state.phase === 'walking' && state.purpose === 'stop' && state.target !== id }); save(); stopSheet(id); return render();
    case 'skipid': state.skipped[id] = true; if (state.target === id && state.phase === 'walking') replan({ keepTarget: false }); else if (state.phase !== 'setup') replan(); closeSheet(); return render();
    case 'unskip': delete state.skipped[id]; if (state.phase !== 'setup') replan(); closeSheet(); return render();
    case 'close': return closeSheet();
    case 'apply': return applySettings();
    case 'reset': if (confirm('Reset this tour? Progress will be lost.')) { state = freshState(tour); plan = null; save(); closeSheet(); tab = 'now'; render(); } return;
    case 'gpx': return exportGpx();
    case 'review': return openReview();
    case 'close-review': reviewMode = false; closeSheet(); return render();
    case 'clock5': case 'clock15': state.clockOffset += (d === 'clock5' ? 5 : 15) * 60000; save(); renderStatus(); toast(`Clock is now ${fmtClock(now())}`); if (state.phase !== 'setup') { replan({ keepTarget: true, quiet: true }); } render(); return;
    case 'clock0': state.clockOffset = 0; save(); render(); return;
    case 'loo-go': closeSheet(); if (state.phase === 'stop') finishStopSilently(); if (state.phase === 'break') { state.from = state.at; state.at = null; } state.phase = 'walking'; state.target = id; state.purpose = 'loo'; state.leftAt = now(); replan({ keepTarget: true }); tab = 'now'; return render();
    case 'coffee-go': closeSheet(); if (state.phase === 'stop') finishStopSilently(); state.phase = 'walking'; state.target = breakCfg().at; state.purpose = 'cafe'; state.leftAt = now(); replan({ keepTarget: true }); tab = 'now'; return render();
    case 'leave-in': closeSheet(); return setDeadline(now() + (+el.dataset.min) * 60000);
    case 'leave-set': { const v = $('#lv').value; closeSheet(); if (v) setDeadline(timeFromInput(v)); return; }
  }
}

document.addEventListener('click', (e) => {
  const tabBtn = e.target.closest('#tabs button');
  if (tabBtn) { tab = tabBtn.dataset.tab; render(); return; }
  const act = e.target.closest('#actions button');
  if (act) {
    if (state.phase === 'setup') return;
    const a = act.dataset.act;
    if (a === 'bored') return bored();
    if (a === 'loving') return loving();
    if (a === 'loo') return looSheet();
    if (a === 'coffee') return coffeeSheet();
    if (a === 'leave') return leaveSheet();
  }
  if (e.target.closest('#btn-settings')) return openSettings();
  const segBtn = e.target.closest('.seg button');
  if (segBtn) { segBtn.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === segBtn)); return; }
  const doEl = e.target.closest('[data-do]');
  if (doEl) return handleDo(doEl);
  const sh = e.target.closest('[data-sheet]');
  if (sh && sh.dataset.sheet && !e.target.closest('#mapwrap')) return stopSheet(sh.dataset.sheet);
  if (e.target.id === 'sheet') closeSheet();
});
document.addEventListener('input', (e) => {
  if (e.target.matches('#sheet input[type=range]')) e.target.nextElementSibling.textContent = Math.round(e.target.value * 100);
});

// ---------------------------------------------------------------- tick
let lastReplan = 0;
setInterval(() => {
  if (!state || state.phase === 'setup') return;
  renderStatus();
  if (tab === 'now' && state.phase === 'walking') renderNowLight();
  if (state.phase === 'walking' && Date.now() - lastReplan > 120000) {
    lastReplan = Date.now();
    replan({ keepTarget: true, quiet: true });
    if (plan && !plan.feasible && state.purpose === 'stop') { replan({ keepTarget: false }); toast('Running short of time: plan changed.'); render(); }
  }
  if (state.phase === 'break' && now() > state.breakEnds && !state._breakNudged) { state._breakNudged = true; toast('Planned break time is up. Tap “Back on tour” when ready.'); }
}, 20000);

// ---------------------------------------------------------------- boot
async function boot() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  const idx = await (await fetch('tours/index.json')).json();
  const params = new URLSearchParams(location.search);
  const id = params.get('tour') || localStorage.getItem(LS + ':last') || idx.tours[0].id;
  const entry = idx.tours.find(t => t.id === id) || idx.tours[0];
  tour = await (await fetch(`tours/${entry.file}`)).json();
  model = P.buildModel(tour);
  localStorage.setItem(LS + ':last', tour.id);
  state = load(tour.id) || freshState(tour);
  state.prefs.weights = { ...P.defaultSettings(tour).weights, ...state.prefs.weights };
  if (state.phase !== 'setup') { replan({ keepTarget: true, quiet: true }); startGps(); requestWake(); }
  render();
}
boot().catch(err => { $('#view').innerHTML = `<div class="card">Couldn’t load the tour: ${esc(err.message)}</div>`; });

// expose for debugging in the console
window.__tour = { get state() { return state; }, get plan() { return plan; }, P };
