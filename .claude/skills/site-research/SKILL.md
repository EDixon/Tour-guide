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
- **Interests:** the family's interests, and the special angles for this batch.
- **Reminders:**
  - Every claim sourced.
  - Full years.
  - Toddler tasks only for things genuinely there.
  - Say when sources disagree.

Mark the batch "dispatched" in `STATUS.md` as you go.

## 3. Review each batch as it returns
Read the batch files. You are checking judgement, not formatting, which `site-check` covers:
- **Is it interesting?** Would the family want these bullets read out? Is bullet 1 a real headline?
- **Is it sourced properly?** Watch for site-specific claims resting on "general knowledge".
- **Is it plausible?** Do dates agree with the listing entries, and do names match across batches?
- **Is it well formed?** Are notes sections 150–500 words, each about one thing, with sensible `About:` ids?

Send the batch back to its agent (SendMessage) with specific fixes if needed. Only fix small things yourself.

## 4. Merge
- `node tools/merge-research.mjs <id> --dry`, read the report, then run it without `--dry`.
- `node tools/validate-tour.mjs tours/<id>.json 120` and `node tools/check-knowledge.mjs <id>`. Leave mechanical warnings for `site-check`; fix errors that block merging.
- Mark batches merged in `STATUS.md`, add flags, set `Stage: reference`, commit and push (`<site>: research batches merged`).

## 5. Hand on
If this chat has grown large, stop here and tell Eliot to say "continue <site>" in a new chat. Otherwise invoke the **reference-packs** skill.
