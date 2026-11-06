# Testing checklist

Work through this before switching on full automation. Every step in sections 1 and 2 is safe: nothing is published.

## How test mode works

- With the variable `DRY_RUN` set to anything except `false`, or missing, the scheduler starts nothing.
- A manual **Generate article** run with **Test run only** ticked writes and checks a full article, then stops. It opens no Pull Request and changes nothing in the repository.
- The result arrives as an Issue and email titled "Testlauf: bestanden" or "Testlauf: nicht bestanden", with the quality report and the full article. The run's summary page shows the same.
- Test runs use your Claude Pro limits, but never trigger the Unsplash download endpoint or record images as used.

## 1. Basics

- [ ] **Deploy site** is green on the latest commit.
- [ ] https://blog.djmostar.de opens with a padlock, and **Enforce HTTPS** is ticked in Settings → Pages.
- [ ] Header, footer, logo and fonts look right on a phone and a computer.
- [ ] Footer links work: Impressum/Datenschutz, email, phone, WhatsApp, social profiles.
- [ ] https://blog.djmostar.de/sitemap.xml, `/feed.xml` and `/robots.txt` open.
- [ ] No cookies: open the blog, press F12 → **Application** → **Cookies**, reload, and check the list is empty.

## 2. Test runs

Run **Actions** → **Generate article** → **Run workflow**, with **Test run only** ticked, at least twice.

For each run:

- [ ] The run finishes with a green tick, in about 3 to 6 minutes.
- [ ] An email about the new Issue arrives.
- [ ] The report shows the hard rules and the editor's scores.
- [ ] Read the article yourself:
  - [ ] Only approved facts about DJ MOSTAR, nothing invented
  - [ ] No prices, "Paket", VAT, clock times or "Hochzeits-DJ" with a hyphen
  - [ ] Correct "ihr" or "Sie" throughout
  - [ ] Links to the inquiry page, the homepage and 1 to 2 external sources
  - [ ] Photos fit the topic, and the alt texts describe them without naming Mo
- [ ] Note how much of your Claude Pro limit the run used.

A failed run is fine here, as long as the reason in the report makes sense. Send it to me if it doesn't.

Test runs always use the next planned topic, which stays the same until a live run uses it.

## 3. Before going live

- [ ] The Datenschutz text from `docs/datenschutz-blog.md` is on https://djmostar.de/impressum.
- [ ] You've decided on Pro or an API key (setup guide, Appendix B).
- [ ] Secrets exist: `CLAUDE_CODE_OAUTH_TOKEN`, `UNSPLASH_ACCESS_KEY`.
- [ ] The variable `CLAUDE_TOKEN_CREATED` holds the date the token was made.

## 4. First live week, with approval

This tests the parts a manual run can't: the scheduler starting runs as a bot, real Pull Requests, merging, deploying and the publish email.

1. Set the variables:
   - `AUTO_PUBLISH` = `false`
   - `DRY_RUN` = `false`
2. On the next generate day:
   - [ ] **Scheduler** starts **Generate article** after 09:00 Berlin time. It runs at about 17 minutes past each hour.
   - [ ] A Pull Request appears with the label `passed` or `needs-review`, with the quality report in its description.
3. Read the Pull Request. If it's good, add the label `approved`.
4. On the next publish day:
   - [ ] **Publish article** merges it, then **Deploy site** runs.
   - [ ] The article is live at its URL, with photos, photo credits and FAQ.
   - [ ] An email "Neuer Beitrag online" arrives with the link.
   - [ ] On Unsplash, the photos count a download.

If the generate run fails with a message about the actor or bot not being allowed, send me the run link. Nothing is published in that case.

## 5. Full automation

When week 4 worked:

- [ ] Set `AUTO_PUBLISH` = `true`.
- [ ] Apply for Unsplash production access, using a live article (setup guide, Part 11).
- [ ] Submit the sitemap in Search Console (setup guide, Part 9).

From then on, articles that pass are published automatically. Failed ones are skipped, and you get an email.

## If something goes wrong

| What you see | What to do |
|---|---|
| Red **Deploy site** after a change | Undo the last change, or send me the run link. The live site stays as it was. |
| An article is live but wrong | Set `DRY_RUN` = `true` to stop everything, then send me the link. |
| Email "Artikel übersprungen" | Nothing to do if it happens now and then. If it happens every time, send me the report. |
| Email "Claude-Anmeldung fehlgeschlagen" | Create a new token with `claude setup-token` and update the secret. |
| No runs for a long time | Check **Actions** → **Scheduler** for a "disabled" notice, and enable it. |
