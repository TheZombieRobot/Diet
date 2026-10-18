# Handover Prompt for the Implementing Model (Opus 5.5)

Copy everything between the lines into a new Claude Code session running Opus 5.5, with the repository `TheZombieRobot/Diet` and the handoff file attached.

---

You are implementing a personal Android-first fitness, fasting, keto-aware meal planning and grocery app with a Chrome side-panel extension for PAK'nSAVE Pāpāmoa shopping. The plan is approved. Work on branch `claude/fitness-grocery-mvp-plan-xzbk8k` of `TheZombieRobot/Diet` and push there only.

**Read first, in this order, before writing any code:**
1. The attached handoff document `Personal_Fitness_Grocery_App_Claude_Handoff.md`. It is not in the repository and must never be committed, because the repository is public and it contains personal health details.
2. `docs/PLAN.md`, `docs/DECISIONS.md`, `docs/HEALTH_SAFETY.md`, `docs/INTEGRATION_FEASIBILITY.md`, `docs/TEST_PLAN.md`, `docs/UX_SCREENS.md`, `docs/DATA_MODEL.md`.
3. `docs/IMPLEMENTATION_CHECKLIST.md`. Then follow it in numbered order. Stop at every item marked STOP and wait for me. Items marked OWNER are mine.

**Decisions already made, do not reopen:** PWA with Vite, React, TypeScript, Dexie and Workbox, hosted on GitHub Pages; Cloudflare Worker + KV as the blind encrypted relay for the grocery list only; repo layout `apps/mobile-web`, `apps/cart-extension`, `packages/core`, `packages/ui`, `packages/grocery`, `packages/test-fixtures`, `services/relay`; bodyweight exercise by default with band and dumbbell toggles; a three-week Kickstart weight phase with a capped deficit, protein protected and no rapid-loss warnings, then a Steady phase; fasting presets 16:8, 18:6, 20:4, 22:2 and 23:1, with 23:1 as the Kickstart default and a daily single-meal protein and energy check that offers the 5 pm snack with no penalty.

**Hard rules:**
- Never commit personal data: no handoff, backups, photos, logs or trial notes containing health information. Fixtures are generic.
- Every health-sensitive formula lives in `packages/core` behind unit tests. All health text lives in one file so it can be scanned. The CI scans for banned phrases must stay green.
- The extension mode (A, B or C) is decided only by the Phase 0 spike recorded in `docs/INTEGRATION_FEASIBILITY.md` section 9. Build no extension code before section 9.3 records my decision. Never write code that reads or changes paknsave.co.nz pages unless mode A is recorded as approved, and even then never checkout, payment, credential or session-token handling, store changes, hidden errors or any bypass of security controls. Never scrape, reverse engineer, or copy a third-party extension.
- Never show a price, stock level or cart status that did not come from me (timestamped) or a permitted source.
- No AI calls at runtime. No dependency that phones home. No account required to use the app.

**How to work with me:** I do not read code. After each checklist item, tell me in two or three plain sentences what now works and what you tested. At each STOP, tell me exactly what to try on my phone or laptop and what to look for. If a site, licence or term blocks you, stop and ask rather than working around it. Commit after each item with the item number in the message, and push.

Begin with checklist item 1: confirm you have read the handoff and the seven documents, list anything in them that conflicts, then proceed to item 2.

---
