# Motore veloce (specchio)

Finestra che mostra l'iPhone e invia tocchi, scorrimento e tastiera **dal vivo**, usando lo stesso canale
di Device Hub di Xcode 27 (CoreDevice). Serve **Xcode 27** sul Mac e **iOS 27** sull'iPhone.

È basata su [ipb](https://github.com/ipbtools/ipb) (commit `f2e85a6`, licenza MIT: vedi `LICENSE-ipb`),
con le modifiche di Specchio iPhone (tastiera completa, appunti, scorciatoie, sessione illimitata,
messaggi di stato per l'app). Usa interfacce Apple non documentate: un aggiornamento di Xcode o iOS
potrebbe romperla; in quel caso l'app torna da sola alla modalità compatibilità.

Si compila con `make` (lo fa già `../crea-app.sh`). Il programma `build/specchio-mirror` viene avviato
dall'app; i parametri sono:

```
specchio-mirror <id-coredevice> <utunN> <ip-mac> <ip-iphone> <productType> [--seconds S] [--title NOME]
```
