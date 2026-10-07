# Mahjong Seat, Call and Payment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct ordinary drag release, opponent North perspective, visible public calls and Mahjong Soul public-default sanma counter payments with readable settlement deltas.

**Architecture:** Sequential small changes to existing GameRoom and its geometry hooks, followed by a bounded scoring correction and result component. Reuse authorized faces, projection/flight code and rules engine. Shared client edits are sequential; each task receives a separate gate before the joint publication review.

**Tech Stack:** Existing React/TypeScript/WAAPI, SanmaGame/majiang-core, Vitest and Chromium/WebKit.

**Spec:** `docs/superpowers/specs/2026-10-07-mahjong-seat-call-payment.md`

## Global Constraints

- Only release couple-home files; no academic/shared-root/credentials/real-data changes or dependency additions.
- Use original/licensed existing faces and shared camera; never copy vendor art/audio/client implementation.
- Preserve legal Choice payloads, server snapshot fields, exact red/instance identity, pointer capture, contextual actions and cumulative North.
- Never infer a concealed opponent source or duplicate physical identity; ambiguous events settle to authoritative state.
- Drag threshold12px; call flight230ms/group emphasis900ms are product choices, not measured vendor timings.
- Adopt the publisher's public sanma counter default200 as configuration-derived inference; preserve yonma300, tsumo100 per payer, sticks1000 and current multi-ron priority.
- Display authoritative signed delta; no client deduction formula or invented final aggregate.
- Fresh physically valid engine and actual browser geometry/pixels are required; emulation is not Android-device acceptance.

## Review Focus

- Ordinary drag clear of rack should submit once; returning to rack/HUD/cancellation/new decision should not submit.
- Rotated four-North group must fit its side anchor and retain upright count text without covering rack/river.
- A rapid call while previous discard flight still hides its river source must not teleport from an invented source.
- Red called tile, kakan added layer, coalesced/reconnect/silent updates must not replay a previous pon.
- Correcting sanma surcharge alone must not alter displayed base value; multi-ron UI must not manufacture a combined total.

---

### Task 1: Rack-exit discard and opponent North orientation

**Files:** Modify `src/components/mahjong/mahjong-client.tsx`, `src/app/mahjong/mahjong-table-edge.css`, `src/app/mahjong/mahjong-interaction.css` only if cue/copy needs it. Create `src/components/mahjong/discard-drop-zone.ts` if a pure geometry predicate is needed. Tests `tests/component/mahjong-game.test.tsx`, new `tests/browser/mahjong-seat-drag.tsx` and optional `tests/unit/mahjong-discard-drop-zone.test.ts`.

**Interfaces:** Consumes existing active pointer, legal Choice/intent and actual table/own-rack hit geometry. Produces one shared drop predicate for move preview and end release; public North tile-group CSS gets actor-relative orientation without rotating labels or changing rack signs. Later tasks retain these gestures and projection.

- [x] Write new real-browser failing `ordinaryClearRackDrop` and `sideNorthSharesSeatPlane` using retained audit's legal real-engine fixtures and fresh pages, at667×375/844×390/1440×810 Chromium/WebKit. Assert exact once-only ordinary Choice after whole tile is clear on felt, source instance/geometry, side±90° local basis and full visible North quads. Add drag-back, outside-board, HUD, pointercancel/lost-capture and changed-decision protection; four-North physical scene verifies footprint/count.
- [x] Run genuine RED before runtime code; retain unique logs/JSON and setup-success/missing-behavior assertion.
- [x] Implement shared actual playable release predicate using own rack top/actual surface and interactive/opponent exclusions; retain12px/capture/latch/click suppression and double-tap. Apply relative North physical-group rotation with reserved footprint and upright count; existing ordinary rack/meld/river signs stay unchanged. Do not add arbitrary bigger badges or a new camera.
- [x] Run focused changed component/unit tests, typecheck and new browser matrix; existing riichi drag/own reflow acceptance may run ONLY after preserving its fixed audit outputs (archive exact bytes before run, save fresh nuki/seat-specific copies afterwards, restore old files). Also rerun changed nuki browser acceptance because target orientation affects it, under unique NUKI_STAGE. Validate actual compositor for side groups and target source/endpoint, finite cleanup and input.
- [x] Commit owned task files, full report with commands/exits/source hashes/RED/GREEN/relevant limits in task-1-report.md. No full suite/build/deploy/root docs.

