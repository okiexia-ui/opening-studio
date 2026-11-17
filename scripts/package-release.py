"""Build allowlisted, portable GitHub assets without publishing anything."""
import hashlib
import json
import pathlib
import shutil
import subprocess
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
VERSION = json.loads((ROOT / 'package.json').read_text())['version']
OUT = ROOT / 'release'
STAGE = OUT / 'staging'
PREFIX = f'OpeningStudio-v{VERSION}'
OUT.mkdir(exist_ok=True)
STAGE.mkdir(exist_ok=True)
manifest = {'version': VERSION, 'artifacts': [], 'published': False}

def files(patterns):
    return sorted({p for pattern in patterns for p in ROOT.glob(pattern) if p.is_file()})

def stage(name, source_files):
    dest = STAGE / name
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir()
    for source in source_files:
        target = dest / source.relative_to(ROOT)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    return dest

def archive(directory, suffix):
    dest = OUT / f'{PREFIX}-{suffix}.zip'
    paths = sorted(p for p in directory.rglob('*') if p.is_file())
    with zipfile.ZipFile(dest, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for path in paths:
            z.write(path, path.relative_to(directory.parent))
    with zipfile.ZipFile(dest) as z:
        assert z.testzip() is None, 'Archive CRC validation failed'
        assert all(not any(part in {'.git', 'node_modules', '.build', '__pycache__'} for part in pathlib.PurePosixPath(n).parts) for n in z.namelist())
    record = {'file': dest.name, 'bytes': dest.stat().st_size,
              'sha256': hashlib.sha256(dest.read_bytes()).hexdigest(),
              'contents': [str(p.relative_to(directory)) for p in paths]}
    manifest['artifacts'].append(record)
    print(f'{dest.name}: {record["bytes"]:,} bytes / {len(paths)} files')

common = files(['README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'CHANGELOG.md',
                'docs/**/*.md', 'docs/media/*.png', '安装 Opening Studio.command',
                'delivery/*.command'])
sources = files(['.gitignore', '.github/workflows/*.yml', 'package.json', 'package-lock.json',
                 'native/*.swift', 'scripts/*.py', 'scripts/*.cjs', 'scripts/*.sh',
                 'film/index.html', 'film/native.html', 'film/gallery.html',
                 'film/package.json', 'film/SPEC.md', 'film/STORYBOARD.md', 'film/REVIEW.md',
                 'film/compositions/welcome.html', 'film/assets/*.js', 'film/assets/*.css',
                 'film/assets/*.svg', 'film/assets/SOURCES.md', 'film/assets/fonts/*'])
# GSAP is installed from the pinned dependency on npm ci, never vendored here.
sources = [p for p in sources if p.name != 'gsap.min.js']
source_stage = stage(PREFIX + '-source', sorted(set(common + sources)))
# This catches accidentally embedded local usernames/absolute checkout paths.
for path in source_stage.rglob('*'):
    if path.is_file() and path.suffix in {'.md', '.js', '.cjs', '.swift', '.py', '.sh', '.html', '.json', '.yml', '.command'}:
        if ('/' + 'Users' + '/') in path.read_text(errors='ignore'):
            raise RuntimeError(f'Local absolute path in public source: {path.relative_to(source_stage)}')
archive(source_stage, 'source')

app = ROOT / 'delivery/Welcome Tommy.app'
if not (app / 'Contents/MacOS/WelcomeTommy').is_file():
    raise SystemExit('Build the native app before packaging: zsh scripts/build-native.sh --universal')
architectures = subprocess.check_output(['lipo', '-archs', str(app / 'Contents/MacOS/WelcomeTommy')], text=True).split()
if not {'arm64', 'x86_64'}.issubset(architectures):
    raise SystemExit('Universal release requires: zsh scripts/build-native.sh --universal')
subprocess.run(['codesign', '--verify', '--deep', '--strict', str(app)], check=True)
binary_stage = stage(PREFIX, common + files(['scripts/install.py']))
shutil.copytree(app, binary_stage / 'delivery/Welcome Tommy.app')
archive(binary_stage, 'macos-universal')

videos = files(['delivery/*.mp4'])
if videos:
    demo_stage = stage(PREFIX + '-demos', videos + files(['LICENSE', 'THIRD_PARTY_NOTICES.md', 'docs/RELEASE_NOTES.md']))
    # Rendered font outlines retain their attribution with the demos.
    for font_license in files(['film/assets/fonts/*-OFL.txt']):
        shutil.copy2(font_license, demo_stage / font_license.name)
    archive(demo_stage, 'demos')

(OUT / 'SHA256SUMS.txt').write_text(''.join(f'{a["sha256"]}  {a["file"]}\n' for a in manifest['artifacts']))
(OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
print('Ready locally; no repository or release was published.')
