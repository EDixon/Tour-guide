# Tour file format (format 1)

One JSON file per site in `tours/`. Example: `wrest-park.json`.

## Top level

| Field | Meaning |
|---|---|
| `id`, `name`, `subtitle`, `operator` | Identity. `id` is used in the URL (`?tour=id`) and storage key. |
| `significance` | 0–1 default for “how gripping is this place” (royal castle ~0.8, random country house ~0.3). |
| `hours` | `{open, close, note}`. `close` caps the default deadline. |
| `start`, `exit` | Stop ids (usually the visitor centre / car park). |
| `introStop` | Id of a stop with `kind: "intro"`: the story in brief, shown at the start (trimmed like any stop) and on the Timeline tab. Give it a path to the start node and optionally `attnBoost` (e.g. 0.15) so a few more of its points are kept. |
| `walk` | `{detour, indoorFactor}`: multipliers on straight-line distance for outdoor paths and indoor rooms. |
| `buildings` | `{id: {name, entrySeconds, exitSeconds, note}}`: one-off cost of going in (e.g. leaving the pushchair). |
| `breaks.cafe` | `{label, minutes, restore, at}`: the break the planner may insert; `restore` is energy after it (0–1). |
| `topics` | `{key: label}`: the interest dimensions shown as sliders. |
| `defaultWeights` | `{key: 0–1}`: starting interest per topic. |
| `eras` | `[{id, name, from, to, colour, summary}]` for the timeline. |
| `events` | `[{year, label, src, stop?}]`. `stop` links an event to a stop. |
| `waypoints` | `[{id, name, pos}]`: path junctions that aren't stops. |
| `paths` | `[[a, b, scenic 0–1, name, door?]]`: walkable links. `scenic` drives route choice; `name` is used for directions; `door` = building id for links that enter a building. |
| `stops` | See below. |
| `map` | `{note, features: [{kind: wood|garden|lawn|building|water, poly|line+width|circle+r, label?}]}`: schematic shapes. |
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
  "wow": 5,                        // 0–5 value of just seeing it
  "mustSee": true,                 // planner includes it whenever feasible
  "facilities": ["toilet", "cafe", "play", "babychange"],
  "look": "What to look at on arrival.",
  "note": "Practical note (steps, opening).",
  "kids": ["A find-it task for a toddler."],
  "bullets": [ ... ]
}
```

## Bullet

```json
{ "id": 2, "t": "Text to read aloud, one or two sentences.", "imp": 4,
  "tags": { "engineering": 1, "physics": 0.4 },
  "needs": 1,          // optional: id of an earlier bullet this one depends on
  "src": [4, "gk"],    // keys into sources
  "verify": true }     // optional: flag for checking the night before
```

Rules:
- The **first bullet is the headline**: always read if the stop is visited.
- Bullets are always **shown in file order**. The planner only drops some.
- `imp` 5 = core story, 1 = nice-to-know. Tag strengths 0–1.
- Keep bullets to 15–35 words, written to be read aloud.
