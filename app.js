import * as P from './planner.js';
import { llm } from './assistant/llm.js';
import { createSession } from './assistant/prompt.js';
import { loadKnowledge, knowledgeFiles } from './assistant/knowledge.js';

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
    energy: { E: 1, at: Date.now(), drainMult: 1 }, depthMult: 1, herePos: null,
    prefs: {
      weights: d.weights, siteInterest: d.siteInterest, chrono: false, volatility: 'normal',
      speed: d.speed, talkFactor: d.talkFactor, allowBreaks: true, recordTrack: true, useGps: true, detail: d.detail,
    },
    clockOffset: 0, track: [], gps: null, log: [],
  };
}
function save() { try { localStorage.setItem(LS + ':' + tour.id, JSON.stringify(state)); } catch (e) { /* storage full or blocked */ } }
function load(id) { try { return JSON.parse(localStorage.getItem(LS + ':' + id)); } catch (e) { return null; } }

function settings() {
  const d = P.defaultSettings(tour);
  const p = state.prefs;
  return { ...d, weights: { ...d.weights, ...p.weights }, siteInterest: p.siteInterest, chrono: p.chrono, volatility: p.volatility, speed: p.speed, talkFactor: p.talkFactor, allowBreaks: p.allowBreaks, detail: p.detail || d.detail };
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
  const seeds = prev ? [prev.route] : [];
  plan = P.plan(model, {
    from, deadlineS: state.deadline / 1000, E0, drainMult: state.energy.drainMult, depthMult: state.depthMult || 1,
    visited: state.visited, skipped: state.skipped, pinned: state.pinned, forceFirst, onBreak,
  }, st, nowS, { seeds });
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
  state.from = tour.start;
  state.leftAt = now();
  setEnergy(1, 1); state.depthMult = 1;
  logEv('start', { deadline: deadlineMs });
  const intro = tour.introStop && stop(tour.introStop);
  if (intro) {
    // Always open with the story in brief; its points are trimmed like any other stop's.
    state.phase = 'stop'; state.at = intro.id; state.arrivedAt = now();
    replan({ quiet: true });
    const step = plan.steps.find(s => s.type === 'stop' && s.id === intro.id);
    state.shown = step ? step.bullets : [intro.bullets[0].id]; state.extra = [];
  } else {
    state.phase = 'walking';
    replan({ keepTarget: false, quiet: true });
  }
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
  if (kind === 'cafe') { setEnergy(Math.max(energyNow(), breakCfg().restore ?? 1), Math.max(1, state.energy.drainMult * 0.8)); state.depthMult = Math.max(1, (state.depthMult || 1) * 0.7); }
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
  // Loving a striking place says something about looks, not just its topics.
  if ((s.wow ?? 0) >= 4) state.prefs.weights.looks = clamp((state.prefs.weights.looks ?? P.SIGHT_WEIGHTS.looks) + delta, 0, 1);
}

// Bored: fewer facts per stop from now on (not fewer stops), and energy runs down faster so a
// café break gets suggested sooner.
function bored() {
  setEnergy(energyNow() - 0.1, state.energy.drainMult * 1.3);
  state.depthMult = clamp((state.depthMult || 1) * 1.5, 0.4, 5);
  const here = state.at || (state.purpose === 'stop' ? state.target : null);
  logEv('bored', { at: here });
  if (state.phase === 'stop') {
    // Trim this stop hard (they want to move on now), then plan the rest with the new mood.
    const keep = state.depthMult;
    state.depthMult = keep * 3;
    replan({ quiet: true });
    const step = plan.steps.find(s => s.type === 'stop' && s.id === state.at);
    if (step) state.shown = state.shown.filter(id => step.bullets.includes(id));
    state.extra = [];
    state.depthMult = keep;
    replan({ quiet: true });
    toast('Got it. Trimmed this stop, fewer facts from now on, and a coffee break will come sooner.');
  } else {
    replan({ keepTarget: true });
    toast('Got it. Fewer facts per stop from now on, and a coffee break will come sooner.');
  }
  render();
}

function loving() {
  setEnergy(energyNow() + 0.1, state.energy.drainMult * 0.9);
  state.depthMult = clamp((state.depthMult || 1) * 0.7, 0.4, 5);
  state.prefs.siteInterest = clamp(state.prefs.siteInterest + 0.03, 0, 1);
  const here = state.at || (state.purpose === 'stop' ? state.target : null);
  if (here) nudgeWeights(here, 0.03);
  logEv('loving', { at: here });
  replan({ quiet: false });
  toast('Noted. A bit more depth from now on.');
  render();
}

