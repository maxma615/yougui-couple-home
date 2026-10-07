# Mahjong projective paint implementation plan

> **For agentic workers:** Use superpowers:executing-plans for the root-owned CSS/test changes; independent agents review the flight and final result.

**Goal:** Restore the same perspective tabletop in Chromium and WebKit using compositor frame evidence rather than software snapshots.

**Architecture:** Keep the existing single CSS tabletop plane and independent concealed-hand/HUD lanes. Remove the WebKit affine override only after a compositor-video regression proves the real projected paint matches DOM points. Retain software snapshot diagnostics as separate evidence.

**Tech Stack:** React, CSS transforms, Playwright, sharp, local ffmpeg.

**Spec:** `docs/mahjong-fidelity-progress.md`; current user asks original/licensed materials, aligned table/feedback, visible accumulated North, contextual actions.

## Constraints and review focus

- Own only the Mahjong paths recorded in the private primary baseline; preserve foreign primary paths/index, human rooms, sessions and data.
- No vendor assets or invented vendor RNG protocol; Android hardware acceptance remains separate.
- Test three/four players at 667×375, 844×390 and 1440×810; verify visible North and meld/private-hand separation.
- Distinguish `Page.snapshotRect` software capture from `Screencast` composited frames. Headed software snapshots are not independent evidence.
- Check settlement, reconnect, long river, public-dialog and touch-lane regressions before publication.

## Task 1: Pixel regression and CSS correction

- [x] Add failing `tests/browser/mahjong-table-paint.tsx`: real engine/GameRoom, four synthetic patches, trapezoid depth >=1.1 and DOM/paint agreement.
- [x] Reproduce current affine WebKit depth failure and forced-perspective software screenshot mismatch.
- [x] Compare minimal same-page video/snapshot: video preserves the trapezoid while snapshot shears it.
- [x] Update the test to use WebKit compositor-video frames with bounded color centroid tolerance <=2 CSS px for VP8 chroma-subsampled frames (<=1.5 for lossless screenshots); keep snapshot output separate.
- [x] Confirm the current product remains red and forced-camera diagnostic is green.
- [x] Remove only WebKit camera/anchor overrides from `src/app/mahjong/mahjong-camera.css`.
- [x] Run actual product pixel regression, projection, public surfaces, hand clearance, layout and engine/unit regression; review independent flight evidence.

## Task 2: Verify and publish

- [x] Document the capture distinction and fresh results in `docs/mahjong-projective-paint-acceptance.md` and progress document.
- [x] Typecheck/build/secret scan and independent code review.
- [x] Freeze source/build hashes after independent capture-path review (14 owned paths plus built artifact).
- [x] Use existing immutable COPY-only ECS publisher with current 63ee972 rollback, disk/readiness/data/session/cleaner checks, public resource hashes and fresh offsite backup.
- [ ] Synchronize owned primary paths only, verify foreign/index hashes, and report actual release/remaining reference-timing and Android limitations.
