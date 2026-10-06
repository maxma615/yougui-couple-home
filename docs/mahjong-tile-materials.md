# Mahjong tile artwork materials

The tile faces combine original inline SVG artwork with a small set of glyph outlines from Noto Serif CJK JP. There are no Mahjong Soul images, extracted game assets, or runtime font dependencies in the tile component.

## Licensed glyph outlines

- Font: Noto Serif CJK JP Regular, upstream version 2.003.
- Source project: [notofonts/noto-cjk](https://github.com/notofonts/noto-cjk), the official Noto CJK source repository.
- Pinned source revision: `f8d157532fbfaeda587e826d4cd5b21a49186f7c`.
- Font file: [`Serif/OTF/Japanese/NotoSerifCJKjp-Regular.otf`](https://github.com/notofonts/noto-cjk/blob/f8d157532fbfaeda587e826d4cd5b21a49186f7c/Serif/OTF/Japanese/NotoSerifCJKjp-Regular.otf).
- Upstream license: [`Serif/LICENSE`](https://github.com/notofonts/noto-cjk/blob/f8d157532fbfaeda587e826d4cd5b21a49186f7c/Serif/LICENSE), SIL Open Font License 1.1. Upstream's [third-party notice](https://github.com/notofonts/noto-cjk/blob/f8d157532fbfaeda587e826d4cd5b21a49186f7c/Serif/README-third_party.md) states that Noto CJK versions 1.002 and later use OFL 1.1.
- The exact source font copyright and attribution are available publicly at [`public/licenses/Noto-Serif-CJK-NOTICE.txt`](../public/licenses/Noto-Serif-CJK-NOTICE.txt).
- Full license text is included at [`public/licenses/Noto-Serif-CJK-OFL.txt`](../public/licenses/Noto-Serif-CJK-OFL.txt).
- Glyph data: `src/components/mahjong/tile-glyphs.ts` contains fitted SVG outlines for 一 through 九, 萬, 東、南、西、北、發、中. That file is distributed under OFL 1.1; the rest of the application remains under the repository license. The upstream font metadata credits © 2017–2024 Adobe; Noto is a Google trademark.
- Downloaded OTF SHA-256: `d9854c7a8ef170b5a7932558856fd64eb8de0b007cd823fed6f9f514ad2803d3`.
- Included license SHA-256: `6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2`.

Only the vector outlines are shipped. They are converted to a fixed 60 × 84 viewBox during development and rendered as SVG paths, so characters remain identical on Windows, macOS, and Linux without loading a system or network font.

## Original vector artwork

The circle pips, nested rosette details, bamboo stalks and joints, one-bamboo bird, and white-dragon border are original inline SVG paths in `src/components/mahjong/mahjong-tile.tsx`. They are drawn for these tiles and are not copied from a commercial game. Red fives keep the same count and layout as ordinary fives, with vermilion primary marks and darker relief lines for legibility.

The existing `TileFace` names, `aria-label`, `data-tile-face`, back-face privacy, button semantics, click behavior, and CSS-controlled physical tile size are unchanged.
