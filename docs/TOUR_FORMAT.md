# Tour file format (format 1)

One JSON file per site in `tours/`. Example: `wrest-park.json`.

## Top level

| Field | Meaning |
|---|---|
| `id`, `name`, `subtitle`, `operator` | Identity. `id` is used in the URL (`?tour=id`) and storage key. |
| `significance` | 0–1 default for “how gripping is this place” (royal castle ~0.8, random country house ~0.3). |
| `hours` | `{open, close, note}`. `close` caps the default deadline. |
| `start`, `exit` | Stop ids: normally the main car park, so the walk to the entrance and back is counted. The car park and main entrance are facility stops (`facilities: ["parking"]` / `["entrance"]`); they are often not where the visitor centre is. |
| `introStop` | Id of a stop with `kind: "intro"`: the story in brief, shown at the start (trimmed like any stop) and on the Timeline tab. Give it a path to the start node and optionally `attnBoost` (e.g. 0.15) so a few more of its points are kept. |
| `walk` | `{detour, indoorFactor}`: multipliers on straight-line distance for outdoor paths and indoor rooms. |
| `buildings` | `{id: {name, entrySeconds, exitSeconds, note, steps?}}`: one-off cost of going in (e.g. leaving the pushchair). `steps: true` if the way in has steps and no lift or ramp: pushchair mode then leaves out its rooms. |
| `breaks.cafe` | `{label, minutes, restore, at}`: the break the planner may insert; `restore` is energy after it (0–1). |
| `topics` | `{key: label}`: the interest dimensions shown as sliders. |
| `defaultWeights` | `{key: 0–1}`: starting interest per topic. May also override the two sight weightings, `looks` (default 0.8) and `popular` (default 0.6), which apply to whole stops rather than bullets and are always shown in Interests under "What to see". |
| `eras` | `[{id, name, from, to, colour, summary}]` for the timeline. |
| `events` | `[{year, label, src, stop?, more?}]`. `stop` links an event to a stop. `more` is the explanation shown when the line is tapped on the Timeline: 1–3 sentences, under 60 words, answering the obvious follow-ups (what was damaged and who was affected by a fire; who bought it and why for a sale; what changed as a result). It is sourced by the event's `src` and must agree with the notes. Give every event whose label leaves a who, what or why question open a `more`. |
| `waypoints` | `[{id, name, pos}]`: path junctions that aren't stops. |
| `paths` | `[[a, b, scenic 0–1, name, door?, opts?]]`: walkable links. `scenic` drives route choice; `name` is used for directions; `door` = building id for links that enter a building (else `null`). `opts` is `{"steps": true}` for a link with steps, which pushchair mode (👶) avoids. |
| `stops` | See below. |
| `map` | `{osm, osmNote, note, features: [{kind: wood|garden|lawn|building|water, poly|line+width|circle+r, label?}]}`: schematic shapes. |
| `photos` | Path of the photo credits file, `tours/<id>.photos.json` (see Photos under Bullet). |
| `map.osm` | Path of the OpenStreetMap layer, `tours/<id>.map.json`, made by `tools/fetch-osm.mjs` (run by the "OpenStreetMap layer" GitHub workflow when `sites/<id>/osm.request` is pushed). When present it replaces the schematic `features` and the planner's network lines on the map. `osmNote` is added after the attribution. Add the file to `sw.js` so it works offline. |
| `sources` | `{key: [title, url]}`. Key `gk` = general knowledge. |

## Stop

