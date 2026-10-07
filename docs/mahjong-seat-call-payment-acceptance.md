# Seat, drag, public-call and payment acceptance — 2026-10-07

## Current status

Implementation follows `docs/superpowers/plans/2026-10-07-mahjong-seat-call-payment.md`; all three tasks are pending review. Current public release remains `152e4fb`. No candidate from this plan has been frozen or published.

## Confirmed before-state

Read-only real-engine evidence `.local/audit/seat-drag-issue-audit.md` shows ordinary whole-tile rack-exit drops rejected in six engine/viewport combinations while center-only drops accept across18 isolated baseline cases. Opponents' public North faces stay at local0° instead of the corresponding±90° seat plane. Ordinary rack/meld/river ownership signs were not reproduced wrong.

`.local/audit/settlement-pon-rule-audit.md` records standard base/fu/han/deposit calculations and first-party current rule configuration. Official `DefaultDetailGameRule3.changbang_value=200`, labeled Continuance Counters Points, supports adopting200 per sanma ron honba together with the matching base-value subtraction. This is an inference from published configuration, not a verified vendor server packet. Yonma300, tsumo100 per payer, riichi1000 and existing double-ron priority remain unchanged. Official double-ron counter priority is still unresolved.

## Required acceptance

Ordinary drag clear of the rack must submit one legal Choice while drag-back/outside/HUD/cancel/lost-capture/changed-decision do not. Rotated North groups must remain complete and readable. Public chi/pon/open-kan must transfer only an uniquely established visible claimed tile to its exact accepted public meld, with finite group emphasis; stale/hidden/ambiguous sources must safely emphasize the group. Added/closed kan must not replay an old called tile.

Sanma child mangan ron with honba2 must pay8400. Physical child50fu1han honba2+stick1 must retain hand value1600 with delta[-2000,3000,0]. Result rendering must name the hand value separately from each seat's authoritative gain/payment, current score and current winner's settlement; no client scoring formula or invented combined final score.

Task reports, actual commands/exits/hashes and unique browser artifacts will be appended after verified implementation. Joint review and protected publication include the completed North sequence. Actual Android and unseen vendor choreography/protocol remain outside proven acceptance.
