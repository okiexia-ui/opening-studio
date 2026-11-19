/* Opening stages registered by theme id. Each stage paints everything before
 * the shared handoff (greeting, scenery, connector), styles the traced mark and
 * may add a foreground. premium.js owns the timing skeleton, the aperture and
 * the tunnel, so every stage exits into the real window the same way.
 *
 * Contract: pure functions of time `t` on the normalised 0–15.8 clock, so any
 * frame can be rendered in any order (video export, gallery scrubbing, tests).
 * Fixed seeds and locally decoded photographs keep native playback and video in sync.
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

  /* An ivory title page and a photographic plate of the wall at Jinshanling. */
  function civic(env) {
    const P = env.style.colors, E = env.style.elements, red = P.red, copy = env.copy;
    const R = rng(1949);
    const wear = Array.from({length: 46}, () => [6 + R() * 88, 6 + R() * 88, .3 + R() * 1.1]);
    const notches = Array.from({length: 12}, () => [4 + R() * 90, R() > .5 ? 5 : 95, .6 + R() * .9]);
    const SEAL_LAYOUT = [[[50, 70]], [[50, 46], [50, 83]], [[32, 45], [68, 45], [50, 82]], [[32, 45], [68, 45], [32, 82], [68, 82]]];
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
    return {
      echo: red, ink: red, end: '#f4efe5',
      mark: {halo: red, core: red, width: 3, haloAlpha: .12, haloWidth: 10},
      scene({ctx, t, view}) {
        const w = view.right - view.left, h = view.bottom - view.top, tall = w / h < 1.05;
        const lift = smooth(span(t, 0, 10)), fade = fadeOut(t);
        fillView(ctx, view, '#f5f0e6');
        const plate = tall ? {left: view.left, top: view.top, right: view.right, bottom: view.top + h * .48}
          : {left: view.left + w * .49, top: view.top, right: view.right, bottom: view.bottom};
        const present = (1 - smooth(span(t, 7.5, 10.8))) * E.wall;
        WelcomePhotos.cover(ctx, 'civic-jinshanling', plate, {focusX: .51, focusY: .69, zoom: 1.015 + lift * .055, alpha: present});
        if (E.clouds && present > 0) {
          const mist = ctx.createLinearGradient(0, plate.top, 0, plate.bottom);
          mist.addColorStop(0, 'rgba(248,244,230,.28)'); mist.addColorStop(.7, 'rgba(248,244,230,0)');
          ctx.save(); ctx.globalAlpha = present; ctx.fillStyle = mist; ctx.fillRect(plate.left, plate.top, plate.right - plate.left, plate.bottom - plate.top); ctx.restore();
        }
        const left = view.left + w * (tall ? .10 : .073), fit = w * (tall ? .80 : .37);
        const y = view.top + h * (tall ? .69 : .49), ready = smooth(span(t, 1.0, 2.45)) * fade;
        if (E.silk) {
          ctx.save(); ctx.globalAlpha = fade; ctx.fillStyle = red;
          ctx.fillRect(left, y - 182, 58 * smooth(span(t, .15, 1.65)), 5); ctx.restore();
        }
        label(ctx, (copy.greeting + '  ' + copy.name).toUpperCase(), left, y - 109, {font: '500 22px Manrope', tracking: 4.8, align: 'left', color: '#725c4e', fit, alpha: ready});
        label(ctx, copy.title, left - 4, y + 17 + (1 - ready) * 12, {font: face(env, 117), tracking: 9, align: 'left', color: red, fit, alpha: ready});
        if (E.wall) label(ctx, '金 山 岭 长 城', plate.right - w * .043, plate.bottom - Math.min(h * .045, 67), {font: '600 23px ' + SONG, tracking: 3.1, color: '#fffaf0', align: 'right', alpha: present});
        const barWidth = Math.min(fit * .65, 325), barY = y + 130, value = smooth(span(t, 2.6, 6.65));
        if (E.auth) {
          const opacity = smooth(span(t, 2.3, 3.1)) * fade;
          label(ctx, value < 1 ? '通行核验' : '准予通行', left, barY - 17, {font: '500 22px ' + SONG, align: 'left', tracking: 4, color: '#6d5a4d', alpha: opacity});
          label(ctx, Math.round(value * 100) + '%', left + barWidth, barY - 17, {font: '400 19px Manrope', align: 'right', color: red, alpha: opacity});
          ctx.save(); ctx.globalAlpha = opacity; ctx.fillStyle = '#cdbfad'; ctx.fillRect(left, barY, barWidth, 1.6);
          ctx.fillStyle = red; ctx.fillRect(left, barY - .6, barWidth * value, 2.8); ctx.restore();
        }
        const sx = left + fit * .86, sy = y + 113, stamp = smooth(span(t, 6.0, 6.5));
        if (E.seal) seal(ctx, sx, sy, 89, -.07, 1 + .19 * (1 - stamp), stamp * fade);
        if (t > 7.05) {
          const from = E.seal ? {x: sx + 38, y: sy + 9} : {x: left + barWidth, y: barY};
          const q = env.points[0], path = bezier(from, {x: from.x + 155, y: from.y + 12}, {x: q.x - 78, y: q.y + 120}, q);
          stroke(ctx, path, 0, path.at(-1).l * ease(span(t, 7.05, 9.3)), red, 2.3, 1 - smooth(span(t, 10.15, 12.3)));
        }
      },
    };
  }

  /* A strand of candlelight writes above real votive lights. */
  function spell(env) {
    const R = rng(7);
    const P = env.style.colors, E = env.style.elements, light = P.light;
    const dust = Array.from({length: 46}, () => ({x: R(), y: R(), phase: R() * 6.28}));
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
    return {
      echo: light, ink: light, end: P.sky[1],
      scene({ctx, t, view}) {
        const fade = fadeOut(t);
        const w = view.right - view.left, h = view.bottom - view.top;
        const drift = smooth(span(t, 0, 11.5)), photo = 1 - smooth(span(t, 8.35, 12.1));
        fillView(ctx, view, P.sky[2]);
        WelcomePhotos.cover(ctx, 'spell-votives', view, {zoom: 1.025 + drift * .045, focusX: .56, focusY: .05 + .026 * drift, alpha: photo * (.66 + .34 * E.candles)});
        if (photo > 0) {
          const shade = ctx.createLinearGradient(0, view.top, 0, view.bottom);
          shade.addColorStop(0, 'rgba(12,5,6,.24)'); shade.addColorStop(.48, 'rgba(12,5,6,.53)'); shade.addColorStop(.78, 'rgba(12,5,6,.04)');
          ctx.save(); ctx.globalAlpha = photo; fillView(ctx, view, shade); ctx.restore();
          if (E.windows) radial(ctx, view.left + w * .14, view.top + h * .13, Math.min(w, h) * .63, P.flame, .13 * photo);
          if (E.candles) radial(ctx, view.left + w * .64, view.top + h * .83, Math.min(w, h) * .47, P.flame, (.07 + .025 * Math.sin(2.8 * t)) * E.candles * photo);
          ctx.save(); ctx.fillStyle = P.light;
          for (const mote of dust.slice(0, Math.round(dust.length * E.stars))) {
            const x = view.left + w * mote.x + 12 * Math.sin(t * .4 + mote.phase);
            const y = view.top + h * ((mote.y + 1 - t * .007) % 1);
            ctx.globalAlpha = (.22 + .16 * Math.sin(t + mote.phase)) * photo;
            ctx.beginPath(); ctx.arc(x, y, 1.55, 0, 2 * Math.PI); ctx.fill();
          }
          ctx.restore();
        }

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

  /* ISS airglow over the Pacific dissolves into the Apollo 17 Earth portrait. */
  function voyage(env) {
    const P = env.style.colors, E = env.style.elements, two = env.style.layout === 'two';
    const rnd = rng(22727);
    const trails = Array.from({length: 18}, () => ({x: rnd(), y: rnd(), phase: rnd()}));
    return {
      echo: P.hud, ink: P.mark, end: '#020305',
      mark: {halo: P.hud, core: P.mark, width: 2.7, haloAlpha: .16, haloWidth: 13},
      scene({ctx, t, view}) {
        const w = view.right - view.left, h = view.bottom - view.top, tall = w / h < .95;
        const pull = smooth(span(t, 3.4, 6.25)), drift = smooth(span(t, 0, 11.6));
        const handoff = smooth(span(t, 8.25, 12.15)), alive = 1 - handoff;
        fillView(ctx, view, '#020305');
        WelcomePhotos.cover(ctx, 'voyage-iss-airglow', view, {
          focusX: .43 + .09 * drift, focusY: .57, zoom: 1.05 + .045 * drift, alpha: 1 - pull,
        });
        const size = (tall ? Math.min(w * .82, h * .44) : Math.min(w * .51, h * .90)) * (1.12 - .14 * drift - .11 * handoff);
        const cx = tall ? view.left + w * .52 : view.left + w * (.745 - .022 * drift);
        const cy = view.top + h * (tall ? .31 : .482);
        if (pull > 0) {
          ctx.save(); ctx.globalCompositeOperation = 'screen';
          WelcomePhotos.cover(ctx, 'voyage-apollo-earth', {left: cx - size / 2, top: cy - size / 2, right: cx + size / 2, bottom: cy + size / 2}, {alpha: pull * alive});
          ctx.restore();
        }
        const x = view.left + w * (tall ? .105 : .082), fit = w * (tall ? .80 : .44);
        const y = view.top + h * (tall ? .65 : .54);
        // Only shade the type side of the orbital exposure; leave the atmospheric bands intact.
        if (pull < 1) {
          const scrim = ctx.createLinearGradient(view.left, 0, view.right, 0);
          scrim.addColorStop(0, rgba('#010205', .69 * (1 - pull)));
          scrim.addColorStop(.64, rgba('#010205', 0)); fillView(ctx, view, scrim);
        }
        const a = smooth(span(t, .65, 2.5)) * fadeOut(t);
        if (two) {
          label(ctx, env.copy.greeting.toUpperCase(), x + 4, y - 91, {font: face(env, 26, 500), tracking: 7, color: P.hud, align: 'left', fit, alpha: a});
          label(ctx, env.copy.name, x, y + 61 + (1 - a) * 14, {font: face(env, 158), tracking: -3, color: '#f6f6f1', align: 'left', fit, alpha: a});
        } else label(ctx, env.copy.greeting + ' ' + env.copy.name, x, y + 36, {font: face(env, 106), tracking: -1, color: P.mark, align: 'left', fit, alpha: a});
        // The two exposure IDs are the actual NASA frame numbers.
        const marginY = Math.min(h * .082, 108), captionY = view.bottom - marginY;
        const captions = [['ISS  /  EASTERN PACIFIC', 'ISS072-E-896652', 1 - pull], ['APOLLO 17  /  EARTH', 'AS17-148-22727', pull]];
        for (const [name, frame, weight] of captions) {
          const opacity = weight * alive * smooth(span(t, .25, 1.15));
          if (E.hud) label(ctx, name, x, captionY, {font: '500 19px Manrope', tracking: 3, align: 'left', fit: w * .46, color: '#d7dce2', alpha: opacity});
          if (E.hud) label(ctx, frame, view.right - (x - view.left), captionY, {font: '500 18px ' + MONO, tracking: 1.2, align: 'right', fit: w * .34, color: '#d7dce2', alpha: opacity});
        }
        if (E.countdown && t < 3.5) {
          const step = Math.min(2, Math.floor(t / 1.05));
          label(ctx, 'T − 0' + (3 - step), x, view.top + marginY, {font: '400 20px ' + MONO, tracking: 2, align: 'left', color: P.mark, alpha: .9 * (1 - smooth(span(t, 2.7, 3.5)))});
        }
        if (t >= 6.75 && t < 12.5) {
          const q = env.points[0], from = {x: x + 4, y: y + (two ? 110 : 83)};
          const path = bezier(from, {x: from.x + w * .24, y: from.y}, {x: q.x - w * .11, y: q.y + 75}, q);
          const length = path.at(-1).l * ease(span(t, 6.75, 9.3)), opacity = 1 - smooth(span(t, 9.6, 12.5));
          const tip = stroke(ctx, path, 0, length, P.hud, 2.4, .95 * opacity);
          if (tip && E.thrusters && t < 9.35) radial(ctx, tip.x, tip.y, 26, P.plume, .95);
        }
        if (E.streaks && t > 10.3) {
          const u = span(t, 10.3, 15.6), a = Math.sin(Math.PI * u) * .4;
          ctx.save(); ctx.strokeStyle = P.hud; ctx.globalAlpha = a; ctx.lineWidth = 1.2; ctx.beginPath();
          for (const s of trails.slice(0, Math.round(trails.length * E.streaks))) {
            const v = (s.phase + u) % 1, dx = (s.x - .5) * w, dy = (s.y - .5) * h;
            ctx.moveTo(1392 + dx * v * 2, 540 + dy * v * 2); ctx.lineTo(1392 + dx * (v * 2 + .035), 540 + dy * (v * 2 + .035));
          }
          ctx.stroke(); ctx.restore();
        }
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
    // Ignition flicker and one temperamental stretch of tube, both scripted.
    const ON = [[1.62, 1.7], [1.92, 2.0], [2.18, 2.5], [2.62, 2.66], [2.82, 8.85], [8.97, 9.05], [9.12, 9.18]];
    const FAULTY = [env.textLength * .5997, env.textLength * .6803], FAULT_OFF = E.fault ? [[4.9, 5.03], [5.26, 5.31], [6.08, 6.18], [6.3, 6.33]] : [];
    const drops = Math.round(92 * E.rain);
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
      stroke(ctx, env.text, 0, env.textLength, '#130b16', 13 * scale, .83 * lit);
      tube(ctx, 0, FAULTY[0], lit, scale); tube(ctx, FAULTY[0], FAULTY[1], lit * faulty, scale); tube(ctx, FAULTY[1], env.textLength, lit, scale);
    }
    return {
      echo: P.mark, ink: P.mark, end: '#07060c',
      scene({ctx, t, view}) {
        const fade = fadeOut(t), glass = smooth(span(t, .1, 1)) * fade;
        const lit = (inside(t, ON) ? 1 : 0) * (.86 + .14 * smooth(span(t, 2.82, 3.4))) * (.97 + .03 * Math.sin(t * 61));
        const w = view.right - view.left, drift = smooth(span(t, 0, 10.8));
        const photo = 1 - smooth(span(t, 8.2, 12.25));
        fillView(ctx, view, '#09080d');
        WelcomePhotos.cover(ctx, 'neon-tokyo-rain', view, {focusX: .50 + .075 * drift, focusY: .53, zoom: 1.01 + .055 * drift, alpha: photo});
        // The name is reflected in a shop window. Its local shadow leaves the street lights in colour.
        const night = ctx.createLinearGradient(0, view.top, 0, view.bottom);
        night.addColorStop(0, 'rgba(8,6,14,.08)'); night.addColorStop(.44, 'rgba(8,6,14,.47)');
        night.addColorStop(.64, 'rgba(8,6,14,.47)'); night.addColorStop(1, 'rgba(8,6,14,.11)');
        ctx.save(); ctx.globalAlpha = photo; fillView(ctx, view, night); ctx.restore();
        if (E.bokeh) for (const b of bokeh.slice(0, 12)) radial(ctx, b.x, b.y, b.r * .62, b.c, b.a * E.bokeh * photo);
        if (E.reflection && lit > 0) {
          ctx.save(); ctx.beginPath(); ctx.rect(view.left, HORIZON, w, Math.max(0, view.bottom - HORIZON)); ctx.clip();
          ctx.translate(0, HORIZON + 8); ctx.scale(1, -.46); ctx.translate(0, -HORIZON);
          sign(ctx, t, lit * fade * .16, 0, .8); ctx.restore();
        }
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

  /* A slow move across an actual auroral exposure above the Denali treeline. */
  function aurora(env) {
    const P = env.style.colors, E = env.style.elements, two = env.style.layout === 'two';
    const rnd = rng(5150), stars = Array.from({length: 85}, () => ({x: rnd(), y: rnd() * .46, phase: rnd() * 6.28}));
    const text = P.text, eyebrowWeight = 500, nameWeight = env.style.face.weight;
    return {
      echo: P.glow, ink: P.glow, end: P.sky[1],
      mark: {halo: P.glow, core: shade(P.glow, .7), width: 2.6, haloAlpha: .2, haloWidth: 16},
      scene({ctx, t, view}) {
        const fade = fadeOut(t), w = view.right - view.left, h = view.bottom - view.top;
        const drift = smooth(span(t, 0, 11)), photo = 1 - smooth(span(t, 8.4, 12.3));
        fillView(ctx, view, P.sky[0]);
        WelcomePhotos.cover(ctx, 'aurora-denali', view, {
          zoom: (E.ice ? 1.015 : 1.46) + drift * .042, focusX: .57 + drift * .06,
          focusY: E.ice ? .84 : .035, alpha: photo * (.47 + .53 * E.curtains),
        });
        ctx.save(); ctx.fillStyle = P.text;
        for (const star of stars.slice(0, Math.round(stars.length * E.stars))) {
          ctx.globalAlpha = (.26 + .19 * Math.sin(t * .75 + star.phase)) * photo;
          ctx.beginPath(); ctx.arc(view.left + w * star.x, view.top + h * star.y, 1.4, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
        if (E.meteor && t > 2.25 && t < 3.55) {
          const u = span(t, 2.25, 3.55), x = view.left + w * (.61 + .19 * u), y = view.top + h * (.12 + .09 * u);
          ctx.save(); ctx.globalAlpha = Math.sin(Math.PI * u) * .8; ctx.strokeStyle = P.text; ctx.lineWidth = 1.8;
          ctx.beginPath(); ctx.moveTo(x - 55, y - 17); ctx.lineTo(x, y); ctx.stroke(); ctx.restore();
        }
        // The greeting condenses out of the light, letter by letter.
        const nameY = view.top + h * .36;
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
          letters(env.copy.greeting.toUpperCase(), 960, nameY - 112, 31, eyebrowWeight, 8, 2.9, shade(P.glow, .55));
          letters(env.copy.name, 960, nameY + 19, 141, nameWeight, 2, 3.5, text);
        } else letters(`${env.copy.greeting} ${env.copy.name}`, 960, nameY, 113, nameWeight, 2, 3, text);
        // One strand of light pours from the curtains into the mark.
        if (t > 6.9) {
          const q = env.points[0], path = bezier({x: 1660, y: 300}, {x: 1720, y: 520}, {x: q.x - 340, y: q.y + 120}, q), L = path.at(-1).l * ease(span(t, 6.9, 9.3));
          const a = 1 - smooth((t - 10.4) / 2);
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          stroke(ctx, path, 0, L, P.glow, 16, .12 * a); stroke(ctx, path, 0, L, shade(P.glow, .6), 2.4, .9 * a);
          ctx.restore();
          if (t < 9.4) { const h = pointAt(path, L); radial(ctx, h.x, h.y, 21, shadeTrip(P.glow, .6), .52); }
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