```json
{
  "id": "pavilion", "name": "Archer Pavilion", "short": "Archer Pavilion",
  "kind": "sight",                 // or "facility" (visitor centre etc.; never planned as a sight) or "intro"
  "pos": [52.0004, -0.4109],       // lat, lon; add "approx": true if estimated
  "building": "house", "indoor": true,   // only for rooms inside a building
  "date": 1709, "dateLabel": "1709–11", "era": "duke",
  "dwell": 210,                    // seconds spent looking, regardless of reading
  "wow": 5,                        // 0–5 how visually impressive it is, story aside (see below)
  "popular": 4,                    // 0–5 how often visitors single it out in reviews and guides (see below)
  "mustSee": true,                 // planner includes it whenever feasible
  "steps": true,                   // optional: the stop itself needs steps (pushchair mode leaves it out)
  "photoSpot": true,               // a viewpoint people stop to photograph (camera on the map); "look" says where to point
  "photo": "pavilion-vista",       // optional photo beside the "look" line
  "facilities": ["toilet", "cafe", "play", "babychange"],   // also "parking" and "entrance", which get their own map symbols
  "look": "What to look at on arrival.",
  "note": "Practical note (steps, opening).",
  "kids": ["A find-it task for a toddler."],
  "bullets": [ ... ]
}
```

### Sight scores: `wow` and `popular`

Bullets carry the story; these two say what a stop is worth just to see. Both are whole numbers 0–5. The evidence for every score goes in `sites/<id>/visitor-scores.md`, so a score can be argued with.

- **`wow`: how striking it is to look at**, judged as a first-time visitor with no guidebook.
  - 5: the image people take away from the site, the view on the guidebook cover.
  - 4: a real "oh!" moment: a grand interior, a long vista, a fine building seen whole.
  - 3: handsome and worth the walk.
  - 2: pleasant, but you need the story.
  - 1: hard to spot without the story.
  - 0: nothing to see (a site of something gone).
  - Evidence: what is striking, how often it is photographed (Wikimedia Commons, the operator's own images, review photos), and the listing grade as a minor signal. Grade measures significance, not looks.
- **`popular`: how often visitors single it out**, based on independent visitor accounts: reviews (Tripadvisor, Google), blogs, family days-out write-ups and newspaper pieces, plus the operator's "highlights" list. Count the share of accounts that mention the stop by name or unmistakably:
  - 5: at least half
  - 4: 30–49%
  - 3: 15–29%
  - 2: 5–14%
  - 1: under 5%, but mentioned
  - 0: never
  - Use at least 20 independent accounts. Note recurring complaints (closed, muddy, hard with a pushchair) in `note` and in STATUS flags rather than lowering the score.

The planner adds both to a stop's value, scaled by the family's "looks" and "popular" weightings. A stop with no `popular` simply gets nothing for it, so score every sight or none.

## Bullet

```json
{ "id": 2, "t": "Text to read aloud, one or two sentences.", "imp": 4,
  "tags": { "engineering": 1, "physics": 0.4 },
  "needs": 1,          // optional: id of an earlier bullet this one depends on
  "src": [4, "gk"],    // keys into sources
  "verify": true,      // optional: flag for checking the night before
  "photo": "william-statue" }  // optional: id in the tour's photos file, shown as a thumbnail
```

**Photos.** Any bullet that asks the family to look for or find something specific should have a `photo` that shows it clearly. The same goes for a toddler task (write it as `{"t": "Find the dog statue!", "photo": "dog-statue"}` instead of a plain string) and for a stop's `look` line (stop field `photo`). Photo ids point into `tours/<id>.photos.json`, which the tour names in its top-level `photos` field. That file maps each id to `{file, credit, licence, licenceUrl, page}` and is written by `tools/fetch-photos.mjs download` from `sites/<id>/photos-wanted.json`. Use only freely licensed photos (Wikimedia Commons, which mirrors Geograph), always credited, or Eliot's own photos of objects. Never use photos showing the family or other people's faces up close: the repo is public.

Rules:
- The **first bullet is the headline**: always read if the stop is visited.
- Bullets are always **shown in file order**. The planner only drops some.
- `imp` 5 = core story, 1 = nice-to-know. Tag strengths 0–1.
- Keep bullets to 15–35 words, written to be read aloud.
