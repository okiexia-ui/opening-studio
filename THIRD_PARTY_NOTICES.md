# Third-party notices

The MIT license applies to original project code. It does not grant rights
in third-party fonts, trademarks, logos or tooling.

## OpenAI Blossom

The six-petal mark is authored by OpenAI. Vector source and provenance:

- https://commons.wikimedia.org/wiki/File:OpenAI_logo_2025_(symbol).svg
- https://upload.wikimedia.org/wikipedia/commons/6/66/OpenAI_logo_2025_%28symbol%29.svg
- Official brand information: https://openai.com/brand/

`film/assets/openai-blossom.svg` and `logo.js` contain this geometry. The
renderer traces it. This independent project does not claim endorsement.
Trademark rights are not granted by the project license.

## Fonts

Cormorant Garamond and Manrope are redistributed under the SIL Open Font
License 1.1. Original copyright notices and full license texts are included
alongside the fonts in `film/assets/fonts/` and in the native app bundle.

- https://github.com/google/fonts/tree/main/ofl/cormorantgaramond
- https://github.com/google/fonts/tree/main/ofl/manrope

## Development and video export

HyperFrames and Puppeteer Core are pinned in `package-lock.json`; their own
licenses apply. Video export obtains GSAP from the installed HyperFrames
vendor bundle. GSAP retains its standard license and is not part of this
project's MIT grant. The native app and gallery do not use GSAP.

- https://github.com/heygen-com/hyperframes
- https://github.com/puppeteer/puppeteer
- https://gsap.com/standard-license/

## Original artwork and references

The app icon, handwritten Welcome Tommy paths, paper, orbit and theatre
artwork are original project work. Apple hello was a visual reference; no
Apple artwork or system resource is redistributed. The government sites
informed colour and composition only; no government marks or page assets
are included. See `docs/DESIGN.md` for source observations.

## Claude and other application icons

The Claude asterisk in `claude-asterisk.svg` and `marks.js` is the original
asterisk path extracted from the official wordmark at https://claude.com/
on 2026-11-17. It is authored by Anthropic and its trademark rights are
reserved. This project traces the supplied geometry and claims no endorsement.
Other application icons are read at runtime from the user's installed apps;
those icons are not bundled with the source or native app. The generic portal
is original project artwork.

## dsh-gov-boot artwork (Great Wall Pass)

The paper, meander-corner, cloud, geese, ridge, Great Wall and seal geometry
in `film/assets/stages.js` (`civic`) is adapted from
https://github.com/okiexia-ui/dsh-gov-boot, by the same author, under the MIT
License:

    Copyright (c) 2026 dsh-gov-boot contributors

The full MIT permission notice is identical to this repository's `LICENSE`.
The seal text, identity-check bar and connector are new. No national emblem,
government seal, department name or page asset is included.

## Genre themes

Candlelit Spell, Planetary Voyage and Neon Rain are original canvas artwork.
They evoke familiar fantasy, science-fiction and city-night moods without
using any film or book title, logo, character, typeface, frame or music.

## System fonts used at runtime

Custom handwritten greetings are traced from fonts already installed with
macOS: Snell Roundhand, Savoye LET or Bradley Hand for the script, handwriting
and calligraphic choices, with Kaiti SC or Songti SC for Chinese. The Great Wall
Pass and Planetary Voyage text also uses installed Songti SC and Menlo. These
fonts are rendered on the user's Mac and are not redistributed with this
project.

