#!/bin/bash
# Compila "Specchio iPhone.app", la installa in Applicazioni e la apre.
set -euo pipefail
cd "$(dirname "$0")"
DIR="$(pwd)"

if [ ! -d WebDriverAgent ]; then
  echo "Prima esegui ./avvia-wda.sh una volta e firma WebDriverAgent in Xcode (passo 3 del LEGGIMI)."
  exit 1
fi

swift build -c release
BIN="$(swift build -c release --show-bin-path)/SpecchioiPhone"
APP="build/Specchio iPhone.app"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cp "$BIN" "$APP/Contents/MacOS/SpecchioiPhone"
cp Resources/Info.plist "$APP/Contents/Info.plist"
# L'app avvia WebDriverAgent da questa cartella.
plutil -insert WDAProjectDir -string "$DIR/WebDriverAgent" "$APP/Contents/Info.plist"
# Firma locale: basta per usarla sul proprio Mac.
codesign --force --sign - "$APP"

DEST="/Applications"
[ -w "$DEST" ] || DEST="$HOME/Applications"
mkdir -p "$DEST"
pkill -x SpecchioiPhone 2>/dev/null && sleep 1 || true
rm -rf "$DEST/Specchio iPhone.app"
cp -R "$APP" "$DEST/"
open "$DEST/Specchio iPhone.app"

echo
echo "Fatto: Specchio iPhone è installata in $DEST e si apre da sola quando colleghi l'iPhone."
