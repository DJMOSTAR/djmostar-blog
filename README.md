# DJ MOSTAR Blog

Automatischer deutscher Blog unter https://blog.djmostar.de, gebaut mit Eleventy und GitHub Pages.

## Ablauf

Stündlicher Scheduler → Artikel schreiben (Mo/Do) → harte Regeln und Redaktion → Pull Request → Veröffentlichen (Di/Fr) → Deploy → Benachrichtigung.

## Wo was liegt

| Pfad | Inhalt |
|---|---|
| `config/schedule.yml` | Tage und Zeiten |
| `config/content.yml` | Modell, Limits, Kategorien, Tags, Saisons, externe Quellen |
| `config/rules.yml` | Verbotene Formulierungen und harte Regeln |
| `config/facts.md` | Die einzigen freigegebenen Fakten über DJ MOSTAR |
| `config/site.yml` | Menü, Footer, Kontakt, Logo, KI-Hinweis |
| `config/analytics.yml` | Search Console, aus ohne Secret |
| `prompts/` | Anweisungen für Themenplanung, Autor und Redaktion |
| `content/posts/` | Veröffentlichte Beiträge |
| `data/` | Kalender, Register, Bilder, Protokoll, Scheduler-Status |
| `scripts/` | Die Automatik |
| `.github/actions/claude-step/` | Der einzige Aufruf von Claude |
| `.github/workflows/` | scheduler, generate, publish, deploy, report, hero (Titelbild der Startseite) |
| `tests/` | Tests für jede Veröffentlichung |
| `docs/setup-guide.md` | Einrichtung |
| `docs/owner-guide-de.md` | Kurzanleitung für Mo |
| `docs/testing-checklist.md` | Testplan vor dem Start |
| `docs/sample-article.md` | Beispielartikel aus einem Testlauf |

## Variablen

- `DRY_RUN`: nur `false` schaltet den echten Betrieb ein. Sonst läuft nichts nach Zeitplan und nichts wird veröffentlicht.
- `AUTO_PUBLISH`: `true` veröffentlicht geprüfte Beiträge automatisch. Sonst nur mit dem Label `approved`.

Secrets gehören nur in die GitHub Actions Secrets, nie in dieses Repository. Das Repository und seine Logs sind öffentlich.

Der Ähnlichkeitsvergleich prüft nur gegen diesen Blog. Er ist keine Internet-Plagiatsprüfung. Die Prüfungen können nicht garantieren, dass jede Aussage stimmt.
