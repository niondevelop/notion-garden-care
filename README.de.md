# 🌱 Notion Garden Care für Home Assistant (Deutsch)

> Die ausführliche Dokumentation ist auf Englisch: [README.md](README.md).
> Diese Seite fasst das Wichtigste auf Deutsch zusammen.

Verwalte deinen Garten in Notion und lass dich von Home Assistant ans Gießen,
Düngen, Schneiden und Ernten erinnern.

## Sprache

Die Integration ist vollständig auf Deutsch verfügbar:

- Einrichtungsassistent, Optionen und Aktionen (Dienste) – folgt der Sprache
  deines HA-Benutzerprofils.
- Dashboard-Karten (Pflanzenkarte, „Pflanze hinzufügen“, Bereichskarten) –
  inkl. Datumsformat (z. B. „12. Nov.“) und übersetzter Werte wie
  Pflanzentyp, Monate oder Standort.
- Mit KI hinzugefügte Pflanzen erhalten Pflegehinweise auf Deutsch.

Die Notion-Datenbank (Spaltennamen, Auswahlwerte) sowie Entitätszustände wie
`Needs Water` bleiben bewusst Englisch, damit Automationen und Blueprints
weiter funktionieren. Weitere Sprachen: siehe
[docs/TRANSLATIONS.md](docs/TRANSLATIONS.md).

## Pflanzensensoren (optional)

Ohne Sensoren funktioniert alles wie bisher über den Zeitplan aus Notion.
Wer Sensoren hat (z. B. Xiaomi MiFlora, ESPHome-Bodenfeuchtesensor,
Zigbee-Bodensensor), kann sie zusätzlich einer Pflanze zuordnen:

1. **Einstellungen → Geräte & Dienste → Notion Garden Care → Konfigurieren**
2. **Pflanzensensoren (optional)** → Pflanze auswählen
3. Vorhandene Sensoren auswählen, Wohlfühlbereich anpassen → **Absenden**

| Messwert | Standardbereich | Zustand außerhalb des Bereichs |
|---|---|---|
| Bodenfeuchte | 20 – 60 % | `Needs Water` / `Too Wet` |
| Temperatur | 5 – 35 °C | `Too Cold` / `Too Hot` |
| Helligkeit | – (aus) | `Too Dark` / `Too Bright` |
| Leitfähigkeit (Nährstoffe) | 350 – 2000 µS/cm | `Low Nutrients` / `Too Much Fertilizer` |
| Luftfeuchtigkeit | – (aus) | `Air Too Dry` / `Air Too Humid` |
| Sensor-Batterie | min. 15 % | `Sensor Battery Low` |

- Ein Bodenfeuchte-Sensor (mit Minimum) entscheidet dann, wann gegossen
  werden muss – statt des festen Intervalls. Fällt er aus, greift wieder der
  Zeitplan.
- „Zu dunkel“ wird nur geprüft, solange die Sonne aufgegangen ist.
- Die Pflanzenkarte zeigt die Messwerte live an (rot = außerhalb des
  Bereichs).
- Sobald mindestens eine Pflanze Sensoren hat, gibt es zusätzlich
  `sensor.plants_needing_attention`.

Details: [docs/SENSOR_MONITORING.md](docs/SENSOR_MONITORING.md)
