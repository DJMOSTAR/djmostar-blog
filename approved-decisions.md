# DJ MOSTAR Blog: Approved Decisions

Approved by the developer on 2026-11-05. These add to the project instructions. Where the project instructions mention the pay-per-use Anthropic API, the AI authentication section below applies for now.

## Added facts
Use the wording closely. Do not use older page text.

- **Wedding booking time:** "Idealerweise empfiehlt sich eine Buchung 6 bis 12 Monate im Voraus. Kurzfristige Anfragen sind aber jederzeit willkommen, da auch spontan noch Termine verfügbar sein können."
- **Corporate and Weihnachtsfeier booking time:** "Am besten etwa 6 Monate vorher anfragen, aber manchmal geht es auch kurzfristig, wenn noch ein Termin frei ist."
- Mo is bookable on all weekdays. Never write "Samstage im Sommer".
- First-person statements are limited strictly to approved facts, because Mo does not read posts before they go live.

## Publishing
- Fully automatic: `AUTO_PUBLISH=true`. Generate Mon/Thu 09:00 Berlin, publish Tue/Fri 10:00 Berlin.
- A post needs every hard rule to pass and an AI score of at least 85.
- After 2 failed regenerations: do not publish, label `needs-review`, skip the slot, notify with the reason.
- After each publish: notify with title and live URL.
- `DRY_RUN=true` during setup. A missing `DRY_RUN` counts as `true`.
- With `AUTO_PUBLISH=false`, generation stops once 2 drafts are waiting.
- Limit: 10 articles a month. The dollar-based cost guard is removed.

## Architecture
- Eleventy and Node.js in the public repo `DJMOSTAR/djmostar-blog`, deployed to GitHub Pages at `blog.djmostar.de`.
- An hourly `scheduler.yml` reads `config/schedule.yml` and starts generate, publish and report once per slot.
- `publish.yml` starts the deploy directly. There is no CNAME file; the domain is set in Settings → Pages.
- Only bot-created `post/*` branches can auto-merge.
- Duplicate checks use a local text-similarity score. This is not an internet plagiarism check.
- FAQ schema stays, but Google no longer shows FAQ rich results.
- Notifications: no Telegram (removed 2026-11-05). The system opens a GitHub Issue mentioning `@DJMOSTAR`, and GitHub emails the account. Publish notices close automatically; problems stay open. Sending goes through `scripts/lib/notify.js`, and workflows need `issues: write`. GitHub's own workflow emails aren't used, because scheduler-started runs aren't triggered by a person. Issues are public, so they must never contain secrets.

## AI authentication
- All AI steps use `anthropics/claude-code-action@v1` with `claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}`, on the developer's Claude Pro plan. No API key for now.
- If a run fails because a limit is reached: retry later the same day, up to 3 times, then notify. Never publish a partial article.
- One shared step, `.github/actions/claude-step/action.yml`, also passes `anthropic_api_key`. Adding `ANTHROPIC_API_KEY` switches to API billing with no code changes.
- Terms question raised with the developer on 2026-11-05: the Pro terms and Claude Code's credential rules may not fit client production work. Their decision is pending. Build as requested.
- Limit retries: about 2.5, 5 and 7.5 hours after the slot, configurable in `config/schedule.yml`. A limit retry restarts the article from the beginning.

### Technical consequences
- AI steps are workflow steps, not Node API calls. Node scripts prepare inputs and validate outputs. `scripts/lib/anthropic.js` and `data/cost-log.json` are dropped.
- Claude gets no shell and no write access to GitHub. Its work is returned through a JSON schema. A separate non-AI step validates it and only then commits, so a partial article can't reach a branch.
- A regeneration or a limit retry is a new run of `generate.yml` with an attempt number. `data/slot-state.json` tracks slots and retry times, read by the hourly scheduler.
- The action needs `allowed_bots: "github-actions[bot]"`, because the scheduler starts it. `show_full_output` stays off, because Actions logs are public. The execution file is never uploaded.
- Pass `github_token`, so the broad Claude GitHub App isn't needed.
- Publishing needs no AI, so a reached limit doesn't block a post that has already passed.
- Warn 30 days before the one-year token expires, using `CLAUDE_TOKEN_CREATED`.