// Re-route from an arbitrary spot (GPS fix or a tap on the map).
let mapPick = false;
function rerouteFrom(pos, how) {
  if (state.phase === 'stop') finishStopSilently();
  if (state.phase === 'break') { state.from = state.at; state.at = null; state.breakKind = null; }
  state.herePos = pos;
  P.setHere(model, pos);
  state.from = P.HERE_ID; state.phase = 'walking'; state.purpose = null; state.leftAt = now();
  logEv('reroute', { pos, how });
  replan({ keepTarget: false, quiet: true });
  mapPick = false; tab = 'now';
  const t = state.target && stop(state.target);
  toast(`Re-routed from where you are.${t ? ' Next: ' + t.name + '.' : ''}`);
  render();
}
function offRoute() {
  const g = gpsFresh();
  if (g) return rerouteFrom([g.lat, g.lon], 'gps');
  mapPick = true; tab = 'map'; render();
  toast('Tap the map where you are.');
}
function readHere(id) {
  if (state.phase === 'stop') finishStopSilently();
  if (state.skipped[id]) delete state.skipped[id];
  state.phase = 'walking'; state.target = id; state.purpose = 'stop';
  arrive();
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
    if (e && e.len < 5) continue; // zero-length hops (e.g. introduction → visitor centre)
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
  const near = me.kind === 'gps' && P.haversine(me.pos, tpos) < 25 && !stop(state.target)?.indoor;
  let other = null, off = false;
  if (me.kind === 'gps' && !near) {
    // Wandered up to a different stop?
    let bd = 25;
    for (const s of tour.stops) {
      if (s.kind !== 'sight' || s.indoor || s.id === state.target || state.visited[s.id]) continue;
      const d = P.haversine(me.pos, s.pos);
      if (d < bd) { bd = d; other = s; }
    }
    // Or just off the planned path?
    if (!other && leg?.path?.length) off = P.distanceToPath(model, me.pos, leg.path) > Math.max(60, me.acc + 25);
  }
  return { leg, me, brg, remaining, legLeft, near, other, off };
}
function bannerHtml(nav, s) {
  if (nav.near) return `<div class="banner"><span>You look to be at <b>${esc(s.name)}</b></span><button class="btn secondary" style="background:#fff" data-do="arrive">Start</button></div>`;
  if (nav.other) return `<div class="banner"><span>You're at <b>${esc(nav.other.name)}</b>. Read it now?</span><button class="btn secondary" style="background:#fff" data-do="here-stop" data-id="${nav.other.id}">Yes</button></div>`;
  if (nav.off) return `<div class="banner" style="background:var(--accent)"><span>Off the planned path?</span><button class="btn secondary" style="background:#fff" data-do="reroute-gps">Re-route</button></div>`;
  return '';
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
  <div id="bannerslot">${bannerHtml(nav, s)}</div>
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
  ${purpose === 'stop' ? `<div class="small muted">Coming up</div>${upNext()}` : ''}
  <button class="btn ghost block" style="margin-top:14px" data-do="offroute">📍 We're somewhere else: re-route</button>`;
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
  const slot = $('#bannerslot');
  if (slot) { const h = bannerHtml(nav, stop(state.target)); if (slot.innerHTML !== h) slot.innerHTML = h; }
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
    <button class="btn secondary block" style="margin-top:10px" data-do="ask">💬 Ask about this</button>
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
  // An event with `more` opens to explain itself (what happened, who was affected, what came
  // next); one linked to a stop opens that stop.
  const evHtml = (x) => {
    const cls = `tl-ev${x.stop && x.stop === here ? ' here' : ''}`;
    if (!x.more) {
      const row = `<span class="y">${x.year}</span><span>${esc(x.label)}</span>`;
      return x.stop ? `<div class="${cls} link" data-sheet="${x.stop}">${row}</div>` : `<div class="${cls}">${row}</div>`;
    }
    const srcs = (x.src || []).map(k => tour.sources[String(k)]).filter(Boolean)
      .map(([t, u]) => u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>` : esc(t)).join(' · ');
    const st = x.stop && stop(x.stop);
    const btns = (st ? `<button class="btn ghost" data-sheet="${x.stop}">📍 ${esc(st.short || st.name)}</button>` : '')
      + (llm.available() ? `<button class="btn ghost" data-do="ask" data-q="${esc(`Tell me more about this: ${x.label} (${x.year}).`)}">💬 Ask more</button>` : '');
    return `<details class="${cls} tl-more"><summary><span class="y">${x.year}</span><span>${esc(x.label)} <span class="tl-chev">▸</span></span></summary>
      <div class="tl-body"><p>${esc(x.more)}</p>${srcs ? `<div class="small muted">Source: ${srcs}</div>` : ''}${btns ? `<div class="btn-row">${btns}</div>` : ''}</div></details>`;
  };
  const html = tour.eras.map(e => {
    const evs = tour.events.filter(x => x.year >= e.from && x.year <= e.to);
    const stops = tour.stops.filter(s => s.era === e.id && s.kind === 'sight');
    const items = [
      ...evs.map(evHtml),
      ...stops.map(s => `<div class="tl-ev stop ${s.id === here ? 'here' : ''}" data-sheet="${s.id}"><span class="y">${s.date || ''}</span><span>📍 ${esc(s.name)} ${status(s.id)}</span></div>`),
    ];
    return `<section class="tl-era ${e.id === hereEra ? 'here' : ''}" style="border-color:${e.colour}">
      <h2>${esc(e.name)}</h2><div class="years">${e.from}–${e.to === 2026 ? 'today' : e.to}</div>
      <p>${esc(e.summary)}</p>${items.join('')}</section>`;
  }).join('');
  const intro = tour.introStop && stop(tour.introStop);
  const brief = intro ? `<div class="card"><details><summary><b>${esc(intro.name)}</b> <span class="small muted">(${intro.bullets.length} points)</span></summary><ul class="bullets" style="margin-top:8px">${intro.bullets.map(b => bulletHtml(intro, b.id)).join('')}</ul></details></div>` : '';
  return `${brief}<p class="small muted">How the place developed. 📍 = stops; tap one for details. Tap a line marked ▸ for more about it.</p>${html}`;
}

// ---------------------------------------------------------------- Map tab
// The OpenStreetMap layer (tours/<id>.map.json, from tools/fetch-osm.mjs) is drawn once into its own
// SVG under the stops; panning and zooming only change its viewBox. Without it, the tour's
// schematic shapes are drawn instead.
let osmLayer = null, osmSvg = '';
const OSM_FILL = { site: 'var(--site)', field: 'var(--field)', park: 'var(--park)', lawn: 'var(--lawn)', garden: 'var(--garden)', playground: 'var(--garden)', wood: 'var(--wood)', parking: 'var(--parking)', water: 'var(--water)', building: 'var(--building)' };
function loadOsm() {
  if (!tour.map?.osm) return;
  fetch(tour.map.osm).then(r => r.ok ? r.json() : null).then(l => {
    if (!l?.features) return;
    osmLayer = l; osmSvg = '';
    if (tab === 'map') renderMap(true);
  }).catch(() => {});
}
function osmBase() {
  if (osmSvg) return osmSvg;
  const pt = (p) => proj(p).map(v => v.toFixed(1)).join(',');
  const ring = (r) => 'M' + r.map(pt).join('L') + 'Z';
  const line = (f, stroke, w, extra = '') => `<polyline points="${f.line.map(pt).join(' ')}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
  const NS = ' vector-effect="non-scaling-stroke"';
  const out = [];
  for (const f of osmLayer.features) {
    if (f.rings) {
      const fill = OSM_FILL[f.kind]; if (!fill) continue;
      const edge = f.kind === 'building' ? ` stroke="var(--building-edge)" stroke-width="0.8"${NS}`
        : f.kind === 'site' ? ` stroke="var(--site-edge)" stroke-width="1.5" stroke-dasharray="6 4"${NS}` : '';
      out.push(`<path d="${f.rings.map(ring).join('')}" fill="${fill}" fill-rule="evenodd"${edge}/>`);
    } else if (f.line) {
      if (f.kind === 'waterline') out.push(line(f, 'var(--water)', f.width || 3));
      else if (f.kind === 'road') out.push(line(f, 'var(--road)', 4, NS));
      else if (f.kind === 'path') out.push(line(f, 'var(--path)', 1.6, NS + (f.steps ? ' stroke-dasharray="2 2"' : '')));
      else if (f.kind === 'wall') out.push(line(f, 'var(--wall)', 1.2, NS));
    }
  }
  return (osmSvg = out.join(''));
}
// Facility markers: car parks and the main entrance get their own symbol, everything else "i".
function facilityMark(s) {
  const f = s.facilities || [];
  if (f.includes('parking')) return { glyph: 'P', fill: '#2f5d9e' };
  if (f.includes('entrance')) return { glyph: '⇥', fill: '#555' };
  return { glyph: 'i', fill: '#555' };
}
// Where to put a shape's name: its centre if that's inside it, otherwise (a U-shaped canal, say)
// the edge point nearest the centre, nudged inwards.
function labelPoint(ring) {
  const r = ring.map(proj);
  const c = r.reduce((a, p) => [a[0] + p[0] / r.length, a[1] + p[1] / r.length], [0, 0]);
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if ((r[i][1] > c[1]) !== (r[j][1] > c[1]) && c[0] < (r[j][0] - r[i][0]) * (c[1] - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) inside = !inside;
  }
  if (inside) return c;
  let best = r[0], bd = Infinity;
  for (let i = 0; i < r.length - 1; i++) {
    const [a, b] = [r[i], r[i + 1]];
    const L2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((c[0] - a[0]) * (b[0] - a[0]) + (c[1] - a[1]) * (b[1] - a[1])) / L2));
    const q = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    const d = Math.hypot(q[0] - c[0], q[1] - c[1]);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}
const ringNear = (ring, pos, m) => ring.some(p => P.haversine(p, pos) < m);
// Names of water, woods and gardens, and a P on car parks; sized for the current zoom.
function osmLabels(k) {
  const out = [];
  for (const f of osmLayer.features) {
    if (!f.rings || !f.name) continue;
    const isP = f.kind === 'parking';
    if (isP && tour.stops.some(s => (s.facilities || []).includes('parking') && ringNear(f.rings[0], s.pos, 60))) continue;
    if (!isP && (k > 1.6 || !['water', 'wood', 'garden', 'lawn', 'playground'].includes(f.kind))) continue;
    const [x, y] = labelPoint(f.rings[0]);
    if (isP) out.push(`<g><rect x="${x - 8 * k}" y="${y - 8 * k}" width="${16 * k}" height="${16 * k}" rx="${3 * k}" fill="#2f5d9e"/><text x="${x}" y="${y + 4.5 * k}" font-size="${12 * k}" font-weight="700" fill="#fff" text-anchor="middle">P</text></g>`);
    else out.push(`<text class="lbl" x="${x}" y="${y}" font-size="${10.5 * k}" stroke-width="${3 * k}" text-anchor="middle" fill-opacity="0.75" font-style="italic">${esc(f.name)}</text>`);
  }
  return out.join('');
}
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
  if (osmLayer) parts.push(osmLabels(k));
  for (const f of osmLayer ? [] : tour.map?.features || []) {
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
  // paths (the planner's network; with the OpenStreetMap layer the real paths show instead)
  for (const e of osmLayer ? [] : model.edges) {
    if (e.temp || (model.nodes.get(e.a).building && model.nodes.get(e.b).building)) continue;
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
  const r = 11 * k;
  for (const s of tour.stops) {
    if (s.kind === 'intro') continue;
    const [x, y] = proj(s.pos);
    const visited = !!state.visited[s.id];
    const isTarget = state.phase === 'walking' && s.id === state.target;
    const isHere = s.id === state.at;
    const n = order.get(s.id);
    const fac = s.kind === 'facility' ? facilityMark(s) : null;
    const fill = fac ? fac.fill : visited ? '#8a8f8c' : (isTarget || isHere) ? 'var(--accent)' : n ? 'var(--brand)' : 'var(--card)';
    const stroke = n || visited || isTarget || isHere || s.kind === 'facility' ? '#fff' : '#8a8f8c';
    const small = s.indoor && k > 1.2;
    const rr = small ? r * 0.55 : r;
    if (isTarget || isHere) parts.push(`<circle class="pulse" cx="${x}" cy="${y}" r="${rr * 2}" fill="var(--accent)" opacity="0.4"/>`);
    parts.push(`<g data-sheet="${s.kind === 'facility' ? '' : s.id}"><circle cx="${x}" cy="${y}" r="${rr}" fill="${fill}" stroke="${stroke}" stroke-width="${2 * k}"/>`);
    if (!small) parts.push(`<text class="num" x="${x}" y="${y}" font-size="${10 * k}">${fac ? fac.glyph : visited ? '✓' : n ?? ''}</text>`);
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
  const vbs = `${vb.x} ${vb.y} ${vb.w} ${vb.h}`;
  const svg = `<svg id="map" viewBox="${vbs}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`;
  const legend = osmLayer ? '● planned &nbsp;✓ seen &nbsp;<span style="color:var(--route)">━</span> route &nbsp;<span style="color:#1a73e8">◉</span> you'
    : '● planned &nbsp;✓ seen &nbsp;<span style="color:#5a9e7a">━</span> waterside &nbsp;<span style="color:#1a73e8">◉</span> you';
  const note = osmLayer ? `Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors. ${tour.map?.osmNote || ''}` : esc(tour.map?.note || '');
  if (fresh || !$('#map')) {
    wrap.classList.toggle('has-osm', !!osmLayer);
    wrap.innerHTML = (osmLayer ? `<svg id="basemap" viewBox="${vbs}" xmlns="http://www.w3.org/2000/svg">${osmBase()}</svg>` : '') + svg + `<div class="map-ctrl"><button data-map="in">＋</button><button data-map="out">－</button><button data-map="fit">⤢</button><button data-map="me">◎</button><button data-map="pick" title="We're here">📍</button></div>
      <div class="map-legend" id="pickhint" style="top:auto;bottom:44px;background:var(--accent);color:#fff;${mapPick ? '' : 'display:none'}">Tap where you are to re-route</div>
      <div class="map-legend">${legend}</div>
      <div class="map-note">${note}</div>`;
    bindMap(wrap);
  } else {
    $('#map').outerHTML = svg;
    $('#basemap')?.setAttribute('viewBox', vbs);
  }
}
function viewBoxNow() {
  const v = $('#map')?.viewBox?.baseVal;
  return v ? { x: v.x, y: v.y, w: v.width, h: v.height } : mapView;
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
    if (was && st && Math.hypot(was[0] - st[0], was[1] - st[1]) < 6 && mapPick) {
      const [wx, wy] = toWorld(e.clientX, e.clientY, viewBoxNow());
      const lat0 = LAT0(), lon0 = model.nodes.get(tour.start).pos[1];
      rerouteFrom([lat0 - wy / 110574, lon0 + wx / (Math.cos(lat0 * Math.PI / 180) * 111320)], 'map');
      return;
    }
    if (was && st && Math.hypot(was[0] - st[0], was[1] - st[1]) < 10) {
      // Generous finger-sized hit area: anything within ~32 px of the tap counts. If several
      // stops are that close (e.g. rooms in the house), offer a short list to pick from.
      const vb = viewBoxNow();
      const r = wrap.getBoundingClientRect();
      const k = vb.w / r.width;
      const [wx, wy] = toWorld(e.clientX, e.clientY, vb);
      const hits = tour.stops.filter(s => s.kind === 'sight')
        .map(s => { const [x, y] = proj(s.pos); return { s, d: Math.hypot(x - wx, y - wy) / k }; })
        .filter(h => h.d < 32).sort((a, b) => a.d - b.d);
      if (hits.length === 1 || (hits.length > 1 && hits[1].d - hits[0].d > 14)) stopSheet(hits[0].s.id);
      else if (hits.length > 1) openSheet(`<h2>Which one?</h2>${hits.slice(0, 6).map(h => `<button class="btn secondary block" style="margin-top:10px" data-sheet="${h.s.id}">${esc(h.s.name)}</button>`).join('')}
        <button class="btn ghost block" style="margin-top:10px" data-do="close">Cancel</button>`);
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
    if (b.dataset.map === 'pick') {
      if (state.phase === 'setup') return;
      mapPick = !mapPick; const h = $('#pickhint'); if (h) h.style.display = mapPick ? '' : 'none';
      if (mapPick) toast('Tap the map where you are.');
      return;
    }
    if (b.dataset.map === 'me' && state.phase !== 'setup') { const [x, y] = proj(whereAmI().pos); mapView = { x: x - 150, y: y - 150, w: 300, h: 300 }; }
    renderMap();
  });
}

// ---------------------------------------------------------------- Ask (offline assistant)
// The app builds each question's prompt (date facts worked out in code, the best-matching notes, where you
// are, the earlier question) and the Android app's on-phone model writes the answer.
const APP_URL = 'https://github.com/EDixon/Tour-guide/releases/tag/android-latest';
const ask = { session: null, loading: null, items: [], busy: null, key: 0 };
function ensureKnowledge() {
  if (ask.session) return Promise.resolve(ask.session);
  if (!ask.loading) {
    ask.loading = loadKnowledge(tour, async (p) => { const r = await fetch(p); return r.ok ? r.text() : null; })
      .then(k => (ask.session = createSession({ sections: k.sections, dates: k.dates, tour })))
      .catch(e => { ask.loading = null; throw e; });
  }
  return ask.loading;
}
// Where the family is, for "this" and "here": the stop you're at, or the nearest outdoor stop within 60 m by GPS,
// or the stop you've just left.
function whereForAsk() {
  if (state.phase === 'stop' && state.at && !['intro', 'facility'].includes(stop(state.at)?.kind)) return state.at;
  const g = gpsFresh();
  if (g) {
    let best = null, bd = Infinity;
    for (const st of tour.stops) {
      if (st.kind === 'facility' || st.kind === 'intro' || st.indoor) continue;
      const d = P.haversine([g.lat, g.lon], st.pos);
      if (d < bd) { bd = d; best = st.id; }
    }
    if (bd <= 60) return best;
  }
  if (state.phase === 'walking' && state.from && now() - state.leftAt < 120000 && stop(state.from)?.kind !== 'facility') return state.from;
  return null;
}
function fmtGB(b) { return `${(b / 1e9).toFixed(1)} GB`; }
function assistantStatusText(st = llm.status()) {
  const pr = st.progress || {};
  switch (st.state) {
    case 'unavailable': return 'Needs the Android app.';
    case 'none': return 'Model not on the phone yet.';
    case 'downloading': return pr.total > 0 ? `${pr.kind === 'import' ? 'Copying' : 'Downloading'} the model: ${Math.round(100 * pr.bytes / pr.total)}% of ${fmtGB(pr.total)}` : 'Starting download (Wi-Fi only)…';
    case 'ready': return 'Ready. It takes a few seconds to load the first time.';
    case 'loading': return 'Getting the assistant ready…';
    case 'loaded': return `Ready (${st.backend === 'GPU' ? 'using the graphics chip' : 'using the main processor'}).`;
    case 'error': return st.error || 'Something went wrong.';
  }
  return '';
}
function askItemHtml(it) {
  const a = it.a ? esc(it.a) : (it.state === 'thinking' ? '<span class="muted">Thinking…</span>' : '');
  return `<div class="ask-item" data-ask="${it.key}"><div class="ask-q">${esc(it.q)}</div><div class="ask-a">${a}</div><div class="small muted ask-meta">${esc(it.meta || '')}</div></div>`;
}
function updateAskItem(it) {
  const el = document.querySelector(`[data-ask="${it.key}"]`);
  if (el) { el.outerHTML = askItemHtml(it); scrollAskLog(); }
}
function scrollAskLog() { const b = $('#sheet-body'); if (b && $('#ask-log')) b.scrollTop = b.scrollHeight; }
function openAsk(prefill = '') {
  const where = whereForAsk();
  const st = llm.status();
  if (st.state === 'ready') llm.load();   // warm the model up while they type
  ensureKnowledge().catch(() => {});
  const setup = llm.available() && !st.model && st.state !== 'downloading';
  openSheet(`
    <h2>Ask</h2>
    <div class="small muted"><span id="ask-status">${esc(assistantStatusText(st))}</span>${where ? ` · at ${esc(stop(where).name)}` : ''}</div>
    <div id="ask-log" class="ask-log">${ask.items.map(askItemHtml).join('') || '<p class="small muted">Ask about what you’re looking at: who built it, when, why, who someone was. Dates are worked out by the app, so they’re exact; the rest comes from the guide’s notes.</p>'}</div>
    ${!llm.available() ? `<div class="note">The offline assistant runs on the phone in the Android app. <a href="${APP_URL}" target="_blank" rel="noopener">Get the app</a></div>` : ''}
    ${setup ? '<button class="btn secondary block" data-do="ask-setup">Set up the assistant</button>' : ''}
    <div class="ask-row"><input type="text" id="ask-q" placeholder="Ask a question…" enterkeyhint="send" autocomplete="off"><button class="btn" data-do="ask-send">Ask</button></div>
    <div class="btn-row"><button class="btn ghost" data-do="ask-new">New topic</button><button class="btn ghost" data-do="close">Close</button></div>`);
  const input = $('#ask-q');
  if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendAsk(); } });
  if (input && prefill) { input.value = prefill; input.focus(); }
  scrollAskLog();
}
async function sendAsk() {
  const input = $('#ask-q');
  const q = input?.value.trim();
  if (!q) return;
  if (!llm.available()) return toast('The assistant needs the Android app.');
  const st = llm.status();
  if (!st.model) return toast('Set up the assistant first: Settings → Offline assistant.');
  if (ask.busy) llm.cancel(ask.busy);
  input.value = '';
  const it = { key: ++ask.key, q, a: '', state: 'thinking', meta: '' };
  ask.items.push(it);
  if (ask.items.length > 20) ask.items.shift();
  const log = $('#ask-log');
  if (log) { if (ask.items.length === 1) log.innerHTML = ''; log.insertAdjacentHTML('beforeend', askItemHtml(it)); scrollAskLog(); }
  let session;
  try { session = await ensureKnowledge(); } catch (e) { it.state = 'error'; it.meta = `Couldn’t load the notes: ${e.message}`; return updateAskItem(it); }
  const where = whereForAsk();
  const r = session.prompt(q, { stopId: where });
  logEv('ask', { q, stop: where, about: r.about });
  const t0 = performance.now();
  const tick = setInterval(() => { if (it.state === 'thinking') { it.meta = `Thinking… ${Math.round((performance.now() - t0) / 1000)} s`; updateAskItem(it); } }, 1000);
  const h = llm.ask(r.text, { maxTokens: 256, onToken: (text) => { it.a = text.replace(/\*\*/g, ''); it.state = 'streaming'; updateAskItem(it); } });
  ask.busy = h.id;
  try {
    const res = await h.done;
    it.a = res.text.replace(/\*\*/g, '').trim();
    it.state = 'done';
    it.meta = res.firstMs >= 0 ? `${(res.firstMs / 1000).toFixed(1)} s to start, ${(res.totalMs / 1000).toFixed(1)} s in all` : '';
  } catch (e) {
    it.state = 'error'; it.meta = e.message;
  } finally {
    clearInterval(tick);
    if (ask.busy === h.id) ask.busy = null;
    updateAskItem(it);
    save();
  }
}
function assistantSettingsHtml() {
  if (!llm.available()) return `<p class="small muted">The offline assistant runs on the phone in the Android app. <a href="${APP_URL}" target="_blank" rel="noopener">Get the app</a></p>`;
  const st = llm.status();
  const busy = st.state === 'downloading';
  return `<div class="small" id="as-status">${esc(assistantStatusText(st))}</div>
    ${st.model ? `<div class="small muted">${esc(st.model)} · ${fmtGB(st.modelBytes || 0)} · app ${esc(st.appVersion || '')}</div>` : ''}
    ${!st.model && !busy ? `<div class="btn-row"><button class="btn" data-do="ask-download">Download (about 2.6 GB, Wi-Fi)</button></div>
      <div class="btn-row"><button class="btn ghost" data-do="ask-import">Import model file…</button></div>
      <div class="hint small muted">The model is Google’s Gemma 4 E2B. Download needs Wi-Fi; it carries on in the background and shows in the notifications.</div>` : ''}
    ${st.model ? `<div class="btn-row">${st.state !== 'loaded' ? '<button class="btn ghost" data-do="ask-load">Load now</button>' : ''}<button class="btn ghost" data-do="ask-delete">Delete model</button></div>` : ''}`;
}
llm.onStatus((st) => {
  const t = assistantStatusText(st);
  const a = $('#ask-status'); if (a) a.textContent = t;
  const block = $('#as-block'); if (block) block.innerHTML = assistantSettingsHtml();
});
// Lets the Android back button close a sheet before leaving the app.
window.TourApp = { back() { if (!$('#sheet').classList.contains('hidden')) { closeSheet(); return true; } return false; } };

