# Mahjong physical discard sequence

Spec: the user-provided continuing goal in this task: standard authorized Japanese tile faces, Mahjong Soul-like table placement and whole discard experience, including the wall-generation mechanism. Full success remains unproven. This plan addresses two measured breaks in that experience together; it does not redefine the goal. Current verified live source is 6380ef0, documentation HEAD cd6f2e7.

## Evidence and design

The pinned cf790 real-server Chromium/WebKit touch probes show surviving tiles moving 42.5 CSS px and the drawn tile moving 139.67 px instantly at the accepted snapshot. The official 918–920s reference shows the drawn tile joining the sorted hand; its intermediate transfer is obscured, so keep the server's final ordering rather than infer the discarded slot. The same probes show opponent flip planes about 1–2px high at 115ms despite adjacent six-face standing tiles. Add a real volume during the whole flip, retaining exact source-back and target-front anchoring. Existing timing is a product parameter, not measured vendor timing.

## Global Constraints

- Work only in couple-home/.local/riichi-release on codex/riichi-four-player; leave the academic app and root project files/processes/data alone.
- Keep server Choice validation, decision IDs, payloads, rules, bot resource limits and wall generation unchanged. Client-only geometry/identity cannot enter server messages or reveal opponent concealed faces.
- Start hand movement only after a matching accepted own discard; selected or sent inputs alone cannot rearrange the hand. Preserve sorted authoritative target order, exact red-five value, duplicate instances, drawn hand separation and selected/dragged tile origin.
- Both animations must be finite, cancel cleanly on scope/connection/environment changes, respect reduced motion/hidden document, avoid replay on initial GET/reconnect/duplicate snapshots, and preserve ongoing motion on a quiet update. No dependency, model, permanent RAF/timer or alternative game state.
- Maintain source and endpoint geometry, material continuity, live operation visibility, actual input hit regions, river/event dedupe, nuki cumulative tray and authorized assets. Actual browser pixels/geometry must support volume and reflow claims; styles alone are insufficient.
- Use Chromium and WebKit at 667×375, 844×390 and 1440×810; report evidence and limitations, and do not call macOS browser checks Android acceptance or complete vendor parity.
- Deployment destination remains the explicitly authorized Shanghai ECS / HTTPS 8.133.186.15. Preserve original database/photo/session digests, cleaner CID/image, reviewed publisher/helpers, complete backups and exact previous live rollback. Root alone deploys after combined verification and review.

## Task 1: Accepted own-hand reflow

Files owned: src/components/mahjong/mahjong-client.tsx, src/components/mahjong/use-hand-reflow.tsx, src/components/mahjong/hand-reflow.ts, tests/unit/mahjong-hand-reflow.test.ts, tests/component/mahjong-hand-reflow.test.tsx, tests/browser/mahjong-hand-reflow.tsx.

Implement a bounded transition from actual pre-acceptance locations to the authoritative sorted hand after a matching own discard, covering transferred drawn tile, surviving duplicates/red tiles, normal and riichi discards, double tap and real drag. Match physical occurrences using actual source instance; do not approximate by the new positional keys. A separate translate animation is preferable to overwriting selection/drag transforms, but choose the implementation after inspecting current input and lifecycle logic. Cancel motion immediately on real new hand input. Test the actual measured jump RED before implementation; cover quiet update, next draw, first mount/reconnect, resize/reduced/hidden/cancellation and no legal/Choice changes.

## Task 2: Solid opponent flying tile

Files owned: src/components/mahjong/use-discard-motion.tsx, src/app/mahjong/mahjong-discard-motion.css, src/components/mahjong/mahjong-solid-flight-tile.tsx if needed, tests/component/mahjong-solid-flight.test.tsx, tests/browser/mahjong-solid-flight.tsx, tests/component/mahjong-discard-motion.test.tsx.

Replace two-plane opponent card with an actual six-face volume using the existing ivory/orange tile set. Its back plane must coincide with the cached source at start and face with actual river at completion; keep own source-paint animation and real quadrilateral movement. Thickness must remain visibly painted at the halfway flip in both engines, verified by finite-animation pause/actual screenshot or video pixels. Do not reveal a concealed opponent value until it is the public accepted discard. Cover each opponent orientation, sanma/yonma, red five/tsumogiri/riichi, source/target paint and lifecycle. Do not edit Task 1 files or global table layout.

## Task 3: Combined review, acceptance and publication

Root owns tests/browser/mahjong-table-projection.tsx and the plan/acceptance/progress docs. Capture full primary ownership baseline before tracked changes. Independently review both task packages with exact diff and reports. Resolve Critical/Important findings, record Minor items. Run meaningful combined coverage: current 48-flight projection, complete unit/integration, existing 26 multiplayer browser regression, build/type/secrets. No broad repeats without an amended source or unresolved evidence.

Freeze exact source/build; publish through unchanged guarded helpers only after fresh read-only room/data check, then verify actual publisher exit, gone, live runtime/public hashes, all original data, full/offsite backup and rollback. Sync only owned files to primary against baseline and report true residual gaps (camera/timing/official wall protocol/Android).

## Preflight interfaces

| Tasks | Shared relationship | Resolution |
| --- | --- | --- |
| 1 and 2 | GameRoom provides local intent to the existing discard hook; both animate one accepted snapshot | Separate files; source-paint/geometry schema stays unchanged unless root adjudicates. Each observes server acceptance rather than advancing game state. |
| 1 and 3 | Reflow changes own tile motion while projection reads source/target geometry | Root tests current sources after both tasks; exact local source and hit testing remain invariants. |
| 2 and 3 | Solid card changes interior planes while projection anchors outer movement | Task 2 verifies real back/front endpoints, root preserves meaningful geometry/material assertions. |

No contradictory requirements found. Prior Minor: outline shorthand can disappear discretely midflight; defer for final review rather than claim continuous interpolation. All notes and test reports are app-local ignored artifacts; tracked acceptance will record actual outcomes.
