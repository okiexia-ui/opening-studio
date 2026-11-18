// Fast, browser-free guard against values that are duplicated across the
// web renderer, the native companion and the build scripts drifting apart.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.resolve(__dirname, '..'), read = file => fs.readFileSync(path.join(root, file), 'utf8');

// Theme IDs, names and durations: themes.js is the reference.
const sandbox = {window: {}};
vm.runInNewContext(read('film/assets/themes.js'), sandbox);
const themes = Array.from(sandbox.window.WelcomeThemes ?? []); // copy out of the vm realm so deepStrictEqual compares plain arrays
assert(Array.isArray(themes) && themes.length, 'themes.js defines WelcomeThemes');
const web = Object.fromEntries(themes.map(t => [t.id, t.duration]));

const swift = read('native/AppProfiles.swift');
const swiftTable = name => {
  const body = swift.match(new RegExp(`let ${name}\\s*=\\s*\\[([^\\]]*)\\]`))?.[1];
  assert(body, `AppProfiles.swift declares ${name}`);
  return Object.fromEntries([...body.matchAll(/"(\w+)"\s*:\s*("([^"]*)"|[\d.]+)/g)].map(m => [m[1], m[3] ?? Number(m[2])]));
};
assert.deepStrictEqual(swiftTable('openingThemes'), web, 'native durations match themes.js');
assert.deepStrictEqual(swiftTable('openingThemeNames'), Object.fromEntries(themes.map(t => [t.id, t.name])), 'native menu names match themes.js');
const order = swift.match(/let openingThemeOrder\s*=\s*\[([^\]]*)\]/)?.[1];
assert(order, 'AppProfiles.swift declares openingThemeOrder');
assert.deepStrictEqual([...order.matchAll(/"(\w+)"/g)].map(m => m[1]), themes.map(t => t.id), 'native menu order matches themes.js');
for (const t of themes) {
  assert(t.posterTime > 0 && t.posterTime < t.duration, `${t.id} poster frame lies inside the opening`);
  if (!['frost', 'cinnabar', 'midnight', 'aurum'].includes(t.id)) assert(read('film/assets/stages.js').includes(`function ${t.id}(env)`), `${t.id} has a stage in stages.js`);
}

const variants = [...read('scripts/make-variants.py').matchAll(/\('(\w+)','(\w+)',([\d.]+),'(\w+)'\)/g)];
assert(variants.length, 'make-variants.py lists variants');
for (const [, variant, theme, duration] of variants) assert.strictEqual(Number(duration), web[theme], `variant ${variant} uses the ${theme} duration`);

// The editable greeting: defaults and limits agree between the renderer and native storage.
const renderer = read('film/assets/renderer.js');
const jsTable = name => Object.fromEntries([...renderer.match(new RegExp(`${name}=\\{([^}]*)\\}`))[1].matchAll(/(\w+):('([^']*)'|\d+)/g)].map(m => [m[1], m[3] ?? Number(m[2])]));
const standard = swift.match(/static let standard = Greeting\(([^)]*)\)/)[1];
assert.deepStrictEqual(Object.fromEntries([...standard.matchAll(/(\w+):"([^"]*)"/g)].map(m => [m[1], m[2]])), jsTable('COPY_DEFAULTS'), 'greeting defaults match');
assert.deepStrictEqual(swiftTable('limits'), jsTable('COPY_LIMITS'), 'greeting limits match');

// Every asset a bundled page loads must be copied into the app by the build.
const build = read('scripts/build-native.sh');
const bundled = new Set(build.match(/for TASK_ASSET in ([^;]+);/)[1].trim().split(/\s+/));
for (const page of ['film/native.html', 'film/gallery.html']) {
  for (const [, asset] of read(page).matchAll(/(?:src|href)="assets\/([^"]+)"/g)) {
    assert(bundled.has(asset), `${page} loads assets/${asset}, which build-native.sh does not bundle`);
  }
}

// One version number for the package, the app bundle and the documented archive.
const version = JSON.parse(read('package.json')).version;
assert(build.includes(`'CFBundleShortVersionString':'${version}'`), `build-native.sh bundles version ${version}`);
assert(read('README.md').includes(`OpeningStudio-v${version}-macos-universal.zip`), `README names the v${version} archive`);

console.log(`Consistency OK: ${themes.length} themes, ${variants.length} variants, bundled assets, version ${version}`);
