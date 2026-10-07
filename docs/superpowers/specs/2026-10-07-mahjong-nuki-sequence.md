# Accepted nuki physical sequence

User scope: continue towards Mahjong Soul-like table movement with original/licensed stock Japanese tile faces, keep every extracted North visible, show only legal contextual actions, and publish the completed changes to the already authorized Shanghai ECS. This is a bounded continuation of that scope, not a claim that vendor timing or shuffle protocol is proven.

## Behavior

- Animate only a newly accepted sanma nuki count increment of exactly one in consecutive live room versions, same room/game/hand/viewer, changed decision, unchanged public rivers/melds and other nuki counts. Initial GET, reconnect, missing identities, version gaps, rollback, settlement and hidden/reduced-motion views show current state without replay.
- The source of a local physical North transfer is unambiguous only when the combined previous own closed hand and drawn tile contains exactly one `z4`. Capture its actual pre-update tile geometry/paint; fly that public face into the newly added North in the persistent tray. Never infer a concealed opponent tile slot or claim identity between duplicate Norths.
- Own unique-North survivors smoothly move from their measured pre-update occurrences into the server's sorted closed row. Exclude the removed North and the new replacement drawn slot; preserve exact red-five faces and duplicates among surviving tiles. The previously drawn tile merges into the sorted closed row when a closed North was removed.
- Transfer lasts 230 ms; survivor reflow lasts 250 ms. These are product choices consistent with existing discard movement, not measured vendor timings. The replacement's existing 220 ms entrance starts after the transfer completes; authoritative choices and tile input remain immediately available. Input cancels any hold/flight/reflow and displays the current replacement immediately.
- A newly added public North receives a finite 230 ms arrival emphasis even when an own source is ambiguous or the actor is an opponent. All extracted Norths and the cumulative count remain visible afterwards. This does not expose any concealed face other than the publicly accepted North.
- Repeated quiet updates do not restart, cancel or extend a valid movement. New decision, scope, disconnect, resize/orientation/fullscreen/viewport changes, tab hiding, motion preference changes and unmount cancel finite effects and restore all real targets. No permanent animation loops or server delays.
- The same original/licensed TileFace and existing projected flight geometry/paint are reused. No rules, RNG, Choice payload, server snapshot fields, dependencies, bot behavior or persistent data change.

## Verification and limits

Real SanmaGame snapshots must prove drawn unique North, closed unique North with prior red/duplicate drawn survivor, duplicate North fallback, repeated nuki cumulative tray and a rob-nuki reaction that has not yet incremented the count. Browser geometry must measure actual source, midpoint, target and cleanup in Chromium/WebKit at 667×375, 844×390 and 1440×810, not only assert CSS names. Component tests cover cancellation and replay guards. Existing own discard/riichi drag and projected flight regressions remain relevant after integration.

Current official reference establishes the public table/announcement and sorted hand end states; the nuki flight path and exact vendor choreography are unproven. Public SHA256 announcement does not disclose the seed-to-shuffle protocol. Desktop browser emulation does not establish Android real-device acceptance. These limits remain recorded.
