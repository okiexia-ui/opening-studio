/* Opening stages registered by theme id. Each stage paints everything before
 * the shared handoff (greeting, scenery, connector), styles the traced mark and
 * may add a foreground. premium.js owns the timing skeleton, the aperture and
 * the tunnel, so every stage exits into the real window the same way.
 *
 * Contract: pure functions of time `t` on the normalised 0–15.8 clock, so any
 * frame can be rendered in any order (video export, gallery scrubbing, tests).
 * Random-looking detail comes from fixed seeds. No network, images or audio.
 *
 *   0.0–7.5   stage and greeting       7.1–9.3  connector into points[0]
 *   7.5–9.9   greeting fades           9.3–13.1 mark is traced
 *   13.5–15.8 tunnel through the mark and transparent aperture (premium.js)
 */
window.WelcomeStages = (() => {
  'use strict';
  const clamp = x => Math.min(1, Math.max(0, x));
  const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
  const ease = x => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(2 - 2 * x, 3) / 2; };
  const easeOut = x => 1 - Math.pow(1 - clamp(x), 3);
  const mix = (a, b, u) => a + (b - a) * u;
  const span = (t, a, b) => clamp((t - a) / (b - a));
  const fadeOut = t => 1 - smooth((t - 7.5) / 2.4);
  const SONG = '"Songti SC","STSong","Noto Serif SC","Noto Serif CJK SC","Source Han Serif SC",serif';
  const MONO = 'Menlo,"SF Mono",Monaco,"Courier New",monospace';

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---- sampled polylines: arrays of {x, y, l} with cumulative length l ---- */
  function indexAt(pts, L) {
    let lo = 0, hi = pts.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (pts[m].l <= L) lo = m; else hi = m - 1; }
    return lo;
  }
  function pointAt(pts, L) {
    L = Math.max(0, Math.min(L, pts.at(-1).l));
    const i = indexAt(pts, L), a = pts[i], b = pts[Math.min(i + 1, pts.length - 1)];
    const u = b.l > a.l ? (L - a.l) / (b.l - a.l) : 0;
    return {x: mix(a.x, b.x, u), y: mix(a.y, b.y, u)};
  }
  /** Stroke the stretch of a polyline between two lengths; returns its end point. */
  function stroke(ctx, pts, from, to, color, width, alpha = 1) {
    from = Math.max(0, from); to = Math.min(to, pts.at(-1).l);
    if (alpha <= .002 || to <= from) return null;
    const start = pointAt(pts, from), end = pointAt(pts, to), last = indexAt(pts, to);
    ctx.save();
    ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(start.x, start.y);
    const step = width >= 10 ? 3 : 1; // soft glows hide the coarser polyline
    // Pen-up moves (traced handwriting) break the line; other points may be skipped.
    for (let i = indexAt(pts, from) + 1, k = 0; i <= last && pts[i].l < to; i++) {
      if (pts[i].lift) { ctx.moveTo(pts[i].x, pts[i].y); k = 0; }
      else if (++k % step === 0 || pts[i + 1]?.lift) ctx.lineTo(pts[i].x, pts[i].y);
    }
    if (pts[Math.min(last + 1, pts.length - 1)].lift) ctx.moveTo(end.x, end.y); else ctx.lineTo(end.x, end.y);
    ctx.stroke(); ctx.restore();
    return end;
  }
  /** Sample a cubic Bézier into a polyline with lengths. */
  function bezier(a, b, c, d, n = 72) {
    const out = [];
    for (let i = 0, l = 0; i <= n; i++) {
      const u = i / n, v = 1 - u;
      const p = {x: v * v * v * a.x + 3 * v * v * u * b.x + 3 * v * u * u * c.x + u * u * u * d.x,
                 y: v * v * v * a.y + 3 * v * v * u * b.y + 3 * v * u * u * c.y + u * u * u * d.y};
      if (i) l += Math.hypot(p.x - out[i - 1].x, p.y - out[i - 1].y);
      out.push({...p, l});
    }
    return out;
  }
  /** The frost handwriting schedule, shared by stages that reuse its pen path. */
  function pen(t, env) {
    if (t < 8.1) { const u = clamp(t / 8.1); return {text: env.textLength * (u - Math.sin(u * Math.PI * 2) * .026), travel: 0}; }
    return {text: env.textLength, travel: env.travelLength * smooth((t - 8.1) / 1.2)};
  }

  /** Tracked single-line text; manual tracking keeps older WebKit consistent. */
  function label(ctx, str, x, y, {font, color, alpha = 1, tracking = 0, align = 'center', fit = Infinity}) {
    if (alpha <= .002) return 0;
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.font = font; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    const chars = [...str], widths = chars.map(c => ctx.measureText(c).width);
    const total = widths.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1);
    // Custom text that is too wide shrinks uniformly around its anchor.
    if (total > fit) { const k = fit / total; ctx.translate(x, y); ctx.scale(k, k); ctx.translate(-x, -y); }
    let xx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    chars.forEach((c, i) => { ctx.fillText(c, xx, y); xx += widths[i] + tracking; });
    ctx.restore();
    return total;
  }
  // Soft glows are drawn from one cached sprite per colour: dozens of glows
  // per frame stay cheap even where the canvas falls back to software.
  const sprites = new Map();
  function sprite(color) {
    let c = sprites.get(color);
    if (!c) {
      c = document.createElement('canvas'); c.width = c.height = 256;
      const g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
      gr.addColorStop(0, `rgba(${color},1)`); gr.addColorStop(1, `rgba(${color},0)`);
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256); sprites.set(color, c);
    }
    return c;
  }
  function radial(ctx, x, y, r, color, alpha) {
    if (alpha <= .002) return;
    const a = ctx.globalAlpha; ctx.globalAlpha = a * Math.min(1, alpha);
    ctx.drawImage(sprite(color), x - r, y - r, r * 2, r * 2); ctx.globalAlpha = a;
  }
  /* ---- colour: palettes give hex or "r,g,b"; stages derive shades from them ---- */
  const trip = c => c.startsWith('#') ? WelcomeStyle.triplet(c) : c;
  const rgba = (c, a) => `rgba(${trip(c)},${a})`;
  /** Towards white (k > 0) or black (k < 0). */
  function shade(c, k) {
    const [r, g, b] = trip(c).split(',').map(Number), to = k > 0 ? 255 : 0, u = Math.abs(k);
    return `rgb(${Math.round(r + (to - r) * u)},${Math.round(g + (to - g) * u)},${Math.round(b + (to - b) * u)})`;
  }
  const shadeTrip = (c, k) => shade(c, k).slice(4, -1);
  /** The chosen face at a size, honouring the text-size option. */
  const face = (env, px, weight = env.style.face.weight) => `${weight} ${Math.round(px * env.style.size)}px ${env.style.face.face}`;
  /** A stable subset: item i is shown when its rank falls under the density. */
  const ranked = (n, seed) => { const r = rng(seed); return Array.from({length: n}, () => r()); };

  function fillView(ctx, view, style) { ctx.fillStyle = style; ctx.fillRect(view.left - 2, view.top - 2, view.right - view.left + 4, view.bottom - view.top + 4); }
  /** A small four-point sparkle, the light source of the spell and neon stages. */
  function sparkle(ctx, x, y, size, rotation, alpha, color = '255,250,235') {
    if (alpha <= .002) return;
    radial(ctx, x, y, size * 3.2, color, alpha * .35);
    ctx.save(); ctx.translate(x, y); ctx.rotate(rotation); ctx.globalAlpha = alpha; ctx.fillStyle = `rgb(${color})`;
    ctx.beginPath();
    for (let k = 0; k < 8; k++) { const r = k % 2 ? size * .16 : size, a = k * Math.PI / 4; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); ctx.fill(); ctx.restore();
  }

  /* ======================================================================
   * 长城 · 通行 — adapted from the author's dsh-gov-boot splash (MIT): paper,
   * meander frame, sun, auspicious clouds, ridges and the Great Wall. Then an
   * identity check fills, a seal stamps 准予通行 and its red line becomes the
   * connector. No government emblems, seals or page assets are used.
   * ==================================================================== */
  function civic(env) {
    const R = rng(1949);
    const n1 = v => Math.round(v * 10) / 10;
    const box = (x, y, w, h) => `M${n1(x)} ${n1(y)}h${n1(w)}v${n1(h)}h${n1(-w)}z`;
    const disc = (cx, cy, r) => `M${n1(cx - r)} ${n1(cy)}a${r} ${r} 0 1 1 ${2 * r} 0a${r} ${r} 0 1 1 ${-2 * r} 0z`;
    const curve = points => {
      let d = `M${n1(points[0][0])} ${n1(points[0][1])}`;
      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i - 1] || points[i], p1 = points[i], p2 = points[i + 1], p3 = points[i + 2] || p2;
        d += ' C' + [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]].map(n1).join(' ');
      }
      return d;
    };
    // Land artwork lives in gov-boot's 1440×460 box, bottom-aligned and widened
    // so ultra-wide and very tall windows stay covered.
    const K = 1920 / 1440, TOP = 1080 - 460 * K, DEEP = 4600, WIDE = [-1300, 2740];
    function ridge(seed, base, amp) {
      const r = rng(seed), ph = [r() * 6.28, r() * 6.28, r() * 6.28], points = [];
      for (let x = WIDE[0]; x <= WIDE[1]; x += 40) points.push([x, base - amp * (.55 * Math.sin(x / 260 + ph[0]) + .3 * Math.sin(x / 118 + ph[1]) + .15 * Math.sin(x / 51 + ph[2]))]);
      return new Path2D(curve(points) + ` L${WIDE[1]} ${DEEP} L${WIDE[0]} ${DEEP} Z`);
    }
    const WALL = [[-40, 362], [40, 354], [120, 336], [190, 318], [250, 302], [300, 292], [352, 276], [396, 270], [440, 280], [500, 302], [560, 316], [620, 310], [680, 292], [730, 270], [772, 260], [820, 270], [880, 292], [940, 306], [1000, 300], [1060, 282], [1110, 266], [1150, 260], [1196, 270], [1260, 290], [1330, 304], [1400, 310], [1480, 314]];
    const TOWERS = [[3, 16], [7, 24], [11, 17], [14, 26], [18, 18], [21, 25], [24, 16]];
    const WIDE_WALL = [[-1300, 380], [-600, 372], ...WALL, [2000, 320], [2740, 326]];
    const offset = dy => WIDE_WALL.map(([x, y]) => [x, y + dy]);
    let towers = '', doors = '';
    for (const [i, w] of TOWERS) {
      const x = WALL[i][0], y = WALL[i][1] + 2, h = w * .95, left = x - w / 2, gap = (w + 3.2 - 2.6) / 3;
      towers += box(left, y - h, w, h + 5) + box(left - 1.6, y - h - 2.4, w + 3.2, 3);
      for (let k = 0; k < 4; k++) towers += box(left - 1.6 + k * gap, y - h - 6, 2.6, 3.8);
      doors += box(x - w * .11, y - h * .62, w * .22, h * .3);
    }
    const land = {
      far2: ridge(11, 196, 46), far: ridge(23, 246, 40), near: ridge(37, 412, 16),
      mid: new Path2D(curve(offset(3)) + ` L${WIDE[1]} ${DEEP} L${WIDE[0]} ${DEEP} Z`),
      crest: new Path2D(curve(WIDE_WALL)), merlons: new Path2D(curve(offset(-3.4))), walk: new Path2D(curve(offset(.8))),
      towers: new Path2D(towers), doors: new Path2D(doors),
    };
    const puffs = [[40, 36, 16], [72, 26, 22], [106, 32, 18], [134, 42, 12]];
    const cloudOutline = new Path2D(puffs.map(([x, y, r]) => disc(x, y, r)).join('') + 'M26 38h114a8 8 0 0 1 0 16H26a8 8 0 0 1 0-16z');
    const cloudCurls = new Path2D(puffs.slice(0, 3).map(([x, y, r]) => { const a = r * .55; return `M${n1(x - a)} ${n1(y + a * .2)}a${n1(a)} ${n1(a)} 0 1 1 ${n1(a)} ${n1(a * .9)}a${n1(a * .5)} ${n1(a * .5)} 0 1 1 ${n1(-a * .42)} ${n1(-a * .6)}`; }).join('') + 'M150 46c6 0 9 3 9 6');
    const CORNER = new Path2D('M1.5 45V1.5H45M7 31V7h24v18H13V13h12v6h-6');
    const GEESE = new Path2D('M10 30q6-6 10 0q4-6 10 0M38 20q5-5 8 0q3-5 8 0M60 34q5-5 8 0q3-5 8 0M82 14q4-4 7 0q3-4 7 0M104 26q4-4 7 0q3-4 7 0');
    const wear = Array.from({length: 46}, () => [6 + R() * 88, 6 + R() * 88, .35 + R() * 1.25]);
    const notches = Array.from({length: 14}, () => { const side = Math.floor(R() * 4), u = 8 + R() * 84; return [[u, 4], [96, u], [u, 96], [4, u]][side].concat(.8 + R() * 1.6); });
    const STEPS = [[4.3, 14], [4.8, 38], [5.3, 62], [5.8, 86], [6.4, 100]];
    const SEAL = {x: 1238, y: 690, size: 104};
    const SEAL_LAYOUT = [[[50, 70]], [[50, 46], [50, 83]], [[32, 45], [68, 45], [50, 82]], [[32, 45], [68, 45], [32, 82], [68, 82]]];
    const copy = env.copy, standardSeal = copy.seal === '准予通行';
    const P = env.style.colors, E = env.style.elements, red = P.red, gold = P.gold;
    const blend = k => P.land.split(',').map(Number).map((v, i) => Math.round(v + ([252, 246, 232][i] - v) * k)).join(',');
    const TITLE_WEIGHT = {song: 900, kai: 700, sans: 600}[env.style.font] || 900;
    let fibreTile = null;
    function fibre(ctx) {
      if (!fibreTile) {
        const c = document.createElement('canvas'); c.width = c.height = 20; const g = c.getContext('2d');
        g.fillStyle = 'rgba(140,105,70,.0175)'; for (let x = 0; x < 20; x += 4) g.fillRect(x, 0, 1, 20);
        g.fillStyle = 'rgba(140,105,70,.0125)'; for (let y = 0; y < 20; y += 5) g.fillRect(0, y, 20, 1);
        fibreTile = ctx.createPattern(c, 'repeat');
      }
      return fibreTile;
    }

    function cloud(ctx, x, y, scale, alpha) {
      if (alpha <= .002) return;
      ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.globalAlpha = alpha;
      ctx.lineWidth = 2.4; ctx.strokeStyle = rgba(gold, .6); ctx.stroke(cloudOutline);
      ctx.fillStyle = '#fbf6ea'; ctx.fill(cloudOutline);
      ctx.lineWidth = 1.3; ctx.lineCap = 'round'; ctx.strokeStyle = rgba(gold, .62); ctx.stroke(cloudCurls);
      ctx.restore();
    }
    function seal(ctx, x, y, size, rotation, scale, alpha) {
      if (alpha <= .002) return;
      const u = size / 100;
      ctx.save(); ctx.translate(x, y); ctx.rotate(rotation); ctx.scale(scale * u, scale * u); ctx.translate(-50, -50);
      ctx.globalAlpha = alpha; ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = red; ctx.beginPath(); ctx.roundRect(4, 4, 92, 92, 6); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = '#fbf1e0'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.roundRect(10.5, 10.5, 79, 79, 2); ctx.stroke();
      ctx.fillStyle = '#fbf1e0'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      // Seal layouts for one to four characters, read across then down (as in dsh-gov-boot).
      const chars = [...env.copy.seal].slice(0, 4), at = SEAL_LAYOUT[chars.length - 1];
      ctx.font = `900 ${chars.length === 1 ? 58 : chars.length === 2 ? 34 : 33}px ${SONG}`;
      chars.forEach((c, i) => ctx.fillText(c, at[i][0], at[i][1]));
      // Worn ink: paper shows through in specks and along the edge.
      ctx.fillStyle = '#f4ecdd';
      for (const [sx, sy, r] of wear) { ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill(); }
      for (const [sx, sy, r] of notches) { ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    function landscape(ctx, t, view, alpha) {
      const rise = easeOut(span(t, .6, 2.6));
      ctx.save(); ctx.globalAlpha = alpha * rise; ctx.translate(0, TOP + (1 - rise) * 22 * K); ctx.scale(K, K);
      const vertical = (y0, y1, stops) => { const g = ctx.createLinearGradient(0, y0, 0, y1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; };
      // Ridges are the land colour thinned towards paper, nearest darkest.
      ctx.fillStyle = vertical(150, 460, [[0, rgba(blend(.55), .24)], [1, rgba(blend(.55), 0)]]); ctx.fill(land.far2);
      ctx.fillStyle = vertical(206, 460, [[0, rgba(blend(.4), .3)], [1, rgba(blend(.4), .02)]]); ctx.fill(land.far);
      ctx.fillStyle = vertical(260, 460, [[0, rgba(blend(.2), .36)], [.6, rgba(blend(.2), .12)], [1, rgba(blend(.2), .05)]]); ctx.fill(land.mid);
      // The wall unrolls from the left along the ridge.
      const reach = mix(view.left / K - 30, view.right / K + 30, ease(span(t, 1.5, 4.4)));
      if (E.wall) {
        ctx.save(); ctx.beginPath(); ctx.rect(WIDE[0], 0, reach - WIDE[0], DEEP); ctx.clip();
        ctx.lineJoin = 'round'; ctx.strokeStyle = rgba(P.land, .5); ctx.lineWidth = 5.5; ctx.stroke(land.crest);
        ctx.setLineDash([2.2, 2.6]); ctx.strokeStyle = rgba(P.land, .55); ctx.lineWidth = 2.8; ctx.stroke(land.merlons); ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(247,236,217,.55)'; ctx.lineWidth = .9; ctx.stroke(land.walk);
        ctx.fillStyle = rgba(P.land, .58); ctx.fill(land.towers); ctx.fillStyle = 'rgba(246,236,217,.75)'; ctx.fill(land.doors);
        ctx.restore();
      }
      ctx.fillStyle = vertical(318, 392, [[0, 'rgba(251,245,232,0)'], [.5, 'rgba(251,245,232,.8)'], [1, 'rgba(251,245,232,0)']]); ctx.fillRect(WIDE[0], 318, WIDE[1] - WIDE[0], 74);
      ctx.fillStyle = vertical(396, 460, [[0, rgba(blend(.1), .34)], [1, rgba(blend(.1), .12)]]); ctx.fill(land.near);
      ctx.restore();
    }

    return {
      mark: {halo: red, core: red, width: 3, haloAlpha: .1, haloWidth: 11},
      echo: red, ink: red, end: '#f7f5f0',
      scene({ctx, t, view}) {
        const fade = fadeOut(t), settle = 1 - .3 * smooth((t - 8.6) / 3);
        // Paper with the vignette folded into its outer stops, then a woven fibre tile.
        const paper = ctx.createRadialGradient(960, 330, 0, 960, 330, Math.max(1500, (view.right - view.left) * .8, (view.bottom - view.top) * .8));
        paper.addColorStop(0, '#fcf7ec'); paper.addColorStop(.48, '#f6efe2'); paper.addColorStop(.78, '#efe4cf'); paper.addColorStop(1, '#e2d1b5');
        fillView(ctx, view, paper);
        fillView(ctx, view, fibre(ctx));

        // Sun: a pale vermilion disc, rising.
        const sun = easeOut(span(t, .4, 2.9));
        ctx.save(); ctx.globalAlpha = sun * settle; ctx.translate(0, (1 - sun) * 16);
        const sg = ctx.createRadialGradient(1488, 255, 0, 1488, 255, 125);
        sg.addColorStop(0, rgba(P.sun, .3)); sg.addColorStop(.775, rgba(P.sun, .3)); sg.addColorStop(.805, rgba(P.sun, .12)); sg.addColorStop(1, rgba(P.sun, 0));
        ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(1488, 255, 125, 0, Math.PI * 2); ctx.fill(); ctx.restore();

        const drift = easeOut(span(t, .9, 3.9));
        if (E.clouds) cloud(ctx, 134 - 14 * (1 - drift), 173, 1.8, drift * settle);
        ctx.save(); ctx.globalAlpha = E.clouds * smooth(span(t, 2.2, 3.4)) * (1 - smooth(span(t, 6.5, 9))) * .9; ctx.translate(1171 + 60 * span(t, 2, 9), 184 - 10 * span(t, 2, 9)); ctx.scale(1.18, 1.18);
        ctx.strokeStyle = rgba(P.land, .42); ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(GEESE); ctx.restore();
        landscape(ctx, t, view, settle);
        if (E.clouds) cloud(ctx, 1498 + 14 * (1 - drift), 259, 1.32, drift * settle);

        // Red silk along the bottom edge.
        const silk = E.silk * smooth(span(t, 1, 2.4)) * settle;
        if (silk > 0) {
          for (const [phase, depth, color, alpha] of [[1.7, 50, shadeTrip(P.silk, .12), .35], [0, 34, P.silk, .9]]) {
            ctx.save(); ctx.globalAlpha = silk * alpha; ctx.fillStyle = `rgb(${color})`; ctx.beginPath(); ctx.moveTo(view.left, view.bottom + 4);
            for (let x = view.left; x <= view.right + 30; x += 30) ctx.lineTo(x, view.bottom - depth + 9 * Math.sin(x / 190 + phase + t * .35));
            ctx.lineTo(view.right + 30, view.bottom + 4); ctx.closePath(); ctx.fill(); ctx.restore();
          }
          ctx.save(); ctx.globalAlpha = silk * .8; ctx.strokeStyle = '#e3c27a'; ctx.lineWidth = 2; ctx.beginPath();
          for (let x = view.left; x <= view.right + 30; x += 30) ctx.lineTo(x, view.bottom - 34 + 9 * Math.sin(x / 190 + t * .35));
          ctx.stroke(); ctx.restore();
        }


        // Double hairline frame with meander corners, hugging the window.
        const frame = smooth(span(t, .2, 1.4)), inset = 44;
        if (frame > 0) {
          const x0 = view.left + inset, y0 = view.top + inset, x1 = view.right - inset, y1 = view.bottom - inset;
          ctx.save(); ctx.globalAlpha = frame; ctx.lineWidth = 1;
          ctx.strokeStyle = rgba(gold, .55); ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
          ctx.strokeStyle = rgba(gold, .18); ctx.strokeRect(x0 + 7, y0 + 7, x1 - x0 - 14, y1 - y0 - 14);
          ctx.strokeStyle = rgba(gold, 1); ctx.lineWidth = 1.7; ctx.lineCap = 'square';
          for (const [x, y, sx, sy] of [[x0 - 2, y0 - 2, 1, 1], [x1 + 2, y0 - 2, -1, 1], [x0 - 2, y1 + 2, 1, -1], [x1 + 2, y1 + 2, -1, -1]]) {
            ctx.save(); ctx.translate(x, y); ctx.scale(sx * 1.25, sy * 1.25); ctx.stroke(CORNER); ctx.restore();
          }
          ctx.restore();
        }

        // Greeting block.
        label(ctx, `${copy.greeting}  ${copy.name}`.toUpperCase(), 960, 352, {font: '600 20px Manrope', color: '#9a7a56', tracking: 12, fit: 1100, alpha: smooth(span(t, 2.3, 3.3)) * fade});
        ctx.save();
        // The title shrinks to fit when a custom one is long.
        const titleFace = env.style.face.face;
        let size = 124 * env.style.size; ctx.font = `${TITLE_WEIGHT} ${size}px ${titleFace}`;
        const chars = [...copy.title], measure = () => chars.map(c => ctx.measureText(c).width);
        let widths = measure(), track = 17;
        const natural = widths.reduce((a, b) => a + b, 0) + track * (chars.length - 1);
        if (natural > 1240) { size *= 1240 / natural; track *= 1240 / natural; ctx.font = `${TITLE_WEIGHT} ${size}px ${titleFace}`; widths = measure(); }
        let x = 960 - (widths.reduce((a, b) => a + b, 0) + track * (chars.length - 1)) / 2;
        const ink = ctx.createLinearGradient(0, 500 - size, 0, 512); ink.addColorStop(0, shade(red, .1)); ink.addColorStop(1, shade(red, -.08));
        ctx.fillStyle = ink; ctx.textBaseline = 'alphabetic'; ctx.globalAlpha = fade;
        chars.forEach((c, i) => {
          const open = ease(span(t, 2.6 + i * .16, 3.6 + i * .16));
          if (open > 0) { ctx.save(); ctx.beginPath(); ctx.rect(x - 4, 500 - size * 1.0, widths[i] + 8, size * 1.21 * open); ctx.clip(); ctx.fillText(c, x, 500); ctx.restore(); }
          x += widths[i] + track;
        });
        ctx.restore();
        const rule = easeOut(span(t, 3.4, 4.3));
        if (rule > 0) {
          ctx.save(); ctx.globalAlpha = rule * fade;
          for (const dir of [-1, 1]) {
            const g = ctx.createLinearGradient(960, 0, 960 + dir * 190 * rule, 0); g.addColorStop(0, rgba(gold, .85)); g.addColorStop(1, rgba(gold, 0));
            ctx.fillStyle = g; ctx.fillRect(dir > 0 ? 974 : 946 - 190 * rule, 551.5, 190 * rule, 1);
          }
          ctx.translate(960, 552); ctx.rotate(Math.PI / 4);
          ctx.fillStyle = rgba(gold, .25); ctx.fillRect(-7.5, -7.5, 15, 15); ctx.fillStyle = red; ctx.fillRect(-4.5, -4.5, 9, 9);
          ctx.restore();
        }
        label(ctx, `尊敬的 ${copy.name} · 您的工作台已就绪`, 960, 616, {font: `${env.style.font === 'sans' ? 400 : 500} 28px ${titleFace}`, color: '#6f5040', tracking: 6, fit: 1200, alpha: smooth(span(t, 3.8, 4.8)) * fade});

        // Identity check: stepped progress, held at 86% like a real boot.
        const bar = E.auth * smooth(span(t, 3.9, 4.4)) * fade;
        if (bar > 0) {
          let value = 0;
          for (let i = 0; i < STEPS.length; i++) value = mix(value, STEPS[i][1], easeOut(span(t, STEPS[i][0], STEPS[i][0] + .32)));
          const done = t >= 6.72, x0 = 722, x1 = 1158, y = 688;
          label(ctx, done ? (standardSeal ? '认证通过 · 准予通行' : '认证通过') : '统一身份认证', x0, y - 16, {font: `${done ? 700 : 500} 21px ${titleFace}`, color: done ? red : '#6f5040', tracking: 5, align: 'left', alpha: bar});
          label(ctx, `${Math.round(value)}%`, x1, y - 16, {font: '600 20px Manrope', color: done ? red : '#8a6b4c', align: 'right', alpha: bar});
          ctx.save(); ctx.globalAlpha = bar;
          ctx.fillStyle = rgba(gold, .12); ctx.fillRect(x0, y, x1 - x0, 9);
          ctx.strokeStyle = rgba(gold, .5); ctx.lineWidth = 1; ctx.strokeRect(x0 - .5, y - .5, x1 - x0 + 1, 10);
          const fill = ctx.createLinearGradient(x0, 0, x1, 0); fill.addColorStop(0, shade(red, .1)); fill.addColorStop(.8, red); fill.addColorStop(1, '#e3c27a');
          ctx.fillStyle = fill; ctx.fillRect(x0 + 1.5, y + 1.5, (x1 - x0 - 3) * value / 100, 6);
          ctx.restore();
        }
        // The stamp lands the moment the check completes.
        const stamp = span(t, 6.62, 6.98), land_ = 1 + .42 * Math.pow(1 - easeOut(stamp), 2);
        if (E.seal) {
          seal(ctx, SEAL.x, SEAL.y, SEAL.size, -.1 + .02 * (1 - stamp), land_, Math.min(1, stamp * 3) * .94 * fadeOut(t + .3));
          if (stamp > 0 && stamp < 1) radial(ctx, SEAL.x, SEAL.y, 120, trip(red), .12 * Math.sin(stamp * Math.PI));
        }
        label(ctx, '开屏 · 政务版', view.left + 110, view.bottom - 132, {font: `700 22px ${SONG}`, color: red, tracking: 7, align: 'left', alpha: smooth(span(t, 3, 4)) * fade});
        label(ctx, 'SECURE WORKSPACE', view.left + 110, view.bottom - 104, {font: '500 15px Manrope', color: 'rgba(104,74,54,.9)', tracking: 5, align: 'left', alpha: smooth(span(t, 3, 4)) * fade});

        // Connector: a vermilion hairline springs from the seal into the mark.
        if (t > 7.05) {
          // From the seal, or the bar or the subtitle when those are switched off.
          const from = E.seal ? {x: SEAL.x + 54, y: SEAL.y + 6} : E.auth ? {x: 1162, y: 692} : {x: 1250, y: 606};
          const p = env.points[0], path = bezier(from, {x: from.x + 230, y: from.y + 20}, {x: p.x + 120, y: p.y + 210}, p);
          stroke(ctx, path, 0, path.at(-1).l * ease(span(t, 7.05, 9.3)), red, 2, 1 - smooth((t - 10.5) / 2));
        }
      },
    };
  }

  /* ======================================================================
   * 星烛 · 咒语 — candles light one by one beneath a starry vault; a wand of
   * light writes the name on the frost pen path, sheds sparks and flies on
   * to trace the mark. Original artwork in a general magical-hall mood.
   * ==================================================================== */
  function spell(env) {
    const R = rng(7);
    const stars = Array.from({length: 240}, () => ({x: R() * 2800 - 440, y: R() * 900 - 420, r: .4 + R() * 1.3, ph: R() * 6.28, sp: .5 + R() * 1.6}));
    const P = env.style.colors, E = env.style.elements, light = P.light;
    // Up to 31 candles; the density option keeps a stable, evenly spread subset (23 by default).
    const candles = Array.from({length: 31}, (_, i) => {
      const d = .45 + R() * .62;
      return {x: 50 + i * (1820 / 30) + (R() - .5) * 40, y: 96 + R() * 210 + (1 - d) * 90, d, ph: R() * 6.28, fl: R() * 6.28, rank: ((i * 7) % 31) / 31};
    }).filter(c => c.rank < Math.min(1, E.candles / .75 * 23 / 31) - 1e-9).sort((a, b) => a.d - b.d);
    // Sparks are born at fixed times on the pen path, so any frame is reproducible.
    const sparkCount = Math.round(250 * E.sparks);
    const sparks = Array.from({length: sparkCount}, (_, k) => {
      const born = .7 + (k / sparkCount) * 7.3, at = pointAt(env.text, pen(born, env).text);
      return {born, x: at.x, y: at.y, vx: (R() - .5) * 80, vy: -15 - R() * 60, life: .8 + R() * 1.4, size: 1.4 + R() * 2.6, tw: R() * 6.28};
    });
    const markCount = Math.round(117 * E.sparks);
    const markSparks = Array.from({length: markCount}, (_, k) => {
      const born = 9.35 + (k / markCount) * 3.7, at = pointAt(env.points, env.logoLength * clamp((born - 9.3) / 3.8));
      return {born, x: at.x, y: at.y, vx: (R() - .5) * 60, vy: -10 - R() * 50, life: .7 + R() * 1.1, size: .9 + R() * 2, tw: R() * 6.28};
    });
    function drawSparks(ctx, list, t, gravity) {
      for (const s of list) {
        const age = t - s.born;
        if (age < 0 || age > s.life) continue;
        const k = 1 - age / s.life, x = s.x + s.vx * age, y = s.y + s.vy * age + .5 * gravity * age * age;
        const a = k * k * (.65 + .35 * Math.sin(t * 22 + s.tw));
        ctx.globalAlpha = a; ctx.fillStyle = k > .6 ? shade(light, .7) : light;
        ctx.beginPath(); ctx.arc(x, y, s.size * (.4 + .6 * k), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    function arch(ctx, cx, width, spring, apex, bottom) {
      const l = cx - width / 2, r = cx + width / 2;
      ctx.beginPath(); ctx.moveTo(l, bottom); ctx.lineTo(l, spring);
      ctx.quadraticCurveTo(l, apex + (spring - apex) * .2, cx, apex); ctx.quadraticCurveTo(r, apex + (spring - apex) * .2, r, spring);
      ctx.lineTo(r, bottom); ctx.closePath();
    }
    return {
      echo: light, ink: light, end: P.sky[1],
      scene({ctx, t, view}) {
        const fade = fadeOut(t);
        const sky = ctx.createLinearGradient(0, view.top, 0, view.bottom);
        sky.addColorStop(0, P.sky[0]); sky.addColorStop(.45, P.sky[1]); sky.addColorStop(1, P.sky[2]);
        fillView(ctx, view, sky);
        // The vault: twinkling stars, thinning towards the hall.
        const night = smooth(span(t, .1, 2.2)) * E.stars / .6;
        ctx.fillStyle = '#e9e4ff';
        for (const s of stars) {
          const a = night * (.25 + .75 * (.5 + .5 * Math.sin(t * s.sp * 2.4 + s.ph))) * clamp((520 - s.y) / 380);
          if (a <= .01) continue;
          ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        // Three tall pointed windows with a breath of moonlight.
        const hall = E.windows * smooth(span(t, .3, 2));
        for (const [cx, w] of [[420, 250], [960, 300], [1500, 250]]) {
          ctx.save(); ctx.globalAlpha = hall;
          arch(ctx, cx, w, 330, 150, view.bottom + 10);
          const glass = ctx.createLinearGradient(0, 150, 0, 1000); glass.addColorStop(0, rgba(P.glass, .17)); glass.addColorStop(1, rgba(P.glass, 0));
          ctx.fillStyle = glass; ctx.fill();
          ctx.strokeStyle = rgba(shadeTrip(P.glass, .3), .08); ctx.lineWidth = 2; ctx.stroke();
          ctx.beginPath(); ctx.moveTo(cx, 150); ctx.lineTo(cx, view.bottom);
          for (let y = 420; y < 1000; y += 150) { ctx.moveTo(cx - w / 2, y); ctx.lineTo(cx + w / 2, y); }
          ctx.strokeStyle = rgba(shadeTrip(P.glass, .3), .05); ctx.stroke(); ctx.restore();
        }
        ctx.save(); ctx.globalAlpha = hall * .5; ctx.beginPath(); ctx.moveTo(810, 330); ctx.lineTo(1110, 330); ctx.lineTo(1380, view.bottom); ctx.lineTo(560, view.bottom); ctx.closePath();
        const beam = ctx.createLinearGradient(0, 330, 0, view.bottom); beam.addColorStop(0, rgba(shadeTrip(P.glass, .2), .07)); beam.addColorStop(1, rgba(P.glass, 0));
        ctx.fillStyle = beam; ctx.fill(); ctx.restore();

        // Floating candles ignite in a sweep from left to right.
        let warmth = 0;
        for (const c of candles) {
          const ignite = .5 + (c.x / 1920) * 2.4, lit = smooth((t - ignite) / .35), body = smooth((t - ignite + .2) / .3);
          if (body <= 0) continue;
          warmth += lit / candles.length;
          const d = c.d, x = c.x, y = c.y + Math.sin(t * .85 + c.ph) * 7 * d, h = 60 * d, w = 11 * d;
          radial(ctx, x, y - 8 * d, 125 * d, P.flame, .22 * lit);
          ctx.save(); ctx.globalAlpha = body * .92;
          const wax = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0); wax.addColorStop(0, '#d9cdb1'); wax.addColorStop(.45, '#f5edda'); wax.addColorStop(1, '#bfb193');
          ctx.fillStyle = wax; ctx.fillRect(x - w / 2, y, w, h);
          ctx.fillStyle = 'rgba(255,214,150,.35)'; ctx.fillRect(x - w / 2, y, w, 3 * d);
          ctx.restore();
          if (lit > 0) {
            const flick = 1 + .12 * Math.sin(t * 15 + c.fl) + .06 * Math.sin(t * 27 + c.fl * 2), fh = 31 * d * flick * lit, fw = 8 * d;
            ctx.save(); ctx.globalAlpha = lit;
            const flame = ctx.createRadialGradient(x, y - fh * .35, 0, x, y - fh * .35, fh * .9);
            flame.addColorStop(0, '#fffbe8'); flame.addColorStop(.45, shade(P.flame, .45)); flame.addColorStop(1, rgba(P.flame, 0));
            ctx.fillStyle = flame; ctx.beginPath(); ctx.moveTo(x, y - fh);
            ctx.quadraticCurveTo(x + fw, y - fh * .32, x, y - 1); ctx.quadraticCurveTo(x - fw, y - fh * .32, x, y - fh); ctx.fill(); ctx.restore();
          }
        }
        radial(ctx, 960, 160, 1100, P.flame, .07 * warmth * candles.length / 23);

        // The incantation: a glowing line written by a moving light.
        const p = pen(t, env), L = p.text;
        const glint = env.textLength * smooth((t - 7.4) / 1.1), glintAlpha = Math.sin(Math.PI * span(t, 7.4, 8.5)) * .8;
        stroke(ctx, env.text, 0, L, shade(light, -.12), 30, .07 * fade);
        stroke(ctx, env.text, 0, L, shade(light, .1), 11, .2 * fade);
        stroke(ctx, env.text, 0, L, light, 3.6, .96 * fade);
        stroke(ctx, env.text, L - 260, L, shade(light, .8), 4.6, .9 * fade * (t < 8.1 ? 1 : 1 - span(t, 8.1, 8.6)));
        if (glintAlpha > 0) stroke(ctx, env.text, glint - 110, glint + 110, '#ffffff', 4.4, glintAlpha * fade);
        ctx.save(); drawSparks(ctx, sparks, t, 70); ctx.restore();
        // The light leaves the last letter as a comet and flies to the mark.
        let tip = pointAt(env.text, L);
        if (p.travel > 0) {
          stroke(ctx, env.travel, p.travel - 240, p.travel, shade(light, .1), 10, .25);
          tip = stroke(ctx, env.travel, p.travel - 240, p.travel, shade(light, .65), 3.4, .9) || tip;
        }
        if (t > .5 && t < 9.35) sparkle(ctx, tip.x, tip.y, 15 + 3 * Math.sin(t * 9), t * 1.6, smooth((t - .5) / .4), shadeTrip(light, .75));
      },
      mark({ctx, t, trace}, limit, progress) {
        trace(limit, .07, 26, shade(light, -.12));
        trace(limit, .2, 9, shade(light, .1));
        const tip = trace(limit, 1, 2.8, shade(light, .35));
        ctx.save(); drawSparks(ctx, markSparks, t, 55); ctx.restore();
        if (progress < 1) sparkle(ctx, tip.x, tip.y, 13, t * 1.6, 1, shadeTrip(light, .75));
        return tip;
      },
    };
  }

  /* ======================================================================
   * 星际 · 远航 — dawn over a planet's limb, a mission countdown, thrusters
   * firing along the horizon, then a trajectory that locks onto the mark.
   * Original sci-fi artwork; no film titles, logos or frames.
   * ==================================================================== */
  function voyage(env) {
    const R = rng(4242), PLANET = {x: 960, y: 3460, r: 2620};
    const stars = Array.from({length: 430}, () => ({x: R() * 3200 - 640, y: R() * 2400 - 900, z: R(), r: .35 + R() * 1.2, ph: R() * 6.28}));
    const lights = Array.from({length: 260}, () => ({a: (R() - .5) * .62, depth: 14 + R() * 260, r: .6 + R() * 1.4, ph: R() * 6.28}));
    const engines = Array.from({length: 13}, (_, i) => ({a: -.33 + i * (.66 / 12) + (R() - .5) * .015, len: 175 + R() * 135, w: 8 + R() * 7, ph: R() * 6.28, delay: Math.abs(i - 6) * .07}));
    const TELEMETRY = ['DEPARTURE SEQUENCE   启航序列', 'ORBIT ............ 1.000 AU', 'VELOCITY ........ {v} KM/S', 'DESTINATION ...... 4.24 LY', 'STATUS ........... {s}'];
    const drop = t => 300 * ease(span(t, 6.1, 11)) - 80 * (1 - easeOut(span(t, 0, 2.6)));
    const P = env.style.colors, E = env.style.elements, hud = P.hud, text = shade(hud, .3), bright = shade(hud, .8);
    const big = {sans: 200, mono: 400, serif: 400}[env.style.font] ?? 300, small = {sans: 500, mono: 500, serif: 600}[env.style.font] ?? 500;
    return {
      mark: {halo: `rgb(${P.glow})`, core: P.mark, width: 2.4, haloAlpha: .16, haloWidth: 14},
      echo: hud, ink: hud, end: '#02050b',
      scene({ctx, t, view}) {
        const fade = fadeOut(t), hudAlpha = E.hud * smooth(span(t, .4, 1.3)) * fade;
        const dy = drop(t), speed = 300 * Math.max(0, ease(span(t + .05, 6.1, 11)) - ease(span(t - .05, 6.1, 11))) * 2.4 * E.streaks / .6;
        fillView(ctx, view, '#02050b');
        // Stars stream past once the burn begins.
        ctx.save(); ctx.strokeStyle = '#dceeff'; ctx.lineCap = 'round';
        for (const s of stars) {
          const y = s.y + dy * (.15 + s.z * .55) + 0, streak = speed * (.4 + s.z * 2.2) + .01;
          const a = (.25 + .75 * (.5 + .5 * Math.sin(t * 1.7 + s.ph))) * smooth(span(t, 0, 1.6)) * (.4 + s.z * .6);
          if (y < view.top - 40 || y > view.bottom + 40) continue;
          ctx.globalAlpha = a * (1 - Math.min(.5, streak / 160)); ctx.lineWidth = s.r * 1.6; ctx.beginPath(); ctx.moveTo(s.x, y); ctx.lineTo(s.x, y - streak); ctx.stroke();
        }
        ctx.restore();
        // Planet with night-side city lights and a dawn-lit atmosphere.
        const cy = PLANET.y + dy, sunX = 430, sunY = cy - Math.sqrt(PLANET.r ** 2 - (sunX - PLANET.x) ** 2);
        const body = ctx.createRadialGradient(PLANET.x - 700, cy - PLANET.r + 160, 60, PLANET.x, cy, PLANET.r);
        body.addColorStop(0, P.planet[0]); body.addColorStop(.12, P.planet[1]); body.addColorStop(.35, P.planet[2]); body.addColorStop(1, P.planet[3]);
        ctx.fillStyle = body; ctx.beginPath(); ctx.arc(PLANET.x, cy, PLANET.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = P.lights;
        for (const c of lights) {
          const r = PLANET.r - c.depth, x = PLANET.x + Math.sin(c.a) * r, y = cy - Math.cos(c.a) * r;
          ctx.globalAlpha = (.25 + .35 * Math.sin(c.ph + t * .7) ** 2) * clamp((x - 520) / 500) * smooth(span(t, .8, 2.4));
          ctx.beginPath(); ctx.arc(x, y, c.r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        const dawn = easeOut(span(t, .7, 3.2));
        const rim = ctx.createLinearGradient(view.left, 0, view.right, 0);
        rim.addColorStop(0, rgba(P.rim, .7)); rim.addColorStop(clamp((sunX - view.left) / (view.right - view.left)), 'rgba(255,246,222,1)');
        rim.addColorStop(.62, rgba(P.rim, .55)); rim.addColorStop(1, rgba(P.rim, .25));
        for (const [w, a] of [[64, .05], [18, .2], [2.6, .75]]) {
          ctx.save(); ctx.globalAlpha = a * (.35 + .65 * dawn); ctx.strokeStyle = rim; ctx.lineWidth = w;
          ctx.beginPath(); ctx.arc(PLANET.x, cy, PLANET.r, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke(); ctx.restore();
        }
        // The sun clears the limb: a hot core and a long anamorphic streak.
        const sunUp = sunY - 26 * dawn + 30 * (1 - dawn);
        radial(ctx, sunX, sunUp, 720, P.glow, .16 * dawn);
        radial(ctx, sunX, sunUp, 190, '255,243,214', .85 * dawn);
        radial(ctx, sunX, sunUp, 34, '255,255,255', dawn);
        for (const [h, a, len] of [[5, .45, 900], [1.4, .7, 1500]]) {
          const g = ctx.createLinearGradient(sunX - len, 0, sunX + len, 0);
          g.addColorStop(0, 'rgba(150,210,255,0)'); g.addColorStop(.5, `rgba(235,248,255,${a * dawn})`); g.addColorStop(1, 'rgba(150,210,255,0)');
          ctx.fillStyle = g; ctx.fillRect(sunX - len, sunUp - h / 2, len * 2, h);
        }
        // Thrusters fire from the centre of the horizon outwards.
        for (const e of engines) {
          const ign = E.thrusters * smooth((t - 4.45 - e.delay) / .5) * (1 - .55 * smooth((t - 10) / 2.5));
          if (ign <= 0) continue;
          const bx = PLANET.x + Math.sin(e.a) * PLANET.r, by = cy - Math.cos(e.a) * PLANET.r, len = e.len * ign * (1 + .07 * Math.sin(t * 24 + e.ph));
          ctx.save(); ctx.translate(bx, by); ctx.rotate(e.a);
          for (const [scale, a, c0] of [[3.2, .22, P.glow], [1, .95, P.plume]]) {
            const g = ctx.createLinearGradient(0, 0, 0, -len * (scale > 1 ? 1.15 : 1));
            g.addColorStop(0, `rgba(${c0},${a})`); g.addColorStop(1, `rgba(${c0},0)`);
            ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-e.w * scale / 2, 0); ctx.lineTo(0, -len * (scale > 1 ? 1.15 : 1)); ctx.lineTo(e.w * scale / 2, 0); ctx.closePath(); ctx.fill();
          }
          ctx.restore();
          radial(ctx, bx, by, 60, P.rim, .45 * ign);
        }
        const flash = smooth(span(t, 4.4, 4.55)) * (1 - smooth(span(t, 4.55, 5.6)));
        if (flash > 0 && (E.thrusters || E.countdown)) { ctx.save(); ctx.globalAlpha = .2 * flash; fillView(ctx, view, shade(hud, .7)); ctx.restore(); }

        // HUD: corner brackets, typed telemetry, countdown ring.
        ctx.save(); ctx.globalAlpha = hudAlpha * .7; ctx.strokeStyle = hud; ctx.lineWidth = 1.5;
        const ix = 56, b = 64;
        for (const [x, y, sx, sy] of [[view.left + ix, view.top + ix, 1, 1], [view.right - ix, view.top + ix, -1, 1], [view.left + ix, view.bottom - ix, 1, -1], [view.right - ix, view.bottom - ix, -1, -1]]) {
          ctx.beginPath(); ctx.moveTo(x, y + sy * b); ctx.lineTo(x, y); ctx.lineTo(x + sx * b, y); ctx.stroke();
        }
        ctx.restore();
        const vel = t < 4.5 ? '29.78' : (29.78 + 11.4 * ease(span(t, 4.5, 8))).toFixed(2), state = t < 4.45 ? 'STANDBY' : t < 6.1 ? 'IGNITION' : 'EN ROUTE';
        TELEMETRY.forEach((line, i) => {
          const text = line.replace('{v}', vel).replace('{s}', state), shown = Math.floor(text.length * span(t, .9 + i * .32, 1.6 + i * .32));
          label(ctx, text.slice(0, shown), view.left + 120, view.top + 150 + i * 32, {font: `${i ? 400 : 600} 19px ${MONO}`, color: i === 4 && t >= 4.45 ? '#ffd58a' : text, align: 'left', alpha: hudAlpha * (i ? .72 : .95)});
        });
        label(ctx, 'T+' + (t < 4.45 ? '00:00' : `00:${String(Math.floor((t - 4.45) * 1.3)).padStart(2, '0')}`), view.right - 120, view.top + 150, {font: `500 19px ${MONO}`, color: text, align: 'right', alpha: hudAlpha * .8});
        const cd = span(t, 2.2, 4.45), ring = E.countdown * smooth(span(t, 1.9, 2.4)) * (1 - smooth(span(t, 4.45, 5.1)));
        if (ring > 0) {
          ctx.save(); ctx.globalAlpha = ring; ctx.translate(960, 500); ctx.strokeStyle = rgba(hud, .35); ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(0, 0, 168, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); for (let k = 0; k < 60; k++) { const a = k / 60 * Math.PI * 2, r0 = k % 5 ? 178 : 174; ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a) * 186, Math.sin(a) * 186); } ctx.stroke();
          ctx.strokeStyle = bright; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 168, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (cd * 3 % 1 || (cd >= 1 ? 1 : 0))); ctx.stroke();
          ctx.restore();
          const n = Math.min(2, Math.floor(cd * 3)), local = cd * 3 - n, digit = 3 - n;
          if (cd < 1) label(ctx, String(digit), 960, 582, {font: face(env, 230, big), color: bright, alpha: ring * smooth(local / .15) * (1 - smooth((local - .75) / .25))});
        }
        label(ctx, 'IGNITION', 960, 520, {font: face(env, 46, small), color: bright, tracking: 18, alpha: (E.countdown || E.thrusters) * Math.sin(Math.PI * span(t, 4.4, 5.15)) * .95});
        // Greeting: a scan-line wipe with a settling colour fringe.
        const wipe = ease(span(t, 5.25, 6.2)), fringe = 1 - smooth(span(t, 5.3, 6.7));
        if (wipe > 0) {
          ctx.save(); ctx.beginPath(); ctx.rect(960 - 720 * wipe, 380, 1440 * wipe, 320); ctx.clip();
          // Two lines: eyebrow and callsign. One line: the whole greeting as the callsign.
          const two = env.style.layout === 'two', eyebrow = env.copy.greeting === 'Welcome' ? 'WELCOME ABOARD' : env.copy.greeting.toUpperCase();
          const callsign = two ? env.copy.name.toUpperCase() : `${env.copy.greeting} ${env.copy.name}`.toUpperCase(), y = two ? 620 : 596, px = two ? 168 : 132;
          if (two) label(ctx, eyebrow, 960, 452, {font: face(env, 34, small), color: hud, tracking: 16, fit: 1300, alpha: fade * .9});
          for (const [dx, c] of [[-5 * fringe, '#47e0ff'], [5 * fringe, '#ff5cc8']]) if (fringe > .02) label(ctx, callsign, 960 + dx, y, {font: face(env, px, big), color: c, tracking: 34, fit: 1400, alpha: fade * .35 * fringe});
          label(ctx, callsign, 960, y, {font: face(env, px, big), color: P.mark, tracking: 34, fit: 1400, alpha: fade});
          ctx.restore();
          ctx.save(); ctx.globalAlpha = .6 * fade * wipe; ctx.fillStyle = bright; ctx.fillRect(960 - 720 * wipe, 380 + 320 * ((t * .9) % 1), 1440 * wipe, 1.2); ctx.restore();
        }
        // Trajectory from the horizon to the mark; a pulse makes the connection.
        const p0 = env.points[0], start = {x: 860, y: cy - Math.sqrt(PLANET.r ** 2 - 100 ** 2) - 6};
        const path = bezier(start, {x: start.x + 160, y: start.y - 430}, {x: p0.x - 300, y: p0.y + 260}, p0), Lpath = path.at(-1).l;
        const plot = ease(span(t, 5.5, 7.1)), lineAlpha = (1 - smooth((t - 10.4) / 2)) * .9;
        if (plot > 0) {
          ctx.save(); ctx.setLineDash([6, 9]); ctx.lineDashOffset = -t * 40; stroke(ctx, path, 0, Lpath * plot, hud, 1.6, .55 * lineAlpha); ctx.restore();
          const pulse = Lpath * ease(span(t, 7.1, 9.3));
          if (pulse > 0) {
            stroke(ctx, path, 0, pulse, `rgb(${P.glow})`, 8, .18 * lineAlpha); stroke(ctx, path, 0, pulse, P.mark, 2, lineAlpha);
            if (t < 9.4) { const at = pointAt(path, pulse); radial(ctx, at.x, at.y, 40, P.rim, .8); }
          }
        }
        // Target lock closes in around the mark.
        const lock = ease(span(t, 7.3, 9.1)), lockAlpha = smooth(span(t, 7.3, 7.7)) * (1 - smooth(span(t, 9.8, 11)));
        if (lockAlpha > 0) {
          const half = mix(330, 215, lock), arm = 46;
          ctx.save(); ctx.globalAlpha = lockAlpha * .85; ctx.strokeStyle = hud; ctx.lineWidth = 2;
          for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            const x = 1392 + sx * half, y = 540 + sy * half;
            ctx.beginPath(); ctx.moveTo(x, y - sy * arm); ctx.lineTo(x, y); ctx.lineTo(x - sx * arm, y); ctx.stroke();
          }
          ctx.restore();
          label(ctx, lock >= 1 ? 'TARGET LOCKED' : 'ACQUIRING', 1392 - half, 540 + half + 30, {font: `500 15px ${MONO}`, color: text, align: 'left', alpha: lockAlpha * .85 * E.hud});
        }
      },
      front({ctx, t, g}) {
        // Warp lines while the camera dives through the mark.
        if (g.z <= 0) return;
        const a = Math.sin(Math.PI * clamp(g.z * 1.2)) * .55;
        ctx.save(); ctx.strokeStyle = shade(hud, .6); ctx.lineCap = 'round';
        for (let k = 0; k < 90; k++) {
          const ang = k * 2.39996, r0 = 160 + ((k * 97) % 520) + g.z * 900, r1 = r0 + 120 + g.z * 900;
          ctx.globalAlpha = a * (.3 + ((k * 37) % 10) / 14); ctx.lineWidth = 1 + (k % 3);
          ctx.beginPath(); ctx.moveTo(g.centreX + Math.cos(ang) * r0, 540 + Math.sin(ang) * r0); ctx.lineTo(g.centreX + Math.cos(ang) * r1, 540 + Math.sin(ang) * r1); ctx.stroke();
        }
        ctx.restore();
      },
    };
  }

  /* ======================================================================
   * 霓虹 · 雨夜 — the frost pen path as a neon tube in the rain: it flickers
   * on, one letter misbehaves, current runs down the tube into a cyan mark,
   * and a puddle carries the reflection.
   * ==================================================================== */
  function neon(env) {
    const R = rng(2077), HORIZON = 800, P = env.style.colors, E = env.style.elements;
    const rain = Array.from({length: 380}, () => ({x: R() * 2900 - 500, y: R() * 1700, len: 26 + R() * 54, sp: 1300 + R() * 900, a: .06 + R() * .16}));
    const bokeh = Array.from({length: 44}, () => ({x: R() * 2400 - 240, y: 60 + R() * 700, r: 18 + R() * 70, c: ['255,70,160', '70,220,255', '255,178,90', '150,110,255'][Math.floor(R() * 4)], a: .04 + R() * .09, ph: R() * 6.28}));
    const ripples = Array.from({length: 64}, () => ({y: R(), x: R() * 2400 - 240, w: 120 + R() * 520, ph: R() * 6.28}));
    // Ignition flicker and one temperamental stretch of tube, both scripted.
    const ON = [[1.62, 1.7], [1.92, 2.0], [2.18, 2.5], [2.62, 2.66], [2.82, 8.85], [8.97, 9.05], [9.12, 9.18]];
    const FAULTY = [env.textLength * .5997, env.textLength * .6803], FAULT_OFF = E.fault ? [[4.9, 5.03], [5.26, 5.31], [6.08, 6.18], [6.3, 6.33]] : [];
    const drops = Math.round(230 * E.rain / .6);
    const inside = (t, list) => list.some(([a, b]) => t >= a && t < b);
    function tube(ctx, from, to, lit, scale = 1) {
      if (scale === 1) stroke(ctx, env.text, from, to, shade(P.tube, -.08), 46, .09 * lit);
      stroke(ctx, env.text, from, to, P.tube, 18 * scale, .24 * lit);
      stroke(ctx, env.text, from, to, P.core, 4.6 * scale, lit);
      stroke(ctx, env.text, from, to, '#ffffff', 1.6 * scale, .55 * lit);
    }
    function sign(ctx, t, lit, glass, scale = 1) {
      const drawn = env.textLength * ease(span(t, .2, 1.7));
      stroke(ctx, env.text, 0, drawn, '#3d2b3c', 7 * scale, .6 * glass);
      stroke(ctx, env.text, 0, drawn, '#6a4b66', 2 * scale, .32 * glass);
      if (lit <= 0) return;
      const faulty = inside(t, FAULT_OFF) ? .08 : 1;
      tube(ctx, 0, FAULTY[0], lit, scale); tube(ctx, FAULTY[0], FAULTY[1], lit * faulty, scale); tube(ctx, FAULTY[1], env.textLength, lit, scale);
    }
    return {
      echo: P.mark, ink: P.mark, end: '#07060c',
      scene({ctx, t, view}) {
        const fade = fadeOut(t), glass = smooth(span(t, .1, 1)) * fade;
        const lit = (inside(t, ON) ? 1 : 0) * (.86 + .14 * smooth(span(t, 2.82, 3.4))) * (.97 + .03 * Math.sin(t * 61));
        const sky = ctx.createLinearGradient(0, view.top, 0, view.bottom);
        sky.addColorStop(0, '#0d0b1c'); sky.addColorStop(.62, '#120c22'); sky.addColorStop(1, '#040408');
        fillView(ctx, view, sky);
        for (const b of bokeh) radial(ctx, b.x + Math.sin(t * .2 + b.ph) * 12, b.y, b.r, b.c, E.bokeh / .6 * b.a * smooth(span(t, 0, 1.5)) * (.8 + .2 * Math.sin(t * .9 + b.ph)));
        radial(ctx, 960, 570, 980, P.glow, .11 * lit * fade);
        // Wet street: a faint horizon, pink spill and a broken reflection.
        const street = ctx.createLinearGradient(0, HORIZON, 0, view.bottom);
        street.addColorStop(0, 'rgba(40,24,52,.55)'); street.addColorStop(1, 'rgba(6,5,10,.9)');
        ctx.fillStyle = street; ctx.fillRect(view.left, HORIZON, view.right - view.left, view.bottom - HORIZON + 2);
        ctx.save(); ctx.beginPath(); ctx.rect(view.left, HORIZON, view.right - view.left, view.bottom - HORIZON + 2); ctx.clip();
        ctx.globalAlpha = .22 * E.reflection; ctx.translate(0, HORIZON + 8); ctx.scale(1, -.74); ctx.translate(0, -HORIZON); sign(ctx, t, lit * fade, glass * .6, 1.3); ctx.restore();
        ctx.save(); ctx.strokeStyle = '#07060c'; ctx.lineCap = 'round';
        for (const r of ripples) {
          const y = HORIZON + 14 + r.y * (view.bottom - HORIZON), x = r.x + Math.sin(t * 1.3 + r.ph) * 30;
          ctx.globalAlpha = .55; ctx.lineWidth = 2 + r.y * 5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + r.w, y); ctx.stroke();
        }
        ctx.restore();
        const deep = ctx.createLinearGradient(0, HORIZON, 0, HORIZON + 300); deep.addColorStop(0, 'rgba(6,5,10,0)'); deep.addColorStop(1, 'rgba(6,5,10,.82)');
        ctx.fillStyle = deep; ctx.fillRect(view.left, HORIZON, view.right - view.left, view.bottom - HORIZON + 2);
        ctx.save(); ctx.globalAlpha = .07; ctx.fillStyle = '#ffffff'; ctx.fillRect(view.left, HORIZON, view.right - view.left, 1.2); ctx.restore();

        sign(ctx, t, lit * fade, glass);
        // Current runs down the tube from the last letter into the mark.
        const p = pen(t, env), alive = 1 - smooth((t - 10.4) / 1.8);
        if (p.travel > 0) {
          stroke(ctx, env.travel, 0, p.travel, shade(P.mark, -.1), 30, .1 * alive); stroke(ctx, env.travel, 0, p.travel, P.mark, 11, .28 * alive);
          const head = stroke(ctx, env.travel, 0, p.travel, P.markCore, 3.2, alive);
          if (head && t < 9.4) sparkle(ctx, head.x, head.y, 14, t * 3, 1, trip(P.markCore));
        }
        // Rain, lit by the sign.
        ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = 1.3;
        const H = view.bottom - view.top + 300;
        for (const pass of [0, 1]) {
          ctx.strokeStyle = pass ? rgba(shadeTrip(P.glow, .45), .22 + .3 * lit) : 'rgba(170,190,255,.3)'; ctx.beginPath();
          for (let i = pass; i < Math.min(drops, rain.length); i += 2) {
            const d = rain[i], y = view.top - 150 + ((d.y + d.sp * t * .55) % H), x = d.x + (y - view.top) * .14;
            ctx.moveTo(x, y); ctx.lineTo(x - d.len * .14, y - d.len);
          }
          ctx.globalAlpha = smooth(span(t, 0, .8)); ctx.stroke();
        }
        ctx.restore();
      },
      mark({trace}, limit) {
        trace(limit, .1, 34, shade(P.mark, -.1));
        trace(limit, .26, 12, P.mark);
        trace(limit, 1, 3.6, P.markCore);
        return trace(limit, .55, 1.4, '#ffffff');
      },
      front({ctx, t, view}) {
        // A few close, fast drops in front of everything for depth.
        if (E.rain <= .05) return;
        ctx.save(); ctx.strokeStyle = `rgba(200,215,255,${.16 * Math.min(1.5, E.rain / .6)})`; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.beginPath();
        const H = view.bottom - view.top + 400;
        for (let i = 0; i < 26; i++) {
          const d = rain[i], y = view.top - 200 + ((d.y * 1.3 + d.sp * t * 1.1) % H), x = d.x * .8 + 200 + (y - view.top) * .2;
          ctx.moveTo(x, y); ctx.lineTo(x - 22, y - 120);
        }
        ctx.stroke(); ctx.restore();
      },
    };
  }


  /* ======================================================================
   * 水墨 · 山水 — ink drops bloom into layered mountains on rice paper, mist
   * drifts, a small boat crosses the water. A broad-nib brush writes the
   * greeting in the empty sky, a name seal is stamped, and one brush line
   * carries on into the mark.
   * ==================================================================== */
  /** Per-point widths (0–1) for a broad nib held at `angle`: thick when the
   *  pen moves across the nib, thin along it, tapered at every pen lift. */
  function nibWidths(pts, angle = .55) {
    const nx = Math.cos(angle), ny = Math.sin(angle);
    const raw = pts.map((p, i) => {
      const q = pts[Math.max(0, i - 2)], r = pts[Math.min(pts.length - 1, i + 2)], dx = r.x - q.x, dy = r.y - q.y, l = Math.hypot(dx, dy) || 1;
      return .3 + .7 * Math.abs((dx * ny - dy * nx) / l);
    });
    const soft = raw.map((_, i) => { let sum = 0, n = 0; for (let k = -5; k <= 5; k++) if (raw[i + k] !== undefined) { sum += raw[i + k]; n++; } return sum / n; });
    // Pen-down runs taper at both ends.
    for (let i = 0; i < pts.length;) {
      let j = i + 1;
      while (j < pts.length && !pts[j].lift) j++;
      const l0 = pts[i].l, l1 = pts[j - 1].l;
      for (let k = i; k < j; k++) soft[k] *= .35 + .65 * smooth(Math.min(pts[k].l - l0, l1 - pts[k].l) / 26);
      i = j;
      while (i < pts.length && pts[i].lift) i++;
      if (i < pts.length && i > 0) i = Math.max(i - 1, j);
    }
    return soft;
  }
  /** Stroke a stretch of a pen path with per-point widths, batched by width. */
  function brush(ctx, pts, widths, from, to, base, color, alpha) {
    if (alpha <= .002 || to <= from) return null;
    const buckets = Array.from({length: 8}, () => new Path2D());
    let prev = pointAt(pts, Math.max(0, from)), end = prev;
    for (let i = indexAt(pts, from) + 1; i < pts.length; i++) {
      const p = pts[i].l > to ? pointAt(pts, to) : pts[i];
      if (!pts[i].lift) { const b = buckets[Math.min(7, Math.floor(widths[i] * 8))]; b.moveTo(prev.x, prev.y); b.lineTo(p.x, p.y); }
      prev = p; end = p;
      if (pts[i].l >= to) break;
    }
    ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    buckets.forEach((b, k) => { ctx.lineWidth = Math.max(.6, base * (k + .6) / 8); ctx.stroke(b); });
    ctx.restore();
    return end;
  }
  function ink(env) {
    const R = rng(1271), P = env.style.colors, E = env.style.elements, paper = trip(P.paper);
    const dark = paper.split(',').reduce((n, v, i) => n + v * [.299, .587, .114][i], 0) < 128;
    // The greeting sits in the empty sky above the mountains, as an inscription would.
    const TX = 958, TY = 335, TS = .82, place = p => ({x: TX + (p.x - 958) * TS, y: TY + (p.y - 570) * TS});
    const widths = nibWidths(env.text);
    const tail = place(env.text.at(-1));
    let right = -Infinity, bottom = -Infinity;
    for (const q of env.text) { const m = place(q); right = Math.max(right, m.x); bottom = Math.max(bottom, m.y); }
    const name = env.copy.name, cjk = [...name].filter(c => /[㐀-鿿豈-﫿]/.test(c));
    const sealText = cjk.length ? cjk.slice(0, 2).join('') : (name.match(/[\p{L}\p{N}]/u)?.[0] || '印').toUpperCase();
    const SEAL = {x: Math.min(1700, right + 70), y: Math.min(560, bottom + 4), size: 88};
    // Mountain layers, composed like a hanging scroll: distant soft peaks, a
    // tall massif on each side, and a dark near cliff, leaving the middle open
    // for water and the mark. Peaks: [centre, height, half-width, lean].
    function layer(base, peaks, seed, cun) {
      const r = rng(seed);
      const y = x => base - Math.max(0, ...peaks.map(([cx, h, w, lean = 0]) => {
        const u = (x - cx) / w + lean * ((x - cx) / w) ** 2;
        return Math.abs(u) >= 1 ? 0 : h * Math.pow(Math.cos(u * Math.PI / 2), 1.35) * (1 + .05 * Math.sin(u * 13 + cx));
      })) - 4 * Math.sin(x / 31 + seed);
      const fill = new Path2D(), edge = new Path2D(), texture = new Path2D();
      fill.moveTo(-1300, 4000);
      for (let x = -1300; x <= 3220; x += 10) { fill.lineTo(x, y(x)); x === -1300 ? edge.moveTo(x, y(x)) : edge.lineTo(x, y(x)); }
      fill.lineTo(3220, 4000); fill.closePath();
      // Short dry-brush strokes down the slopes (cun), denser near the ridge.
      for (const [cx, h, w] of peaks) for (let k = 0; k < cun; k++) {
        const x = cx + (r() - .5) * w * 1.3, top = y(x);
        if (top > base - 20) continue;
        const len = 30 + r() * 110 * (h / 300);
        texture.moveTo(x, top + 6 + r() * 20); texture.quadraticCurveTo(x + (r() - .5) * 18, top + len * .5, x + (r() - .5) * 26, top + len);
      }
      return {fill, edge, texture, top: base - Math.max(...peaks.map(q => q[1])), base, y};
    }
    const LAYERS = [
      {...layer(700, [[-120, 180, 300], [240, 230, 260, .2], [560, 150, 280], [880, 200, 300, -.15], [1180, 130, 240], [1480, 210, 260, .1], [1780, 250, 300, -.2], [2120, 170, 320]], 31, 0),
        color: P.wash, alpha: .2, outline: .06, cunAlpha: 0, seeds: [[260, 560], [1500, 560]], at: .3},
      {...layer(860, [[40, 470, 250, .15], [260, 400, 200, -.1], [450, 260, 190], [1560, 300, 220, .1], [1760, 440, 230, -.15], [2010, 330, 260]], 57, 26),
        color: P.wash, alpha: .4, outline: .16, cunAlpha: .16, seeds: [[200, 520], [1760, 520]], at: 1},
      {...layer(1190, [[-40, 650, 340, .12], [260, 470, 220, -.2], [1900, 430, 300, .1]], 83, 18),
        color: trip(P.ink), alpha: .66, outline: .32, cunAlpha: .26, seeds: [[60, 640], [1900, 800]], at: 1.7},
    ];
    // A few pines lean from the near cliff.
    const PINES = [[150, 1.1], [300, .9], [380, .75]].map(([x, s]) => ({x, y: LAYERS[2].y(x), s}));
    function pine(ctx, x, y, s, alpha) {
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.globalAlpha = alpha; ctx.strokeStyle = P.ink; ctx.fillStyle = P.ink; ctx.lineCap = 'round';
      ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 6); ctx.quadraticCurveTo(-6, -40, 10, -92); ctx.stroke();
      for (const [dy, w] of [[-92, 34], [-70, 50], [-48, 62], [-28, 44]]) { ctx.beginPath(); ctx.ellipse(6 + w * .12, dy, w / 2, 7, -.12, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    const ripples = Array.from({length: 22}, () => ({x: R() * 2400 - 240, y: 930 + R() * 130, w: 40 + R() * 160, ph: R() * 6.28}));
    let fibreTile = null;
    const fibre = ctx => {
      if (!fibreTile) {
        const c = document.createElement('canvas'); c.width = c.height = 24; const g = c.getContext('2d');
        g.fillStyle = rgba(P.ink, .018); for (let i = 0; i < 9; i++) g.fillRect((i * 7) % 24, (i * 11) % 24, 7, 1);
        g.fillStyle = rgba(P.ink, .012); for (let i = 0; i < 6; i++) g.fillRect((i * 5) % 24, (i * 13) % 24, 1, 6);
        fibreTile = ctx.createPattern(c, 'repeat');
      }
      return fibreTile;
    };
    function boat(ctx, x, y, alpha, flip = 1) {
      ctx.save(); ctx.translate(x, y); ctx.scale(1, flip); ctx.globalAlpha = alpha; ctx.fillStyle = P.ink; ctx.strokeStyle = P.ink; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-62, -2); ctx.quadraticCurveTo(0, 20, 64, -6); ctx.lineTo(50, -2); ctx.quadraticCurveTo(0, 10, -50, 1); ctx.closePath(); ctx.fill();
      ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(6, -2); ctx.lineTo(3, -24); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-9, -24); ctx.lineTo(16, -24); ctx.lineTo(4, -35); ctx.closePath(); ctx.fill();
      ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-4, -16); ctx.lineTo(-46, 34); ctx.stroke();
      ctx.restore();
    }
    function seal(ctx, alpha, scale) {
      if (alpha <= .002) return;
      const u = SEAL.size / 100, chars = [...sealText];
      ctx.save(); ctx.translate(SEAL.x, SEAL.y); ctx.rotate(.04); ctx.scale(scale * u, scale * u); ctx.translate(-50, -50); ctx.globalAlpha = alpha;
      if (!dark) ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = P.seal; ctx.beginPath(); ctx.roundRect(4, 4, 92, 92, 8); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgb(${paper})`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `700 ${chars.length > 1 ? 40 : 64}px "Kaiti SC","STKaiti","Songti SC",serif`;
      if (chars.length > 1) { ctx.fillText(chars[0], 50, 30); ctx.fillText(chars[1], 50, 72); } else ctx.fillText(chars[0], 50, 54);
      ctx.fillStyle = `rgb(${paper})`;
      for (let i = 0; i < 18; i++) { const r = rng(i + 7), a = r() * Math.PI * 2; ctx.beginPath(); ctx.arc(50 + Math.cos(a) * (42 + r() * 6), 50 + Math.sin(a) * (42 + r() * 6), .8 + r() * 1.6, 0, 7); ctx.fill(); }
      ctx.restore();
    }
    return {
      echo: P.ink, ink: P.ink, end: P.paper,
      scene({ctx, t, view}) {
        const fade = fadeOut(t);
        fillView(ctx, view, P.paper); fillView(ctx, view, fibre(ctx));
        const aged = ctx.createRadialGradient(960, 480, 300, 960, 480, Math.max(1400, (view.right - view.left) * .75));
        aged.addColorStop(0, rgba(P.wash, 0)); aged.addColorStop(1, rgba(P.wash, dark ? .1 : .14));
        fillView(ctx, view, aged);
        // Mountains bleed in from ink drops; each layer settles darker at its ridge.
        const strength = Math.min(1.25, E.mountains / .8);
        for (const [i, L] of LAYERS.entries()) {
          if (strength * L.alpha <= .01 || (i === 2 && E.mountains < .25)) continue;
          const bleed = easeOut(span(t, L.at, L.at + 2.4));
          if (bleed <= 0) continue;
          // Ink drops land and diffuse, while the layer soaks in from its ridge down.
          for (const [x, y] of L.seeds) radial(ctx, x, y, 40 + 260 * bleed, trip(P.ink), .38 * Math.sin(Math.PI * span(t, L.at - .1, L.at + 1.6)) * strength);
          ctx.save(); ctx.globalAlpha = bleed;
          const g = ctx.createLinearGradient(0, L.top, 0, L.base + 220);
          g.addColorStop(0, rgba(L.color, L.alpha * strength)); g.addColorStop(.5, rgba(L.color, L.alpha * .5 * strength)); g.addColorStop(1, rgba(L.color, 0));
          ctx.fillStyle = g; ctx.fill(L.fill);
          ctx.lineJoin = 'round'; ctx.lineCap = 'round';
          ctx.strokeStyle = rgba(P.ink, L.outline * strength); ctx.lineWidth = 2.4; ctx.stroke(L.edge);
          if (L.cunAlpha) { ctx.strokeStyle = rgba(P.ink, L.cunAlpha * strength); ctx.lineWidth = 1.6; ctx.stroke(L.texture); }
          ctx.restore();
          if (i === 2) for (const q of PINES) pine(ctx, q.x, q.y + 4, q.s, .85 * bleed * strength);
        }
        // Mist bands drift across the valleys.
        for (const [i, y] of [650, 760, 880].entries()) {
          const a = .72 * E.mist * smooth(span(t, .8 + i * .4, 2.6 + i * .4));
          if (a <= .01) continue;
          const g = ctx.createLinearGradient(0, y - 70, 0, y + 70);
          g.addColorStop(0, rgba(paper, 0)); g.addColorStop(.5, rgba(paper, a)); g.addColorStop(1, rgba(paper, 0));
          ctx.fillStyle = g; ctx.fillRect(view.left, y - 70, view.right - view.left, 140);
          radial(ctx, (300 + i * 620 + t * (18 + i * 8)) % 2400 - 200, y, 260, paper, a * .8);
        }
        // Water, ripples and a small boat with its reflection.
        ctx.save(); ctx.strokeStyle = P.ink; ctx.lineCap = 'round';
        for (const r of ripples) { ctx.globalAlpha = .1 * smooth(span(t, 1.5, 3)); ctx.lineWidth = 1.6; ctx.beginPath(); const x = r.x + Math.sin(t * .6 + r.ph) * 14; ctx.moveTo(x, r.y); ctx.lineTo(x + r.w, r.y); ctx.stroke(); }
        ctx.restore();
        if (E.boat) {
          const appear = smooth(span(t, 1.8, 3)), bx = 980 + 300 * span(t, 1.8, 14), by = 968 + 2.5 * Math.sin(t * 1.4);
          ctx.save(); ctx.translate(bx, by); ctx.scale(1.35, 1.35); boat(ctx, 0, 0, .85 * appear); boat(ctx, 0, 10, .14 * appear, -.6); ctx.restore();
        }
        // The inscription: a broad-nib brush on the pen path, with a faint bleed.
        const p = pen(t, env);
        ctx.save(); ctx.translate(TX, TY); ctx.scale(TS, TS); ctx.translate(-958, -570);
        brush(ctx, env.text, widths, 0, p.text, 30, rgba(P.wash, 1), .12 * fade);
        const nib = brush(ctx, env.text, widths, 0, p.text, 17, P.ink, .94 * fade);
        ctx.restore();
        if (nib && t < 8.1) radial(ctx, place(nib).x, place(nib).y, 18, trip(P.ink), .35);
        // The seal is pressed once the brush lifts.
        const stamp = span(t, 7.2, 7.55);
        if (E.seal) seal(ctx, Math.min(1, stamp * 3) * .92 * fadeOut(t + .2), 1 + .35 * Math.pow(1 - easeOut(stamp), 2));
        // One continuous brush line leads into the mark.
        if (t > 7.05) {
          const from = E.seal ? {x: SEAL.x + 30, y: SEAL.y + 34} : tail, q = env.points[0];
          const path = bezier(from, {x: from.x + 120, y: from.y + 200}, {x: q.x - 160, y: q.y + 220}, q);
          const conn = path.map((pt, i) => .3 + .7 * Math.sin(Math.PI * Math.min(1, i / path.length * 1.15)));
          brush(ctx, path, conn, 0, path.at(-1).l * ease(span(t, 7.05, 9.3)), 7, P.ink, .85 * (1 - smooth((t - 10.5) / 2)));
        }
      },
      mark({trace}, limit, progress) {
        trace(limit, .16, 11, rgba(P.wash, 1));
        const tip = trace(limit, .94, 3.6, P.ink);
        return tip;
      },
    };
  }

  /* ======================================================================
   * 极光 · 冰原 — night over an ice field: aurora curtains sway, their light
   * lies on the ice, the greeting condenses out of the glow, and one strand
   * of light pours into the mark. Additive light, drawn as curtain columns.
   * ==================================================================== */
  function aurora(env) {
    const R = rng(5150), P = env.style.colors, E = env.style.elements, HORIZON = E.ice ? 820 : 1400;
    const stars = Array.from({length: 360}, () => ({x: R() * 3000 - 540, y: R() * 1500 - 700, r: .3 + R() * 1.25, ph: R() * 6.28, sp: .5 + R() * 1.5}));
    const ribbons = [
      {base: 380, h: 270, a1: 64, l1: 520, w1: .34, a2: 26, l2: 190, w2: .55, ph: R() * 6, at: .6},
      {base: 285, h: 200, a1: 52, l1: 610, w1: .27, a2: 22, l2: 230, w2: .48, ph: R() * 6, at: 1.3},
      {base: 500, h: 170, a1: 46, l1: 450, w1: .42, a2: 18, l2: 160, w2: .7, ph: R() * 6, at: 2},
    ];
    const ridge = new Path2D();
    ridge.moveTo(-1300, HORIZON + 4);
    for (let x = -1300, r = rng(91); x <= 3220; x += 34) ridge.lineTo(x, HORIZON - 8 - 46 * Math.pow(Math.abs(Math.sin(x / 260 + 1.3)), 3) - 18 * r());
    ridge.lineTo(3220, HORIZON + 4); ridge.closePath();
    // One curtain column: a sharp, bright lower hem rising into the upper colour.
    const column = document.createElement('canvas'); column.width = 4; column.height = 256;
    { const g = column.getContext('2d'), gr = g.createLinearGradient(0, 256, 0, 0);
      gr.addColorStop(0, rgba(P.glow, 0)); gr.addColorStop(.03, rgba(P.glow, .95)); gr.addColorStop(.22, rgba(P.glow, .55));
      gr.addColorStop(.58, rgba(P.high, .22)); gr.addColorStop(1, rgba(P.high, 0)); g.fillStyle = gr; g.fillRect(0, 0, 4, 256); }
    const text = P.text, two = env.style.layout === 'two';
    const eyebrowWeight = {serif: 500, sans: 500, elegant: 400, kai: 700}[env.style.font] ?? 500, nameWeight = {serif: 400, sans: 200, elegant: 400, kai: 700}[env.style.font] ?? 400;
    function curtains(ctx, t, view, strength, step = 14) {
      for (const rb of ribbons) {
        const on = strength * smooth(span(t, rb.at, rb.at + 2.2));
        if (on <= .01) continue;
        for (let x = view.left - 20; x <= view.right + 20; x += step) {
          const base = rb.base + rb.a1 * Math.sin(x / rb.l1 + t * rb.w1 + rb.ph) + rb.a2 * Math.sin(x / rb.l2 - t * rb.w2 + rb.ph * 2);
          const h = rb.h * (.55 + .45 * Math.sin(x / (rb.l1 * .6) + t * .4 + rb.ph * 3));
          const ray = .35 + .65 * (.5 + .5 * Math.sin(x * .045 + t * 1.3 + rb.ph)) * (.6 + .4 * Math.sin(x * .013 - t * .7));
          ctx.globalAlpha = on * ray * .55;
          ctx.drawImage(column, x, base - h, step + 2, h * 1.04);
        }
      }
      ctx.globalAlpha = 1;
    }
    return {
      echo: P.glow, ink: P.glow, end: P.sky[1],
      mark: {halo: P.glow, core: shade(P.glow, .7), width: 2.6, haloAlpha: .2, haloWidth: 16},
      scene({ctx, t, view}) {
        const fade = fadeOut(t), strength = E.curtains / .75;
        const sky = ctx.createLinearGradient(0, view.top, 0, Math.min(view.bottom, HORIZON));
        sky.addColorStop(0, P.sky[0]); sky.addColorStop(.6, P.sky[1]); sky.addColorStop(1, P.sky[2]);
        fillView(ctx, view, sky);
        const night = smooth(span(t, 0, 1.8)) * E.stars / .6;
        ctx.fillStyle = '#eef4ff';
        for (const s of stars) {
          if (s.y > HORIZON - 30) continue;
          const a = night * (.3 + .7 * (.5 + .5 * Math.sin(t * s.sp * 2 + s.ph)));
          if (a <= .01) continue;
          ctx.globalAlpha = Math.min(1, a); ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        if (E.meteor) {
          const m = span(t, 3.1, 3.75);
          if (m > 0 && m < 1) {
            const x = mix(240, 820, m), y = mix(110, 330, m), g = ctx.createLinearGradient(x - 220, y - 84, x, y);
            g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, `rgba(255,255,255,${.9 * Math.sin(m * Math.PI)})`);
            ctx.save(); ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - 220, y - 84); ctx.lineTo(x, y); ctx.stroke(); ctx.restore();
          }
        }
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; curtains(ctx, t, view, strength); ctx.restore();
        if (E.ice) {
          // Ice field: distant ridges, a pale plain and the aurora lying on it.
          const plain = ctx.createLinearGradient(0, HORIZON, 0, view.bottom);
          plain.addColorStop(0, rgba(P.ice, .13)); plain.addColorStop(.06, rgba(P.sky[2], .96)); plain.addColorStop(1, P.sky[0]);
          ctx.fillStyle = plain; ctx.fillRect(view.left, HORIZON, view.right - view.left, view.bottom - HORIZON + 2);
          ctx.fillStyle = shade(P.sky[1], -.25); ctx.fill(ridge);
          ctx.strokeStyle = rgba(P.ice, .22); ctx.lineWidth = 1.2; ctx.stroke(ridge);
          ctx.save(); ctx.beginPath(); ctx.rect(view.left, HORIZON + 2, view.right - view.left, view.bottom - HORIZON); ctx.clip();
          ctx.globalCompositeOperation = 'lighter'; ctx.translate(0, HORIZON); ctx.scale(1, -.32); ctx.translate(0, -HORIZON);
          curtains(ctx, t, view, strength * .35, 28); ctx.restore();
        }
        // The greeting condenses out of the light, letter by letter.
        radial(ctx, 960, 540, 620, trip(P.glow), .07 * smooth(span(t, 2.6, 4)) * fade);
        const at = (str, i, n, start) => smooth(span(t, start + i * (1.1 / Math.max(1, n)), start + i * (1.1 / Math.max(1, n)) + .7)) * fade;
        const letters = (str, x, y, px, weight, tracking, start, color) => {
          const chars = [...str]; ctx.save(); ctx.font = face(env, px, weight); ctx.textBaseline = 'alphabetic';
          const widths = chars.map(c => ctx.measureText(c).width), total = widths.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1), k = Math.min(1, 1500 / total);
          ctx.translate(x, y); ctx.scale(k, k);
          let xx = -total / 2;
          chars.forEach((c, i) => { const a = at(str, i, chars.length, start); if (a > .002) { ctx.globalAlpha = a; ctx.fillStyle = color; ctx.fillText(c, xx, (1 - a) * 14); } xx += widths[i] + tracking; });
          ctx.restore();
        };
        if (two) {
          letters(env.copy.greeting.toUpperCase(), 960, 438, 40, eyebrowWeight, 14, 2.9, shade(P.glow, .55));
          letters(env.copy.name, 960, 606, 156, nameWeight, 6, 3.5, text);
        } else letters(`${env.copy.greeting} ${env.copy.name}`, 960, 580, 124, nameWeight, 4, 3, text);
        // One strand of light pours from the curtains into the mark.
        if (t > 6.9) {
          const q = env.points[0], path = bezier({x: 1660, y: 300}, {x: 1720, y: 520}, {x: q.x - 340, y: q.y + 120}, q), L = path.at(-1).l * ease(span(t, 6.9, 9.3));
          const a = 1 - smooth((t - 10.4) / 2);
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          stroke(ctx, path, 0, L, P.glow, 16, .12 * a); stroke(ctx, path, 0, L, shade(P.glow, .6), 2.4, .9 * a);
          ctx.restore();
          if (t < 9.4) { const h = pointAt(path, L); radial(ctx, h.x, h.y, 46, shadeTrip(P.glow, .6), .7); }
        }
      },
    };
  }

  /* ======================================================================
   * 磷光 · 终端 — an old CRT warms up, a boot log scrolls, the cursor types
   * the greeting, then the beam swings out like an oscilloscope trace to
   * draw the mark with phosphor persistence.
   * ==================================================================== */
  function terminal(env) {
    const P = env.style.colors, E = env.style.elements, glow = trip(P.phosphor);
    const two = env.style.layout === 'two', weight = env.style.font === 'mono' ? 400 : 300;
    const user = env.copy.name.toLowerCase().replace(/\s+/g, '_');
    const BOOT = [
      ['OPENING STUDIO BIOS v4.0', 0], ['CPU ................................ OK', .32], ['MEMORY TEST ............... 640K OK', .64],
      ['DISPLAY ..................... PHOSPHOR', .96], ['LOADING GREETING ............... DONE', 1.28], [`> ${env.copy.greeting.toLowerCase()} --user ${user}`, 1.7],
    ];
    let scanTile = null;
    const scan = ctx => {
      if (!scanTile) { const c = document.createElement('canvas'); c.width = 2; c.height = 4; const g = c.getContext('2d'); g.fillStyle = 'rgba(0,0,0,1)'; g.fillRect(0, 2, 2, 2); scanTile = ctx.createPattern(c, 'repeat'); }
      return scanTile;
    };
    function screenRect(view) {
      const inset = 34 + 30 * E.curve;
      return {x: view.left + inset, y: view.top + inset, w: view.right - view.left - inset * 2, h: view.bottom - view.top - inset * 2, r: 24 + 70 * E.curve};
    }
    function glowText(ctx, str, x, y, px, alpha, align = 'left', blur = 18) {
      if (alpha <= .002) return 0;
      ctx.save(); ctx.font = face(env, px, weight); ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = P.phosphor;
      const width = ctx.measureText(str).width, k = Math.min(1, 1500 / Math.max(1, width));
      if (k < 1) { ctx.translate(x, y); ctx.scale(k, k); ctx.translate(-x, -y); }
      ctx.globalAlpha = alpha * .55; ctx.shadowColor = rgba(glow, .9); ctx.shadowBlur = blur; ctx.fillText(str, x, y);
      ctx.shadowBlur = 0; ctx.globalAlpha = alpha; ctx.fillStyle = shade(P.phosphor, .35); ctx.fillText(str, x, y);
      ctx.restore();
      return width * k;
    }
    const flicker = t => E.flicker ? (.95 + .05 * Math.sin(t * 47)) * (t > 5.62 && t < 5.7 ? .72 : 1) : 1;
    return {
      echo: P.phosphor, ink: P.phosphor, end: P.screen,
      scene({ctx, t, view}) {
        const S = screenRect(view), fade = fadeOut(t), power = easeOut(span(t, .2, .85)), bright = flicker(t);
        fillView(ctx, view, shade(P.screen, -.55));
        ctx.save(); ctx.beginPath(); ctx.roundRect(S.x, S.y, S.w, S.h, S.r); ctx.clip();
        const tube = ctx.createRadialGradient(960, 540, 80, 960, 540, Math.max(S.w, S.h) * .75);
        tube.addColorStop(0, shade(P.screen, .05)); tube.addColorStop(1, shade(P.screen, -.35));
        ctx.fillStyle = tube; ctx.fillRect(S.x, S.y, S.w, S.h);
        // Warm-up: a bright line opens into the raster.
        const open = S.h * power;
        ctx.beginPath(); ctx.rect(S.x, 540 - open / 2, S.w, open); ctx.clip();
        if (power < 1) radial(ctx, 960, 540, 900 * (1 - power) + 120, glow, .5 * (1 - power));
        radial(ctx, 960, 540, 900, glow, .06 * power * bright);
        ctx.globalAlpha = bright;
        // Boot log, typed line by line, then cleared.
        const log = E.boot * (1 - smooth(span(t, 3.55, 3.85))) * fade;
        if (log > 0) {
          const x = S.x + 90, y0 = S.y + 120;
          BOOT.forEach(([line, at], i) => {
            const shown = Math.floor(line.length * span(t, 1 + at, 1 + at + (i === 5 ? .9 : .28)));
            if (shown > 0) glowText(ctx, line.slice(0, shown), x, y0 + i * 54, 31, log * (i === 5 ? 1 : .8), 'left', 12);
          });
        }
        // The greeting, typed with a block cursor.
        const start = E.boot ? 3.9 : 1.5;
        const lines = two ? [[env.copy.greeting.toUpperCase(), 72, 440], [env.copy.name, 170, 630]] : [[`${env.copy.greeting} ${env.copy.name}`, 120, 590]];
        let typed = span(t, start, start + 2.4) * lines.reduce((n, l) => n + [...l[0]].length, 0), cursor = null;
        for (const [str, px, y] of lines) {
          const chars = [...str], n = Math.min(chars.length, Math.floor(typed));
          typed -= chars.length;
          if (n <= 0 && cursor) break;
          const w = glowText(ctx, chars.slice(0, Math.max(0, n)).join(''), 960 - glowWidth(ctx, str, px) / 2, y, px, fade, 'left', px / 6);
          cursor = {x: 960 - glowWidth(ctx, str, px) / 2 + w + 10, y, px};
          if (n < chars.length) break;
        }
        if (cursor && t > start - .4 && t < 7.2 && Math.floor(t * 2.4) % 2 === 0) {
          ctx.save(); ctx.globalAlpha = fade; ctx.fillStyle = P.phosphor; ctx.shadowColor = rgba(glow, .9); ctx.shadowBlur = 16;
          ctx.fillRect(cursor.x, cursor.y - cursor.px * .74 * env.style.size, cursor.px * .5 * env.style.size, cursor.px * .86 * env.style.size); ctx.restore();
        }
        // The beam leaves the last letter and swings out to the mark.
        if (t > 7.05 && cursor) {
          const q = env.points[0], from = {x: cursor.x, y: cursor.y - 30}, path = bezier(from, {x: from.x + 260, y: from.y - 260}, {x: q.x - 260, y: q.y + 260}, q);
          const L = path.at(-1).l * ease(span(t, 7.05, 9.3)), a = 1 - smooth((t - 10.4) / 2);
          stroke(ctx, path, 0, L, P.phosphor, 1.6, .28 * a);
          stroke(ctx, path, L - 320, L, P.phosphor, 10, .14 * a); stroke(ctx, path, L - 320, L, shade(P.phosphor, .5), 2.4, a);
          if (t < 9.4) { const h = pointAt(path, L); radial(ctx, h.x, h.y, 34, glow, .9); }
        }
        ctx.restore();
        ctx.globalAlpha = 1;
      },
      mark({ctx, trace, t}, limit, progress) {
        // Phosphor persistence: the whole trace glows dimly, the fresh part burns bright.
        const settle = smooth((t - 12.4) / 1.1), fresh = 1 - smooth((t - 13) / .6);
        trace(limit, .14 + .06 * settle, 12, P.phosphor);
        trace(limit, .38 + .62 * settle, 2.2, P.phosphor);
        const tip = stroke(ctx, env.points, Math.max(0, limit - 520), limit, shade(P.phosphor, .45), 2.6, fresh) || env.points[0];
        stroke(ctx, env.points, Math.max(0, limit - 260), limit, P.phosphor, 11, .22 * fresh);
        if (progress < 1) radial(ctx, tip.x, tip.y, 30, glow, .95);
        return tip;
      },
      front({ctx, view, t}) {
        const S = screenRect(view);
        ctx.save(); ctx.beginPath(); ctx.roundRect(S.x, S.y, S.w, S.h, S.r); ctx.clip();
        // Scanlines, a slow refresh band and the darkened, curved edges of the tube.
        ctx.globalAlpha = .28 * E.scanlines; fillView(ctx, view, scan(ctx));
        ctx.globalAlpha = .05 * E.scanlines; const band = S.y + ((t * 160) % (S.h + 300)) - 150;
        const g = ctx.createLinearGradient(0, band - 90, 0, band + 90); g.addColorStop(0, rgba(glow, 0)); g.addColorStop(.5, rgba(glow, 1)); g.addColorStop(1, rgba(glow, 0));
        ctx.fillStyle = g; ctx.fillRect(S.x, band - 90, S.w, 180);
        ctx.globalAlpha = 1;
        const v = ctx.createRadialGradient(960, 540, Math.min(S.w, S.h) * .35, 960, 540, Math.max(S.w, S.h) * .72);
        v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${.25 + .45 * E.curve})`);
        ctx.fillStyle = v; ctx.fillRect(S.x, S.y, S.w, S.h);
        ctx.restore();
        ctx.save(); ctx.strokeStyle = rgba(glow, .12); ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(S.x, S.y, S.w, S.h, S.r); ctx.stroke(); ctx.restore();
      },
    };
    function glowWidth(ctx, str, px) { ctx.save(); ctx.font = face(env, px, weight); const w = ctx.measureText(str).width; ctx.restore(); return Math.min(1500, w); }
  }

  return {ink, aurora, terminal, civic, spell, voyage, neon};
})();
