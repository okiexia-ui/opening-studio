/* Settings gallery: pick an app, a style and the greeting, with a live preview.
 * Inside the native settings window a `settings` message bridge saves choices;
 * opened as a plain page it is a preview only. */
(async () => {
  await Promise.all([WelcomePhotos.loadAll(), document.fonts.load('400 154px "Cormorant Garamond"'), document.fonts.load('300 122px Manrope')]);
  const $ = id => document.getElementById(id), bridge = window.webkit?.messageHandlers?.settings;
  const params = new URLSearchParams(location.search), FIELDS = ['greeting', 'name', 'title', 'seal'];
  const examples = [
    {bundleID: 'com.openai.codex', name: 'ChatGPT', theme: 'frost', mark: 'openai', enabled: true},
    {bundleID: 'com.anthropic.claudefordesktop', name: 'Claude', theme: 'ink', mark: 'claude', enabled: true},
    {bundleID: 'generic', name: '其他应用', theme: 'aurora', mark: 'portal', enabled: false},
  ];
  let renderer, selected, profile, profiles = [], playing = false, start = 0, frame = null, t = 0;
  let savedCopy = WelcomeFilm.normalizeCopy(Object.fromEntries(FIELDS.map(k => [k, params.get(k)])));
  let copy = savedCopy, copyTimer = null, editRevision = 0, submittedRevision = -1;
  const thumbs = [];
  const sameCopy = (a, b) => FIELDS.every(k => a[k] === b[k]);
  // Saved options per style (only what differs from defaults), and unsaved drafts.
  let styles = {}, styleTimer = null;
  const drafts = {}, same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const styleFor = id => drafts[id] ? WelcomeStyle.delta(drafts[id]) : styles[id] || {};

  function stop() { playing = false; cancelAnimationFrame(frame); $('play').textContent = '▶'; $('play').setAttribute('aria-label', '播放动画'); }
  function update() { t = Math.min(t, renderer.duration); renderer.at(t); $('seek').value = t; $('time').textContent = `${t.toFixed(1).padStart(4, '0')} / ${renderer.duration.toFixed(1)}`; }
  function makeRenderer() {
    renderer?.dispose();
    renderer = WelcomeFilm.create($('stage'), {theme: selected.id, mark: profile?.mark, icon: profile?.icon, copy, style: styleFor(selected.id)});
    $('seek').max = renderer.duration;
  }
  function paintThumb(x) {
    x.painter?.dispose();
    x.painter = WelcomeFilm.create(x.canvas, {theme: x.theme.id, mark: profile.mark, icon: profile.icon, copy, style: styleFor(x.theme.id)});
    x.painter.at(x.theme.posterTime * x.painter.duration / x.theme.duration);
  }
  function paintThumbs() { thumbs.forEach(paintThumb); }
  function choose(id) {
    stop();
    selected = WelcomeStyle.theme(id);
    makeRenderer(); t = selected.posterTime * renderer.duration / selected.duration; showStyle();
    $('number').textContent = String(WelcomeThemes.indexOf(selected) + 1).padStart(2, '0');
    for (const k of ['name', 'english', 'description', 'motif']) $(k).textContent = selected[k];
    document.querySelectorAll('.choice').forEach(b => b.setAttribute('aria-pressed', b.dataset.theme === selected.id ? 'true' : 'false'));
    $('apply').textContent = '保存此应用设置';
    if (bridge) $('status').textContent = '保存后，下次完整退出并打开此应用时生效。';
    update();
  }
  function chooseApp(id, draft = {}, copyChanged = false) {
    const previous = profile;
    profile = profiles.find(x => x.bundleID === id) || profiles[0];
    const theme = draft.theme ?? profile.theme;
    $('target-app').value = profile.bundleID; $('profile-enabled').checked = draft.enabled ?? profile.enabled;
    $('app-note').textContent = bridge ? (profile.installed === false ? '未检测到此应用；安装后即可生效。' : '样式和开关独立保存，切回时不重播。') : '浏览器内可预览，安装后可添加本机应用。';
    if (previous?.bundleID !== profile.bundleID || selected?.id !== theme ||
        previous?.icon !== profile.icon || previous?.mark !== profile.mark || copyChanged) {
      choose(theme); paintThumbs();
    }
  }
  function play(restart = false) {
    if (playing) { stop(); return; }
    if (restart || t >= renderer.duration) t = 0;
    playing = true; start = performance.now() - t * 1000;
    $('play').textContent = 'Ⅱ'; $('play').setAttribute('aria-label', '暂停动画');
    const tick = now => { t = Math.min(renderer.duration, (now - start) / 1000); update(); if (t < renderer.duration) frame = requestAnimationFrame(tick); else stop(); };
    frame = requestAnimationFrame(tick);
  }

  /* ---- greeting editor: live preview, saved for every app at once ---- */
  function showCopy(values) { for (const k of FIELDS) $(`copy-${k}`).value = values[k]; }
  function copyState() {
    const dirty = !sameCopy(copy, savedCopy);
    $('copy-save').disabled = !dirty;
    $('copy-note').textContent = !bridge ? '浏览器内只预览；在菜单栏的“应用与开屏…”中保存。'
      : dirty ? '问候已修改，尚未保存。' : '问候对所有应用和样式生效；连笔类样式会按名字重新生成笔迹。';
  }
  function readCopy() {
    copy = WelcomeFilm.normalizeCopy(Object.fromEntries(FIELDS.map(k => [k, $(`copy-${k}`).value])));
    editRevision++; copyState();
  }
  function paintCopy() {
    makeRenderer(); paintThumbs(); update();
  }
  for (const k of FIELDS) {
    const input = $(`copy-${k}`);
    input.placeholder = WelcomeFilm.copyDefaults[k];
    const changed = event => {
      if (event.isComposing) return;
      // HTML maxlength counts UTF-16 code units. The renderer and Swift count Unicode scalars.
      const scalars = Array.from(input.value);
      if (scalars.length > WelcomeFilm.copyLimits[k]) input.value = scalars.slice(0, WelcomeFilm.copyLimits[k]).join('');
      readCopy();
      clearTimeout(copyTimer); copyTimer = setTimeout(paintCopy, 220);
    };
    input.addEventListener('input', changed);
    input.addEventListener('compositionend', changed);
  }
  $('copy-reset').addEventListener('click', () => { clearTimeout(copyTimer); showCopy(WelcomeFilm.copyDefaults); readCopy(); paintCopy(); });
  $('copy-save').hidden = !bridge;
  $('copy-save').addEventListener('click', () => {
    submittedRevision = editRevision;
    $('copy-note').textContent = '正在保存…';
    bridge.postMessage({event: 'copy', ...copy});
  });
  window.didSaveCopy = values => {
    savedCopy = WelcomeFilm.normalizeCopy(values);
    copyState();
    if (submittedRevision === editRevision && sameCopy(copy, savedCopy)) {
      showCopy(savedCopy); $('copy-note').textContent = '所有应用的开屏问候已保存。';
    }
  };

  /* ---- style editor: palettes, accent, pace, font, layout, size, elements ---- */
  const draftOf = id => drafts[id] || WelcomeStyle.normalize(id, styles[id]);
  const swatchColors = palette => Object.values(palette.colors).flatMap(v => Array.isArray(v) ? [v[0], v[Math.floor(v.length / 2)]] : [v])
    .map(v => v.startsWith('#') ? v : `rgb(${v})`).filter((v, i, a) => a.indexOf(v) === i).slice(0, 4);
  function segmented(container, options, value, onPick) {
    container.replaceChildren(...options.map(([id, name]) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = name; b.dataset.value = id;
      b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(id === value)); b.addEventListener('click', () => onPick(id)); return b;
    }));
  }
  function styleState() {
    const id = selected.id, dirty = !!drafts[id] && !same(WelcomeStyle.delta(drafts[id]), styles[id] || {});
    $('style-save').disabled = !dirty;
    $('style-note').textContent = !bridge ? '浏览器内只预览；在“应用与开屏…”中保存。' : dirty ? '此样式有未保存的修改。' : '保存后，所有使用此样式的应用都会生效。';
  }
  function editStyle(change) {
    const id = selected.id, next = structuredClone(draftOf(id));
    change(next);
    drafts[id] = WelcomeStyle.normalize(id, next);
    showStyle();
    clearTimeout(styleTimer);
    styleTimer = setTimeout(() => { const keep = t / renderer.duration; makeRenderer(); t = keep * renderer.duration; update(); paintThumb(thumbs.find(x => x.theme.id === id)); }, 120);
  }
  function showStyle() {
    const theme = selected, d = draftOf(theme.id);
    $('style-title').textContent = `定制 · ${theme.name}`;
    $('palettes').replaceChildren(...theme.palettes.map(p => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'swatch'; b.dataset.value = p.id;
      b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(p.id === d.palette));
      const colors = swatchColors(p); b.innerHTML = '<i></i><span></span>';
      b.querySelector('i').style.background = `linear-gradient(90deg,${colors.join(',')})`; b.querySelector('span').textContent = p.name;
      b.addEventListener('click', () => editStyle(n => { n.palette = p.id; n.accent = null; }));
      return b;
    }));
    const role = WelcomeStyle.resolve(theme.id, {palette: d.palette}).colors[theme.accentRole];
    $('accent').value = d.accent || (Array.isArray(role) ? role[3] : role.startsWith('#') ? role : '#' + role.split(',').map(v => (+v).toString(16).padStart(2, '0')).join(''));
    $('accent-clear').hidden = !d.accent;
    segmented($('pace'), Object.entries(WelcomeStyle.PACES).map(([id, v]) => [id, v.name]), d.pace, id => editStyle(n => { n.pace = id; }));
    $('font').replaceChildren(...theme.fonts.map(id => { const o = document.createElement('option'); o.value = id; o.textContent = WelcomeStyle.FONTS[id].name; return o; }));
    $('font').value = d.font;
    segmented($('layout'), theme.layouts.map(id => [id, WelcomeStyle.LAYOUTS[id].name]), d.layout, id => editStyle(n => { n.layout = id; }));
    $('layout').closest('.style-group').querySelector('.group-label').hidden = $('layout').hidden = theme.layouts.length < 2;
    $('size').value = d.size; $('size-value').textContent = `${Math.round(d.size * 100)}%`;
    $('elements').replaceChildren(...theme.elements.map(e => {
      const label = document.createElement('label'), input = document.createElement('input'), name = document.createElement('span');
      label.className = `element ${e.kind}`; name.textContent = e.name; input.dataset.element = e.id;
      if (e.kind === 'toggle') { input.type = 'checkbox'; input.checked = !!d.elements[e.id]; input.addEventListener('change', () => editStyle(n => { n.elements[e.id] = input.checked ? 1 : 0; })); label.append(input, name); }
      else { input.type = 'range'; input.min = 0; input.max = 1; input.step = .05; input.value = d.elements[e.id]; input.addEventListener('input', () => editStyle(n => { n.elements[e.id] = +input.value; })); label.append(name, input); }
      return label;
    }));
    styleState();
  }
  $('accent').addEventListener('input', () => editStyle(n => { n.accent = $('accent').value; }));
  $('accent-clear').addEventListener('click', () => editStyle(n => { n.accent = null; }));
  $('font').addEventListener('change', () => editStyle(n => { n.font = $('font').value; }));
  $('size').addEventListener('input', () => editStyle(n => { n.size = +$('size').value; }));
  $('style-reset').addEventListener('click', () => editStyle(n => Object.assign(n, WelcomeStyle.normalize(selected.id, {}))));
  $('style-save').hidden = !bridge;
  $('style-save').addEventListener('click', () => {
    $('style-note').textContent = '正在保存…';
    bridge.postMessage({event: 'style', theme: selected.id, options: WelcomeStyle.delta(draftOf(selected.id))});
  });
  window.didSaveStyle = ({theme, options}) => {
    styles[theme] = options || {};
    if (drafts[theme] && same(WelcomeStyle.delta(drafts[theme]), styles[theme])) delete drafts[theme];
    if (selected.id === theme) { styleState(); $('style-note').textContent = '此样式已保存。'; }
  };

  /* ---- styles and apps ---- */
  for (const [index, theme] of WelcomeThemes.entries()) {
    const button = document.createElement('button');
    button.className = 'choice'; button.dataset.theme = theme.id; button.setAttribute('aria-pressed', 'false');
    button.innerHTML = `<canvas aria-label="${theme.name}缩略图"></canvas><span class="choice-title"><span>${theme.name}</span><span class="choice-dot"></span></span><span class="choice-meta">${String(index + 1).padStart(2, '0')} / ${theme.duration.toFixed(1)} SEC</span>`;
    $('choices').append(button);
    thumbs.push({canvas: button.querySelector('canvas'), theme, painter: null});
    button.addEventListener('click', () => choose(theme.id));
  }
  $('play').addEventListener('click', () => play());
  $('replay').addEventListener('click', () => { stop(); play(true); });
  $('seek').addEventListener('input', () => { stop(); t = Number($('seek').value); update(); });
  $('target-app').addEventListener('change', () => { chooseApp($('target-app').value); bridge?.postMessage({event: 'select_profile', bundleID: profile.bundleID}); });
  $('profile-enabled').disabled = !bridge;
  $('profile-enabled').addEventListener('change', () => { $('apply').textContent = '保存此应用设置'; $('status').textContent = '设置尚未保存。'; });
  if (bridge) {
    $('apply').hidden = false; $('add-app').hidden = false;
    $('status').textContent = '保存后，下次完整退出并打开此应用时生效。';
    $('apply').addEventListener('click', () => bridge.postMessage({event: 'apply', bundleID: profile.bundleID, theme: selected.id, enabled: $('profile-enabled').checked}));
    $('add-app').addEventListener('click', () => bridge.postMessage({event: 'add_app'}));
  }
  window.didApplyTheme = result => {
    const p = profiles.find(x => x.bundleID === result.bundleID);
    if (p) { p.theme = result.theme; p.enabled = result.enabled; }
    if (profile.bundleID !== result.bundleID || selected.id !== result.theme || $('profile-enabled').checked !== result.enabled) return;
    $('apply').textContent = '已保存';
    $('status').textContent = result.enabled ? '下次冷启动生效，切回时不重播。' : '已关闭此应用的开屏。';
  };
  window.openingError = (text, field) => { $(field === 'copy' ? 'copy-note' : 'status').textContent = text; };
  window.updateOpeningProfiles = data => {
    // Native resyncs often; never overwrite a greeting that is being edited.
    let copyChanged = false;
    if (data.copy) {
      const incoming = WelcomeFilm.normalizeCopy(data.copy);
      const editing = FIELDS.some(k => $(`copy-${k}`).value !== savedCopy[k]);
      savedCopy = incoming;
      if (!editing && !sameCopy(copy, incoming)) { copy = incoming; showCopy(copy); copyChanged = true; }
    }
    const draft = {};
    if (profile && data.selectedID === profile.bundleID) {
      if (selected.id !== profile.theme) draft.theme = selected.id;
      if ($('profile-enabled').checked !== profile.enabled) draft.enabled = $('profile-enabled').checked;
    }
    if (data.styles) {
      styles = Object.fromEntries(Object.entries(data.styles).map(([id, o]) => [WelcomeStyle.theme(id).id, o]));
      for (const id of Object.keys(drafts)) if (same(WelcomeStyle.delta(drafts[id]), styles[id] || {})) delete drafts[id];
    }
    profiles = data.profiles?.length ? data.profiles : examples;
    $('target-app').replaceChildren(...profiles.map(p => { const option = document.createElement('option'); option.value = p.bundleID; option.textContent = p.name; return option; }));
    chooseApp(data.selectedID || profiles[0].bundleID, draft, copyChanged);
    copyState();
  };
  window.selectWelcomeTheme = choose;
  showCopy(copy);
  window.updateOpeningProfiles(window.OPENING_PROFILES || {profiles: examples, selectedID: params.get('app') || 'com.openai.codex'});
  if (params.get('theme')) choose(params.get('theme'));
  window.addEventListener('resize', () => { update(); thumbs.forEach(x => x.painter.at(x.theme.posterTime * x.painter.duration / x.theme.duration)); });
  window.galleryReady = true;
  bridge?.postMessage({event: 'ready'});
})();
