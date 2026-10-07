# Physical North Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep extracted North tiles tangible during travel and at their indexed public tray, without changing accepted game actions or replacement timing.

**Architecture:** Reuse the licensed standard TileFace and existing face-up flight cuboid. A persistent North body exposes the measured cap, base, contact and four joined sides, using depth = height × 0.4; the hook hides/restores cap and body together. The existing shared symmetric table camera and seat rotations remain authoritative.

**Tech Stack:** React 19, TypeScript, CSS 3D, WAAPI, Vitest and Playwright Chromium/WebKit.

**Spec:** User's physical tile/fidelity and North visibility requirements; existing `docs/mahjong-nuki-sequence-acceptance.md`. Confirmed baseline in `.local/audit/mahjong-full-flow-experience-report-20261007.md`.

## Global Constraints

- Only the isolated `couple-home/.local/riichi-release` source worktree; no academic application or root Git changes.
- Preserve `acceptedNukiEvent`, exact unique own North identity, authoritative count, 230ms transfer and `heldDecisionId` replacement gate.
- Do not infer another player's concealed North source. Duplicate/unknown own source keeps destination-only emphasis.
- Preserve tray footprint/seat orientation, symmetric `scale(.84)` table and own touch rack.
- Shanghai ECS publish is already authorized. Preserve the disabled-backup marker/timer and live cleaner. Do not create backups or download real user data.

## Review Focus

- An explicit visible cap must not bypass a hidden parent body; hide/restore both prior value and priority.
- Counts 1–4 remain visible and aligned at all three sanma seat orientations.
- The flight's final normal/depth matches the actual raised cap, without duplicated side walls.
- Cancellation, resize, reduced motion and unmount release hidden targets and the held replacement.
- New shared flight changes preserve discard/call behavior; actual browser paint, not WebKit software snapshots, judges visible perspective.

### Task 1: Physical North body and handoff

**Files:** Modify `src/components/mahjong/mahjong-client.tsx` (North tray only), `src/components/mahjong/use-nuki-motion.tsx`, `src/components/mahjong/use-discard-motion.tsx`; create minimal North body/CSS when needed; extend `tests/component/mahjong-nuki-motion.test.tsx` and add focused body/browser tests.

**Interfaces:** Consumes the unchanged accepted nuki event, `measureDiscardElement`, `FlightView`, `TileFace`, existing face-up cuboid and tray seat/index. Produces a persistent `data-nuki-volume` around the cap and a six-plane `kind="nuki"` flight with positive measured target depth.

- [ ] Add regressions that fail on the flat baseline: persistent sides absent, flight depth absent, cap-only hiding leaves body visible; run the focused Vitest files and retain actual RED output.
- [ ] Implement the minimal cuboid, nuki depth measurement and whole-target visibility lifecycle; keep public count and accepted rules unchanged.
- [ ] Run focused Vitest and typecheck; execute real-engine nuki → replacement → legal settlement in Chromium/WebKit, plus tray count/orientation and lifecycle cases. Save composited frames and endpoint geometry.
- [ ] Independent review of the final diff; resolve material findings and re-run covering checks.

### Task 2: Validate and publish the exact revision

**Files:** Update `docs/mahjong-fidelity-progress.md` and add the bounded acceptance record; ignored `.local/ecs-deploy/nuki-solid-*` release proof helpers.

**Interfaces:** Consumes Task 1 reviewed source, fresh parent 2a614ff manifest, exact build manifest and existing reviewed no-backup publisher. Produces source/build-bound Linux COPY-only image and actual public health/static SHA checks.

- [ ] Commit only owned reviewed code/tests/docs; run `npm test -- --maxWorkers=2`, build/type/secrets and relevant real served Mahjong E2E once on that exact clean revision.
- [ ] Freeze source/build/archive; check parent preservation and candidate SHA/path sets. Run protected readiness before any switch, keeping active-room guard and resource limits.
- [ ] Publish using the unchanged no-backup publisher; verify current image/Build ID, health, data digests, helper/cleaner preservation, policy marker and public assets.
- [ ] Sync only changed Mahjong/docs/test paths to primary after byte guards, preserving all foreign files, HEAD/index and next-env. Record actual results and remaining full vendor/Android limits.
