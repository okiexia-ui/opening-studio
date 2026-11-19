/* Opening styles and what each lets people customise.
 * The ids are part of the preferences and CLI contract; retired ids are mapped
 * forward in style.js (LEGACY) and native/AppProfiles.swift.
 *
 * Every style takes a palette (with an optional custom accent that replaces
 * `accentRole`), a pace, a font, a layout, a text size and its own elements.
 * Element values are 0–1; toggles store 0 or 1. Colours are hex strings or
 * "r,g,b" triplets where a stage blends alpha itself.
 */
window.WelcomeThemes = [
  {id: 'frost', name: '雾彩 · 连笔', english: 'Frosted Script', duration: 15.8, posterTime: 8.1, ground: '#edf0f6', ink: '#bd83cc',
    description: '一笔写出名字，流线绕向标志，再穿入窗口。', motif: '连笔 / 磨砂 / 柔彩',
    fonts: ['script', 'elegant', 'casual', 'kai', 'serif'], font: 'script', layouts: ['one', 'two'], layout: 'one', accentRole: 'line',
    palettes: [
      {id: 'mist', name: '雾彩', colors: {ground: '#edf0f6', line: ['#ef7a67', '#eb81a6', '#b08fdf', '#7495ea', '#5cb8d9', '#71c4af', '#deb96e'], fields: ['175,188,232', '237,186,192', '255,252,244', '163,205,211']}},
      {id: 'dusk', name: '晚霞', colors: {ground: '#f5eee9', line: ['#f6bd60', '#f7a072', '#f28482', '#e5689a', '#b56fb8', '#f28482', '#f6bd60'], fields: ['247,205,170', '242,170,190', '255,250,242', '220,180,220']}},
      {id: 'sea', name: '海盐', colors: {ground: '#eaf1f4', line: ['#2a9d8f', '#3aa6c9', '#4f7cd6', '#6a6fd1', '#3aa6c9', '#52c4b5', '#8fd3c8'], fields: ['160,205,225', '170,190,235', '250,253,255', '170,220,210']}},
      {id: 'grove', name: '青林', colors: {ground: '#eef2ea', line: ['#6a994e', '#7fb069', '#a7c957', '#5e9e8a', '#3d7c6b', '#a7c957', '#d4b483'], fields: ['190,215,170', '170,210,190', '252,253,246', '215,205,165']}},
      {id: 'graphite', name: '墨灰', colors: {ground: '#f0f0ee', line: ['#22252c', '#3a3f4b', '#555b69', '#3a3f4b', '#22252c', '#555b69', '#3a3f4b'], fields: ['200,200,205', '215,212,210', '255,255,253', '205,210,212']}},
    ],
    elements: [
      {id: 'glow', name: '柔光', kind: 'range', default: .6},
      {id: 'fields', name: '背景色雾', kind: 'range', default: .7},
      {id: 'tip', name: '笔尖光点', kind: 'toggle', default: 1},
      {id: 'echo', name: '穿越余韵', kind: 'toggle', default: 1},
    ]},
  {id: 'ink', name: '水墨 · 山水', english: 'Ink Landscape', duration: 12.4, posterTime: 6.2, ground: '#f3eee3', ink: '#1b1b1d',
    description: '墨滴在宣纸上晕开成山，小舟穿雾而过；毛笔写下名字，钤印，再一笔勾出标志。', motif: '宣纸 / 墨晕 / 钤印',
    fonts: ['script', 'casual', 'kai', 'elegant'], font: 'script', layouts: ['one', 'two'], layout: 'one', accentRole: 'seal',
    palettes: [
      {id: 'classic', name: '墨色', colors: {paper: '#f3eee3', ink: '#1b1b1d', wash: '92,102,112', seal: '#b5251e'}},
      {id: 'jade', name: '青绿', colors: {paper: '#f1efe6', ink: '#1f3b3a', wash: '63,127,120', seal: '#b5251e'}},
      {id: 'night', name: '夜墨', colors: {paper: '#17171a', ink: '#ece6d8', wash: '150,156,168', seal: '#c8372d'}},
      {id: 'ochre', name: '赭石', colors: {paper: '#f4ead8', ink: '#3b2a1e', wash: '156,107,63', seal: '#a22a1f'}},
    ],
    elements: [
      {id: 'mountains', name: '远山层次', kind: 'range', default: .8},
      {id: 'mist', name: '云雾', kind: 'range', default: .6},
      {id: 'boat', name: '小舟', kind: 'toggle', default: 1},
      {id: 'seal', name: '印章', kind: 'toggle', default: 1},
    ]},
  {id: 'aurora', name: '极光 · 冰原', english: 'Aurora Field', duration: 12, posterTime: 6, ground: '#030812', ink: '#38f0a8',
    description: '冰原夜空亮起极光，光幕摇曳间浮现名字，再收束成一缕光描出标志。', motif: '极光 / 冰原 / 星空',
    fonts: ['serif', 'sans', 'elegant', 'kai'], font: 'serif', layouts: ['two', 'one'], layout: 'two', accentRole: 'glow',
    palettes: [
      {id: 'boreal', name: '极光绿', colors: {sky: ['#01040c', '#061524', '#0b2a35'], glow: '#38f0a8', high: '#8a5cff', ice: '#cfe6f2', text: '#eafff6'}},
      {id: 'crimson', name: '绯红', colors: {sky: ['#05020a', '#170818', '#2a0d24'], glow: '#ff4f8b', high: '#ffa94f', ice: '#f0d8e4', text: '#fff0f5'}},
      {id: 'glacier', name: '冰蓝', colors: {sky: ['#01030c', '#06112a', '#0a2244'], glow: '#4fd6ff', high: '#7f7bff', ice: '#d6ecff', text: '#eef8ff'}},
      {id: 'dawn', name: '金曦', colors: {sky: ['#070510', '#1c1230', '#3a1f3a'], glow: '#ffd36b', high: '#ff6f91', ice: '#f6e6d6', text: '#fff7e8'}},
    ],
    elements: [
      {id: 'curtains', name: '极光强度', kind: 'range', default: .75},
      {id: 'stars', name: '星空', kind: 'range', default: .6},
      {id: 'ice', name: '冰原', kind: 'toggle', default: 1},
      {id: 'meteor', name: '流星', kind: 'toggle', default: 1},
    ]},
  {id: 'terminal', name: '磷光 · 终端', english: 'Phosphor Terminal', duration: 11.4, posterTime: 5.5, ground: '#120b02', ink: '#ffb000',
    description: '旧显像管亮起，开机自检逐行滚过，光标敲出名字，再像示波器一样描出标志。', motif: '显像管 / 光标 / 示波器',
    fonts: ['mono', 'sans'], font: 'mono', layouts: ['two', 'one'], layout: 'two', accentRole: 'phosphor',
    palettes: [
      {id: 'amber', name: '琥珀', colors: {phosphor: '#ffb000', screen: '#120b02'}},
      {id: 'green', name: '磷绿', colors: {phosphor: '#39ff7a', screen: '#03100a'}},
      {id: 'white', name: '冰白', colors: {phosphor: '#d6ecff', screen: '#05080d'}},
      {id: 'magenta', name: '品红', colors: {phosphor: '#ff5ad8', screen: '#10040e'}},
    ],
    elements: [
      {id: 'scanlines', name: '扫描线', kind: 'range', default: .6},
      {id: 'curve', name: '屏幕弧度', kind: 'range', default: .6},
      {id: 'boot', name: '开机自检', kind: 'toggle', default: 1},
      {id: 'flicker', name: '闪烁', kind: 'toggle', default: 1},
    ]},
  {id: 'civic', name: '长城 · 通行', english: 'Great Wall Pass', duration: 12.6, posterTime: 5.6, ground: '#f6efe2', ink: '#a50f19',
    description: '宣纸朝阳间长城展开，朱红标题揭幕；身份认证走到 100%，印章落下：准予通行。', motif: '宣纸 / 长城 / 朱印',
    fonts: ['song', 'kai', 'sans'], font: 'song', layouts: ['one'], layout: 'one', accentRole: 'red',
    palettes: [
      {id: 'red', name: '中国红', colors: {red: '#a50f19', gold: '176,138,74', land: '107,47,37', sun: '201,58,36', silk: '179,18,26'}},
      {id: 'jade', name: '青绿', colors: {red: '#1f6f68', gold: '176,138,74', land: '47,79,74', sun: '60,140,120', silk: '31,111,104'}},
      {id: 'navy', name: '黛蓝', colors: {red: '#1d3f7a', gold: '168,136,72', land: '42,53,80', sun: '80,110,170', silk: '29,63,122'}},
      {id: 'amber', name: '金秋', colors: {red: '#9a4a12', gold: '192,154,76', land: '106,68,38', sun: '214,120,50', silk: '154,74,18'}},
    ],
    elements: [
      {id: 'wall', name: '长城', kind: 'toggle', default: 1},
      {id: 'clouds', name: '祥云与雁', kind: 'toggle', default: 1},
      {id: 'auth', name: '身份认证', kind: 'toggle', default: 1},
      {id: 'seal', name: '印章', kind: 'toggle', default: 1},
      {id: 'silk', name: '红绸', kind: 'toggle', default: 1},
    ]},
  {id: 'spell', name: '星烛 · 咒语', english: 'Candlelit Spell', duration: 13.6, posterTime: 6.9, ground: '#0d0b18', ink: '#f3d48b',
    description: '星穹下浮烛次第点亮，一缕咒光凌空写下名字，火花散落，再飞去描出标志。', motif: '星穹 / 浮烛 / 咒光',
    fonts: ['script', 'elegant', 'casual', 'kai'], font: 'script', layouts: ['one', 'two'], layout: 'one', accentRole: 'light',
    palettes: [
      {id: 'gold', name: '金烛', colors: {light: '#f6d48a', flame: '255,176,88', sky: ['#1d1738', '#110e22', '#07060d'], glass: '86,104,190'}},
      {id: 'silver', name: '银月', colors: {light: '#dfe8ff', flame: '190,214,255', sky: ['#121a33', '#0b1124', '#05070d'], glass: '120,150,230'}},
      {id: 'emerald', name: '翡翠', colors: {light: '#9ff0c3', flame: '140,240,180', sky: ['#0e2420', '#081613', '#030807'], glass: '70,160,130'}},
      {id: 'ember', name: '绯焰', colors: {light: '#ffb0a0', flame: '255,120,90', sky: ['#2a0f1c', '#170812', '#070306'], glass: '190,80,110'}},
    ],
    elements: [
      {id: 'candles', name: '浮烛数量', kind: 'range', default: .75},
      {id: 'stars', name: '星穹', kind: 'range', default: .6},
      {id: 'sparks', name: '火花', kind: 'range', default: .6},
      {id: 'windows', name: '拱窗月光', kind: 'toggle', default: 1},
    ]},
  {id: 'voyage', name: '星际 · 远航', english: 'Planetary Voyage', duration: 12.8, posterTime: 5.4, ground: '#02050b', ink: '#a8e6ff',
    description: '晨光越过行星边缘，倒计时归零，推进器沿地平线点火，航迹锁定标志。', motif: '晨昏线 / 倒计时 / 航迹',
    fonts: ['sans', 'mono', 'serif'], font: 'sans', layouts: ['two', 'one'], layout: 'two', accentRole: 'hud',
    palettes: [
      {id: 'ice', name: '冰蓝', colors: {hud: '#8edcff', mark: '#e9f9ff', plume: '234,248,255', glow: '89,184,255', planet: ['#1d5f92', '#0c3358', '#051727', '#010409'], rim: '150,215,255', lights: '#ffcf8a'}},
      {id: 'ember', name: '赤焰', colors: {hud: '#ffb38a', mark: '#fff1e6', plume: '255,236,214', glow: '255,130,60', planet: ['#9a4524', '#4f2111', '#1d0b06', '#060201'], rim: '255,190,150', lights: '#ffe0a0'}},
      {id: 'violet', name: '极紫', colors: {hud: '#c9a8ff', mark: '#f4ecff', plume: '244,236,255', glow: '170,120,255', planet: ['#43338a', '#1f1850', '#0b0920', '#03020a'], rim: '200,170,255', lights: '#ffd0f0'}},
    ],
    elements: [
      {id: 'thrusters', name: '推进器', kind: 'toggle', default: 1},
      {id: 'countdown', name: '倒计时', kind: 'toggle', default: 1},
      {id: 'hud', name: '航行仪表', kind: 'toggle', default: 1},
      {id: 'streaks', name: '星流', kind: 'range', default: .6},
    ]},
  {id: 'neon', name: '霓虹 · 雨夜', english: 'Neon Rain', duration: 11.6, posterTime: 4.4, ground: '#07060c', ink: '#ff5fa8',
    description: '雨夜里霓虹灯管闪烁亮起，一个字母接触不良；电流沿灯管流进标志，倒影在积水里摇晃。', motif: '霓虹 / 雨丝 / 倒影',
    fonts: ['script', 'casual', 'elegant', 'kai'], font: 'script', layouts: ['one', 'two'], layout: 'one', accentRole: 'tube',
    palettes: [
      {id: 'pink', name: '粉紫', colors: {tube: '#ff3d9e', core: '#ffd3ea', mark: '#3fe0ff', markCore: '#d8fbff', glow: '255,45,150'}},
      {id: 'cyan', name: '青蓝', colors: {tube: '#2fd6ff', core: '#d8fbff', mark: '#ff4fb0', markCore: '#ffe0f0', glow: '47,214,255'}},
      {id: 'amber', name: '琥珀', colors: {tube: '#ff8a1f', core: '#ffe2bd', mark: '#ffd34f', markCore: '#fff6d6', glow: '255,138,31'}},
      {id: 'lime', name: '草绿', colors: {tube: '#7dff4f', core: '#e6ffd6', mark: '#4fd8ff', markCore: '#e0f9ff', glow: '125,255,79'}},
    ],
    elements: [
      {id: 'rain', name: '雨势', kind: 'range', default: .6},
      {id: 'bokeh', name: '远处光斑', kind: 'range', default: .6},
      {id: 'reflection', name: '积水倒影', kind: 'toggle', default: 1},
      {id: 'fault', name: '接触不良', kind: 'toggle', default: 1},
    ]},
];
