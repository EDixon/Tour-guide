// Geotagged photos for a site, from Wikimedia Commons (free licences; credit required).
//
// Usage:
//   node tools/fetch-photos.mjs <site-id> list       list every geotagged photo in the site's area
//   node tools/fetch-photos.mjs <site-id> download   download the photos chosen in sites/<id>/photos-wanted.json
//
// list writes sites/<id>/photos.json: one record per photo with where the camera stood, title,
//   description, author, licence, date and a thumbnail URL. tools/photo-spots.mjs clusters these
//   into the places people stand to take pictures (good views), and researchers pick photos from it.
// download reads sites/<id>/photos-wanted.json:
//   [{"id": "william-statue", "file": "File:Wrest Park - William III.jpg", "width": 900}, ...]
//   and writes tours/<id>/img/<id>.jpg plus tours/<id>.photos.json (credits), which the app shows.
//
// The area is the bbox of tours/<id>.map.json, or the stops plus 250 m. Claude's workspace can't
// reach Wikimedia, so this runs in GitHub Actions (the "Site photos" workflow), started by pushing
// sites/<id>/photos.request (first line: "list", "download" or "list download").
import fs from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const [id, ...modes] = process.argv.slice(2);
if (!id || !modes.length) { console.error('Usage: node tools/fetch-photos.mjs <site-id> list|download'); process.exit(2); }
const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'TourGuide/1.0 (https://github.com/EDixon/Tour-guide; family tour app)';

async function api(params) {
  const url = API + '?' + new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (r.ok) return r.json();
    if (r.status === 429 || r.status >= 500) { await new Promise(res => setTimeout(res, 2000 * (attempt + 1))); continue; }
    throw new Error(`Commons API: HTTP ${r.status}`);
  }
  throw new Error('Commons API: gave up after retries');
}
const strip = (html) => String(html ?? '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

function bbox() {
  const mf = root + `tours/${id}.map.json`;
  if (fs.existsSync(mf)) return JSON.parse(fs.readFileSync(mf, 'utf8')).bbox;
  const t = JSON.parse(fs.readFileSync(root + `tours/${id}.json`, 'utf8'));
  const pts = [...t.stops, ...(t.waypoints || [])].map(s => s.pos);
  const lat = pts.map(p => p[0]), lon = pts.map(p => p[1]);
  const dLat = 250 / 110574, dLon = 250 / (111320 * Math.cos(lat[0] * Math.PI / 180));
  return [Math.min(...lat) - dLat, Math.min(...lon) - dLon, Math.max(...lat) + dLat, Math.max(...lon) + dLon];
}

async function list() {
  const [s, w, n, e] = bbox();
  // Geosearch returns at most 500 per call, so split the area into tiles.
  const tiles = 3, titles = new Map();
  for (let i = 0; i < tiles; i++) for (let j = 0; j < tiles; j++) {
    const ts = s + (n - s) * i / tiles, tn = s + (n - s) * (i + 1) / tiles, tw = w + (e - w) * j / tiles, te = w + (e - w) * (j + 1) / tiles;
    const d = await api({ action: 'query', list: 'geosearch', gsbbox: `${tn}|${tw}|${ts}|${te}`, gsnamespace: '6', gslimit: '500', gsprimary: 'primary' });
    for (const g of d.query?.geosearch || []) titles.set(g.title, [g.lat, g.lon]);
  }
  console.log(`${titles.size} geotagged files in the area`);
  const photos = [];
  const all = [...titles.keys()];
  for (let k = 0; k < all.length; k += 50) {
    const batch = all.slice(k, k + 50);
    const d = await api({ action: 'query', titles: batch.join('|'), prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '640',
      iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl|ImageDescription|DateTimeOriginal|ObjectName|Credit' });
    for (const p of d.query?.pages || []) {
      const ii = p.imageinfo?.[0]; if (!ii || !/^image\/(jpeg|png|webp)/.test(ii.mime || '')) continue;
      const m = ii.extmetadata || {};
      photos.push({
        title: p.title, pos: titles.get(p.title).map(v => +v.toFixed(6)),
        desc: strip(m.ImageDescription?.value).slice(0, 300), name: strip(m.ObjectName?.value).slice(0, 120),
        author: strip(m.Artist?.value).slice(0, 120), licence: strip(m.LicenseShortName?.value), licenceUrl: m.LicenseUrl?.value || '',
        date: strip(m.DateTimeOriginal?.value).slice(0, 10), size: [ii.width, ii.height],
        thumb: ii.thumburl, page: ii.descriptionurl,
      });
    }
  }
  fs.mkdirSync(root + `sites/${id}`, { recursive: true });
  fs.writeFileSync(root + `sites/${id}/photos.json`, JSON.stringify({ source: 'Wikimedia Commons, geotagged files (camera position)', fetched: new Date().toISOString().slice(0, 10), bbox: [s, w, n, e], photos }, null, 1) + '\n');
  console.log(`Wrote sites/${id}/photos.json: ${photos.length} photos`);
}

async function download() {
  const wf = root + `sites/${id}/photos-wanted.json`;
  if (!fs.existsSync(wf)) { console.log(`No ${wf}`); return; }
  const wanted = JSON.parse(fs.readFileSync(wf, 'utf8'));
  const cf = root + `tours/${id}.photos.json`;
  const credits = fs.existsSync(cf) ? JSON.parse(fs.readFileSync(cf, 'utf8')) : {};
  fs.mkdirSync(root + `tours/${id}/img`, { recursive: true });
  for (const w of wanted) {
    const title = w.file.startsWith('File:') ? w.file : 'File:' + w.file;
    const d = await api({ action: 'query', titles: title, prop: 'imageinfo', iiprop: 'url|mime|extmetadata', iiurlwidth: String(w.width || 900),
      iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl' });
    const p = d.query?.pages?.[0], ii = p?.imageinfo?.[0];
    if (!ii) { console.error(`  not found: ${title}`); continue; }
    const r = await fetch(ii.thumburl, { headers: { 'User-Agent': UA } });
    if (!r.ok) { console.error(`  download failed (${r.status}): ${title}`); continue; }
    const ext = /png/.test(ii.mime) ? 'png' : 'jpg';
    const rel = `tours/${id}/img/${w.id}.${ext}`;
    fs.writeFileSync(root + rel, Buffer.from(await r.arrayBuffer()));
    const m = ii.extmetadata || {};
    credits[w.id] = { file: rel, credit: strip(m.Artist?.value).slice(0, 120) || 'Unknown', licence: strip(m.LicenseShortName?.value), licenceUrl: m.LicenseUrl?.value || '', page: ii.descriptionurl, title: p.title };
    console.log(`  ${rel} (${credits[w.id].licence}, ${credits[w.id].credit})`);
  }
  fs.writeFileSync(cf, JSON.stringify(credits, null, 1) + '\n');
  console.log(`Wrote ${cf}: ${Object.keys(credits).length} photos`);
}

if (modes.includes('list')) await list();
if (modes.includes('download')) await download();
