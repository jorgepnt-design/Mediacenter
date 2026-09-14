# Mediacenter

Video-, Audio- und Bilddateien **konvertieren und komprimieren – direkt im Browser**.
Kein Upload, kein Konto, keine Werbung, kein Tracking. Alle Dateien bleiben auf dem Gerät.

Die App ist **mobil zuerst** gebaut: wichtigste Zielplattform ist das iPhone (Safari, iOS 17+),
als PWA auf dem Home-Bildschirm. Die Desktop-Ansicht ist die Erweiterung, nicht umgekehrt.

---

## Funktionen

| Bereich | Was geht |
| --- | --- |
| **Video konvertieren** | mp4, mov, mkv, avi, webm, wmv, flv, mpeg/mpg, m4v, 3gp, ts, ogv → MP4, WebM, MKV, MOV, GIF |
| **Video komprimieren** | Presets *Klein / Ausgewogen / Hohe Qualität*, Experten-Modus mit CRF, Bitrate oder **Zielgröße in MB** (2-Pass, mit automatischem 1-Pass-Rückfall), Auflösung bis 2160p oder eigene Breite, FPS, Codec (H.264, H.265, VP9, AV1), Encoder-Tempo |
| **Audio extrahieren** | Video → **MP3** (320/256/192/128/96 kbit/s oder VBR), außerdem WAV, AAC/M4A, FLAC, OGG, Opus – auf Wunsch **ohne Neukodierung kopieren**, wenn die Tonspur schon passt |
| **Audio konvertieren** | zwischen mp3, wav, aac/m4a, flac, ogg/opus, wma – Bitrate, Abtastrate, Mono/Stereo, Lautstärke-Normalisierung (`loudnorm`) |
| **Bilder** | JPG, PNG, WebP, AVIF, GIF, BMP, TIFF, **HEIC-Import** · Qualitätsregler mit Live-Vorschau und Live-Größenanzeige · **Zielgröße in kB** · Skalieren nach Breite/Höhe/Prozent mit Seitenverhältnis-Sperre und „nicht vergrößern" · EXIF entfernen oder behalten · Hintergrundfarbe bei Transparenz → JPG |
| **Extras** | Trimmen mit Vorschau-Scrubber, Video → GIF / animiertes WebP (FPS, Breite, Loop, Palette), Einzelbild & Bildsequenz, Drehen/Spiegeln, Stummschalten, Metadaten entfernen, mehrere Dateien **zusammenfügen** (concat) |
| **Stapel** | Warteschlange mit Status je Datei, Fortschritt je Datei und gesamt, Restzeit, Abbrechen, Wiederholen, „Optionen auf alle anwenden" |
| **Ergebnisse** | Größe vorher/nachher inkl. Ersparnis, Vorschau (Video, Audio, Bildvergleich vorher/nachher), Einzel-Download, **Teilen über das iOS-Share-Sheet**, „Alle als ZIP" |

---

## Schnellstart

```bash
npm install
npm run dev      # http://localhost:5173
```

`npm run dev` und `npm run build` kopieren vorher automatisch die ffmpeg.wasm-Cores
aus `node_modules` nach `public/ffmpeg/` (siehe `scripts/copy-ffmpeg-core.mjs`).
Dieses Verzeichnis ist bewusst nicht eingecheckt.

```bash
npm run build     # Produktionsbuild nach dist/
npm run preview   # Build lokal testen – mit denselben COOP/COEP-Headern
npm run icons     # Icons und iOS-Splashscreens neu erzeugen
```

---

## COOP/COEP – bitte nicht vergessen

Der **Multithread-Core** von ffmpeg.wasm braucht `SharedArrayBuffer`. Den gibt es nur,
wenn die Seite *cross-origin isolated* ausgeliefert wird:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Gesetzt ist das an drei Stellen:

* **Dev- und Preview-Server** → `vite.config.ts` (`server.headers`, `preview.headers`)
* **Vercel** → `vercel.json`
* **Render / Netlify / Cloudflare Pages** → `public/_headers` (und `render.yaml`)

