#!/bin/bash
# Avvia WebDriverAgent sull'iPhone collegato e lo rende raggiungibile su http://localhost:8100.
# Uso: ./avvia-wda.sh [UDID-iPhone]
# Lascia aperta questa finestra del Terminale finché usi Specchio iPhone (Ctrl+C per fermare).
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d WebDriverAgent ]; then
  echo "Scarico WebDriverAgent…"
  git clone --depth 1 https://github.com/appium/WebDriverAgent.git
  echo
  echo "Prima volta: apri WebDriverAgent/WebDriverAgent.xcodeproj in Xcode e segui il passo 3 del LEGGIMI"
  echo "(firma con il tuo Apple ID), poi rilancia questo script."
  open WebDriverAgent/WebDriverAgent.xcodeproj
  exit 0
fi

UDID="${1:-}"
if [ -z "$UDID" ]; then
  UDID="$(xcrun xctrace list devices 2>/dev/null \
    | sed -n '/== Devices ==/,/== Simulators ==/p' \
    | grep -i 'iphone' \
    | head -1 \
    | sed -E 's/.*\(([0-9A-Fa-f-]{20,})\)[[:space:]]*$/\1/')"
fi
if [ -z "$UDID" ]; then
  echo "Nessun iPhone trovato. Collegalo con il cavo, sbloccalo e autorizza questo computer."
  exit 1
fi
echo "iPhone: $UDID"

# Con il cavo: inoltra la porta 8100 del Mac all'iPhone (serve libimobiledevice).
if command -v iproxy >/dev/null; then
  iproxy 8100 8100 -u "$UDID" >/dev/null 2>&1 &
  IPROXY_PID=$!
  trap 'kill $IPROXY_PID 2>/dev/null || true' EXIT
  echo "Inoltro attivo: http://localhost:8100"
else
  echo "iproxy non trovato (brew install libimobiledevice): userai l'indirizzo Wi‑Fi mostrato sotto."
fi

echo "Avvio WebDriverAgent sull'iPhone (la prima volta ci vuole qualche minuto)…"
xcodebuild test \
  -project WebDriverAgent/WebDriverAgent.xcodeproj \
  -scheme WebDriverAgentRunner \
  -destination "id=$UDID" \
  -allowProvisioningUpdates \
  2>&1 | while IFS= read -r line; do
    case "$line" in
      *ServerURLHere*)
        url="$(echo "$line" | sed -E 's/.*ServerURLHere->(.*)<-ServerURLHere.*/\1/')"
        echo
        echo "✅ WebDriverAgent è pronto. Indirizzo Wi‑Fi: $url"
        echo "   In Specchio iPhone usa http://localhost:8100 (cavo + iproxy) oppure l'indirizzo Wi‑Fi."
        ;;
      *"requires a development team"*)
        echo "$line"
        echo
        echo "👉 Manca la firma: apri WebDriverAgent/WebDriverAgent.xcodeproj in Xcode e scegli il tuo Team"
        echo "   in Signing & Capabilities per WebDriverAgentRunner e WebDriverAgentLib (passo 3 del LEGGIMI)."
        ;;
      *error:*|*"Testing failed"*|*"** TEST FAILED **"*)
        echo "$line"
        ;;
    esac
  done
