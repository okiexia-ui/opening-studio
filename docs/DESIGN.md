# Eight openings, one handoff

The supplied references are the [National Government Services Platform](https://gjzwfw.www.gov.cn/index.html)
and the [Chinese government portal](https://www.gov.cn/). The Traditional Chinese
gateway redirected repeatedly. Their pages timed out in the local browser;
their public HTML and CSS were retrieved on 2026-11-17 instead.

The service site's `styleIndex.css` uses `#c3040f` / `#c40311`; the government
portal's `gtrs_pc_index_20260827.css` uses `#015293` / `#2e5586`. These are source
observations. The restrained paper, orbital and theatre treatments below are
original interpretations of that formal palette and composition, as requested.
No government logos, seals, text or page assets are included.

| Theme | Source of the visual form | Motion | Duration |
| --- | --- | --- | --- |
| Frosted Script | Apple-like personal handwriting | One continuous pen, then a knot and tunnel | 15.8 s |
| Cinnabar Folio | Red institutional typography and a central axis | Paper leaves unfold; a ruled line becomes the connector | 11.8 s |
| Midnight Orbit | The portal's blues and measured horizontal order | A horizon widens; shallow orbital arcs converge | 10.8 s |
| Aurum Theatre | A more ceremonial alternative to the two light references | A narrow light gap opens onto the name | 12.2 s |

All themes share the real window handoff and cold-launch-only behaviour. The
original handwriting remains available. New themes intentionally use distinct
typography and motions, not merely different colours on the same drawing.

The application openings stay silent. The stage contains only the greeting,
the line and the final mark; controls and explanatory labels live in the gallery.

## v0.3 additions

| Theme | Source of the visual form | Motion | Duration |
| --- | --- | --- | --- |
| Great Wall Pass | The author's own [dsh-gov-boot](https://github.com/okiexia-ui/dsh-gov-boot) splash (MIT): paper, meander frame, sun, clouds, ridges and the Great Wall | The wall unrolls; a red Song title is revealed; an identity check steps to 100%; a 准予通行 seal stamps and its red line becomes the connector | 12.6 s |
| Candlelit Spell | A general magical-hall mood: starry vault, floating candles, tall windows | Candles ignite in a sweep; a light writes the name on the Frosted Script pen path, shedding sparks, then flies on to trace the mark | 13.6 s |
| Planetary Voyage | Hard sci-fi departure: a planet's limb at dawn and a mission HUD | Countdown, thrusters ignite along the horizon, the planet falls away, a trajectory pulse locks onto the mark, warp lines in the tunnel | 12.8 s |
| Neon Rain | A rainy street at night | The pen path becomes a neon tube that flickers on (one letter is faulty); current runs into a cyan neon mark; a puddle carries the reflection | 11.6 s |

These four are registered in `film/assets/stages.js` and reuse the shared
handoff in `premium.js`, so the aperture, window following and transparent
exit are identical to the original themes. The film and fantasy references
describe a mood only: no titles, logos, characters, typefaces, frames or
music from any film or book are used, and the government-style theme
contains no national emblem, real department name or official seal.
Every frame is a pure function of time with fixed seeds.

## Custom greetings

The greeting word, name, Great Wall Pass title and seal are editable. Type
themes set the words in their own faces and shrink long text to fit. The three
pen themes (Frosted Script, Candlelit Spell, Neon Rain) need a single line to
travel along. The default phrase keeps its hand-drawn path. Any other phrase
is set in a connected script face, rasterised, thinned to a one-pixel
centreline (Zhang–Suen), turned into a graph and walked into one pen journey.
The walk goes as straight as possible through junctions and lifts the pen to
the nearest loose end behind it. Pen-up moves cost a fifth of their length on
the clock and are never drawn. The result is fitted to the same stage box as
the authored lettering, so the connector, mark and aperture are unchanged.

