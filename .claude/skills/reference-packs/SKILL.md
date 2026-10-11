---
name: reference-packs
description: Fourth link in the Tour Guide site chain. Make sure the shared background a site needs (rulers, royal houses, architectural styles, technologies, wars) exists as reusable packs in knowledge/reference/, reusing what's there and having reference-writer agents (Sonnet) write what's missing. Hands on to site-check.
---

# reference-packs: shared background, written once

Main chat (Opus) decides. The **reference-writer** agent (Sonnet) writes.

## 1. What does the site need?
From `research-plan.md` and the merged notes, list the background that questions will reach for. Typical needs:
- who reigned when, at home and abroad
- the royal or noble families involved, with the Habsburgs as a standing interest
- architectural and garden styles
- technologies and engineering, such as how an orangery was heated or how the Long Water was dug
- wars and events that shaped the site
- for Egypt: chronology with competing date schemes, gods, scripts, later periods

## 2. Reuse first
- Look in `knowledge/reference/`. A pack is a folder with `notes.md` and/or `dates.json`.
- Add the packs that fit to `tours/<id>.json` → `knowledge.reference`.
- Where a pack exists but lacks something this site needs (e.g. `rulers` has no Spanish monarchs), extend it rather than making a near-duplicate.
- **Background currently inside a site's own notes** (`Kind: reference` sections), which another site would also use, should move into a pack. Do this when a second site needs it, not before.

## 3. Write what's missing
- Start one **reference-writer** agent per pack. Tell it:
  - the pack name
  - its output file names, `sites/<id>/research/ref-<pack>-notes.md` and `ref-<pack>-dates.json`
  - what's needed and why (which site questions it serves)
  - the existing ids it must not clash with
- Packs must be **site-neutral**: no "here at Wrest". Each section is about one person, event, style or technique.
- Review as in site-research: is it accurate, sourced and useful?
- Run `node tools/merge-research.mjs <id>`. It routes `ref-` files to `knowledge/reference/<pack>/`.

## 4. Hand on
`node tools/check-knowledge.mjs <id>`, then update `STATUS.md` (`Stage: check`), commit and push. Invoke the **site-check** skill.
