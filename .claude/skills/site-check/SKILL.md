---
name: site-check
description: Fifth link in the Tour Guide site chain. Mechanical checks and fixes (format-fixer agent, Haiku), then an independent fact-check (fact-checker agent, Opus, report only), then the lead fixes what matters and sends Eliot the flags. Hands on to site-publish.
---

# site-check: make it right before it goes on the phone

## 1. Mechanical (format-fixer, Haiku)
Run these and read the output:
```
npm test
node tools/validate-tour.mjs tours/<id>.json 120
node tools/check-knowledge.mjs <id>
```
If there are errors or many warnings, start a **format-fixer** agent with:
- the exact output
- the instruction to fix only mechanical problems: JSON syntax, missing fields, lower-case aliases, shortened dates, ids that don't match, sections without `Kind`/`About`/`Sources` lines
- the instruction to re-run the checks until clean

It must not change facts or wording beyond that. Review its diff (`git diff`) before accepting.

## 2. Facts (fact-checker, Opus, fresh context)
Start a **fact-checker** agent. Give it:
- the site id
- `sites/<id>/sources.md`
- the list of files to check
- a sampling instruction:
  - every bullet with `imp` 4–5
  - every date in `dates.json`
  - every claim sourced only to "general knowledge" or marked `verify`
  - a random 20% of the remaining notes sentences

It reports in `sites/<id>/factcheck.md`: claim, file, verdict (confirmed / wrong / unsupported / sources disagree), and evidence. It must not edit content files.

## 3. Fix and flag
- Fix every **wrong** item yourself (main chat), or send a batch back to a stop-researcher with the evidence.
- For **unsupported**: find a source or soften the claim ("is said to", "probably").
- For **sources disagree**: say so in the text and add a flag.
- Re-run the mechanical checks.

## 4. Try it as a visitor
- Run the planner at a few lengths with `node tools/validate-tour.mjs tours/<id>.json 60`, then 120 and 240. Do the plans make sense, is the order walkable, and do the must-sees appear?
- Build five prompts with `node tools/ask.mjs --tour <id> --at <stop> "<question>"`: a date question, a "who built this", a "why", a follow-up with "he/she", and something not covered. Do the facts and notes chosen look right? If retrieval picks poor sections, improve titles and `About:` lines rather than the code.

## 5. Hand on
Update `STATUS.md`: tick the check stage, set `Stage: publish`, and list what remains flagged under **Flags for Eliot**. Commit and push. Invoke the **site-publish** skill.