### Task 2: Public river-to-meld motion and caller emphasis

**Files:** Create `src/components/mahjong/public-call-motion.ts`, `src/components/mahjong/use-public-call-motion.tsx`; modify `src/components/mahjong/mahjong-client.tsx`, `src/components/mahjong/mahjong-meld.tsx` only for stable public IDs, `src/components/mahjong/use-discard-motion.tsx` only for reusable public-flight kind, `src/app/mahjong/mahjong-discard-motion.css`. Tests new `tests/unit/mahjong-public-call-motion.test.ts`, `tests/component/mahjong-public-call-motion.test.tsx`, `tests/browser/mahjong-public-call-motion.tsx`.

**Interfaces:** Consume Task1 unchanged gesture/camera and existing projected measurement/flight types. Produce `acceptedPublicCallEvent(before:RoomView|null, after:RoomView)` with actor seat/meld index/identity and optional uniquely proved claimed river source; `usePublicCallMotion({room,ownSeat,connected,canAnimate,tableRef})` returns finite flight/finish/cancel. Exact event interface may use a discriminated union for new meld versus kakan, documented in report. Stable DOM IDs include actor seat and meld index; source is actual previous river event ID, target exact `data-called` face or added kakan layer. Call input cancels visuals before submitting legal Choice.

- [x] Write meaningful browser RED for real red-five pon: public source disappears and target teleports without continuation/emphasis. Unit/component tests cover exact marker/face/identity/version proof, kakan versus append, missing/hidden source fallback and cleanup.
- [x] Confirm genuine RED before runtime changes, retain unique artifact paths.
- [x] Implement public-only230ms transfer and900ms exact actor-group emphasis. Cache current valid river geometry, hide only a proven new target during flight, and restore on all exits. Do not infer concealed supplying tiles. Hidden/in-flight old source falls back to group emphasis. Quiet updates preserve fixed deadline; initial/reconnect/new quiet/coalesced events do not replay. Refresh/invalidate geometry before events after resize, as fixed nuki hook does. No timer or input delay.
- [x] Run focused tests/typecheck and real Chromium/WebKit browser cases: yonma chi/red pon/open kan and sanma pon/open kan at all three sizes with own/opponent actor; real kakan/ankan emphasis and rapid hidden-source fallback. Measure source/midpoint/called-target quads, one visible called face, exact red identity, finite group deadline, quiet/interrupted/resize-before-acceptance cleanup and page errors. Preserve prior audit files and inspect one actual compositor midpoint.
- [x] Commit/report exact results and limitations to task-2-report.md; no broad suite/deploy.

### Task 3: Published sanma counter default and readable authoritative result

**Files:** Modify `src/modules/mahjong/sanma-scoring.ts`, `src/modules/mahjong/sanma.ts`, `src/components/mahjong/mahjong-client.tsx`, `src/app/mahjong/mahjong.css`; create `src/components/mahjong/mahjong-settlement-panel.tsx` for focused result rendering if extracting it. Tests `tests/unit/mahjong-sanma.test.ts`, new `tests/component/mahjong-settlement-panel.test.tsx`, new `tests/browser/mahjong-settlement-payment.tsx`.

**Interfaces:** Existing `sanmaPayment(Payment):number[]` and `Settlement.points/delta` payload unchanged. Optional shared exported constant `SANMA_HONBA_POINTS=200` used by payment and base-value recovery. Result component consumes current `GameView` and `RoomView`, displays fixed-seat current score and signed current-settlement delta with winner/method/value/fu/han/yaku/tiles/ura; no derived cumulative final score.

- [x] Write RED for child mangan ron, honba2: exact delta `[0,8400,-8400]` (currently8600); dealer/child zero/nonzero counters, stick and responsibility conservation; physically valid SanmaGame settlement keeps base value1600 while child ron honba2+stick1 has `[-2000,3000,0]`. Use audit fixtures, clearly label seeded counter bookkeeping. Browser/component RED asserts explicit hand-value label and actual per-seat gain/payment, readable three/four-seat layout and no invented total on multi-ron.
- [x] Confirm RED behavior before code; save unique logs and first-party source refs, not rewritten before-state evidence.
- [x] Use public-default200 in both ron surcharge and base-points subtraction. Ordinary dealer/child/fu/han/tsumo/deposits/pao/multi-ron priority stay intact. Present authoritative result with prominent winner/method/hand value and gained/paid/unchanged deltas, current fixed-seat score, concise counter/pot explanation and sanma tsumo-loss; preserve winning closed/meld/winning/ura faces and reachable acknowledgement. Reuse current licensed portraits/theme, no vendor images/client code.
- [x] Run focused sanma/result/winning-hand tests and typecheck; real-engine/browser dealer/child ron/tsumo, honba/deposit, yakuman/pao and separate multi-ron presentation in both engines/all three sizes, with actual displayed deltas, winning face count and ack hit accessibility. Official server-packet parity and unresolved double-ron counter priority are explicitly not claimed.
- [x] Commit/report exact commands/evidence/scoring source/limits to task-3-report.md. Root owns Linux scoring checks and final integration/publication batch.

