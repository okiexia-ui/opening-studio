/* Single-stroke handwriting for any greeting.
 *
 * The default "Welcome Tommy" uses the hand-authored path in lettering.js.
 * Any other phrase is set in a connected script face, rasterised, thinned to
 * a one-pixel centreline (Zhang–Suen) and traced into an ordered pen path.
 * The path is in the same {x, y, l} form as the authored one. Points whose
 * `lift` flag is set arrive by a pen-up move, which painters skip. Non-Latin
 * text falls back to the system's Kaiti or Songti and is traced the same way.
 *
 * Deterministic for a given phrase and installed fonts, and cached per phrase.
 */
window.WelcomeHandwriting = (() => {
  'use strict';
  const FONT = '"Snell Roundhand","Apple Chancery","Kaiti SC","STKaiti","Songti SC","Noto Serif SC",cursive';
  // Pen-up moves cost a fifth of their length on the clock: a quick hop, not a pause.
  const SIZE = 200, LIFT = .2, cache = new Map();

  function rasterise(phrase) {
    const c = document.createElement('canvas'), g = c.getContext('2d', {willReadFrequently: true});
    const font = `700 ${SIZE}px ${FONT}`;
    g.font = font;
    const m = g.measureText(phrase), pad = 24;
    const left = Math.ceil(m.actualBoundingBoxLeft || 0), ascent = Math.ceil(m.actualBoundingBoxAscent || SIZE * .8);
    const w = Math.max(8, Math.ceil(left + (m.actualBoundingBoxRight || m.width)) + pad * 2);
    const h = Math.max(8, Math.ceil(ascent + (m.actualBoundingBoxDescent || SIZE * .3)) + pad * 2);
    c.width = w; c.height = h;
    g.font = font; g.fillStyle = '#000'; g.textBaseline = 'alphabetic';
    g.fillText(phrase, pad + left, pad + ascent);
    const rgba = g.getImageData(0, 0, w, h).data, img = new Uint8Array(w * h);
    for (let i = 0; i < img.length; i++) img[i] = rgba[i * 4 + 3] > 100 ? 1 : 0;
    return {img, w, h};
  }

  function thin(img, w, h) {
    const kill = [];
    for (let changed = true; changed;) {
      changed = false;
      for (let pass = 0; pass < 2; pass++) {
        kill.length = 0;
        for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          if (!img[i]) continue;
          const p2 = img[i - w], p3 = img[i - w + 1], p4 = img[i + 1], p5 = img[i + w + 1], p6 = img[i + w], p7 = img[i + w - 1], p8 = img[i - 1], p9 = img[i - w - 1];
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (b < 2 || b > 6) continue;
          const a = (!p2 & p3) + (!p3 & p4) + (!p4 & p5) + (!p5 & p6) + (!p6 & p7) + (!p7 & p8) + (!p8 & p9) + (!p9 & p2);
          if (a !== 1) continue;
          if (pass ? (p2 * p4 * p8 === 0 && p2 * p6 * p8 === 0) : (p2 * p4 * p6 === 0 && p4 * p6 * p8 === 0)) kill.push(i);
        }
        if (kill.length) { changed = true; for (const i of kill) img[i] = 0; }
      }
    }
  }

  /** Skeleton pixels as a graph. Diagonal links are kept only where no
   *  4-neighbour path exists, so staircases do not form tiny triangles. */
  function graph(img, w, h) {
    const nb = i => {
      const out = [], x = i % w, y = (i - x) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = (y + dy) * w + x + dx; if (img[j]) out.push(j); }
      for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const j = (y + dy) * w + x + dx;
        if (img[j] && !img[y * w + x + dx] && !img[(y + dy) * w + x]) out.push(j);
      }
      return out;
    };
    const adj = new Map();
    for (let i = 0; i < img.length; i++) if (img[i]) adj.set(i, nb(i));
    return adj;
  }

  function edges(adj, w) {
    const key = (a, b) => a < b ? a * 1e7 + b : b * 1e7 + a, used = new Set(), out = [];
    const isNode = i => adj.get(i).length !== 2;
    const walk = (start, next) => {
      const path = [start]; let prev = start, cur = next;
      used.add(key(start, next));
      while (true) {
        path.push(cur);
        if (isNode(cur) || cur === start) break;
        const step = adj.get(cur).find(j => j !== prev && !used.has(key(cur, j)));
        if (step === undefined) break;
        used.add(key(cur, step)); prev = cur; cur = step;
      }
      return path;
    };
    for (const [i, n] of adj) if (isNode(i)) for (const j of n) if (!used.has(key(i, j))) out.push(walk(i, j));
    // Closed loops with no junction (an isolated "o").
    for (const [i, n] of adj) for (const j of n) if (!used.has(key(i, j))) out.push(walk(i, j));
    // Dots (the i, j, ë diacritics) can thin to a lone pixel: keep them as a tiny stroke.
    for (const [i, n] of adj) if (!n.length) out.push([i, i + 1]);
    return out.map(p => p.map(i => ({x: i % w, y: Math.floor(i / w)})));
  }

  const length = p => { let l = 0; for (let i = 1; i < p.length; i++) l += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y); return l; };
  const same = (a, b) => a.x === b.x && a.y === b.y;

  /** Drop short spurs that thinning leaves at serifs and blobs. */
  function prune(list, minimum) {
    for (let round = 0; round < 3; round++) {
      const degree = new Map(), id = p => p.x + ',' + p.y;
      for (const e of list) for (const end of [e[0], e.at(-1)]) degree.set(id(end), (degree.get(id(end)) || 0) + 1);
      const keep = list.filter(e => {
        const d0 = degree.get(id(e[0])), d1 = degree.get(id(e.at(-1)));
        return !(length(e) < minimum && ((d0 === 1 && d1 > 2) || (d1 === 1 && d0 > 2)));
      });
      if (keep.length === list.length) break;
      list = keep;
    }
    return list.filter(e => length(e) >= 1);
  }

  /** Order edges into one pen journey: keep going as straight as possible
   *  through junctions; when stuck, lift the pen to the nearest loose end. */
  function journey(list) {
    const left = new Set(list.map((_, i) => i)), out = [];
    const dirAt = (e, fromStart) => {
      const a = fromStart ? e[0] : e.at(-1), b = fromStart ? e[Math.min(6, e.length - 1)] : e[Math.max(0, e.length - 7)];
      const l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return {x: (b.x - a.x) / l, y: (b.y - a.y) / l};
    };
    let pos = null, dir = {x: 1, y: 0};
    while (left.size) {
      let best = null;
      if (pos) for (const i of left) {
        const e = list[i];
        for (const fromStart of [true, false]) {
          if (!same(fromStart ? e[0] : e.at(-1), pos)) continue;
          const d = dirAt(e, fromStart), score = d.x * dir.x + d.y * dir.y;
          if (!best || score > best.score) best = {i, fromStart, score, lift: false};
        }
      }
      if (!best) for (const i of left) {
        const e = list[i];
        for (const fromStart of [true, false]) {
          const end = fromStart ? e[0] : e.at(-1);
          // The first stroke starts at the far left; later lifts go to the nearest end.
          // Finish what lies behind the pen before moving on, as a hand would.
          const score = pos ? -Math.hypot(end.x - pos.x, end.y - pos.y) - Math.max(0, end.x - pos.x) * .6 : -end.x * 10 - end.y * .01;
          if (!best || score > best.score) best = {i, fromStart, score, lift: !!pos};
        }
      }
      const e = best.fromStart ? list[best.i] : [...list[best.i]].reverse();
      left.delete(best.i);
      out.push({points: e, lift: best.lift});
      pos = e.at(-1); dir = dirAt(e, false); dir = {x: -dir.x, y: -dir.y};
    }
    return out;
  }

  /** Smooth each pen-down run, map into the stage and resample every 2 px. */
  function resample(strokes, w, h) {
    const runs = [];
    for (const s of strokes) {
      if (s.lift || !runs.length) runs.push([]);
      const run = runs.at(-1);
      for (const p of s.points) if (!run.length || !same(run.at(-1), p)) run.push(p);
    }
    const smoothRun = run => run.map((p, i) => {
      let x = 0, y = 0, n = 0;
      for (let k = -4; k <= 4; k++) { const q = run[Math.min(run.length - 1, Math.max(0, i + k))]; x += q.x; y += q.y; n++; }
      return i === 0 || i === run.length - 1 ? {...p} : {x: x / n, y: y / n};
    });
    const smoothed = runs.map(smoothRun);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const r of smoothed) for (const p of r) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    // Same stage box as the authored lettering: centred on x 958, y 570.
    const k = Math.min(1316 / Math.max(1, maxX - minX), 300 / Math.max(1, maxY - minY), 1.25);
    const map = p => ({x: 958 + (p.x - (minX + maxX) / 2) * k, y: 570 + (p.y - (minY + maxY) / 2) * k});
    const out = [];
    let l = 0;
    const push = (p, lift) => { if (out.length) l += Math.hypot(p.x - out.at(-1).x, p.y - out.at(-1).y) * (lift ? LIFT : 1); out.push({x: p.x, y: p.y, l, lift}); };
    smoothed.forEach((run, r) => {
      const pts = run.map(map);
      if (r && out.length) {
        const a = out.at(-1), b = pts[0], d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(d / 2));
        for (let i = 1; i <= n; i++) push({x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n}, true);
      } else if (!out.length) push(pts[0], false);
      let carry = 0;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], d = Math.hypot(b.x - a.x, b.y - a.y);
        let s = 2 - carry;
        for (; s <= d; s += 2) push({x: a.x + (b.x - a.x) * s / d, y: a.y + (b.y - a.y) * s / d}, false);
        carry = d - (s - 2);
      }
      if (!same(out.at(-1), pts.at(-1))) push(pts.at(-1), false);
    });
    return out;
  }

  function trace(phrase) {
    if (cache.has(phrase)) return cache.get(phrase);
    const {img, w, h} = rasterise(phrase);
    thin(img, w, h);
    const strokes = journey(prune(edges(graph(img, w, h), w), SIZE * .05));
    const points = strokes.length ? resample(strokes, w, h) : [{x: 958, y: 570, l: 0, lift: false}, {x: 960, y: 570, l: 2, lift: false}];
    cache.set(phrase, points);
    return points;
  }
  return {trace};
})();
