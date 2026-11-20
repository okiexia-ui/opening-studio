#!/bin/zsh
set -euo pipefail
cd "${0:A:h:h}"
TASK_APP="$PWD/delivery/Welcome Tommy.app"
# Start from an empty bundle so files dropped from the sources never linger in a build.
rm -rf "$TASK_APP"
mkdir -p "$TASK_APP/Contents/MacOS" "$TASK_APP/Contents/Resources/film/assets/fonts" .build/module-cache
cat native/AppProfiles.swift native/WelcomeTommy.swift > .build/main.swift
TASK_ARCHS=("$(uname -m)")
if [[ "${1:-}" == '--universal' ]]; then TASK_ARCHS=(arm64 x86_64); fi
TASK_BINARIES=()
for TASK_ARCH in "${TASK_ARCHS[@]}"; do
  TASK_BINARY="$PWD/.build/WelcomeTommy-$TASK_ARCH"
  xcrun swiftc -O -swift-version 5 -target "$TASK_ARCH-apple-macosx13.0" -module-cache-path "$PWD/.build/module-cache" -framework AppKit -framework WebKit -framework QuartzCore .build/main.swift -o "$TASK_BINARY"
  TASK_BINARIES+=("$TASK_BINARY")
done
if (( ${#TASK_BINARIES[@]} > 1 )); then
  lipo -create "${TASK_BINARIES[@]}" -output "$TASK_APP/Contents/MacOS/WelcomeTommy"
else
  cp "${TASK_BINARIES[1]}" "$TASK_APP/Contents/MacOS/WelcomeTommy"
fi
cp film/native.html film/gallery.html "$TASK_APP/Contents/Resources/film/"
for TASK_ASSET in lettering.js handwriting.js logo.js marks.js renderer.js stages.js premium.js themes.js style.js native-player.js gallery.js gallery.css fonts.css; do
  cp "film/assets/$TASK_ASSET" "$TASK_APP/Contents/Resources/film/assets/"
done
cp film/assets/fonts/* "$TASK_APP/Contents/Resources/film/assets/fonts/"
cp LICENSE THIRD_PARTY_NOTICES.md "$TASK_APP/Contents/Resources/"
xcrun swiftc -O -module-cache-path "$PWD/.build/module-cache" -framework AppKit native/MakeIcon.swift -o .build/MakeIcon
mkdir -p .build/OpeningStudio.iconset
.build/MakeIcon .build/icon-1024.png
for TASK_SIZE in 16 32 128 256 512; do
  sips -z "$TASK_SIZE" "$TASK_SIZE" .build/icon-1024.png --out ".build/OpeningStudio.iconset/icon_${TASK_SIZE}x${TASK_SIZE}.png" >/dev/null
  TASK_DOUBLE=$(( TASK_SIZE * 2 ))
  sips -z "$TASK_DOUBLE" "$TASK_DOUBLE" .build/icon-1024.png --out ".build/OpeningStudio.iconset/icon_${TASK_SIZE}x${TASK_SIZE}@2x.png" >/dev/null
done
iconutil -c icns .build/OpeningStudio.iconset -o "$TASK_APP/Contents/Resources/AppIcon.icns"
python3 - "$TASK_APP" <<'PY'
import plistlib,sys
d={'CFBundleExecutable':'WelcomeTommy','CFBundleIdentifier':'local.tommy.welcome-companion','CFBundleName':'Opening Studio','CFBundleDisplayName':'Opening Studio','CFBundleVersion':'3','CFBundleShortVersionString':'0.3.0','CFBundlePackageType':'APPL','CFBundleIconFile':'AppIcon','LSUIElement':True,'LSMinimumSystemVersion':'13.0','NSHighResolutionCapable':True,'NSPrincipalClass':'NSApplication'}
with open(sys.argv[1]+'/Contents/Info.plist','wb') as f:plistlib.dump(d,f)
PY
codesign --force --deep --sign - "$TASK_APP"
"$TASK_APP/Contents/MacOS/WelcomeTommy" --self-test
printf 'Built: %s\n' "$TASK_APP"
