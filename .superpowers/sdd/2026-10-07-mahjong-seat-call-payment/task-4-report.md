# Task 4 report — shared seat lanes, felt and legal call previews

Status: DONE, local bounded implementation. Base `f86808f9d554b6de66f942fcd7034fece357a39e` on `codex/riichi-four-player`. The Task 4 implementation commit is the commit containing this report (exact SHA returned to controller). No deployment, remote mutation, dependencies, engine changes, motion-hook edits, primary checkout changes or academic changes.

## Scope and implementation

Read the brief first, root PLAN/app specs/plans, task spec, retained seat-seam audit and pinned reference. Used SDD implementer, TDD, systematic-debugging and verification-before-completion instructions. Controller explicitly bounded verification to focused checks; no broad suite or build was run. Controller narrowly extended ownership to the existing chi component expectation: called-first `p2,p1,p3` and exact called `p2`; the same actual Choice and normal-tile accessible label remain.

- Replaced the pre-perspectived SVG trapezoid with one local rectangular line. Retained the exact single perspective camera, actor signs, physical tile dimensions, own stable touch rack, native drag predicate/capture/exclusions, motion IDs, projected paint and exact accepted-call measurements.
- One family: left/right 12%/88%, north 9%, south 86% of the surface containing block. Opponent rack origins are their front-bottom baseline with unchanged west/east ±90° and north180°. The inner/rear standing floor axis is **6 local CSS px outward from the line**; the front floor axis is another actual standing-body depth outward. Both concealed and public meld groups align to that front baseline; public tiles retain their existing z=1px lift. Own concealed controls remain on their original independent touch lane. The west landscape along-row HUD clearance remains.
- Quiet original charcoal/blue gradients, existing static grain, dark rim and restrained lobby/table/result panels. No shader, animation texture, copied art/code/model or service added.
- Added a small presentation-only MahjongCallOption that consumes the exact Choice.value using existing MahjongMeld. Single and multi-choice entry buttons show every full combination; dialogs preserve distinct Choice IDs and show called/added layers and closed-kan backs. Preview descendants and their wrapper cannot intercept native pointer hit. Dialog names identify red fives as 赤5. Existing cancellation before call input and settlement authority are untouched.
- Older nuki/reflow/projection harnesses now load complete production CSS in this order: mahjong, river, meld, interaction, discard-motion, table-center, table-edge, camera, call-announcement, standing-tile. Existing public-call and seat-drag harnesses already did.

## RED evidence before product edits

Logs are retained under `.local/audit/task4-red-component/`; original artifacts were never overwritten.

1. `npm test -- tests/component/mahjong-call-option.test.tsx` → **exit1**, 6 failed/3 passed. Full actual button tile faces were absent (0 against expected3/4/2, including six multi-pon preview faces). `run-exit.log` is the explicit exit1 repeat; initial `run.log` was wrapped with tail and its shell exit was0 even though tests failed.
2. `THEME_STAGE=red PLAYWRIGHT_BROWSERS_PATH=/Users/Max/Workspace/personal/个人工作台/couple-home/.local/browsers node_modules/.bin/tsx tests/browser/mahjong-seat-theme.tsx` → **exit1**; 18 retained physical real-engine kan scenes, actual standing z=0 contact axes miss side painted seams by14.5–16.9°. Artifacts: `.local/audit/seat-theme-red-1791365911959/`, log `native.log`.
3. Same command with `THEME_STAGE=red-inset` → **exit1**, now including native projected expected local rear-floor probes for north and side placement. Artifacts: `.local/audit/seat-theme-red-inset-1791365978978/`, log `native-inset.log`. This is still before product edits. Both source and initial compositor proof remain intact.
4. Later accessible red-label regression: same component command → **exit1**, 1 failed/8 passed, label did not distinguish 赤. Retained `red-accessibility.log`; then implemented red wording and reran GREEN.

## Verification commands and actual outcomes

All browser commands below used the exact `PLAYWRIGHT_BROWSERS_PATH` shown above. Output logs are in `.local/audit/task4-red-component/`.

