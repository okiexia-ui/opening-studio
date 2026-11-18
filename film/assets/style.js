/* Style options: validation against each theme's schema, colour resolution and
 * the shared choices (pace, fonts, layouts). Native code stores whatever the
 * settings page saves after generic cleaning; this file is the one place that
 * decides what an option means. Unknown or out-of-range values fall back to
 * the theme's defaults, so an old or hand-edited profiles.json is always safe.
 */
window.WelcomeStyle = (() => {
  'use strict';
  const FONTS = {
    script: {name: '连笔', face: '"Snell Roundhand","Kaiti SC","STKaiti",cursive', weight: 700},
    elegant: {name: '花体', face: '"Savoye LET","Kaiti SC","STKaiti",cursive', weight: 400},
    casual: {name: '手写', face: '"Bradley Hand","Kaiti SC","STKaiti",cursive', weight: 700},
    kai: {name: '楷体', face: '"Kaiti SC","STKaiti","Kaiti TC",serif', weight: 700},
    serif: {name: '衬线', face: '"Cormorant Garamond","Songti SC",serif', weight: 500},
    song: {name: '宋体', face: '"Songti SC","STSong","Noto Serif SC",serif', weight: 900},
    sans: {name: '无衬线', face: 'Manrope,"PingFang SC","Noto Sans SC",sans-serif', weight: 300},
    mono: {name: '等宽', face: 'Menlo,"SF Mono",Monaco,"PingFang SC",monospace', weight: 400},
  };
  const PACES = {calm: {name: '舒缓', factor: 1.22}, standard: {name: '标准', factor: 1}, brisk: {name: '利落', factor: .78}};
  const LAYOUTS = {one: {name: '一行'}, two: {name: '两行'}};
  /** Retired ids keep working: each maps to the style that replaced it. */
  const LEGACY = {cinnabar: 'ink', midnight: 'aurora', aurum: 'terminal'};
  const SIZE = {min: .75, max: 1.25};

  const themes = () => window.WelcomeThemes || [];
  function theme(id) { id = LEGACY[id] || id; return themes().find(t => t.id === id) || themes()[0]; }
  const hex = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null;

  /** Keep only what the theme understands, in range. */
  function normalize(themeId, input) {
    const t = theme(themeId), o = input && typeof input === 'object' ? input : {};
    const elements = {};
    for (const e of t.elements) {
      const raw = o.elements && typeof o.elements === 'object' ? o.elements[e.id] : undefined;
      const v = typeof raw === 'number' ? raw : typeof raw === 'boolean' ? +raw : NaN;
      elements[e.id] = Number.isFinite(v) ? (e.kind === 'toggle' ? (v >= .5 ? 1 : 0) : Math.round(Math.min(1, Math.max(0, v)) * 100) / 100) : e.default;
    }
    const size = typeof o.size === 'number' && Number.isFinite(o.size) ? Math.round(Math.min(SIZE.max, Math.max(SIZE.min, o.size)) * 100) / 100 : 1;
    return {
      theme: t.id,
      palette: (t.palettes.find(p => p.id === o.palette) || t.palettes[0]).id,
      accent: hex(o.accent),
      pace: PACES[o.pace] ? o.pace : 'standard',
      font: t.fonts.includes(o.font) ? o.font : t.font,
      layout: t.layouts.includes(o.layout) ? o.layout : t.layout,
      size, elements,
    };
  }
  /** The stored form: only what differs from the defaults (empty for defaults). */
  function delta(style) {
    const t = theme(style.theme), base = normalize(t.id, {}), out = {};
    for (const k of ['palette', 'accent', 'pace', 'font', 'layout', 'size']) if (style[k] !== base[k] && style[k] !== null) out[k] = style[k];
    const elements = Object.fromEntries(Object.entries(style.elements).filter(([k, v]) => v !== base.elements[k]));
    if (Object.keys(elements).length) out.elements = elements;
    return out;
  }

  /* ---- colour ---- */
  const toRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const toHex = rgb => '#' + rgb.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
  function toHsl([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(h * 60 + 360) % 360, s, l];
  }
  function fromHsl([h, s, l]) {
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }
  const triplet = h => toRgb(h).join(',');
  /** A seven-stop line around one accent hue, for gradient pens. */
  function family(accent) {
    const [h, s, l] = toHsl(toRgb(accent));
    return [-48, -28, -10, 0, 14, 32, 54].map((dh, i) => toHex(fromHsl([(h + dh + 360) % 360, Math.min(1, s * (.82 + (i % 3) * .08)), Math.min(.72, Math.max(.38, l + (i % 2 ? .06 : -.02)))])));
  }

  /** Everything a painter needs: colours with the accent applied, timing, font. */
  function resolve(themeId, input) {
    const style = normalize(themeId, input), t = theme(style.theme);
    const colors = structuredClone(t.palettes.find(p => p.id === style.palette).colors);
    if (style.accent) {
      const role = t.accentRole, current = colors[role];
      if (Array.isArray(current)) {
        colors[role] = family(style.accent);
        if (colors.fields) colors.fields = [colors[role][3], colors[role][1], '#fffcf4', colors[role][5]].map(triplet);
      } else colors[role] = /^\d/.test(current) ? triplet(style.accent) : style.accent;
    }
    return {...style, colors, paceFactor: PACES[style.pace].factor, duration: t.duration * PACES[style.pace].factor, face: FONTS[style.font]};
  }

  return {FONTS, PACES, LAYOUTS, LEGACY, SIZE, theme, normalize, resolve, delta, toRgb, triplet};
})();