Fehlen die Header, **stürzt nichts ab**: die App erkennt das und lädt automatisch den
Single-Thread-Core. Auf dem iPhone ist genau das der Normalfall – `SharedArrayBuffer`
gibt es dort erst ab iOS 16.4 und auch nur mit korrekten Headern. Der Kopfbereich zeigt
an, welcher Kern gerade läuft (*Multi-Thread* / *Single-Thread*).

---

## Deployment

### Vercel

```bash
npm i -g vercel
vercel --prod
```

`vercel.json` bringt Buildkommando, Ausgabeverzeichnis, die COOP/COEP-Header und das
Caching für `/assets/*` mit. Sonst ist nichts zu konfigurieren.

### Render (statische Seite)

`render.yaml` ist fertig hinterlegt: Build `npm ci && npm run build`, Verzeichnis `./dist`,
Header wie oben, SPA-Rewrite auf `index.html`.

### Beliebiger Static-Host

`dist/` hochladen und die beiden Header setzen. Wichtig: `dist/` enthält die
ffmpeg-Cores (~60 MB für Single- und Multithread zusammen). Sie werden erst beim
ersten Job geladen und danach vom Service Worker dauerhaft gecacht.

---

## iPhone: was bewusst anders ist

* **Einspaltiges Layout**, Einstellungen im **Bottom-Sheet**, Aktionsleiste unten fixiert.
* `viewport-fit=cover` plus `env(safe-area-inset-*)` – nichts verschwindet unter Notch
  oder Home-Indicator.
* Alle Touch-Ziele mindestens **44 × 44 pt**, keine Hover-abhängigen Funktionen.
* Alle Eingabefelder mit `font-size: 16px` (sonst zoomt Safari beim Fokus) und
  `touch-action: manipulation` gegen Doppeltipp-Zoom.
* Import über **„Aus Fotos"** und **„Aus Dateien"** statt Drag & Drop. **HEIC**-Fotos
  (über `heic2any`) und **HEVC-MOV**-Videos werden verarbeitet.
* **Teilen statt Herunterladen**: liegt `navigator.canShare({ files })` vor, öffnet der
  Teilen-Knopf das iOS-Share-Sheet (Fotos, WhatsApp, AirDrop). Download bleibt als
  Alternative, mit dem Hinweis auf die Dateien-App.
* **Wake Lock** während eines Jobs, plus Hinweis „Bildschirm anlassen und App im
  Vordergrund lassen" – iOS pausiert WASM im Hintergrund.
* Warteschlange **strikt sequentiell** (ein Job gleichzeitig), damit der Speicher reicht.
* Vorschau-Player mit `playsinline`.
* **Speicherwarnung ab ca. 300 MB** Eingangsdatei mit direktem Vorschlag, auf 720p zu gehen.
* Rückfrage beim Verlassen der Seite, solange ein Job läuft.
* PWA: Manifest (`display: standalone`), Apple-Touch-Icon, iOS-Splashscreens, dezenter
  Hinweis „Zum Home-Bildschirm hinzufügen".

---

## Aufbau

```
src/
  lib/              Reine Logik ohne React
    ffmpegArgs.ts     Einstellungen -> ffmpeg-Argumente (typisierte Presets)
    ffmpegClient.ts   Worker-Anbindung, Fallback auf den Hauptthread
    imageProcess.ts   Bildpfad (createImageBitmap + OffscreenCanvas/Canvas)
    platform.ts       Geräte- und Feature-Erkennung (iOS, SAB, AVIF, WebP …)
    errors.ts         ffmpeg-Fehler -> verständliche deutsche Meldungen
    remote.ts         optionale Server-Variante
  worker/
    engine.ts         ffmpeg.wasm-Kapsel (Laden, Durchgänge, Aufräumen)
    ffmpeg.worker.ts  Web Worker darum herum
  hooks/
    useJobQueue.ts    zentrale Warteschlange (Start, Abbruch, Wiederholung, Merge)
  components/
    ImportZone, JobCard, SettingsSheet, ActionBar, panels/ …
server/               optionale Express-API mit nativem ffmpeg (Docker)
scripts/              Icon-Generator, Core-Kopierschritt
```

### Technische Feinheiten, die drinstecken

* **Core wird verzögert geladen** (~30 MB) mit sichtbarem Ladehinweis und liegt danach im
  Service-Worker-Cache – beim zweiten Mal startet der Job sofort.