| Command (after env prefix) | Actual result | Log / unique artifact |
| --- | --- | --- |
| `npm test -- tests/component/mahjong-call-option.test.tsx tests/component/mahjong-game.test.tsx tests/component/mahjong-meld.test.tsx tests/component/mahjong-table-projection.test.tsx tests/component/mahjong-standing-tile.test.tsx tests/component/mahjong-settlement-panel.test.tsx` | exit0;71/71,6 files | component-final.log |
| `npm run typecheck` | exit0, final source and final harness | typecheck-final-harness.log |
| `THEME_STAGE=final-all-choices node_modules/.bin/tsx tests/browser/mahjong-seat-theme.tsx` | exit0;66 physical scenes,54 action cases,84 exact legal selections,18 actual compositor frames; no runtime errors | theme-final-all.log; seat-theme-final-all-choices-1791366629726/ |
| `SEAT_STAGE=task4-final-source node_modules/.bin/tsx tests/browser/mahjong-seat-drag.tsx` | exit0;96/96 | seat-final-source.log; seat-drag-task4-final-source-1791366671866/ |
| `CALL_STAGE=task4-final node_modules/.bin/tsx tests/browser/mahjong-public-call-motion.tsx` | exit0;84 native cases | public-call-final.log; public-call-task4-final-1791366524546/ |
| `NUKI_STAGE=task4-final node_modules/.bin/tsx tests/browser/mahjong-nuki-sequence.tsx` | exit0;24 native sequences plus pre-acceptance resize probes | nuki-final.log; nuki-sequence-task4-final-1791366573991/ |
| `python3 .local/ecs-deploy/preserve-seat-call-payment-reflow.py` | exit0;12 reflow evidence cases;12 prior fixed files restored byte-for-byte | reflow-final.log; seat-call-payment-theme-reflow-preservation-1791366646915352000/ |
| `python3 .local/ecs-deploy/preserve-seat-call-payment-projection.py` | exit0;48 projected flights plus table measurements;33 prior fixed files restored byte-for-byte | projection-final.log; seat-call-payment-final-projection-preservation-1791366670253892000/ |
| `SETTLEMENT_STAGE=task4-theme SETTLEMENT_FIXTURES=sanma-open-ron,riichi-tsumo,yonma-actual-riichi-ura,sanma-actual-riichi-ura node_modules/.bin/tsx tests/browser/mahjong-settlement-payment.tsx` | exit0;24/24;4 exact non-empty named fixtures | settlement-regression.log; task3-browser-task4-theme-1791366498730/ |
| `git diff --check` | exit0 | self-review |

Earlier focused GREEN had9 new component tests, then65 across5 files. Earlier seat96 and theme54 passed before the final accessibility/wrapper polish; final-source runs above supersede them. No passing claim relies on those earlier runs.

Intermediate failures were investigated and retained: first geometry GREEN failed a0.3px endpoint tolerance only on WebKit667 (observed subpixel residual≈0.52px); acceptance now uses0.75px native endpoint tolerance while retaining strict≤1° angular requirement. First native choice iteration tried clicking the last chi option while it was below the scroll viewport; the harness now scrolls that actual option into view before hit-testing. Next iteration checked an engine meld before outstanding responders passed; the harness now submits each actual legal pass before authoritative acceptance. Initial typecheck found two nullable RoomView.game uses only in the new test; corrected. Logs `native-green.log`, `choices-green.log`, `choices-green-scroll.log`, `typecheck.log` retain these failures. Product inputs did not need a workaround for those harness assumptions.

## Geometry and behavior acceptance

Matrix: Chromium/WebKit ×667×375,844×390,1440×810.66 scenes = retained legal kan in each west/north/east actor position plus real SanmaGame side North1–4 for both viewers. No fabricated concealed counts/private tiles. Every generated legal action wall consumes and conserves the physical tile set; authoritative engine accepts all84 chosen IDs. Sanma has no legal chi; chi is covered in yonma, all pon/open/closed/added-kan kinds in both variants.

Native zero-size probes on actual standing bodies measure both z=0 rear and front endpoints; expected floor lines are themselves browser-projected probes in the shared table-local family. Public footprint baselines use matching z=1px native probes. No affine fit, top-face substitution or AABB stands in for floor contact. Projected separating-axis checks found no physical-face/slot clipping or intersection with seat HUD, dora, rivers, North trays, actions or own touch rack in the66 geometry scenes.

Final maxima: standing/line angle **0.291054°**; public-kan/line angle **0.107223°**; rear endpoint residual **0.518552px**, front **0.517861px**, public baseline **0.508555px** against the declared local6px+depth family. The0.75px endpoint tolerance permits browser subpixel layout differences; no per-viewport coordinates are fitted.

Action tests cover all real legal red/ordinary alternatives, full entry face counts and each visible face's actual native button hit, closed backs, exact IDs, every dialog option selected, native busy/disconnected disabled states and stale-decision dialog removal. Component tests additionally cover exact added red layer and called marker. Existing public-call cancellation/target geometry, nuki/reflow and frozen rack drag contracts passed their final-source regressions.

Result tests preserve authoritative signed transfers/current scores, hand values, ura, complete winning-row horizontal scroll, reachable sticky acknowledgement and contrast. Short landscape panels intentionally retain vertical scrolling to reveal the full winning/yaku content; sticky Continue remains available.

## Source, bundle and compositor evidence

