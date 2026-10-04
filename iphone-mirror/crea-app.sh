#!/bin/bash
# Compila "Specchio iPhone.app" nella cartella build/.
set -euo pipefail
cd "$(dirname "$0")"

swift build -c release
BIN="$(swift build -c release --show-bin-path)/SpecchioiPhone"
APP="build/Specchio iPhone.app"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cp "$BIN" "$APP/Contents/MacOS/SpecchioiPhone"
cp Resources/Info.plist "$APP/Contents/Info.plist"
# Firma locale: basta per usarla sul proprio Mac.
codesign --force --sign - "$APP"

echo
echo "Fatto: $(pwd)/$APP"
echo "Aprila con:  open \"$APP\"   (oppure trascinala in Applicazioni)"
