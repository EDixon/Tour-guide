// Find photo spots: places where many different people have stood to take a picture.
// Clusters the camera positions in sites/<id>/photos.json (from tools/fetch-photos.mjs list).
//
// Usage: node tools/photo-spots.mjs <site-id> [--radius 25] [--min-authors 3]
// Writes sites/<id>/photo-spots.md (for the survey to read) and prints a summary.
//
// A spot counts when photos by at least --min-authors different people sit within --radius
// metres of each other (one keen photographer with fifty shots is one opinion, not fifty). Each
// spot lists its nearest tour stop, so the survey can tell a new viewpoint from a stop already
// covered, and the photo titles, which usually say what the view is of.
import fs from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const args = process.argv.slice(2);
const id = args[0];
const opt = (k, d) => { const i = args.indexOf(k); return i > -1 ? +args[i + 1] : d; };
if (!id) { console.error('Usage: node tools/photo-spots.mjs <site-id> [--radius 25] [--min-authors 3]'); process.exit(2); }
const R = opt('--radius', 25), MIN = opt('--min-authors', 3);

const { photos } = JSON.parse(fs.readFileSync(root + `sites/${id}/photos.json`, 'utf8'));
const tour = fs.existsSync(root + `tours/${id}.json`) ? JSON.parse(fs.readFileSync(root + `tours/${id}.json`, 'utf8')) : { stops: [] };
const dist = (a, b) => {
  const r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(s));
};
const who = (p) => (p.author || 'unknown').toLowerCase().replace(/\s+/g, ' ').slice(0, 40);

// DBSCAN on camera positions, with "core" judged by distinct authors rather than photo count.
const n = photos.length, label = new Array(n).fill(-1);
const near = (i) => photos.map((p, j) => j).filter(j => dist(photos[i].pos, photos[j].pos) <= R);
const authors = (idx) => new Set(idx.map(j => who(photos[j]))).size;
let c = 0;
for (let i = 0; i < n; i++) {
  if (label[i] !== -1) continue;
  const nb = near(i);
  if (authors(nb) < MIN) continue;
  label[i] = c;
  const queue = [...nb];
  while (queue.length) {
    const j = queue.shift();
    if (label[j] === -1) {
      label[j] = c;
      const nb2 = near(j);
      if (authors(nb2) >= MIN) queue.push(...nb2.filter(k => label[k] === -1));
    }
  }
  c++;
}
const spots = [];
for (let k = 0; k < c; k++) {
  const idx = label.map((l, i) => (l === k ? i : -1)).filter(i => i >= 0);
  const ps = idx.map(i => photos[i]);
  const pos = [ps.reduce((s, p) => s + p.pos[0], 0) / ps.length, ps.reduce((s, p) => s + p.pos[1], 0) / ps.length].map(v => +v.toFixed(6));
  const stop = tour.stops.filter(s => s.pos).map(s => ({ id: s.id, name: s.name, d: dist(pos, s.pos) })).sort((a, b) => a.d - b.d)[0];
  spots.push({ pos, photos: ps.length, authors: new Set(ps.map(who)).size, stop, sample: ps.slice(0, 8) });
}
spots.sort((a, b) => b.authors - a.authors || b.photos - a.photos);

const lines = [
  `# Photo spots: ${id}`, '',
  `From ${n} geotagged Wikimedia Commons photos (camera positions). A spot needs ${MIN}+ different photographers within ${R} m.`,
  'Use these to find viewpoints worth a stop (or a `look` line at an existing stop), and to pick photos for bullets. Camera positions on Commons are sometimes approximate or are the subject\'s position, so check a spot on the OpenStreetMap layer before adding it.', '',
];
spots.forEach((s, i) => {
  lines.push(`## Spot ${i + 1}: ${s.authors} photographers, ${s.photos} photos`, `- Position: ${s.pos.join(', ')}`,
    `- Nearest stop: ${s.stop ? `${s.stop.name} (${s.stop.id}), ${Math.round(s.stop.d)} m` : 'none'}`, '- Photos:');
  for (const p of s.sample) lines.push(`  - [${p.title.replace(/^File:/, '')}](${p.page}): ${(p.desc || p.name || '').slice(0, 140)}`);
  lines.push('');
});
fs.writeFileSync(root + `sites/${id}/photo-spots.md`, lines.join('\n'));
console.log(`${spots.length} spots from ${n} photos; written to sites/${id}/photo-spots.md`);
for (const s of spots.slice(0, 15)) console.log(`  ${s.authors} people, ${s.photos} photos at ${s.pos.join(',')}; nearest stop ${s.stop?.id} ${Math.round(s.stop?.d)} m: ${s.sample[0].title.replace(/^File:/, '').slice(0, 60)}`);
