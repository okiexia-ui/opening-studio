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
      ctx.lineWidth = 2.4; ctx.strokeStyle = 'rgba(192,154,92,.6)'; ctx.stroke(cloudOutline);
      ctx.fillStyle = '#fbf6ea'; ctx.fill(cloudOutline);
      ctx.lineWidth = 1.3; ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(192,154,92,.62)'; ctx.stroke(cloudCurls);
      ctx.restore();
    }
    function seal(ctx, x, y, size, rotation, scale, alpha) {
      if (alpha <= .002) return;
      const u = size / 100;
      ctx.save(); ctx.translate(x, y); ctx.rotate(rotation); ctx.scale(scale * u, scale * u); ctx.translate(-50, -50);
      ctx.globalAlpha = alpha; ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = '#b3121a'; ctx.beginPath(); ctx.roundRect(4, 4, 92, 92, 6); ctx.fill();
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
      ctx.fillStyle = vertical(150, 460, [[0, 'rgba(212,162,137,.24)'], [1, 'rgba(212,162,137,0)']]); ctx.fill(land.far2);
      ctx.fillStyle = vertical(206, 460, [[0, 'rgba(196,132,106,.3)'], [1, 'rgba(196,132,106,.02)']]); ctx.fill(land.far);
      ctx.fillStyle = vertical(260, 460, [[0, 'rgba(169,90,68,.36)'], [.6, 'rgba(169,90,68,.12)'], [1, 'rgba(169,90,68,.05)']]); ctx.fill(land.mid);
      // The wall unrolls from the left along the ridge.
      const reach = mix(view.left / K - 30, view.right / K + 30, ease(span(t, 1.5, 4.4)));
      ctx.save(); ctx.beginPath(); ctx.rect(WIDE[0], 0, reach - WIDE[0], DEEP); ctx.clip();
      ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(107,47,37,.5)'; ctx.lineWidth = 5.5; ctx.stroke(land.crest);
      ctx.setLineDash([2.2, 2.6]); ctx.strokeStyle = 'rgba(107,47,37,.55)'; ctx.lineWidth = 2.8; ctx.stroke(land.merlons); ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(247,236,217,.55)'; ctx.lineWidth = .9; ctx.stroke(land.walk);
      ctx.fillStyle = 'rgba(107,47,37,.58)'; ctx.fill(land.towers); ctx.fillStyle = 'rgba(246,236,217,.75)'; ctx.fill(land.doors);
      ctx.restore();
      ctx.fillStyle = vertical(318, 392, [[0, 'rgba(251,245,232,0)'], [.5, 'rgba(251,245,232,.8)'], [1, 'rgba(251,245,232,0)']]); ctx.fillRect(WIDE[0], 318, WIDE[1] - WIDE[0], 74);
      ctx.fillStyle = vertical(396, 460, [[0, 'rgba(138,68,52,.34)'], [1, 'rgba(138,68,52,.12)']]); ctx.fill(land.near);
      ctx.restore();
    }

    return {
      mark: {halo: 'rgba(165,15,25,1)', core: '#a50f19', width: 3, haloAlpha: .1, haloWidth: 11},
      echo: '#a50f19', end: '#f7f5f0',
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
        sg.addColorStop(0, 'rgba(201,58,36,.3)'); sg.addColorStop(.775, 'rgba(201,58,36,.3)'); sg.addColorStop(.805, 'rgba(201,58,36,.12)'); sg.addColorStop(1, 'rgba(201,58,36,0)');
        ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(1488, 255, 125, 0, Math.PI * 2); ctx.fill(); ctx.restore();

        const drift = easeOut(span(t, .9, 3.9));
        cloud(ctx, 134 - 14 * (1 - drift), 173, 1.8, drift * settle);
        ctx.save(); ctx.globalAlpha = smooth(span(t, 2.2, 3.4)) * (1 - smooth(span(t, 6.5, 9))) * .9; ctx.translate(1171 + 60 * span(t, 2, 9), 184 - 10 * span(t, 2, 9)); ctx.scale(1.18, 1.18);
        ctx.strokeStyle = 'rgba(107,47,37,.42)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(GEESE); ctx.restore();
        landscape(ctx, t, view, settle);
        cloud(ctx, 1498 + 14 * (1 - drift), 259, 1.32, drift * settle);

        // Red silk along the bottom edge.
        const silk = smooth(span(t, 1, 2.4)) * settle;
        if (silk > 0) {
          for (const [phase, depth, color, alpha] of [[1.7, 50, '200,22,29', .35], [0, 34, '179,18,26', .9]]) {
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
          ctx.strokeStyle = 'rgba(176,138,74,.55)'; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
          ctx.strokeStyle = 'rgba(176,138,74,.18)'; ctx.strokeRect(x0 + 7, y0 + 7, x1 - x0 - 14, y1 - y0 - 14);
          ctx.strokeStyle = '#b08a4a'; ctx.lineWidth = 1.7; ctx.lineCap = 'square';
          for (const [x, y, sx, sy] of [[x0 - 2, y0 - 2, 1, 1], [x1 + 2, y0 - 2, -1, 1], [x0 - 2, y1 + 2, 1, -1], [x1 + 2, y1 + 2, -1, -1]]) {
            ctx.save(); ctx.translate(x, y); ctx.scale(sx * 1.25, sy * 1.25); ctx.stroke(CORNER); ctx.restore();
          }
          ctx.restore();
        }

        // Greeting block.
        label(ctx, `${copy.greeting}  ${copy.name}`.toUpperCase(), 960, 352, {font: '600 20px Manrope', color: '#9a7a56', tracking: 12, fit: 1100, alpha: smooth(span(t, 2.3, 3.3)) * fade});
        ctx.save();
        // The title shrinks to fit when a custom one is long.
        let size = 124; ctx.font = `900 ${size}px ${SONG}`;
        const chars = [...copy.title], measure = () => chars.map(c => ctx.measureText(c).width);
        let widths = measure(), track = 17;
        const natural = widths.reduce((a, b) => a + b, 0) + track * (chars.length - 1);
        if (natural > 1240) { size *= 1240 / natural; track *= 1240 / natural; ctx.font = `900 ${size}px ${SONG}`; widths = measure(); }
        let x = 960 - (widths.reduce((a, b) => a + b, 0) + track * (chars.length - 1)) / 2;
        const ink = ctx.createLinearGradient(0, 400, 0, 512); ink.addColorStop(0, '#c3141e'); ink.addColorStop(1, '#9a0c15');
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
            const g = ctx.createLinearGradient(960, 0, 960 + dir * 190 * rule, 0); g.addColorStop(0, 'rgba(176,138,74,.85)'); g.addColorStop(1, 'rgba(176,138,74,0)');
            ctx.fillStyle = g; ctx.fillRect(dir > 0 ? 974 : 946 - 190 * rule, 551.5, 190 * rule, 1);
          }
          ctx.translate(960, 552); ctx.rotate(Math.PI / 4);
          ctx.fillStyle = 'rgba(176,138,74,.25)'; ctx.fillRect(-7.5, -7.5, 15, 15); ctx.fillStyle = '#b3121a'; ctx.fillRect(-4.5, -4.5, 9, 9);
          ctx.restore();
        }
        label(ctx, `尊敬的 ${copy.name} · 您的工作台已就绪`, 960, 616, {font: `400 28px ${SONG}`, color: '#6f5040', tracking: 6, fit: 1200, alpha: smooth(span(t, 3.8, 4.8)) * fade});

        // Identity check: stepped progress, held at 86% like a real boot.
        const bar = smooth(span(t, 3.9, 4.4)) * fade;
        if (bar > 0) {
          let value = 0;
          for (let i = 0; i < STEPS.length; i++) value = mix(value, STEPS[i][1], easeOut(span(t, STEPS[i][0], STEPS[i][0] + .32)));
          const done = t >= 6.72, x0 = 722, x1 = 1158, y = 688;
          label(ctx, done ? (standardSeal ? '认证通过 · 准予通行' : '认证通过') : '统一身份认证', x0, y - 16, {font: `${done ? 700 : 500} 21px ${SONG}`, color: done ? '#a50f19' : '#6f5040', tracking: 5, align: 'left', alpha: bar});
          label(ctx, `${Math.round(value)}%`, x1, y - 16, {font: '600 20px Manrope', color: done ? '#a50f19' : '#8a6b4c', align: 'right', alpha: bar});
          ctx.save(); ctx.globalAlpha = bar;
          ctx.fillStyle = 'rgba(176,138,74,.12)'; ctx.fillRect(x0, y, x1 - x0, 9);
          ctx.strokeStyle = 'rgba(176,138,74,.5)'; ctx.lineWidth = 1; ctx.strokeRect(x0 - .5, y - .5, x1 - x0 + 1, 10);
          const fill = ctx.createLinearGradient(x0, 0, x1, 0); fill.addColorStop(0, '#c3141e'); fill.addColorStop(.8, '#b3121a'); fill.addColorStop(1, '#e3c27a');
          ctx.fillStyle = fill; ctx.fillRect(x0 + 1.5, y + 1.5, (x1 - x0 - 3) * value / 100, 6);
          ctx.restore();
        }
        // The stamp lands the moment the check completes.
        const stamp = span(t, 6.62, 6.98), land_ = 1 + .42 * Math.pow(1 - easeOut(stamp), 2);
        seal(ctx, SEAL.x, SEAL.y, SEAL.size, -.1 + .02 * (1 - stamp), land_, Math.min(1, stamp * 3) * .94 * fadeOut(t + .3));
        if (stamp > 0 && stamp < 1) radial(ctx, SEAL.x, SEAL.y, 120, '179,18,26', .12 * Math.sin(stamp * Math.PI));
        label(ctx, '开屏 · 政务版', view.left + 110, view.bottom - 132, {font: `700 22px ${SONG}`, color: '#a50f19', tracking: 7, align: 'left', alpha: smooth(span(t, 3, 4)) * fade});
        label(ctx, 'SECURE WORKSPACE', view.left + 110, view.bottom - 104, {font: '500 15px Manrope', color: 'rgba(104,74,54,.9)', tracking: 5, align: 'left', alpha: smooth(span(t, 3, 4)) * fade});

        // Connector: a vermilion hairline springs from the seal into the mark.
        if (t > 7.05) {
          const p = env.points[0], path = bezier({x: SEAL.x + 54, y: SEAL.y + 6}, {x: SEAL.x + 230, y: SEAL.y + 20}, {x: p.x + 120, y: p.y + 210}, p);
          stroke(ctx, path, 0, path.at(-1).l * ease(span(t, 7.05, 9.3)), '#b3121a', 2, 1 - smooth((t - 10.5) / 2));
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
    const candles = Array.from({length: 23}, (_, i) => {
      const d = .45 + R() * .62;
      return {x: 70 + i * (1780 / 22) + (R() - .5) * 46, y: 96 + R() * 210 + (1 - d) * 90, d, ph: R() * 6.28, fl: R() * 6.28};
    }).sort((a, b) => a.d - b.d);
    // Sparks are born at fixed times on the pen path, so any frame is reproducible.
    const sparks = Array.from({length: 150}, (_, k) => {
      const born = .7 + (k / 150) * 7.3, at = pointAt(env.text, pen(born, env).text);
      return {born, x: at.x, y: at.y, vx: (R() - .5) * 80, vy: -15 - R() * 60, life: .8 + R() * 1.4, size: 1.4 + R() * 2.6, tw: R() * 6.28};
    });
    const markSparks = Array.from({length: 70}, (_, k) => {
      const born = 9.35 + (k / 70) * 3.7, at = pointAt(env.points, env.logoLength * clamp((born - 9.3) / 3.8));
      return {born, x: at.x, y: at.y, vx: (R() - .5) * 60, vy: -10 - R() * 50, life: .7 + R() * 1.1, size: .9 + R() * 2, tw: R() * 6.28};
    });
    function drawSparks(ctx, list, t, gravity) {
      for (const s of list) {
        const age = t - s.born;
        if (age < 0 || age > s.life) continue;
        const k = 1 - age / s.life, x = s.x + s.vx * age, y = s.y + s.vy * age + .5 * gravity * age * age;
        const a = k * k * (.65 + .35 * Math.sin(t * 22 + s.tw));
        ctx.globalAlpha = a; ctx.fillStyle = k > .6 ? '#fff6dc' : '#f6c867';
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
      echo: '#f3d48b', end: '#0d0b18',
      scene({ctx, t, view}) {
        const fade = fadeOut(t);
        const sky = ctx.createLinearGradient(0, view.top, 0, view.bottom);
        sky.addColorStop(0, '#1d1738'); sky.addColorStop(.45, '#110e22'); sky.addColorStop(1, '#07060d');
        fillView(ctx, view, sky);
        // The vault: twinkling stars, thinning towards the hall.
        const night = smooth(span(t, .1, 2.2));
        ctx.fillStyle = '#e9e4ff';
        for (const s of stars) {
          const a = night * (.25 + .75 * (.5 + .5 * Math.sin(t * s.sp * 2.4 + s.ph))) * clamp((520 - s.y) / 380);
          if (a <= .01) continue;
          ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        // Three tall pointed windows with a breath of moonlight.
        const hall = smooth(span(t, .3, 2));
        for (const [cx, w] of [[420, 250], [960, 300], [1500, 250]]) {
          ctx.save(); ctx.globalAlpha = hall;
          arch(ctx, cx, w, 330, 150, view.bottom + 10);
          const glass = ctx.createLinearGradient(0, 150, 0, 1000); glass.addColorStop(0, 'rgba(86,104,190,.17)'); glass.addColorStop(1, 'rgba(30,34,80,0)');
          ctx.fillStyle = glass; ctx.fill();
          ctx.strokeStyle = 'rgba(140,150,230,.08)'; ctx.lineWidth = 2; ctx.stroke();
          ctx.beginPath(); ctx.moveTo(cx, 150); ctx.lineTo(cx, view.bottom);
          for (let y = 420; y < 1000; y += 150) { ctx.moveTo(cx - w / 2, y); ctx.lineTo(cx + w / 2, y); }
          ctx.strokeStyle = 'rgba(140,150,230,.05)'; ctx.stroke(); ctx.restore();
        }
        ctx.save(); ctx.globalAlpha = hall * .5; ctx.beginPath(); ctx.moveTo(810, 330); ctx.lineTo(1110, 330); ctx.lineTo(1380, view.bottom); ctx.lineTo(560, view.bottom); ctx.closePath();
        const beam = ctx.createLinearGradient(0, 330, 0, view.bottom); beam.addColorStop(0, 'rgba(120,140,230,.07)'); beam.addColorStop(1, 'rgba(120,140,230,0)');
        ctx.fillStyle = beam; ctx.fill(); ctx.restore();

        // Floating candles ignite in a sweep from left to right.
        let warmth = 0;
        for (const c of candles) {
          const ignite = .5 + (c.x / 1920) * 2.4, lit = smooth((t - ignite) / .35), body = smooth((t - ignite + .2) / .3);
          if (body <= 0) continue;
          warmth += lit / candles.length;
          const d = c.d, x = c.x, y = c.y + Math.sin(t * .85 + c.ph) * 7 * d, h = 60 * d, w = 11 * d;
          radial(ctx, x, y - 8 * d, 125 * d, '255,176,88', .22 * lit);
          ctx.save(); ctx.globalAlpha = body * .92;
          const wax = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0); wax.addColorStop(0, '#d9cdb1'); wax.addColorStop(.45, '#f5edda'); wax.addColorStop(1, '#bfb193');
          ctx.fillStyle = wax; ctx.fillRect(x - w / 2, y, w, h);
          ctx.fillStyle = 'rgba(255,214,150,.35)'; ctx.fillRect(x - w / 2, y, w, 3 * d);
          ctx.restore();
          if (lit > 0) {
            const flick = 1 + .12 * Math.sin(t * 15 + c.fl) + .06 * Math.sin(t * 27 + c.fl * 2), fh = 31 * d * flick * lit, fw = 8 * d;
            ctx.save(); ctx.globalAlpha = lit;
            const flame = ctx.createRadialGradient(x, y - fh * .35, 0, x, y - fh * .35, fh * .9);
            flame.addColorStop(0, '#fffbe8'); flame.addColorStop(.45, '#ffd877'); flame.addColorStop(1, 'rgba(255,140,40,0)');
            ctx.fillStyle = flame; ctx.beginPath(); ctx.moveTo(x, y - fh);
            ctx.quadraticCurveTo(x + fw, y - fh * .32, x, y - 1); ctx.quadraticCurveTo(x - fw, y - fh * .32, x, y - fh); ctx.fill(); ctx.restore();
          }
        }
        radial(ctx, 960, 160, 1100, '255,168,80', .07 * warmth);

        // The incantation: a glowing line written by a moving light.
        const p = pen(t, env), L = p.text;
        const glint = env.textLength * smooth((t - 7.4) / 1.1), glintAlpha = Math.sin(Math.PI * span(t, 7.4, 8.5)) * .8;
        stroke(ctx, env.text, 0, L, '#ffbf5a', 30, .07 * fade);
        stroke(ctx, env.text, 0, L, '#ffd27a', 11, .2 * fade);
        stroke(ctx, env.text, 0, L, '#f6d48a', 3.6, .96 * fade);
        stroke(ctx, env.text, L - 260, L, '#fff8e6', 4.6, .9 * fade * (t < 8.1 ? 1 : 1 - span(t, 8.1, 8.6)));
        if (glintAlpha > 0) stroke(ctx, env.text, glint - 110, glint + 110, '#ffffff', 4.4, glintAlpha * fade);
        ctx.save(); drawSparks(ctx, sparks, t, 70); ctx.restore();
        // The light leaves the last letter as a comet and flies to the mark.
        let tip = pointAt(env.text, L);
        if (p.travel > 0) {
          stroke(ctx, env.travel, p.travel - 240, p.travel, '#ffd27a', 10, .25);
          tip = stroke(ctx, env.travel, p.travel - 240, p.travel, '#fff3d0', 3.4, .9) || tip;
        }
        if (t > .5 && t < 9.35) sparkle(ctx, tip.x, tip.y, 15 + 3 * Math.sin(t * 9), t * 1.6, smooth((t - .5) / .4));
      },
      mark({ctx, t, trace}, limit, progress) {
        trace(limit, .07, 26, '#ffbf5a');
        trace(limit, .2, 9, '#ffd27a');
        const tip = trace(limit, 1, 2.8, '#fbe2a6');
        ctx.save(); drawSparks(ctx, markSparks, t, 55); ctx.restore();
        if (progress < 1) sparkle(ctx, tip.x, tip.y, 13, t * 1.6, 1);
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
    return {
      mark: {halo: '#59c8ff', core: '#e9f9ff', width: 2.4, haloAlpha: .16, haloWidth: 14},
      echo: '#a8e6ff', end: '#02050b',
      scene({ctx, t, view}) {
        const fade = fadeOut(t), hud = smooth(span(t, .4, 1.3)) * fade;
        const dy = drop(t), speed = 300 * Math.max(0, ease(span(t + .05, 6.1, 11)) - ease(span(t - .05, 6.1, 11))) * 2.4;
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
        body.addColorStop(0, '#1d5f92'); body.addColorStop(.12, '#0c3358'); body.addColorStop(.35, '#051727'); body.addColorStop(1, '#010409');
        ctx.fillStyle = body; ctx.beginPath(); ctx.arc(PLANET.x, cy, PLANET.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffcf8a';
        for (const c of lights) {
          const r = PLANET.r - c.depth, x = PLANET.x + Math.sin(c.a) * r, y = cy - Math.cos(c.a) * r;
          ctx.globalAlpha = (.25 + .35 * Math.sin(c.ph + t * .7) ** 2) * clamp((x - 520) / 500) * smooth(span(t, .8, 2.4));
          ctx.beginPath(); ctx.arc(x, y, c.r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        const dawn = easeOut(span(t, .7, 3.2));
        const rim = ctx.createLinearGradient(view.left, 0, view.right, 0);
        rim.addColorStop(0, 'rgba(150,215,255,.7)'); rim.addColorStop(clamp((sunX - view.left) / (view.right - view.left)), 'rgba(255,246,222,1)');
        rim.addColorStop(.62, 'rgba(110,190,255,.55)'); rim.addColorStop(1, 'rgba(80,150,255,.25)');
        for (const [w, a] of [[64, .05], [18, .2], [2.6, .75]]) {
          ctx.save(); ctx.globalAlpha = a * (.35 + .65 * dawn); ctx.strokeStyle = rim; ctx.lineWidth = w;
          ctx.beginPath(); ctx.arc(PLANET.x, cy, PLANET.r, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke(); ctx.restore();
        }
        // The sun clears the limb: a hot core and a long anamorphic streak.
        const sunUp = sunY - 26 * dawn + 30 * (1 - dawn);
        radial(ctx, sunX, sunUp, 720, '127,200,255', .16 * dawn);
        radial(ctx, sunX, sunUp, 190, '255,243,214', .85 * dawn);
        radial(ctx, sunX, sunUp, 34, '255,255,255', dawn);
        for (const [h, a, len] of [[5, .45, 900], [1.4, .7, 1500]]) {
          const g = ctx.createLinearGradient(sunX - len, 0, sunX + len, 0);
          g.addColorStop(0, 'rgba(150,210,255,0)'); g.addColorStop(.5, `rgba(235,248,255,${a * dawn})`); g.addColorStop(1, 'rgba(150,210,255,0)');
          ctx.fillStyle = g; ctx.fillRect(sunX - len, sunUp - h / 2, len * 2, h);
        }
        // Thrusters fire from the centre of the horizon outwards.
        for (const e of engines) {
          const ign = smooth((t - 4.45 - e.delay) / .5) * (1 - .55 * smooth((t - 10) / 2.5));
          if (ign <= 0) continue;
          const bx = PLANET.x + Math.sin(e.a) * PLANET.r, by = cy - Math.cos(e.a) * PLANET.r, len = e.len * ign * (1 + .07 * Math.sin(t * 24 + e.ph));
          ctx.save(); ctx.translate(bx, by); ctx.rotate(e.a);
          for (const [scale, a, c0] of [[3.2, .22, '89,184,255'], [1, .95, '234,248,255']]) {
            const g = ctx.createLinearGradient(0, 0, 0, -len * (scale > 1 ? 1.15 : 1));
            g.addColorStop(0, `rgba(${c0},${a})`); g.addColorStop(1, `rgba(${c0},0)`);
            ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-e.w * scale / 2, 0); ctx.lineTo(0, -len * (scale > 1 ? 1.15 : 1)); ctx.lineTo(e.w * scale / 2, 0); ctx.closePath(); ctx.fill();
          }
          ctx.restore();
          radial(ctx, bx, by, 60, '150,215,255', .45 * ign);
        }
        const flash = smooth(span(t, 4.4, 4.55)) * (1 - smooth(span(t, 4.55, 5.6)));
        if (flash > 0) { ctx.save(); ctx.globalAlpha = .2 * flash; fillView(ctx, view, '#cfeeff'); ctx.restore(); }

        // HUD: corner brackets, typed telemetry, countdown ring.
        ctx.save(); ctx.globalAlpha = hud * .7; ctx.strokeStyle = '#8edcff'; ctx.lineWidth = 1.5;
        const ix = 56, b = 64;
        for (const [x, y, sx, sy] of [[view.left + ix, view.top + ix, 1, 1], [view.right - ix, view.top + ix, -1, 1], [view.left + ix, view.bottom - ix, 1, -1], [view.right - ix, view.bottom - ix, -1, -1]]) {
          ctx.beginPath(); ctx.moveTo(x, y + sy * b); ctx.lineTo(x, y); ctx.lineTo(x + sx * b, y); ctx.stroke();
        }
        ctx.restore();
        const vel = t < 4.5 ? '29.78' : (29.78 + 11.4 * ease(span(t, 4.5, 8))).toFixed(2), state = t < 4.45 ? 'STANDBY' : t < 6.1 ? 'IGNITION' : 'EN ROUTE';
        TELEMETRY.forEach((line, i) => {
          const text = line.replace('{v}', vel).replace('{s}', state), shown = Math.floor(text.length * span(t, .9 + i * .32, 1.6 + i * .32));
          label(ctx, text.slice(0, shown), view.left + 120, view.top + 150 + i * 32, {font: `${i ? 400 : 600} 19px ${MONO}`, color: i === 4 && t >= 4.45 ? '#ffd58a' : '#a9e4ff', align: 'left', alpha: hud * (i ? .72 : .95)});
        });
        label(ctx, 'T+' + (t < 4.45 ? '00:00' : `00:${String(Math.floor((t - 4.45) * 1.3)).padStart(2, '0')}`), view.right - 120, view.top + 150, {font: `500 19px ${MONO}`, color: '#a9e4ff', align: 'right', alpha: hud * .8});
        const cd = span(t, 2.2, 4.45), ring = smooth(span(t, 1.9, 2.4)) * (1 - smooth(span(t, 4.45, 5.1)));
        if (ring > 0) {
          ctx.save(); ctx.globalAlpha = ring; ctx.translate(960, 500); ctx.strokeStyle = 'rgba(142,220,255,.35)'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(0, 0, 168, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); for (let k = 0; k < 60; k++) { const a = k / 60 * Math.PI * 2, r0 = k % 5 ? 178 : 174; ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a) * 186, Math.sin(a) * 186); } ctx.stroke();
          ctx.strokeStyle = '#d8f4ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 168, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (cd * 3 % 1 || (cd >= 1 ? 1 : 0))); ctx.stroke();
          ctx.restore();
          const n = Math.min(2, Math.floor(cd * 3)), local = cd * 3 - n, digit = 3 - n;
          if (cd < 1) label(ctx, String(digit), 960, 582, {font: '200 230px Manrope', color: '#e6f8ff', alpha: ring * smooth(local / .15) * (1 - smooth((local - .75) / .25))});
        }
        label(ctx, 'IGNITION', 960, 520, {font: '500 46px Manrope', color: '#e6f8ff', tracking: 18, alpha: Math.sin(Math.PI * span(t, 4.4, 5.15)) * .95});
        // Greeting: a scan-line wipe with a settling colour fringe.
        const wipe = ease(span(t, 5.25, 6.2)), fringe = 1 - smooth(span(t, 5.3, 6.7));
        if (wipe > 0) {
          ctx.save(); ctx.beginPath(); ctx.rect(960 - 720 * wipe, 380, 1440 * wipe, 320); ctx.clip();
          const eyebrow = env.copy.greeting === 'Welcome' ? 'WELCOME ABOARD' : env.copy.greeting.toUpperCase(), callsign = env.copy.name.toUpperCase();
          label(ctx, eyebrow, 960, 452, {font: '500 34px Manrope', color: '#9fdcff', tracking: 16, fit: 1300, alpha: fade * .9});
          for (const [dx, c] of [[-5 * fringe, '#47e0ff'], [5 * fringe, '#ff5cc8']]) if (fringe > .02) label(ctx, callsign, 960 + dx, 620, {font: '200 168px Manrope', color: c, tracking: 34, fit: 1400, alpha: fade * .35 * fringe});
          label(ctx, callsign, 960, 620, {font: '200 168px Manrope', color: '#eefaff', tracking: 34, fit: 1400, alpha: fade});
          ctx.restore();
          ctx.save(); ctx.globalAlpha = .6 * fade * wipe; ctx.fillStyle = '#d8f4ff'; ctx.fillRect(960 - 720 * wipe, 380 + 320 * ((t * .9) % 1), 1440 * wipe, 1.2); ctx.restore();
        }
        // Trajectory from the horizon to the mark; a pulse makes the connection.
        const p0 = env.points[0], start = {x: 860, y: cy - Math.sqrt(PLANET.r ** 2 - 100 ** 2) - 6};
        const path = bezier(start, {x: start.x + 160, y: start.y - 430}, {x: p0.x - 300, y: p0.y + 260}, p0), Lpath = path.at(-1).l;
        const plot = ease(span(t, 5.5, 7.1)), lineAlpha = (1 - smooth((t - 10.4) / 2)) * .9;
        if (plot > 0) {
          ctx.save(); ctx.setLineDash([6, 9]); ctx.lineDashOffset = -t * 40; stroke(ctx, path, 0, Lpath * plot, '#8edcff', 1.6, .55 * lineAlpha); ctx.restore();
          const pulse = Lpath * ease(span(t, 7.1, 9.3));
          if (pulse > 0) {
            stroke(ctx, path, 0, pulse, '#59c8ff', 8, .18 * lineAlpha); stroke(ctx, path, 0, pulse, '#e9f9ff', 2, lineAlpha);
            if (t < 9.4) { const at = pointAt(path, pulse); radial(ctx, at.x, at.y, 40, '200,240,255', .8); }
          }
        }
        // Target lock closes in around the mark.
        const lock = ease(span(t, 7.3, 9.1)), lockAlpha = smooth(span(t, 7.3, 7.7)) * (1 - smooth(span(t, 9.8, 11)));
        if (lockAlpha > 0) {
          const half = mix(330, 215, lock), arm = 46;
          ctx.save(); ctx.globalAlpha = lockAlpha * .85; ctx.strokeStyle = '#8edcff'; ctx.lineWidth = 2;
          for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            const x = 1392 + sx * half, y = 540 + sy * half;
            ctx.beginPath(); ctx.moveTo(x, y - sy * arm); ctx.lineTo(x, y); ctx.lineTo(x - sx * arm, y); ctx.stroke();
          }
          ctx.restore();
          label(ctx, lock >= 1 ? 'TARGET LOCKED' : 'ACQUIRING', 1392 - half, 540 + half + 30, {font: `500 15px ${MONO}`, color: '#a9e4ff', align: 'left', alpha: lockAlpha * .85});
        }
      },
      front({ctx, t, g}) {
        // Warp lines while the camera dives through the mark.
        if (g.z <= 0) return;
        const a = Math.sin(Math.PI * clamp(g.z * 1.2)) * .55;
        ctx.save(); ctx.strokeStyle = '#cfeeff'; ctx.lineCap = 'round';
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
    const R = rng(2077), HORIZON = 800;
    const rain = Array.from({length: 230}, () => ({x: R() * 2900 - 500, y: R() * 1700, len: 26 + R() * 54, sp: 1300 + R() * 900, a: .06 + R() * .16}));
    const bokeh = Array.from({length: 44}, () => ({x: R() * 2400 - 240, y: 60 + R() * 700, r: 18 + R() * 70, c: ['255,70,160', '70,220,255', '255,178,90', '150,110,255'][Math.floor(R() * 4)], a: .04 + R() * .09, ph: R() * 6.28}));
    const ripples = Array.from({length: 64}, () => ({y: R(), x: R() * 2400 - 240, w: 120 + R() * 520, ph: R() * 6.28}));
    // Ignition flicker and one temperamental stretch of tube, both scripted.
    const ON = [[1.62, 1.7], [1.92, 2.0], [2.18, 2.5], [2.62, 2.66], [2.82, 8.85], [8.97, 9.05], [9.12, 9.18]];
    const FAULTY = [env.textLength * .5997, env.textLength * .6803], FAULT_OFF = [[4.9, 5.03], [5.26, 5.31], [6.08, 6.18], [6.3, 6.33]];
    const inside = (t, list) => list.some(([a, b]) => t >= a && t < b);
    function tube(ctx, from, to, lit, scale = 1) {
      if (scale === 1) stroke(ctx, env.text, from, to, '#ff2d95', 46, .09 * lit);
      stroke(ctx, env.text, from, to, '#ff3d9e', 18 * scale, .24 * lit);
      stroke(ctx, env.text, from, to, '#ffd3ea', 4.6 * scale, lit);
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
      mark: {halo: '#22d3ff', core: '#d8fbff', width: 3.6, haloAlpha: .26, haloWidth: 13, glow: '#22d3ff'},
      echo: '#5ff2ff', end: '#07060c',
      scene({ctx, t, view}) {
        const fade = fadeOut(t), glass = smooth(span(t, .1, 1)) * fade;
        const lit = (inside(t, ON) ? 1 : 0) * (.86 + .14 * smooth(span(t, 2.82, 3.4))) * (.97 + .03 * Math.sin(t * 61));
        const sky = ctx.createLinearGradient(0, view.top, 0, view.bottom);
        sky.addColorStop(0, '#0d0b1c'); sky.addColorStop(.62, '#120c22'); sky.addColorStop(1, '#040408');
        fillView(ctx, view, sky);
        for (const b of bokeh) radial(ctx, b.x + Math.sin(t * .2 + b.ph) * 12, b.y, b.r, b.c, b.a * smooth(span(t, 0, 1.5)) * (.8 + .2 * Math.sin(t * .9 + b.ph)));
        radial(ctx, 960, 570, 980, '255,45,150', .11 * lit * fade);
        // Wet street: a faint horizon, pink spill and a broken reflection.
        const street = ctx.createLinearGradient(0, HORIZON, 0, view.bottom);
        street.addColorStop(0, 'rgba(40,24,52,.55)'); street.addColorStop(1, 'rgba(6,5,10,.9)');
        ctx.fillStyle = street; ctx.fillRect(view.left, HORIZON, view.right - view.left, view.bottom - HORIZON + 2);
        ctx.save(); ctx.beginPath(); ctx.rect(view.left, HORIZON, view.right - view.left, view.bottom - HORIZON + 2); ctx.clip();
        ctx.globalAlpha = .22; ctx.translate(0, HORIZON + 8); ctx.scale(1, -.74); ctx.translate(0, -HORIZON); sign(ctx, t, lit * fade, glass * .6, 1.3); ctx.restore();
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
          stroke(ctx, env.travel, 0, p.travel, '#22d3ff', 30, .1 * alive); stroke(ctx, env.travel, 0, p.travel, '#3fe0ff', 11, .28 * alive);
          const head = stroke(ctx, env.travel, 0, p.travel, '#d8fbff', 3.2, alive);
          if (head && t < 9.4) sparkle(ctx, head.x, head.y, 14, t * 3, 1, '225,252,255');
        }
        // Rain, lit by the sign.
        ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = 1.3;
        const H = view.bottom - view.top + 300;
        for (const pass of [0, 1]) {
          ctx.strokeStyle = pass ? `rgba(255,170,215,${.22 + .3 * lit})` : 'rgba(170,190,255,.3)'; ctx.beginPath();
          for (let i = pass; i < rain.length; i += 2) {
            const d = rain[i], y = view.top - 150 + ((d.y + d.sp * t * .55) % H), x = d.x + (y - view.top) * .14;
            ctx.moveTo(x, y); ctx.lineTo(x - d.len * .14, y - d.len);
          }
          ctx.globalAlpha = smooth(span(t, 0, .8)); ctx.stroke();
        }
        ctx.restore();
      },
      mark({trace}, limit) {
        trace(limit, .1, 34, '#22d3ff');
        trace(limit, .26, 12, '#3fe0ff');
        trace(limit, 1, 3.6, '#d8fbff');
        return trace(limit, .55, 1.4, '#ffffff');
      },
      front({ctx, t, view}) {
        // A few close, fast drops in front of everything for depth.
        ctx.save(); ctx.strokeStyle = 'rgba(200,215,255,.16)'; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.beginPath();
        const H = view.bottom - view.top + 400;
        for (let i = 0; i < 26; i++) {
          const d = rain[i], y = view.top - 200 + ((d.y * 1.3 + d.sp * t * 1.1) % H), x = d.x * .8 + 200 + (y - view.top) * .2;
          ctx.moveTo(x, y); ctx.lineTo(x - 22, y - 120);
        }
        ctx.stroke(); ctx.restore();
      },
    };
  }

  return {civic, spell, voyage, neon};
})();
