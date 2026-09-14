import { isIOS } from './platform';

/** Uebersetzt technische ffmpeg-Fehler in eine verstaendliche Meldung. */
export function explainError(error: unknown, log: string[] = []): string {
  const raw = error instanceof Error ? error.message : String(error);
  const haystack = `${raw}\n${log.slice(-80).join('\n')}`;

  if (/CanceledError|abgebrochen/i.test(raw)) return 'Der Vorgang wurde abgebrochen.';

  if (/Unknown encoder ['"]?([\w-]+)/i.test(haystack)) {
    const name = /Unknown encoder ['"]?([\w-]+)/i.exec(haystack)?.[1] ?? '';
    const readable: Record<string, string> = {
      libx265: 'H.265 / HEVC',
      'libvpx-vp9': 'VP9',
      'libaom-av1': 'AV1',
      libmp3lame: 'MP3',
      libopus: 'Opus',
      libvorbis: 'Vorbis',
      libwebp: 'WebP',
    };
    return `Der Codec ${readable[name] ?? name} ist in dieser ffmpeg-Version nicht enthalten. Bitte einen anderen Codec wählen.`;
  }

  if (/2pass curve failed to converge/i.test(haystack)) {
    return 'Die gewünschte Zielgröße passt nicht zum Material – bitte einen kleineren Wert wählen oder auf CRF umstellen.';
  }

  // Hinweis: "Aborted()" steht auch bei erfolgreichen Läufen im Protokoll und
  // ist deshalb kein Hinweis auf Speichermangel.
  if (
    /out of memory|memory access out of bounds|Cannot enlarge memory|RangeError:[^\n]*(allocation|Invalid array length)/i.test(
      haystack,
    )
  ) {
    return isIOS
      ? 'Der Arbeitsspeicher hat nicht gereicht. Auf dem iPhone hilft eine kleinere Zielauflösung (z. B. 720p), ein kürzerer Ausschnitt oder das Aufteilen der Datei.'
      : 'Der Arbeitsspeicher hat nicht gereicht. Bitte eine kleinere Zielauflösung wählen oder die Datei vorher zuschneiden.';
  }

  if (/Invalid data found|moov atom not found|Invalid argument/i.test(haystack)) {
    return 'Die Datei konnte nicht gelesen werden – sie ist möglicherweise beschädigt oder das Format wird nicht unterstützt.';
  }

  if (/could not find codec parameters|Decoder \(codec .*\) not found/i.test(haystack)) {
    return 'Für diese Datei fehlt der passende Decoder. Bitte vorher in ein gängiges Format umwandeln.';
  }

  if (/Output file .* does not contain any stream|keine Ausgabedatei/i.test(haystack)) {
    return 'Es wurde keine Ausgabedatei erzeugt. Bitte die Einstellungen prüfen (z. B. Zuschnitt oder Tonspur).';
  }

  if (/Conversion failed|Error (while |)(opening|initializing)/i.test(haystack)) {
    return 'Die Umwandlung ist fehlgeschlagen. Details stehen im technischen Protokoll.';
  }

  return raw || 'Unbekannter Fehler.';
}

/** Warnung vor absehbaren Speicherproblemen, bevor der Job startet. */
export function memoryWarning(fileSize: number, hardLimit: number, warnLimit: number): string | null {
  if (fileSize >= hardLimit) {
    return isIOS
      ? 'Diese Datei ist sehr groß. Auf dem iPhone bricht Safari dabei häufig ab – bitte 480p oder 720p wählen und den Ausschnitt kürzen.'
      : 'Diese Datei ist sehr groß. Bitte eine kleinere Zielauflösung wählen oder die Datei in Abschnitte teilen.';
  }
  if (fileSize >= warnLimit) {
    return isIOS
      ? 'Große Datei: Auf dem iPhone ist der Speicher knapp. Eine niedrigere Zielauflösung (720p oder kleiner) erhöht die Erfolgschance deutlich.'
      : 'Große Datei: Die Verarbeitung kann lange dauern und viel Arbeitsspeicher benötigen.';
  }
  return null;
}
