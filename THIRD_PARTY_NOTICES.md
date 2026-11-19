# Third-party notices

The MIT license applies to original project code. It does not grant rights
in third-party fonts, photographs, trademarks, logos or tooling.

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

The app icon, handwritten Welcome Tommy paths and procedural ink, paper and CRT drawings are original project work. Apple hello was a visual reference; no
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

The engraved stamp treatment in Great Wall Pass is adapted from the author's
[dsh-gov-boot](https://github.com/okiexia-ui/dsh-gov-boot) under the MIT license.

    Copyright (c) 2026 dsh-gov-boot contributors

The full MIT permission notice is included in this repository's `LICENSE`.

## Photographs

The six local JPEGs in `film/assets/photos/` are resized editions of published photographs. The compositions crop, pan, dissolve and overlay text on them. The same credits cover the app, the MP4 demos and the preview images.

| File | Photograph and credit | Usage terms |
| --- | --- | --- |
| `voyage-iss-airglow.jpg` | *Nighttime Over the Eastern Pacific*, ISS072-E-896652, 23 March 2025. NASA Johnson Space Center, ISS Crew Earth Observations Facility. The image is cropped from the [unlabelled astronaut frame](https://eol.jsc.nasa.gov/DatabaseImages/ESC/large/ISS072/ISS072-E-896652.JPG). [NASA Earth Observatory](https://science.nasa.gov/earth/earth-observatory/nighttime-over-the-eastern-pacific-154648/) | [NASA imagery guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/) |
| `voyage-apollo-earth.jpg` | *The Blue Marble*, AS17-148-22727, 7 December 1972. NASA, Apollo 17 crew. The surrounding black margin was cropped. [NASA](https://science.nasa.gov/resource/the-blue-marble/) | [NASA imagery guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/) |
| `aurora-denali.jpg` | Aurora borealis in Denali National Park and Preserve. NPS photo by Robbie Hannawacker. [NPS Gallery](https://npgallery.nps.gov/AssetDetail/5c3915f0-1dd8-b71c-0747-90499f04f082) | Public domain, National Park Service |
| `civic-jinshanling.jpg` | *Great Wall at Jinshanling*, Mx. Granger. [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Great_Wall_at_Jinshanling.JPG) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `spell-votives.jpg` | *Candles church*, Antonio Borrillo. [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Candles_church.JPG) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `neon-tokyo-rain.jpg` | *Tokyo*, Moyan Brenn. Adapted with a moving crop, local darkening, rain and animated lettering. [Original photograph](https://commons.wikimedia.org/wiki/File:Tokyo_%2815642193413%29.jpg) | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) |

## System fonts used at runtime

Custom handwritten greetings are traced from fonts already installed with
macOS: Snell Roundhand, Savoye LET or Bradley Hand for the script, handwriting
and calligraphic choices, with Kaiti SC or Songti SC for Chinese. The Great Wall
Pass and Planetary Voyage text also uses installed Songti SC and Menlo. These
fonts are rendered on the user's Mac and are not redistributed with this
project.

