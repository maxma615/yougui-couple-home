# Standard Japanese riichi tile materials

## Current renderer: unchanged stock artwork

`TileFace` now uses the existing Regular SVG assets from [FluffyStuff/riichi-mahjong-tiles](https://github.com/FluffyStuff/riichi-mahjong-tiles). It no longer draws pips, bamboo, birds, honors or numerals in application code.

- Pinned upstream revision: `26e127ba2117f45cdce5ea0225748cc0cfad3169`.
- Original directory: [Regular](https://github.com/FluffyStuff/riichi-mahjong-tiles/tree/26e127ba2117f45cdce5ea0225748cc0cfad3169/Regular).
- Author: FluffyStuff; public domain / CC0 1.0 according to the original [LICENSE.md](https://github.com/FluffyStuff/riichi-mahjong-tiles/blob/26e127ba2117f45cdce5ea0225748cc0cfad3169/LICENSE.md).
- Files: all34 ordinary Japanese tile faces, three red fives, Back and Blank (39 files). The Japanese white dragon is the upstream plain blank face, not a newly drawn border.
- Assets are copied byte-for-byte under `public/images/mahjong-tiles/regular/`. No recoloring, trimming, conversion, AI generation or manual redrawing is applied.
- Provenance, individual SHA-256 and upstream Git blob SHA are recorded in [manifest.json](../public/images/mahjong-tiles/manifest.json); downloads were checked against the pinned GitHub tree before writing.
- Original license: [FluffyStuff-riichi-mahjong-tiles-LICENSE.md](../public/licenses/FluffyStuff-riichi-mahjong-tiles-LICENSE.md). Credit: [NOTICE](../public/licenses/FluffyStuff-riichi-mahjong-tiles-NOTICE.txt).
- The37 rendered faces share the existing native button/accessibility behavior across hands, discards, melds, dora, North trays and dialogs. They use locally served image files, never a third-party CDN. Their original300×400 ratio is retained with `object-fit:contain`. No system font or external SVG references are needed.

The prior Noto glyph outlines and original tile-art implementation belong to the earlier release. Their historical OFL notice remains in the repository; the current renderer does not import those outlines. The license exception applies only to the stock assets; application code keeps its existing MIT license.

## Verification scope

The stock-asset test covers every face, distinct red fives, server suffix normalization, wind/dragon mapping, local file presence, accessible click behavior,39 original-file hashes and the exact original license text. Browser layout checks explicitly serve and decode the image files before asserting geometry, so missing images cannot pass a screenshot-less layout check.

This is the tile-material step of the continuing fidelity goal. It does not prove that table placement, motion, wall generation or Android behavior match Mahjong Soul. Those requirements retain separate acceptance gates.