Final proof: `.local/audit/seat-theme-final-all-choices-1791366629726/proof.json`. All source hashes captured at start and end match. It includes the listed source/CSS/test/fixture hashes, full geometry, native choices, selection IDs, runtime errors(empty), and18 compositor hashes. `bundle.js`, `style.css`, real legal choice snapshots, per-case entry/dialog screenshots and original recorded WebM files are retained beside it. Product hashes:

- `src/components/mahjong/mahjong-client.tsx` — `93c3faed92dec472b2347d9419ee5aadd93b10a0f919f510f613787141a7c81a`
- `src/components/mahjong/mahjong-call-option.tsx` — `5527187988b026c196a542f92747c5a1564e705e4816ddd2f5741987cdb614a2`
- `src/app/mahjong/mahjong.css` — `a7cbde67720861180b8cdfec224e5fbf1edf9d71ef61dcdb6169a3d13e3063a8`
- `src/app/mahjong/mahjong-table-edge.css` — `383fd9ed69a8e5e2e83453ec6f58ab5785c87a21f61ae78a613ee85e2132fe9c`
- `src/app/mahjong/mahjong-camera.css` — `a85bc10cecf337bc5f192f644949e6442398f22b4c5eb84f1035b63e6aabff53`

Bundle SHA256: `cedf29679df0f4eadd05eb245a3dcffb31c7a9b7f53ef130a63db37b585349f0`; full production CSS SHA256: `7d5fe0bc5bc642188a95b22f28b06459ed0916a0e9e434923baaf19082ece30a`.

Representative844 compositor SHA256 (all18 live in proof.json):

- `chromium-844-table-compositor.png` — `ab5a23febdc9d9058bfae32521b470fa9aee204b4ebe3eb8fae90a8149820977`
- `chromium-844-dialog-compositor.png` — `df5566c5193d85881ec0556353c4d5e8d79350d3db53b3230b9d6543cbfa5044`
- `chromium-844-result-compositor.png` — `29b5dccaee5531a6bc6273834bbf27bfeb0d1611788b85860a592f80a64d95a1`
- `webkit-844-table-compositor.png` — `1f99cac0bc6fa8401d5641b98775c5dec55c00920c9e71089882511ecfb0fb14`
- `webkit-844-dialog-compositor.png` — `5043f11280f0a0cd4a41db8a3d6091d581ff25d54a9e08c19b7b17bce18e0a83`
- `webkit-844-result-compositor.png` — `84d2073f18488b9d6bc71804f9a9ad9219cefa81672be7c706e368290f2d2d26`

Actual images inspected with view_image: the pinned Akagi screenshot; final-source table/dialog/result at844 in both logical states (WebKit), and latest final-all-choices Chromium667 table/result, WebKit667 dialog, WebKit1440 table/result, Chromium1440 dialog. The844 preceding final-source compositor set has the same product hashes; the latest set is retained with its own hashes. Inspection confirms restrained dark surfaces, visible seat-plane tile feet, distinct red/ordinary call alternatives, and readable score/ack hierarchy. Snapshot and compositor are separately named; these are actual recorded browser frames, not a DOM-only paint claim.

## Reference attribution and remaining limits

Inspected pinned Akagi v3 tree `cd68865f9e93eddcda6451cd18874a6f68c5fb49`: actual README screenshot (left separate Mahjong Soul client; right Akagi dashboard), BoardTile.css, BotActionTile.tsx and NOTICE. Its quiet panel hierarchy and tile-bearing action concept are reference only. Original screenshot SHA256 `da2ad0f3bda372add2da2280cb40941918cb75d9221329551cf5c640360802d3`; source/notice hashes stay in `.local/reference/akagi-v3/source-proof.json`. No reference screenshot, glyph, client code, asset or inference model was added to product.

No broad suite, production build, Linux payment gate, target-device acceptance, remote merge or publication performed. Root owns final joint review/integration and the newly discovered published-site lineage. macOS Chromium/WebKit evidence is not physical Android/Windows acceptance. All scene/viewport claims are limited to the named matrix, not all possible wall states or maximum four-meld arrangements. Historical missing nuki M1 evidence was not recovered or claimed. Existing empty SETTLEMENT_FIXTURES minor remains deferred to root and was not exercised as a vacuous pass.

Changed owned paths: mahjong-client.tsx, new mahjong-call-option.tsx; mahjong.css, mahjong-camera.css, mahjong-table-edge.css; new component call-option and browser seat-theme tests; existing narrowly approved chi expectation; existing nuki/reflow/projection CSS-order lists; this report. No runtime hook, engine, credentials, root or primary file changed. Controller's unstaged fidelity/plan docs remain excluded. Self-review found no outstanding functional failure in this bounded work.
