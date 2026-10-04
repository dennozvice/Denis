#!/bin/bash
# Compila "Specchio iPhone.app" (con lo specchio veloce, se c'è Xcode 27), la installa in Applicazioni e la apre.
set -euo pipefail
cd "$(dirname "$0")"
DIR="$(pwd)"

if [ ! -d WebDriverAgent ]; then
  echo "Nota: WebDriverAgent non c'è, quindi la modalità compatibilità non potrà controllare l'iPhone."
  echo "      (Serve solo se la modalità veloce non funziona: vedi ./avvia-wda.sh e il LEGGIMI.)"
fi

# Xcode da usare: quello selezionato, altrimenti il più recente in Applicazioni.
XCODE_DEVELOPER="$(xcode-select -p 2>/dev/null || true)"
if [[ "$XCODE_DEVELOPER" != *.app/Contents/Developer ]]; then
  XCODE_APP="$(ls -d /Applications/Xcode*.app 2>/dev/null | sort | tail -1 || true)"
  [ -n "$XCODE_APP" ] && XCODE_DEVELOPER="$XCODE_APP/Contents/Developer"
fi
[ -n "$XCODE_DEVELOPER" ] && export DEVELOPER_DIR="$XCODE_DEVELOPER"

swift build -c release
BIN="$(swift build -c release --show-bin-path)/SpecchioiPhone"
APP="build/Specchio iPhone.app"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cp "$BIN" "$APP/Contents/MacOS/SpecchioiPhone"
cp Resources/Info.plist "$APP/Contents/Info.plist"
# L'app avvia WebDriverAgent da questa cartella.
plutil -insert WDAProjectDir -string "$DIR/WebDriverAgent" "$APP/Contents/Info.plist"

# Specchio veloce (Xcode 27 + iOS 27): se non si compila, l'app usa solo la modalità compatibilità.
MIRROR_APP="$APP/Contents/Helpers/Specchio Mirror.app"
if make -C Engine XCODE_PATH="${XCODE_DEVELOPER%/Contents/Developer}"; then
  mkdir -p "$MIRROR_APP/Contents/MacOS"
  cp Engine/build/specchio-mirror "$MIRROR_APP/Contents/MacOS/specchio-mirror"
  cp Resources/MirrorInfo.plist "$MIRROR_APP/Contents/Info.plist"
  codesign --force --sign - "$MIRROR_APP"
  MIRROR_OK=1
else
  MIRROR_OK=0
  echo
  echo "⚠️  Lo specchio veloce non si è compilato (serve Xcode 27): l'app userà la modalità compatibilità."
  echo
fi

# Firma locale: basta per usarla sul proprio Mac.
codesign --force --sign - "$APP"

DEST="/Applications"
[ -w "$DEST" ] || DEST="$HOME/Applications"
mkdir -p "$DEST"
pkill -x specchio-mirror 2>/dev/null || true
pkill -x SpecchioiPhone 2>/dev/null && sleep 1 || true
rm -rf "$DEST/Specchio iPhone.app"
cp -R "$APP" "$DEST/"
open "$DEST/Specchio iPhone.app"

echo
if [ "$MIRROR_OK" = 1 ]; then
  echo "Fatto: Specchio iPhone (modalità veloce) è installata in $DEST e si apre da sola quando colleghi l'iPhone."
else
  echo "Fatto: Specchio iPhone (solo modalità compatibilità) è installata in $DEST."
fi