* **Aufräumen nach jedem Job**: Ein-, Ausgabe- und Zwischendateien werden aus dem
  WASM-Dateisystem gelöscht, Object-URLs mit `URL.revokeObjectURL` freigegeben. Sonst
  wächst der Speicherbedarf bei Stapelverarbeitung stetig.
* **Feature-Detection** für `OffscreenCanvas` und AVIF-Kodierung; ohne AVIF wird
  automatisch auf WebP bzw. JPEG ausgewichen – mit sichtbarem Hinweis.
* **Encoder-Erkennung**: Beim Laden fragt die App `ffmpeg -encoders` ab; Codecs, die im
  Core fehlen, werden in der Oberfläche ausgegraut statt mitten im Job zu scheitern.
* **Zielgröße**: Die Bitrate wird aus Laufzeit und Zielgröße berechnet und auf das Niveau
  des Originals gedeckelt – mehr Bitrate als die Quelle bringt nichts und lässt die
  2-Pass-Kurve von x264 scheitern („2pass curve failed to converge"). Klappt der
  2-Pass-Lauf trotzdem nicht, greift automatisch ein einzelner Durchgang mit
  VBV-Begrenzung.
* **„Ohne Neukodierung kopieren"** läuft als erster Versuch; scheitert er, weil Codec und
  Container nicht zusammenpassen, kodiert die App ohne Nachfrage neu.
* **Fehler** erscheinen als verständlicher deutscher Satz plus ausklappbarem technischen
  Protokoll mit der vollständigen ffmpeg-Ausgabe.

---

## Optionale Server-Variante

Für Dateien jenseits dessen, was WASM im Browser schafft (> ~2 GB), oder für AV1 in
brauchbarer Geschwindigkeit liegt unter `server/` eine kleine Express-API mit **nativem
ffmpeg** bereit. Sie nimmt exakt dieselben Presets entgegen wie die Web-App.

```bash
cd server
npm install
npm start          # benötigt ffmpeg im PATH
# oder:
docker build -t mediacenter-api . && docker run -p 8080:8080 mediacenter-api
```

In der Web-App aktivieren:

```bash
cp .env.example .env
# VITE_API_URL=https://deine-api.example
# VITE_API_THRESHOLD_MB=2048
```

**Wichtig:** Auch wenn `VITE_API_URL` gesetzt ist, wird **nichts automatisch hochgeladen**.
Der Weg über den Server muss zusätzlich in den Einstellungen eingeschaltet werden
(*Einstellungen → Server-Variante*). Erst dann gehen Dateien oberhalb der Schwelle an die
API – alles darunter bleibt weiterhin lokal. Das Datenschutzversprechen der App soll
niemand versehentlich aufgeben.

Die API prüft die übergebene Argumentliste streng (`server/validate.js`): keine absoluten
Pfade, keine Protokolle, keine Unterverzeichnisse, nur hochgeladene Dateinamen. Betreibe
sie trotzdem nur für vertrauenswürdige Nutzerinnen und Nutzer und setze `ALLOWED_ORIGIN`.

---

## Bekannte Grenzen

* ffmpeg.wasm rechnet im WASM-Speicher (praktisch ~2 GB). Auf iOS Safari liegt die Grenze
  deutlich niedriger – der Tab wird dort oft schon bei einigen hundert MB beendet.
  Die App warnt vorher und schlägt eine kleinere Auflösung vor.
* Ein laufender ffmpeg-Durchgang lässt sich nicht sanft anhalten. „Abbrechen" beendet
  deshalb die Engine; beim nächsten Job wird sie neu geladen (der Core kommt dann aus
  dem Cache).
* AV1 (`libaom`) ist im Browser sehr langsam – dafür gibt es die Server-Variante.
* Metadaten „behalten" funktioniert verlustfrei nur bei JPEG → JPEG.
* Der Fortschritt beruht auf der von ffmpeg gemeldeten Laufzeit; ist die Laufzeit einer
  Datei unbekannt, zeigt die Leiste einen unbestimmten Zustand.

---

## Lizenz

Privates Projekt. ffmpeg.wasm steht unter LGPL/GPL – der mitgelieferte Core enthält
GPL-Komponenten (unter anderem x264 und x265).
