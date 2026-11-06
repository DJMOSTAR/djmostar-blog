# Blog-Automatik: Kurzanleitung für Mo

Der Blog unter https://blog.djmostar.de schreibt und veröffentlicht Beiträge selbstständig. Du musst nichts tun, damit er läuft. Diese Anleitung zeigt dir die drei Dinge, die du vielleicht einmal brauchst.

Alles geht auf dem Handy, in der **GitHub-App** oder im Browser auf github.com. Melde dich als `DJMOSTAR` an. Der Blog liegt unter https://github.com/DJMOSTAR/djmostar-blog

## So läuft es normalerweise

- **Montag und Donnerstag** ab etwa 9 Uhr schreibt das System einen neuen Beitrag und prüft ihn streng.
- **Dienstag und Freitag** ab etwa 10 Uhr wird ein geprüfter Beitrag veröffentlicht.
- Nach jeder Veröffentlichung bekommst du eine **E-Mail** mit dem Link zum Beitrag.
- Fällt ein Beitrag durch die Prüfung, wird er **nicht** veröffentlicht. Du bekommst eine E-Mail mit dem Grund. Der Termin wird dann einfach übersprungen.

GitHub kann die Läufe etwas später starten, manchmal um ein paar Stunden. Das ist normal.

---

## 1. Einen Beitrag auf dem Handy freigeben

Das brauchst du nur, wenn ein Beitrag durch die Prüfung gefallen ist und du ihn trotzdem veröffentlichen möchtest, oder wenn die automatische Veröffentlichung pausiert ist (siehe Punkt 2).

1. Öffne die E-Mail. Sie enthält einen Link zum Entwurf, einem sogenannten **Pull Request**. Oder öffne im Blog oben **Pull requests**.
2. Lies den Beitrag: Tippe auf **Files changed** und dann auf die Datei. Oben im Pull Request steht der Prüfbericht mit Note, Problemen, Keywords und Bildnachweisen.
3. **Nur wenn alles stimmt:** Tippe auf **Labels** (in der App unter **Edit** oder auf das Zahnrad) und wähle **approved**.
4. Fertig. Der Beitrag erscheint am nächsten Veröffentlichungstag, also Dienstag oder Freitag.

**Wichtig:** Mit **approved** gibst du den Beitrag selbst frei. Die automatische Prüfung wird dann übersprungen. Achte besonders auf Preise, das Wort „Paket“, Uhrzeiten und Aussagen über dich, die nicht stimmen.

**Einen Beitrag nicht veröffentlichen:** Im Pull Request ganz unten auf **Close pull request** tippen.

---

## 2. Die Automatik pausieren

Es gibt zwei Stufen. Beide änderst du an derselben Stelle:

1. Öffne https://github.com/DJMOSTAR/djmostar-blog/settings/variables/actions
2. Tippe beim jeweiligen Eintrag auf den **Stift**, ändere den Wert und tippe auf **Update variable**.

| Was du willst | Variable | Wert |
|---|---|---|
| Beiträge weiter schreiben lassen, aber nur noch veröffentlichen, was du freigibst | `AUTO_PUBLISH` | `false` |
| Alles anhalten: nichts wird mehr geschrieben oder veröffentlicht | `DRY_RUN` | `true` |
| Wieder normal laufen lassen | `AUTO_PUBLISH` und `DRY_RUN` | `true` und `false` |

Bei `AUTO_PUBLISH` = `false` schreibt das System höchstens zwei Entwürfe auf Vorrat und wartet dann auf deine Freigabe (siehe Punkt 1).

**Notbremse ohne Einstellungen:** Oben auf **Actions** tippen, links **Scheduler** wählen, dann **…** und **Disable workflow**. Zum Einschalten dasselbe mit **Enable workflow**.

**Hinweis:** GitHub schaltet den Scheduler von selbst ab, wenn 60 Tage lang nichts im Blog passiert. Kommen keine Beiträge mehr, prüfe unter **Actions** → **Scheduler**, ob oben ein Hinweis steht, und tippe auf **Enable workflow**.

---

## 3. Veröffentlichungstage ändern

1. Öffne https://github.com/DJMOSTAR/djmostar-blog/blob/main/config/schedule.yml
2. Tippe auf den **Stift** (Edit this file).
3. Ändere die Tage und Uhrzeiten. Alle Zeiten sind deutsche Zeit.

```yaml
generate:
  - { day: monday, time: "09:00" }
  - { day: thursday, time: "09:00" }

publish:
  - { day: tuesday, time: "10:00" }
  - { day: friday, time: "10:00" }
```

- `generate` ist der Tag, an dem der Beitrag geschrieben wird. `publish` ist der Tag, an dem er online geht.
- Erlaubte Tage, immer auf Englisch und klein geschrieben: `monday`, `tuesday`, `wednesday`, `thursday`, `friday`, `saturday`, `sunday`
- Plane jeden Schreibtag mindestens einen Tag vor einem Veröffentlichungstag.
- Leerzeichen, Klammern und Anführungszeichen genau so lassen wie im Beispiel.

4. Tippe auf **Commit changes** und noch einmal auf **Commit changes**.

Danach unter **Actions** prüfen, ob **Deploy site** einen grünen Haken bekommt. Ist er rot, hat sich ein Tippfehler eingeschlichen. Mach die Änderung dann rückgängig oder sag Bescheid.

Mehr als 10 Beiträge pro Monat werden nie veröffentlicht, egal wie viele Tage du einträgst.

---

## Wenn etwas nicht stimmt

- **Ein Beitrag ist online und enthält einen Fehler:** Sag deinem Entwickler Bescheid und nenne den Link. Zum schnellen Pausieren setze `DRY_RUN` auf `true` (Punkt 2).
- **E-Mail „Claude-Token läuft ab“ oder „Anmeldung fehlgeschlagen“:** Das muss dein Entwickler erneuern. Weiterleiten genügt.
- **Keine E-Mails mehr:** Unter https://github.com/settings/notifications prüfen, ob E-Mails eingeschaltet sind, und den Spam-Ordner ansehen.

Keine Schlüssel, Passwörter oder Tokens in Pull Requests, Issues oder Dateien schreiben. Der Blog ist öffentlich einsehbar.
