# Accepted Nuki Sequence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make accepted North extraction visibly travel into its persistent tray, reflow the surviving own hand and sequence the replacement entrance without delaying input.

**Architecture:** A pure accepted-nuki diff guards a small finite client hook. Reuse existing measured projected flight rendering and own-hand occurrence matching; extend draw-arrival only to support an explicitly keyed visual hold. No engine or server changes.

**Tech Stack:** Existing Next.js/React/TypeScript, WAAPI, majiang-core/SanmaGame, Vitest and Playwright Chromium/WebKit.

**Spec:** `docs/superpowers/specs/2026-10-07-mahjong-nuki-sequence.md`

## Global Constraints

- Only this release checkout's couple-home files are writable; no academic, shared root, credentials or real user data changes.
- Transfer lasts 230 ms; survivor reflow lasts 250 ms; replacement uses its existing 220 ms entrance. These are product choices, not measured vendor timings.
- No rules, RNG, Choice payload, server snapshot fields, dependencies, bot behavior or persistent data change.
- Never infer a concealed opponent tile slot or claim identity between duplicate Norths.
- Authoritative choices and tile input remain immediately available; input cancels any hold/flight/reflow.
- Preserve cumulative North tray/count, contextual actions, red-face matching, ordinary discard flight and legal riichi drag.
- Fresh real engine/browser evidence is required; browser emulation does not establish Android real-device acceptance.

## Review Focus

- A rob-nuki window with unchanged count must not extract a tile or start replacement entrance.
- Repeated Norths must not assign an arbitrary physical source; the new public tray tile still receives finite emphasis.
- A quiet member/connection update during movement must not extend it or read animated positions as final geometry.
- New input while replacement is visually held must show the real replacement immediately and submit exactly once.
- Environment changes or an unfinished animation must restore original target visibility/styles, without hiding a North permanently.

---

### Task 1: Accepted nuki transfer, hand reflow and replacement entrance

**Files:**
- Create: `src/components/mahjong/nuki-motion.ts`, `src/components/mahjong/use-nuki-motion.tsx`
- Modify: `src/components/mahjong/mahjong-client.tsx`, `src/components/mahjong/use-discard-motion.tsx`, `src/components/mahjong/use-hand-reflow.tsx`, `src/components/mahjong/use-draw-arrival.ts`, `src/app/mahjong/mahjong-discard-motion.css`
- Reuse unchanged: `src/components/mahjong/hand-reflow.ts` occurrence matcher
- Test: `tests/unit/mahjong-nuki-motion.test.ts`, `tests/component/mahjong-nuki-motion.test.tsx`, `tests/component/mahjong-draw-arrival.test.tsx`, `tests/browser/mahjong-nuki-sequence.tsx`

**Interfaces:**
- Consumes existing `RoomView`, `GameView`, `measureDiscardElement`, `DiscardFlightLayer`, `matchHandReflowOccurrences`, `useDrawArrival`, actual `[data-hand-instance-id][data-tile-face]` and `[data-nuki-seat]` DOM geometry.
- Produces `acceptedNukiEvent(before: RoomView|null, after: RoomView): {seat:number; index:number; id:string}|null`, `uniqueOwnNorthInstance(tiles: readonly HandReflowTile[]): string|null`, and `useNukiMotion({room, ownSeat, connected, canAnimate, tableRef})` returning finite `flight`, `finishFlight`, `cancel`, `heldDecisionId`.
- `useDrawArrival` receives optional `heldDecisionId: string|null` in its existing source options, remembers the eligible draw decision while held and starts the existing entrance exactly once on release. `cancel()` discards a pending entrance.
- `useHandReflow` additionally recognizes the same accepted own unique-North event and matches only the server's closed targets; existing exact-discard intent path stays intact.
- Expose only the flight type/measurement helpers needed by the new hook; `DiscardFlightLayer` may accept an optional kind (`discard` default, `nuki`) for separate test identity. Preserve the original six-face opponent branch and own source paint interpolation.

- [ ] **Step 1: Write meaningful failing tests before runtime code.** Unit tests `acceptsOnlyConsecutivePublicNuki` and `uniqueNorthDoesNotGuessDuplicates` assert event/count/identity/river/meld/settlement gates and unique-source choice. Component tests `acceptedNorthRestoresTray`, `quietUpdateDoesNotReplay`, `inputReleasesHeldReplacement`, `robWindowIsNotExtraction` cover actual hook behavior including reduced motion/disconnect/environment/unmount. Browser `drawnNorth`, `closedNorthWithDrawnSurvivor`, `duplicateNorthFallback`, `secondNorthCumulative` use real physically valid SanmaWall/SanmaGame snapshots and click the legal nuki action.
- [ ] **Step 2: Run RED.** Retain command, exit status and genuine missing movement assertion, not a module-not-found setup error. Baseline browser should show actual source/target jump and lack of sequenced entrance. Unit tests may be staged after browser RED if pure functions do not yet exist.
- [ ] **Step 3: Implement minimal finite sequence.** Cache actual pre-update geometry, guard accepted event, measure the new indexed public tray face, hide it only for a valid own flight, and restore it on finish/cancel. For ambiguous/opponent source, animate only the actual added tray face. Reflow matching is exact face occurrence with the new drawn target excluded. Sequence visual draw entrance via keyed hold, and cancel all effects before any tile/action input without delaying or changing the Choice. Use finite WAAPI and existing projection/paint math.
- [ ] **Step 4: Verify GREEN and relevant regressions.** Run the new focused unit/component tests, existing hand-reflow/draw-arrival/discard-motion tests, `npm run typecheck`, the real nuki browser matrix in Chromium/WebKit at 667×375/844×390/1440×810, and existing own-hand-reflow browser acceptance after integration. Browser checks actual source/midpoint/target geometry, source ghost versus real target visibility, replacement hold/release/input cancellation, final cumulative count, duplicate fallback and finite cleanup. Fail on page errors. Save machine-readable evidence and one visible compositor midpoint (WebKit video frame if screenshot raster does not represent compositor). Do not rerun unrelated broad suites within this task.
- [ ] **Step 5: Commit and report.** Commit only named owned files, leaving generated evidence in `.local/audit`. Report exact commands/results, source revision, RED proof, geometry ranges, cancellation coverage, concerns and vendor/Android limitations to the task report. Do not publish or edit root deployment documentation.

Root handles independent task/final review, one appropriate full validation batch, frozen source/build, guarded ECS publication/backup and primary sync after task completion. Publication authorization and destination already exist; no repeated permission question.
