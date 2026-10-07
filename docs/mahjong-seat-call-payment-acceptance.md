# Seat, drag, public-call and payment acceptance — 2026-10-07

## Current status

Implementation follows `docs/superpowers/plans/2026-10-07-mahjong-seat-call-payment.md`; Task1 is approved at `f4fcb495` and Task2 at `99b642da`; Tasks3–4 and joint publication remain pending. Current public release remains `152e4fb`. No candidate from this plan has been frozen or published.

## Confirmed before-state

Read-only real-engine evidence `.local/audit/seat-drag-issue-audit.md` shows ordinary whole-tile rack-exit drops rejected in six engine/viewport combinations while center-only drops accept across18 isolated baseline cases. Opponents' public North faces stay at local0° instead of the corresponding±90° seat plane. Ordinary rack/meld/river ownership signs were not reproduced wrong.

`.local/audit/settlement-pon-rule-audit.md` records standard base/fu/han/deposit calculations and first-party current rule configuration. Official `DefaultDetailGameRule3.changbang_value=200`, labeled Continuance Counters Points, supports adopting200 per sanma ron honba together with the matching base-value subtraction. This is an inference from published configuration, not a verified vendor server packet. Yonma300, tsumo100 per payer, riichi1000 and existing double-ron priority remain unchanged. Official double-ron counter priority is still unresolved.

## Added visual steering

The subsequent18-case seat-seam audit proves side floor/line mismatch14.53–16.90° and public group mismatch14.71–17.14°. Task4 will share local rectangular lanes/floor anchors, refresh the felt and show actual chi/pon/kan faces in buttons. The pinned Akagi reference screenshot/code was inspected; it stays reference-only.

## Required acceptance

Task1 evidence: component25/25, native96/96, nuki24/24, preserved reflow12/12 and typecheck passed. `.superpowers/sdd/2026-10-07-mahjong-seat-call-payment/task-1-report.md` records exact commands and hashes; task review approved with only native-runner readability minor.

Task2 evidence: 110 focused cases across six files, typecheck and 84 real-engine Chromium/WebKit cases passed. Exact public red/normal source, finite transfer/emphasis, hidden-source fallback and resize/input cleanup were reviewed. Root viewed the actual WebKit compositor midpoint. Final measured source/target corner error is below0.03px; `.local/audit/public-call-release3-1791363929944/` preserves source and geometry. Task review approved with only test formatting deferred.

Ordinary drag clear of the rack must submit one legal Choice while drag-back/outside/HUD/cancel/lost-capture/changed-decision do not. Rotated North groups must remain complete and readable. Public chi/pon/open-kan must transfer only an uniquely established visible claimed tile to its exact accepted public meld, with finite group emphasis; stale/hidden/ambiguous sources must safely emphasize the group. Added/closed kan must not replay an old called tile.

Sanma child mangan ron with honba2 must pay8400. Physical child50fu1han honba2+stick1 must retain hand value1600 with delta[-2000,3000,0]. Result rendering must name the hand value separately from each seat's authoritative gain/payment, current score and current winner's settlement; no client scoring formula or invented combined final score.

Task reports, actual commands/exits/hashes and unique browser artifacts will be appended after verified implementation. Joint review and protected publication include the completed North sequence. Actual Android and unseen vendor choreography/protocol remain outside proven acceptance.
