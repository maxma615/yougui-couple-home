# Sanma Replacement Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Track work with checkboxes.

**Goal:** Match the publisher's public sanma rules for North replacement-draw rinshan and delayed open-kan dora, keeping rule text consistent with actual 200-point ron honba.

**Architecture:** The authoritative Sanma game grants rinshan only for an actual winning replacement draw; the physical wall separately tracks completed kans and revealed indicators. An accepted open daiminkan or shouminkan withholds its new indicator through the replacement decision, revealing it at the subsequent discard or the next accepted kan boundary as in the pinned four-player engine. Closed-kan still reveals before its replacement decision. The open-kan label and pinned core also cover shouminkan; this is configuration/semantic evidence, not a recorded vendor server packet. Public and scoring dora/ura use the same revealed count.

**Tech Stack:** TypeScript, @kobalab/majiang-core, Vitest, React, Playwright Chromium/WebKit, protected ECS publisher.

**Spec:** `docs/superpowers/specs/2026-10-06-sanma-bots-design.md`, updated under the user's full fidelity objective. Primary evidence: publisher LQC rows24/25/57 (North rinshan), label2111 and `DefaultDetailGameRule3.ming_dora_immediately_open=false`; raw files pinned in `.local/audit/official-rule-focused-proof.json`. Independent official X oEmbed corroborates North rinshan, `.local/audit/mahjong-nuki-rinshan-primary-evidence-20261007.md`.

## Global Constraints

- Work only in isolated couple-home release checkout; preserve primary foreign bytes/HEAD/index/next-env and academic files/processes.
- Keep 108 tiles, existing secure random wall and physical replacement ordering; no guessed vendor RNG or unverified full wall hash formula.
- Preserve North count/230ms physical animation, accepted action identity, robbery/furiten, ippatsu/first-turn cancellation, last-live limits and score conservation.
- Do not count rinshan on normal draw or ron. North robbery remains allowed without adding a chankan yaku.
- Count completed kans for the four-kan limit even while an open-kan indicator is pending. Do not expose or score a pending dora/ura on replacement tsumo. Reset pending state between hands.
- Publish to authorized Shanghai ECS only with reviewed existing no-backup publisher, preserve disabled-backup policy and cleaner; no data backup/download, no active-table disruption.

## Review Focus

- An open hand that previously had no non-bonus yaku gains a legal tsumo only on the actual North replacement; North/dora bonuses alone still cannot establish a yaku.
- Ordinary draw/ron and robbed North/kan must not inherit a prior replacement phase yaku or reveal an uncompleted kan indicator.
- Open-kan followed by North extraction, another kan, discard, tsumo or robbed action keeps a single coherent revealed count without consuming/reordering indicator tiles.
- Existing closed kan and robbed added kan, riichi ura, four-kan abort and last live tile boundaries must remain correct.
- Rule modal, specification, scoring and actual settlement must agree. Browser/native fixtures must be physically valid and never create synthetic production games.

### Task 1: Correct authoritative replacement scoring and dora timing

**Files:** `src/modules/mahjong/sanma.ts`, `src/modules/mahjong/sanma-wall.ts`, `tests/unit/mahjong-sanma.test.ts`; root owns `src/components/mahjong/mahjong-rules.tsx` and existing sanma specification.

**Interfaces:** Existing SanmaGame `draw/finishReaction/discard/respond/score/view`, SanmaWall `replace/canKan/dora/ura` and exact server Choices. A distinct revealed-indicator count/gate may be added without changing physical tile inventory or DTO shape.

- [x] Write real physically valid engine RED for North rinshan/points and open-hand only-rinshan win; preserve normal-draw/robbery negatives.
- [x] Write RED for open-kan replacement view/tsumo withheld indicator and subsequent discard reveal; cover meaningful replacement/next-kan/last-live boundaries, not private-field mirrors.
- [x] Implement the smallest authoritative fix and run focused tests; keep physical wall identity/order intact.
- [x] Independently review source and actual branch coverage; resolve material findings.

### Task 2: Verify and publish the exact change

**Files:** Bounded acceptance record, fidelity progress, owned-only guarded release helpers in ignored `.local/ecs-deploy/`.

- [ ] Verify actual final source with relevant engine/full suite, type/build/secrets and native nuki/settlement/dora views. Do not rerun unchanged historical geometry matrices.
- [ ] Build locally, freeze/archive exact source and build, COPY-only Linux candidate, verify actual candidate scoring on Linux.
- [ ] Protected readiness and no-active-table switch; verify current image/Build ID, source/build hashes, public TLS/assets, data digests and unchanged cleaner/policy.
- [ ] Documentary closeout and guarded owned-only sync preserving all foreign bytes and primary Git state. Keep full vendor RNG and Android acceptance explicitly open.
