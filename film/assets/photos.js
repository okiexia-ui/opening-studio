/* The gallery, native panel and video exporter share the same local photographs.
 * Export pages embed their own shots so the encoder also works offline. */
window.WelcomePhotos = (() => {
  const shots = {
    voyage: ['voyage-iss-airglow', 'voyage-apollo-earth'],
    civic: ['civic-jinshanling'], spell: ['spell-votives'],
    aurora: ['aurora-denali'], neon: ['neon-tokyo-rain'],
  };
  const decoded = new Map(), pending = new Map();
  function loadShot(id) {
    if (!pending.has(id)) {
      const embedded = document.getElementById('photo-' + id);
      const image = embedded || new Image();
      if (!embedded) image.src = 'assets/photos/' + id + '.jpg';
      pending.set(id, image.decode().then(() => {
        decoded.set(id, image);
      }).catch(() => {
        // A damaged optional image must still let the native handoff finish.
        pending.delete(id);
      }));
    }
    return pending.get(id);
  }
  function load(theme) { return Promise.all((shots[theme] || []).map(loadShot)); }
  // Cover a rectangle without stretching. Focus selects the crop within the excess.
  function cover(ctx, id, box, {zoom = 1, focusX = .5, focusY = .5, alpha = 1} = {}) {
    const image = decoded.get(id);
    if (!image || alpha <= 0) return;
    const w = box.right - box.left, h = box.bottom - box.top;
    const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight) * zoom;
    const sw = w / scale, sh = h / scale;
    ctx.save(); ctx.globalAlpha *= alpha;
    ctx.drawImage(image, (image.naturalWidth - sw) * focusX, (image.naturalHeight - sh) * focusY, sw, sh, box.left, box.top, w, h);
    ctx.restore();
  }
  return {shots, load, cover, get: id => decoded.get(id)};
})();