## Search Console
Off by default, including reports, ranking tracking, topic ideas and old-post suggestions. Topic research uses Google autocomplete only. It turns on when `GSC_SERVICE_ACCOUNT_JSON` exists, with no code changes.

## Privacy
No tracking, no cookies, no banner. Fonts are self-hosted. Unsplash images are hotlinked and covered in the Datenschutz text. Schema uses `areaServed` only, with no street address.

## Site details
- **Inquiry links:** `https://djmostar.de/hochzeit` and `https://djmostar.de/firmenfeier`, no anchors for now. Editable in `config/site.yml`.
- **Über mich, Galerie, FAQ:** `https://djmostar.de/` for now. Editable in `config/site.yml`.
- **WhatsApp:** `https://wa.me/message/NKVCGG2LGUV2J1`. Phone shown separately as a `tel:` link: +49 175 4193485.
- **Social:** `https://www.instagram.com/dj.mostar/`, `https://www.facebook.com/p/Djmostar-61574678697365/`, `https://www.tiktok.com/@dj.mostar`, `https://www.youtube.com/@DJ-MOSTAR`
- **Footer:** "Dein DJ für unvergessliche Hochzeiten & Firmenevents in Hamburg und Umgebung.", info@djmostar.de, phone, social links, Impressum/Datenschutz link to `https://djmostar.de/impressum`, "© DJ MOSTAR". The forbidden-phrase check applies to article text, not this fixed footer.
- **AI note:** config switch, on by default, at the end of each post: "Dieser Beitrag wurde KI-gestützt erstellt und automatisch geprüft." Final decision to be confirmed with Mo.

## Design
Built from the live site screenshots received 2026-11-05. They take priority over the earlier mockups.
- Gold text on cream: `#7A5F22`. Brand gold `#C9A55C` on black. Dark text on gold buttons and the WhatsApp button.
- Cream `#F3EDE1`, black `#0A0A0A`, header and footer `#000`, pills `#E8D7A8` with dark text.
- Oswald 700, Playfair Display italic 700 for accent words, Roboto for body text, all self-hosted.
- Hero titles are uppercase. Section headings and article H2/H3 use normal case, as on the live site. The developer's written spec said uppercase for headlines, so this is flagged to them.
- Hero: white title, Oswald subline, white rule, no gold in the title. FAQ accent word: dark italic with a beige highlight.
- Header: full logo, Hochzeit, Firmenevents, Über mich, Galerie, FAQ, Blog (active), social icon boxes from 1140px, gold ANFRAGE button. Hamburger menu on mobile.
- Footer: logo, tagline, link to djmostar.de, Kontakte with email, phone and social icons, "© DJ MOSTAR", Impressum/Datenschutz link. The Top DJ Service badge is left out because no file or facts were supplied.
- Logo: `src/assets/logo.jpg`, the supplied file scaled to 600×270 with its black background. Favicon: the vinyl mark.
- The blog index hero stays plain black until `index_hero` is set in `config/site.yml`.

## Open items
- Homepage and phone screenshots of the live site. Only desktop /hochzeit and /firmenfeier have arrived.
- A sharper logo file (SVG or transparent PNG), if Mo has one.
- Set `index_hero` with a real Unsplash photo once the Unsplash script exists.
- Section anchors for Über mich, Galerie, FAQ and the inquiry forms.
- Mo's final decision on the AI note.
- The developer's decision on Pro versus an API key for client work.
- Confirm in a dry run: bot actor allowed, `github_token` works without the Claude GitHub App, the model is available on Pro, and limit errors are detected.