### Task 4: Shared seat lanes, refreshed felt and tile-bearing action choices

**Files:** Modify `src/components/mahjong/mahjong-client.tsx`, `src/app/mahjong/mahjong.css`, `mahjong-camera.css`, `mahjong-table-edge.css`, `mahjong-table-center.css`, `mahjong-standing-tile.css`, `mahjong-meld.css` only as required for shared anchors/theme; create `src/components/mahjong/mahjong-call-option.tsx` if extracting bounded choice presentation. Tests new `tests/component/mahjong-call-option.test.tsx`, `tests/browser/mahjong-seat-theme.tsx`; modify existing browser `mahjong-nuki-sequence.tsx`, `mahjong-hand-reflow.tsx`, `mahjong-table-projection.tsx`, `mahjong-public-call-motion.tsx` only where production CSS order/new lane acceptance requires it. No runtime motion hooks or engine changes.

**Interfaces:** Consume completed Tasks1–3 unchanged legal choices, native rack-top drop predicate, stable room/seat/meld/North/hand IDs, projected paint and exact public motion target measurements. Define shared table-local rectangular seat lane coordinates/floor anchors and document the deliberate local floor-to-line inset. Existing camera produces the screen perspective once. Choice preview consumes existing `Choice.value`/Meld renderer; labels and exact ids retain their actions. All modified native harnesses load the complete current production CSS order, including standing layer.

- [ ] Use retained seam audit's valid physical kan snapshots and actual z=0 probes to establish genuine RED for side floor/line angle and north placement. Add native three-/four-seat legal chi/red pon/open/closed/added-kan choice previews, including multiple variants and exact red IDs, disabled/busy/disconnect/decision-change cases. RED must assert missing actual button tiles and line alignment, not a CSS spelling.
- [ ] Preserve original missing-behavior proof in unique artifacts before product edits. Review actual pinned Akagi screenshot and focused reference source from `.local/audit/akagi-ui-reference.md`; assets remain reference-only.
- [ ] Replace pre-perspectived trapezoid with one local rectangular lane family and shared floor anchors. Preserve existing actor signs, physical dimensions, exact projected measurement pipeline and own stable touch rack. Use quiet charcoal/blue original static felt texture/rim and restrained Akagi-inspired panel hierarchy across Mahjong lobby/table/result. No shader, animated texture, dependency or reference asset copy.
- [ ] Render actual legal chi/pon/kan combinations in action buttons; retain contextual visibility/labels and legal Choice. Multiple distinct combinations remain selectable, never silently choose/collapse red variants. Preview children cannot intercept button hit handling. Preserve call/nuki/discard cancellation and current result's authoritative deltas.
- [ ] Focused component tests/typecheck and Chromium/WebKit at667×375/844×390/1440×810: actual standing floor/line angle≤1°, documented local perpendicular inset at both row endpoints, public group baseline against actor lane, legal kan west/north/east and three-player side North1–4; no clipping/intersection with HUD/river/actions/touch rack. Actual choice face counts/red identity/one legal click and multi-option choice selection. Inspect native compositor frames for table, choice dialog and result. Geometry/theme changes require relevant nuki/public-call/drag/own-reflow regressions on complete production CSS; preserve every fixed-name existing audit byte before invoking old runners and retain new uniquely named results.
- [ ] Commit owned files and full task-4-report.md with actual commands/exits/RED/GREEN/source and compositor hashes, chosen lane/inset, reference attribution and remaining limits. Root handles joint review/full checks/publication.

One joint final review covers this plan and the completed nuki plan, including its recorded historical audit-loss minor and runtime source correction. Root then runs final appropriate full/E2E/projection/production checks once on stable reviewed source, Linux payment checks, fresh public validation/backup and guarded primary sync before claiming live completion.
