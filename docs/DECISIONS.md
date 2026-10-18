# Decisions Log

Plain-language record of decisions that change the defaults in `PLAN.md`. Newest at the bottom.

| Date | Decision | Reason | Consequences |
|---|---|---|---|
| 2026-10-18 | **Q2: the repository is public.** Phone app is hosted on GitHub Pages from this repo. | Owner confirmed. GitHub Pages is free for public repos and needs no extra account. | If the repo is later made private, hosting moves to Cloudflare Pages (free, about an hour of work). |
| 2026-10-18 | **Nothing personal is ever committed.** No handoff document with health details, no trial-log health notes, no backups, no screenshots of your data. The de-personalised requirements live in `PLAN.md`; your answers live only in the app on your phone. | The repo is public, so anything committed is readable by anyone and stays in history even if deleted later. | Checklist items 1 and 43 updated. The implementer must refuse to commit a file that contains personal health information and ask for a de-personalised version instead. A `.gitignore` entry for `*.backup.json` and `docs/handoff/private/` is added in checklist item 9. |
| pending | Q1: relay hosting (Cloudflare Worker by default). | Awaiting owner. | — |
| pending | NZ Food Composition Database vs USDA data (checklist item 8). | Awaiting terms clause 4. | — |
