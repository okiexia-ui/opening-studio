/* The shared skeleton for every stage in stages.js: clear, clip the exit
 * aperture, let the stage paint its scene, trace the mark through the camera
 * move, echo it in the tunnel and hand over to the real window. No media or
 * network clock; every frame is a pure function of time.
 */
window.WelcomePremium = (() => {
  'use strict';
  const clamp = x => Math.min(1, Math.max(0, x));
  function create(o) {
    const {ctx, points, logoLength, options, theme, geometry, style} = o;
    const stage = window.WelcomeStages[theme.id]({copy: o.copy, style, points, logoLength, text: o.text, textLength: o.textLength, travel: o.travel, travelLength: o.travelLength, options, theme});
    const ink = stage.ink || theme.ink;
    function trace(limit, alpha = 1, width = 3, color = ink) {
      ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = width; ctx.strokeStyle = color;
      let tip = points[0], activeAlpha = null;
      // Stroke each continuous contour once, so translucent joins stay smooth
      // when the camera magnifies them during the tunnel move.
      for (let i = 1; i < points.length && points[i - 1].l < limit; i++) {
        const p = points[i], last = points[i - 1];
        let a = alpha;
        if (p.bridge) a *= 1 - (x => x * x * (3 - 2 * x))(clamp((limit - p.l - 18) / 140));
        if (a !== activeAlpha) { if (activeAlpha !== null) ctx.stroke(); ctx.globalAlpha = a; ctx.beginPath(); ctx.moveTo(last.x, last.y); activeAlpha = a; }
        if (p.l > limit) { const k = (limit - last.l) / (p.l - last.l); tip = {x: last.x + (p.x - last.x) * k, y: last.y + (p.y - last.y) * k}; ctx.lineTo(tip.x, tip.y); break; }
        ctx.lineTo(p.x, p.y); tip = p;
      }
      if (activeAlpha !== null) ctx.stroke();
      ctx.restore();
      return tip;
    }
    function at(realTime) {
      o.size();
      const {w, h, dpr} = o.dimensions(), t = clamp(realTime / style.duration) * 15.8, g = geometry(realTime);
      const s = Math.min(w / 1920, h / 1080), ox = (w - 1920 * s) / 2, oy = (h - 1080 * s) / 2;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h); ctx.save();
      if (g.aperture > 0) { ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.arc(ox + g.centreX * s, oy + 540 * s, g.aperture * s, 0, Math.PI * 2, true); ctx.clip('evenodd'); }
      ctx.translate(ox, oy); ctx.scale(s, s);
      // The view in stage coordinates, so scenery can fill any window shape.
      const view = {left: -ox / s, top: -oy / s, right: (w - ox) / s, bottom: (h - oy) / s}, api = {ctx, t, g, s, view, trace};
      stage.scene(api);
      // The typographic stage hands over to the same brand geometry everywhere.
      const progress = clamp((t - 9.3) / 3.8), limit = logoLength * progress;
      ctx.save(); ctx.translate(g.centreX, g.centreY); ctx.scale(g.zoom, g.zoom); ctx.translate(-1392, -540);
      if (progress > 0) {
        if (stage.mark instanceof Function) stage.mark(api, limit, progress);
        else {
          const m = stage.mark || {}, core = m.core || ink;
          trace(limit, m.haloAlpha ?? .11, m.haloWidth ?? 12, m.halo || ink);
          const tip = trace(limit, 1, m.width ?? 2.6, core);
          if (progress < 1) { ctx.fillStyle = core; ctx.beginPath(); ctx.arc(tip.x, tip.y, 2.8, 0, Math.PI * 2); ctx.fill(); }
        }
      }
      if (g.z > 0) for (let k = 1; k <= 3; k++) {
        ctx.save(); ctx.translate(1392, 540); ctx.scale(.80 ** k, .80 ** k); ctx.translate(-1392, -540);
        trace(logoLength, clamp(g.z * 3 - k * .2) * .08, 1.5, stage.echo || ink); ctx.restore();
      }
      o.drawAppIcon(progress, g);
      ctx.restore(); stage.front?.(api); ctx.restore();
      if (!options.native && g.aperture > 0) { ctx.save(); ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = stage.end || theme.ground; ctx.fillRect(0, 0, w, h); ctx.restore(); }
      return {time: realTime, phase: t < 7.5 ? 'greeting' : t < 9.3 ? 'connecting' : t < 13.5 ? 'mark' : 'tunnel', aperture: g.aperture, centreX: g.centreX, theme: theme.id};
    }
    return {at};
  }
  return {create};
})();
