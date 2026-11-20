/* Shared deterministic painter. Playback clocks live outside the composition.
 *
 * WelcomeFilm.create(canvas, {theme, mark, icon, copy, style, native}) returns
 * a renderer whose at(seconds) paints one frame. Frosted Script is painted here;
 * every other theme is a stage in stages.js run by the skeleton in premium.js.
 * All themes share one normalised 0–15.8 clock, so a pace option only changes
 * `duration`, and the native aperture mask follows automatically.
 */
window.WelcomeFilm = (() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg', CLOCK = 15.8;
  // The editable words. Native settings and the gallery pass a `copy` object; anything
  // missing, empty or too long falls back to these defaults or is trimmed.
  const COPY_DEFAULTS = {greeting: 'Welcome', name: 'Tommy', title: '欢迎回来', seal: '准予通行'}, COPY_LIMITS = {greeting: 16, name: 16, title: 12, seal: 4};
  function normalizeCopy(input) {
    const out = {};
    for (const k in COPY_DEFAULTS) {
      const v = typeof input?.[k] === 'string' ? [...input[k].replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim()].slice(0, COPY_LIMITS[k]).join('').trim() : '';
      out[k] = v || COPY_DEFAULTS[k];
    }
    return out;
  }
  const clamp = x => Math.max(0, Math.min(1, x)), smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); }, mix = (a, b, t) => a + (b - a) * t;

  function path(d) { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); return p; }
  function sample(p, transform, step = 2) { const l = p.getTotalLength(), n = Math.ceil(l / step), a = []; for (let i = 0; i <= n; i++) a.push(transform(p.getPointAtLength(l * i / n))); return a; }
  function cubic(a, b, c, d, n = 100) {
    const r = [];
    for (let i = 1; i <= n; i++) { const u = i / n, v = 1 - u; r.push({x: v * v * v * a.x + 3 * v * v * u * b.x + 3 * v * u * u * c.x + u * u * u * d.x, y: v * v * v * a.y + 3 * v * v * u * b.y + 3 * v * u * u * c.y + u * u * u * d.y}); }
    return r;
  }
  function lengthify(a) { let l = 0; return a.map((p, i) => { if (i) l += Math.hypot(p.x - a[i - 1].x, p.y - a[i - 1].y); return {...p, l}; }); }

  /** The pen path for the greeting: the hand-drawn one for the default words in
   *  the default script on one line, otherwise traced from the chosen face. */
  function penPath(copy, style) {
    const standard = copy.greeting === 'Welcome' && copy.name === 'Tommy' && style.font === 'script' && style.layout === 'one';
    if (!standard) return WelcomeHandwriting.trace(style.layout === 'two' ? [copy.greeting, copy.name] : [`${copy.greeting} ${copy.name}`], style.face, style.size);
    const authored = sample(path(WelcomeLettering.map(x => x.d).join(' ')), p => ({x: 300 + p.x * .85, y: 480 + p.y * 1.10}), 2);
    return lengthify(style.size === 1 ? authored : authored.map(p => ({x: 958 + (p.x - 958) * style.size, y: 570 + (p.y - 570) * style.size})));
  }

  const sharedGeometry = new Map();
  function getGeometry(mark, copy, style) {
    const key = JSON.stringify([mark, copy.greeting, copy.name, style.font, style.layout, style.size]);
    if (sharedGeometry.has(key)) return sharedGeometry.get(key);
    const text = penPath(copy, style), textLen = text.at(-1).l;
    const logoCenter = {x: 1392, y: 540}, spec = window.WelcomeMarks?.[mark] || {path: WelcomeLogo.path, center: [10.005, 10], scale: 18.4, step: .065};
    const logoSource = sample(path(spec.path), p => ({x: logoCenter.x + (p.x - spec.center[0]) * spec.scale, y: logoCenter.y + (p.y - spec.center[1]) * spec.scale}), spec.step);
    const logo = [{...logoSource[0], bridge: false}];
    // Join the source SVG's closed contours with a visible travelling stroke.
    for (let i = 1; i < logoSource.length; i++) {
      const p = logoSource[i], prev = logo.at(-1), dist = Math.hypot(p.x - prev.x, p.y - prev.y);
      if (dist > 10) {
        const mid = {x: (prev.x + p.x) / 2, y: (prev.y + p.y) / 2}, dx = (mid.x - logoCenter.x) * .20, dy = (mid.y - logoCenter.y) * .20;
        logo.push(...cubic(prev, {x: prev.x + dx, y: prev.y + dy}, {x: p.x + dx, y: p.y + dy}, p, Math.ceil(dist / 1.5)).map(q => ({...q, bridge: true})));
      } else logo.push({...p, bridge: false});
    }
    const logoPoints = lengthify(logo), logoLen = logoPoints.at(-1).l, tail = text.at(-1), first = logoPoints[0];
    const travel = lengthify([tail, ...cubic(tail, {x: 1745, y: 570}, {x: 1640, y: 820}, {x: 1402, y: 760}, 110), ...cubic({x: 1402, y: 760}, {x: 1327, y: 740}, {x: first.x - 20, y: first.y + 65}, first, 60)]);
    const value = {text, textLen, logoPoints, logoLen, travel, travelLen: travel.at(-1).l};
    sharedGeometry.set(key, value);
    return value;
  }

  function create(canvas, options = {}) {
    const ctx = canvas.getContext('2d', {alpha: true});
    const theme = WelcomeStyle.theme(options.theme), style = WelcomeStyle.resolve(theme.id, options.style), duration = style.duration;
    const mark = ['openai', 'claude', 'portal'].includes(options.mark) ? options.mark : 'openai';
    const copy = normalizeCopy(options.copy), {text, textLen, logoPoints, logoLen, travel, travelLen} = getGeometry(mark, copy, style);
    let icon = null, currentTime = 0, disposed = false;
    if (mark === 'portal' && options.icon?.startsWith('data:image/')) { icon = new Image(); icon.onload = () => { if (!disposed) at(currentTime); }; icon.src = options.icon; }
    function drawAppIcon(progress, g) {
      if (!icon?.complete || !icon.naturalWidth) return;
      ctx.save(); ctx.globalAlpha = smooth((progress - .35) / .4) * (1 - smooth(g.z * 4));
      ctx.beginPath(); ctx.roundRect(1302, 450, 180, 180, 36); ctx.clip(); ctx.drawImage(icon, 1302, 450, 180, 180); ctx.restore();
    }
    let w = 0, h = 0, dpr = 1;
    function size() {
      const r = canvas.getBoundingClientRect(), nw = Math.max(1, Math.round(r.width)), nh = Math.max(1, Math.round(r.height)), nd = Math.min(window.devicePixelRatio || 1, 2);
      if (nw !== w || nh !== h || nd !== dpr) { w = nw; h = nh; dpr = nd; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    }
    const resizeObserver = new ResizeObserver(size); resizeObserver.observe(canvas); size();
    /** Camera and aperture for real time t; mirrored by applyMask in WelcomeTommy.swift. */
    function geometry(t) {
      t = t / duration * CLOCK;
      const z = clamp((t - 13.5) / 2.3), q = z * z * z;
      return {z, q, zoom: 1 + q * 24, centreX: mix(1392, 960, smooth(z * 1.25)), centreY: 540,
        aperture: Math.pow(clamp((t - 13.82) / 1.98), 2.45) * Math.max(2250, Math.hypot(w, h) / Math.max(.001, Math.min(w / 1920, h / 1080)))};
    }

    /* ---- Frosted Script ---- */
    const lineColors = style.colors.line?.map(WelcomeStyle.toRgb) || [];
    function rgb(p, a = 1) {
      p = ((p % 1) + 1) % 1;
      const n = p * 6, i = Math.floor(n), u = smooth(n - i), x = lineColors[i], y = lineColors[Math.min(i + 1, 6)];
      return `rgba(${Math.round(mix(x[0], y[0], u))},${Math.round(mix(x[1], y[1], u))},${Math.round(mix(x[2], y[2], u))},${a})`;
    }
    const el = style.elements, glow = (el.glow ?? .6) / .6, fieldStrength = (el.fields ?? .7) / .7;
    function progress(n) {
      if (n < 8.1) { const u = clamp(n / 8.1); return {text: textLen * (u - Math.sin(u * Math.PI * 2) * .026), travel: 0, logo: 0}; }
      return {text: textLen, travel: travelLen * smooth((n - 8.1) / 1.2), logo: logoLen * clamp((n - 9.3) / 3.8)};
    }
    function drawLine(points, limit, time, kind, opacity, penWidth, offset) {
      if (limit <= 0 || opacity <= .001) return null;
      let end = null;
      const batch = 9;
      for (let i = 1; i < points.length && points[i - 1].l < limit; i += batch) {
        const last = Math.min(i + batch - 1, points.length - 1);
        let alpha = opacity;
        if (kind === 'logo' && points[i].bridge) alpha *= 1 - smooth((limit - points[i].l - 16) / 145);
        if (alpha <= .002) continue;
        const hue = offset + points[i].l / (kind === 'text' ? textLen : logoLen) * .87 + time * .009;
        ctx.beginPath(); ctx.moveTo(points[i - 1].x, points[i - 1].y);
        for (let j = i; j <= last; j++) {
          const a = points[j - 1], b = points[j];
          if (b.l > limit) {
            const u = (limit - a.l) / (b.l - a.l); end = {x: mix(a.x, b.x, u), y: mix(a.y, b.y, u)};
            if (b.lift) ctx.moveTo(end.x, end.y); else ctx.lineTo(end.x, end.y);
            break;
          }
          if (b.lift) ctx.moveTo(b.x, b.y); else ctx.lineTo(b.x, b.y);
          end = b;
        }
        ctx.lineWidth = kind === 'travel' ? mix(9.2, 5.2, points[i].l / travelLen) : penWidth;
        ctx.strokeStyle = rgb(hue, alpha); ctx.stroke();
      }
      return end;
    }
    function strokeSoft(points, limit, t, kind, alpha, width, offset) {
      drawLine(points, limit, t, kind, alpha * .055 * glow, width * 3.1, offset);
      drawLine(points, limit, t, kind, alpha * .14 * glow, width * 1.65, offset);
      return drawLine(points, limit, t, kind, alpha, width, offset);
    }
    const premium = theme.id !== 'frost' ? WelcomePremium.create({canvas, ctx, copy, style, points: logoPoints, logoLength: logoLen, text, textLength: textLen, travel, travelLength: travelLen, options, theme, geometry, size, drawAppIcon, dimensions: () => ({w, h, dpr})}) : null;
    const ground = WelcomeStyle.toRgb(style.colors.ground || '#edf0f6').join(',');

    function at(t) {
      currentTime = t;
      if (premium) return premium.at(t);
      size();
      t = Math.max(0, Math.min(t, duration));
      const n = t / duration * CLOCK, g = geometry(t), p = progress(n);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      const scale = Math.min(w / 1920, h / 1080), ox = (w - 1920 * scale) / 2, oy = (h - 1080 * scale) / 2;
      ctx.save();
      if (g.aperture > 0) { ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.arc(ox + g.centreX * scale, oy + 540 * scale, g.aperture * scale, 0, Math.PI * 2, true); ctx.clip('evenodd'); }
      ctx.fillStyle = options.native ? `rgba(${ground},.88)` : `rgb(${ground})`; ctx.fillRect(0, 0, w, h);
      const fields = style.colors.fields, alphas = [.24, .20, .90, .12];
      [[-.05, .25, .76], [1.04, .82, .75], [.58, -.5, .95], [.47, 1.08, .62]].forEach(([x, y, r], i) => {
        const a = alphas[i] * (i === 2 ? 1 : fieldStrength);
        if (a <= .002) return;
        const gr = ctx.createRadialGradient(w * x, h * y, 0, w * x, h * y, Math.max(w, h) * r);
        gr.addColorStop(0, `rgba(${fields[i]},${Math.min(1, a)})`); gr.addColorStop(1, `rgba(${ground},0)`);
        ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
      });
      ctx.translate(ox, oy); ctx.scale(scale, scale); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const textAlpha = 1 - smooth((n - 8.75) / 1.9), travelAlpha = 1 - smooth((n - 10.3) / 2.2);
      let tip = null;
      if (n < 13.5) { tip = strokeSoft(text, p.text, n, 'text', textAlpha, 10.5, 0); if (p.travel > 0) tip = strokeSoft(travel, p.travel, n, 'travel', travelAlpha, 9.2, .8); }
      ctx.save(); ctx.translate(g.centreX, g.centreY); ctx.scale(g.zoom, g.zoom); ctx.translate(-1392, -540);
      if (p.logo > 0) tip = strokeSoft(logoPoints, p.logo, n, 'logo', 1, 5.2, .36);
      if (g.z > 0 && el.echo !== 0) {
        for (let k = 1; k <= 3; k++) {
          const a = clamp(g.z * 3 - k * .22) * .12;
          if (a <= 0) continue;
          ctx.save(); ctx.translate(1392, 540); const s = Math.pow(.79, k); ctx.scale(s, s); ctx.translate(-1392, -540);
          drawLine(logoPoints, logoLen, n, 'logo', a, 2.1, .36); ctx.restore();
        }
      }
      drawAppIcon(p.logo / logoLen, g);
      if (el.tip !== 0 && n >= 9.3 && n < 13.5 && tip) { const pulse = 1 - smooth((n - 13.1) / .4); ctx.fillStyle = rgb(.36 + p.logo / logoLen * .87 + n * .009, .7 * pulse); ctx.beginPath(); ctx.arc(tip.x, tip.y, 2.3, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
      if (el.tip !== 0 && n < 9.3 && tip) { ctx.fillStyle = rgb(p.text / textLen * .87 + n * .009, .82); ctx.beginPath(); ctx.arc(tip.x, tip.y, 5.3, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
      if (!options.native && g.aperture > 0) { ctx.save(); ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = '#f8f9fb'; ctx.fillRect(0, 0, w, h); ctx.restore(); }
      return {time: t, phase: n < 8.1 ? 'greeting' : n < 9.3 ? 'connecting' : n < 13.5 ? 'mark' : 'tunnel', aperture: g.aperture, centreX: g.centreX};
    }
    function metrics() {
      return {duration, theme: theme.id, mark, copy, style: WelcomeStyle.normalize(theme.id, style), textLength: textLen, travelLength: travelLen, logoLength: logoLen,
        joinDistances: [Math.hypot(text.at(-1).x - travel[0].x, text.at(-1).y - travel[0].y), Math.hypot(travel.at(-1).x - logoPoints[0].x, travel.at(-1).y - logoPoints[0].y)],
        textBounds: {minX: Math.min(...text.map(p => p.x)), maxX: Math.max(...text.map(p => p.x)), minY: Math.min(...text.map(p => p.y)), maxY: Math.max(...text.map(p => p.y))}};
    }
    return {at, metrics, geometry, duration, dispose: () => { disposed = true; resizeObserver.disconnect(); if (icon) icon.onload = null; }};
  }
  return {create, normalizeCopy, copyDefaults: COPY_DEFAULTS, copyLimits: COPY_LIMITS, normalizeStyle: (theme, style) => WelcomeStyle.normalize(theme, style)};
})();