// ---------------------------------------------------------------- Settings & review
function seg(name, opts, cur) {
  return `<div class="seg" data-seg="${name}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(v) === String(cur) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}
function openSettings() {
  const p = state.prefs;
  openSheet(`
    <h2>Settings</h2>
    ${state.phase !== 'setup' ? `<div class="field"><label for="s-dl">Back at the car by</label><input type="time" id="s-dl" value="${timeInputValue(new Date(state.deadline))}"></div>` : ''}
    <div class="field"><label>Facts per stop</label>${seg('detail', [['light', 'Few'], ['normal', 'Some'], ['full', 'Lots']], p.detail || 'light')}
      <div class="hint">Which facts are chosen still follows your interests; “More” at a stop always shows the next one.</div></div>
    <div class="field switch"><label for="s-chrono">Follow the story in time order</label><input type="checkbox" id="s-chrono" ${p.chrono ? 'checked' : ''}></div>
    <div class="field switch"><label for="s-breaks">Suggest café breaks</label><input type="checkbox" id="s-breaks" ${p.allowBreaks ? 'checked' : ''}></div>
    <div class="field"><label>Walking pace</label>${seg('speed', [[0.7, 'Toddler'], [0.85, 'Family'], [1.1, 'Brisk']], p.speed)}</div>
    <div class="field"><label>Time per point</label>${seg('talk', [[1.1, 'Read only'], [1.5, 'Some chat'], [2.2, 'Lots of chat']], p.talkFactor)}</div>
    <div class="field"><label>How likely are we to have to leave early?</label>${seg('vol', [['calm', 'Unlikely'], ['normal', 'Normal'], ['chaotic', 'Very']], p.volatility)}</div>
    <div class="btn-row"><button class="btn" data-do="apply">Apply</button></div>
    <h3>Interests</h3>
    <button class="btn secondary block" data-do="interests">Edit interests…</button>
    <h3>Offline assistant</h3>
    <div id="as-block">${assistantSettingsHtml()}</div>
    <h3>Tools</h3>
    <div class="field switch"><label for="s-gps">Use GPS (turn off for testing at home)</label><input type="checkbox" id="s-gps" ${p.useGps !== false ? 'checked' : ''}></div>
    <div class="field switch"><label for="s-track">Record GPS track (to correct paths later)</label><input type="checkbox" id="s-track" ${p.recordTrack ? 'checked' : ''}></div>
    <div class="btn-row"><button class="btn ghost" data-do="gpx">Export track (${state.track.length} pts)</button><button class="btn ghost" data-do="review">Review content</button></div>
    <div class="field"><label>Simulated clock ${state.clockOffset ? `(+${Math.round(state.clockOffset / 60000)} min)` : ''}</label>
      <div class="btn-row"><button class="btn ghost" data-do="clock5">+5 min</button><button class="btn ghost" data-do="clock15">+15 min</button><button class="btn ghost" data-do="clock0">Real time</button></div></div>
    <div class="btn-row"><button class="btn ghost" data-do="close">Close</button><button class="btn danger" data-do="reset">Reset tour</button></div>
    <p class="small muted" style="margin-top:14px">Content compiled from public sources (listings, English Heritage, Wikipedia and others). Check “Review content” for sources and items flagged to verify.</p>`);
}
function applySettings() {
  const p = state.prefs;
  const sheet = $('#sheet-body');
  p.chrono = $('#s-chrono', sheet).checked;
  p.allowBreaks = $('#s-breaks', sheet).checked;
  p.recordTrack = $('#s-track', sheet).checked;
  p.useGps = $('#s-gps', sheet).checked;
  const segv = (n) => sheet.querySelector(`[data-seg="${n}"] .on`)?.dataset.v;
  p.speed = +(segv('speed') ?? p.speed); p.talkFactor = +(segv('talk') ?? p.talkFactor); p.volatility = segv('vol') ?? p.volatility;
  p.detail = segv('detail') ?? p.detail;
  const dl = $('#s-dl', sheet);
  if (dl && dl.value) state.deadline = timeFromInput(dl.value);
  if (state.phase !== 'setup') replan({ keepTarget: state.phase === 'walking' });
  save(); closeSheet(); render();
}
// Interests live on their own screen with an explicit Save, so they can't be nudged by accident.
function openInterests() {
  const p = state.prefs;
  const slider = (k, label, hint = '') => {
    const v = p.weights[k] ?? P.SIGHT_WEIGHTS[k] ?? 0.5;
    return `
    <div class="field" style="margin:8px 0"><label for="w-${k}" style="font-weight:500">${esc(label)}</label>${hint ? `<div class="small muted">${esc(hint)}</div>` : ''}
    <div class="slider-row"><input type="range" min="0" max="1" step="0.05" id="w-${k}" data-w="${k}" value="${v}"><output>${Math.round(v * 100)}</output></div></div>`;
  };
  const sights = slider('looks', 'Visually impressive places', 'Worth seeing even without the story.')
    + slider('popular', 'Visitor favourites', 'Places other visitors single out in reviews and guides.');
  const weights = Object.entries(tour.topics).map(([k, label]) => slider(k, label)).join('');
  openSheet(`
    <h2>Interests</h2>
    <p class="small muted">These decide which stops and facts are chosen. The app nudges them a little when you tap More or Loving it.</p>
    <div class="field"><label>How gripping is this place today?</label>
      <div class="slider-row"><input type="range" id="s-si" min="0" max="1" step="0.05" value="${p.siteInterest}"><output>${Math.round(p.siteInterest * 100)}</output></div></div>
    <h3 style="margin:14px 0 2px">What to see</h3>
    ${sights}
    <h3 style="margin:14px 0 2px">Topics</h3>
    ${weights}
    <div class="btn-row"><button class="btn ghost" data-do="close">Cancel</button><button class="btn" data-do="save-interests">Save interests</button></div>`);
}
function saveInterests() {
  const p = state.prefs;
  const sheet = $('#sheet-body');
  sheet.querySelectorAll('[data-w]').forEach(i => { p.weights[i.dataset.w] = +i.value; });
  p.siteInterest = +$('#s-si', sheet).value;
  logEv('interests', { w: p.weights, si: p.siteInterest });
  if (state.phase !== 'setup') replan({ keepTarget: state.phase === 'walking' });
  save(); closeSheet(); render();
  toast('Interests saved.');
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
  const name = `${tour.id}-${new Date().toISOString().slice(0, 10)}.gpx`;
  if (llm.available()) { toast(llm.saveText(name, 'application/gpx+xml', gpx) ? `Saved to Downloads: ${name}` : 'Couldn’t save the track.'); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([gpx], { type: 'application/gpx+xml' }));
  a.download = name;
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
    case 'ask': return openAsk(el.dataset.q || '');
    case 'ask-send': return sendAsk();
    case 'ask-new': if (ask.session) ask.session.reset(); ask.items = []; return openAsk();
    case 'ask-setup': return openSettings();
    case 'ask-download': llm.download(); toast('Download started (Wi-Fi only). It carries on in the background.'); return;
    case 'ask-import': return llm.importModel();
    case 'ask-load': llm.load(); return;
    case 'ask-delete': if (confirm('Delete the assistant model from the phone? You can download it again later.')) llm.deleteModel(); return;
    case 'apply': return applySettings();
    case 'interests': return openInterests();
    case 'save-interests': return saveInterests();
    case 'offroute': return offRoute();
    case 'reroute-gps': { const g = gpsFresh(); return g ? rerouteFrom([g.lat, g.lon], 'gps-banner') : offRoute(); }
    case 'here-stop': return readHere(id);
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
  if (e.target.closest('#btn-ask')) return openAsk();
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
  loadOsm();
  localStorage.setItem(LS + ':last', tour.id);
  if (tour.knowledge) setTimeout(() => knowledgeFiles(tour).forEach(f => fetch(f).catch(() => {})), 3000);
  state = load(tour.id) || freshState(tour);
  state.prefs.weights = { ...P.defaultSettings(tour).weights, ...state.prefs.weights };
  if (state.depthMult == null) state.depthMult = 1;
  if (state.herePos) P.setHere(model, state.herePos);
  if (state.phase !== 'setup') { replan({ keepTarget: true, quiet: true }); startGps(); requestWake(); }
  render();
}
boot().catch(err => { $('#view').innerHTML = `<div class="card">Couldn’t load the tour: ${esc(err.message)}</div>`; });

// expose for debugging in the console
window.__tour = { get state() { return state; }, get plan() { return plan; }, P };
