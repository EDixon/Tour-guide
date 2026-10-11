# Knowledge format (for the offline assistant)

Each site has a folder `knowledge/<site-id>/` with two files, and lists any shared reference packs it uses in its tour file:

```json
"knowledge": { "site": "knowledge/wrest-park", "reference": ["rulers"] }
```

Reference packs live in `knowledge/reference/<pack>/` with the same two files, both optional. Write a pack once and reuse it across sites (rulers, a royal house, an architectural style, an engineering topic).

The assistant never sends all of this to the model. For each question it picks the 3 best-matching sections and works out the date facts in code (`assistant/`).

## notes.md: sections

```markdown
## The Orangery
Kind: site
About: orangery
The Orangery was built about 1835 for Thomas Philip, 2nd Earl de Grey, ...

Second paragraph ...
Sources: Historic England list entry 1158549; English Heritage, History of Wrest Park.
```

- **One section = one retrievable chunk**, 150–500 words, about one thing: a stop, a building, a person, an event, or a background topic.
- **`Kind:`** is `site` (something you can stand at or see here), `person`, or `reference` (background: a war, a technique, a style).
- **`About:`** lists ids from `dates.json` (things and people) that the section covers. When a question names one of them, or the family is standing at its stop, this section is brought in. Every site section needs at least one id.
- **`Sources:`** is required. It is for checking and is stripped before the text reaches the model. Use "general knowledge" only for well-established background, never for site-specific claims.
- **The title** should be how a visitor would name it ("The boundary canals (\"the river\")"), because titles count double in search.
- **Writing:** plain British English that reads well aloud. Use full years ("1834–1839", not "1834–39"; the app also expands these). Give each section the details that make good answers: who, why, how it worked, what to look for. Avoid filler.

## dates.json: things and people

One object per line, so diffs stay readable.

```json
{
  "note": "...",
  "things": [
    {"id": "orangery", "name": "the Orangery", "names": ["orangery", "orange house"], "from": 1835, "to": 1835, "approx": true,
     "verb": "built", "people": ["earl-de-grey"], "who": "designed by Thomas, 2nd Earl de Grey, for himself", "stops": ["orangery"]}
  ],
  "people": [
    {"id": "earl-de-grey", "name": "Thomas, 2nd Earl de Grey", "names": ["earl de grey", "de grey"], "born": [1781, 12], "died": [1859, 11],
     "who": "the owner who built the present house", "events": [[1833, "inherited Wrest Park"]]}
  ]
}
```

**Things:** buildings, works, alterations and events with a date.
- `name` is how a sentence refers to it ("the Orangery"). `names` are the lower-case words a visitor might use in a question; keep them specific, because a too-general alias (e.g. "house" on two things) pulls in the wrong facts.
- `from`/`to` are years, and `approx: true` means circa. `verb` reads as "was ___" ("built", "dug", "put up"), or "happened" for events. Set `plural: true` for plural names ("the canals were dug").
- `who` completes "X was ___" (who designed, made or commissioned it). `people` lists linked person ids (builder, owner, subject), so their ages are worked out.
- `related` lists other thing ids worth comparing with it (a later alteration, the event it commemorates). `stops` lists tour stop ids where you can see it, which is how "this" and "here" are resolved.

**People:**
- `born`/`died` are `[year, month]` (month optional).
- `who` completes "X was ___".
- `events` are `[year, "what they did"]` pairs, phrased to follow the name ("became head gardener at Stowe").

**Rulers** (reference packs): `"rulers": {"England/Britain": [["Anne", 1702, 1714], ...]}`, with years inclusive at both ends.

## Checks

`npm test` runs the date maths and retrieval tests. `node tools/ask.mjs --tour <id> --at <stop> "question"` prints the exact prompt the app would send, so a section's usefulness can be checked by asking a real question.
