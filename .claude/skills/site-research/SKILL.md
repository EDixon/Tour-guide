---
name: site-research
description: Third link in the Tour Guide site chain. Hand each research batch from sites/<id>/research-plan.md to stop-researcher agents (Sonnet), check what comes back, and merge it into the tour and knowledge files. Run by the main chat after site-survey; hands on to reference-packs.
---

# site-research: bullets, notes and dates for every stop

Main chat (Opus) as coordinator. The research itself is done by the **stop-researcher** agent (Sonnet, defined in `.claude/agents/stop-researcher.md`). Its model is fixed there, so don't do the batches yourself: that is the expensive way.

## 1. Prepare
- Read `STATUS.md` and `research-plan.md`. Skip batches already marked merged.
- Read `knowledge/<id>/dates.json` and the tour file, so you can give each researcher the ids it must use.

## 2. Dispatch
For each pending batch, start a **stop-researcher** agent (Agent tool, `subagent_type: "stop-researcher"`). Run up to 4 at a time. Give each a complete brief, because it starts with no context:
- **Site and paths:**
  - site id and name
  - the batch name, which sets its output file names: `sites/<id>/research/<batch>-notes.md`, `-dates.json`, `-stops.json`
- **The stops:** ids, names and what's there, plus the existing dated-thing and person ids to use. It may create new ones, prefixed sensibly.
- **Sources:** the specific sources to start from, from `sources.md`.
- **Timeline events:** the events this batch should explain with `more` (year and label exactly as in the tour file).
- **Interests:** the family's interests, and the special angles for this batch.
- **Reminders:**
  - Every claim sourced.
  - Full years.
  - Toddler tasks only for things genuinely there.
  - Say when sources disagree.

Mark the batch "dispatched" in `STATUS.md` as you go.

**Visitor scores.** Also start one **visitor-scout** agent (`subagent_type: "visitor-scout"`, Sonnet) for the whole site, alongside the first batches, unless `sites/<id>/visitor-scores.md` already exists. Brief it with the site id and name and the list of sights. It writes `sites/<id>/visitor-scores.md` and `sites/<id>/research/visitors-stops.json`. Stop-researchers don't set `wow` or `popular`.

## 3. Review each batch as it returns
Read the batch files. You are checking judgement, not formatting, which `site-check` covers:
- **Is it interesting?** Would the family want these bullets read out? Is bullet 1 a real headline?
- **Is it sourced properly?** Watch for site-specific claims resting on "general knowledge".
- **Is it plausible?** Do dates agree with the listing entries, and do names match across batches?
- **Is it well formed?** Are notes sections 150–500 words, each about one thing, with sensible `About:` ids?
- **Do the event explanations answer the obvious questions?** Who bought it, what burned, who was affected? Do they agree with the notes?

Send the batch back to its agent (SendMessage) with specific fixes if needed. Only fix small things yourself.

For the **visitor scores**, check:
- Enough accounts (at least 20), and independent ones rather than one review copied around.
- Mentions matched to the right stops.
- `wow` changes that make sense to you.
- Then decide:
  - **`mustSee`:** usually the stops with the highest combined `wow` and `popular`. Set it in `visitors-stops.json` for the two or three you choose, and `false` for any you're demoting.
  - **New stops:** for popular things that aren't stops, add a stop and a research batch if they are worth it, or note them as a flag if not.
  - **Complaints:** recurring ones go into stop `note`s or flags.

## 4. Merge
- `node tools/merge-research.mjs <id> --dry`, read the report, then run it without `--dry`.
- **Photos.**
  - If the merge added photos to `sites/<id>/photos-wanted.json`, push `sites/<id>/photos.request` containing `download`.
  - The workflow saves the images to `tours/<id>/img/` and the credits to `tours/<id>.photos.json`. Then `git pull`.
  - Set `"photos": "tours/<id>.photos.json"` in the tour if it isn't there.
  - Check that every `photo` id in the tour has an entry in that file.
- `node tools/validate-tour.mjs tours/<id>.json 120` and `node tools/check-knowledge.mjs <id>`. Leave mechanical warnings for `site-check`; fix errors that block merging.
- Check the validator's "no popular score" note is gone.
- Mark batches (and visitors) merged in `STATUS.md`, add flags, set `Stage: reference`, commit and push (`<site>: research batches merged`).

## 5. Hand on
If this chat has grown large, stop here and tell Eliot to say "continue <site>" in a new chat. Otherwise invoke the **reference-packs** skill.
