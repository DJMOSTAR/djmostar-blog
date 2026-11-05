# DJ MOSTAR Blog: Setup Guide

Follow the steps in order. Do the parts in order. Part 11 has to wait for the first live post.

Button names can shift slightly when providers update their sites. If a label differs, look for the closest match.

| Part | What | Who | Time |
|---|---|---|---|
| 1 | GitHub account and repository | You | 10 min |
| 2 | GitHub repository settings | You | 5 min |
| 3 | DNS records at IONOS | You and Mo | 15 min, plus DNS waiting time |
| 4 | Unsplash developer app | You | 5 min |
| 5 | Claude Code token from your Pro plan | You | 10 min |
| 6 | GitHub email notifications | You | 5 min |
| 7 | GitHub secrets and variables | You | 5 min |
| 8 | Upload the site, custom domain and HTTPS | You | 15 min |
| 9 | Search Console | You | 5 min, after the first deploy |
| 10 | Datenschutz text on OnePage | You | 5 min |
| 11 | Unsplash production access | You | 10 min, after the first live post |
| Appendix A | Search Console API, only if you want it later | You | 15 min |
| Appendix B | Switch from Pro to an API key, only if you want it later | You | 10 min |
| Appendix C | Upload a new version of the files | You | 5 min |

**Keep these safe.** Save every key in a password manager while you work. Never put a key in a repository file, a chat, a screenshot or a Pull Request. The repository is public.

---

## Part 1: GitHub account and repository

1. Sign in to https://github.com as `DJMOSTAR`.
2. Confirm the account email address if GitHub asks you to.
3. Turn on two-factor authentication: click your profile picture (top right) → **Settings** → **Password and authentication** → **Enable two-factor authentication**. This account controls a live website, so don't skip this.
4. Click **+** (top right) → **New repository**.
5. Fill in the form:
   - **Repository name:** `djmostar-blog`
   - **Visibility:** **Public**
   - **Add README:** On
6. Click **Create repository**.

Your repository is now at `https://github.com/DJMOSTAR/djmostar-blog`.

---

## Part 2: GitHub repository settings

Open the repository and click **Settings** (the tab at the top of the repository).

### Let the workflows create Pull Requests

1. In the left sidebar, click **Actions** → **General**.
2. Scroll to **Workflow permissions**.
3. Select **Read and write permissions**.
4. Tick **Allow GitHub Actions to create and approve pull requests**.
5. Click **Save**.

Without this, article generation will fail when it tries to open its Pull Request.

### Publish through GitHub Actions

1. In the left sidebar, click **Pages**.
2. Under **Build and deployment** → **Source**, select **GitHub Actions**.

Leave **Custom domain** alone for now. That comes in Part 8.

### Clean up old article branches

1. In the left sidebar, click **General**.
2. Scroll to **Pull Requests**.
3. Tick **Automatically delete head branches**.

---

## Part 3: DNS records at IONOS

Mo adds the records, because you don't have DNS access. There are two records:

- **TXT:** proves to GitHub that the domain is yours, so nobody else can claim it for their own GitHub site. It covers `blog.djmostar.de` too and stays in place permanently.
- **CNAME:** points `blog.djmostar.de` to GitHub.

The main site on OnePage isn't affected, as long as no existing records are changed.

### Step 1: Ask Mo for a screenshot

Copy this to Mo:

> Hallo Mo, für den neuen Blog brauche ich einen Screenshot deiner aktuellen DNS-Einträge bei IONOS.
>
> So kommst du hin: Bei IONOS einloggen → **Domains & SSL** → bei **djmostar.de** auf **Aktionen** → **DNS**.
>
> Bitte schick mir die komplette Liste. Noch nichts ändern, danke!

### Step 2: Check the screenshot

| If you see | Do this |
|---|---|
| A record with the host `blog` (A, AAAA or CNAME) | Stop and find out what it's for. A CNAME can't normally share its host with other records. |
| A wildcard record with the host `*` | Don't delete it yet, because something may depend on it. Send me the screenshot first. GitHub strongly advises against wildcard records. |
| A **CAA** record on the root domain | At least one CAA record must allow `letsencrypt.org`, or the HTTPS certificate can't be issued. |
| Records for `@`, `www` or similar that belong to OnePage | Leave them alone. |
| The TXT record from your earlier Search Console verification | Leave it alone. Search Console can lose verification without it. |

### Step 3: Get the TXT value from GitHub

1. On GitHub, click your **profile picture** → **Settings**. This is the settings page for your account, not the repository.
2. In the sidebar, under **Code, planning, and automation**, click **Pages**.
3. Click **Add a domain**.
4. Enter `djmostar.de` and click **Add domain**.
5. GitHub now shows a TXT record. Copy its host name and its value.
6. Leave this page open.

GitHub's host will look like `_github-pages-challenge-DJMOSTAR.djmostar.de`. IONOS adds the domain itself, so Mo enters only the part before `.djmostar.de`.

### Step 4: Send Mo the records

Replace `HIER_DEN_WERT_VON_GITHUB_EINFÜGEN` with the value from GitHub, then send this:

> Hallo Mo, bitte lege bei IONOS für **djmostar.de** diese zwei Einträge an. Alles andere bitte nicht ändern.
>
> So geht's: **Domains & SSL** → bei djmostar.de auf **Aktionen** → **DNS** → **Record hinzufügen**.
>
> **Eintrag 1**
> - Typ: `TXT`
> - Hostname: `_github-pages-challenge-DJMOSTAR`
> - Wert: `HIER_DEN_WERT_VON_GITHUB_EINFÜGEN`
> - TTL: `1 Stunde`
>
> **Eintrag 2**
> - Typ: `CNAME`
> - Hostname: `blog`
> - Zeigt auf: `djmostar.github.io`
> - TTL: `1 Stunde`
>
> Wichtig: kein `https://` und kein `/` eintragen. Wenn IONOS einen Konflikt oder eine Warnung meldet, bitte nicht bestätigen, sondern mir einen Screenshot schicken. Wenn alles gespeichert ist, schick mir bitte auch einen Screenshot. Danke!

**If IONOS won't accept the CNAME:** IONOS also offers a route through subdomains. Go to **Domains & SSL** → gear icon next to the domain → **Manage Subdomains**, create `blog`, then open **DNS** for that subdomain and add the CNAME there.

### Step 5: Confirm and verify

IONOS says changes can take up to an hour to be seen everywhere. GitHub allows up to 24 hours for its TXT check.

1. Open these two links:
   - https://dns.google/query?name=_github-pages-challenge-DJMOSTAR.djmostar.de&type=TXT
   - https://dns.google/query?name=blog.djmostar.de&type=CNAME
2. Look under **Answer**. You should see the GitHub value in the first and `djmostar.github.io.` in the second. The dot at the end is normal.
3. Go back to the GitHub page from Step 3 and click **Verify**. If you closed it, go to **Settings** → **Pages**, click **…** next to the domain, then **Continue verifying**.

---

## Part 4: Unsplash developer app

1. Go to https://unsplash.com/developers and sign in, or create an account.
2. Click **Your apps** → **New Application**.
3. Read and accept the API guidelines.
4. Fill in the form:
   - **Application name:** `DJ MOSTAR Blog`
   - **Description:** `Automatisches Blog für DJ MOSTAR unter blog.djmostar.de. Fotos werden per Hotlink eingebunden und mit Namensnennung versehen.`
5. Create the application.
6. Scroll to **Keys** and copy the **Access Key**. You don't need the Secret Key.

The app starts in demo mode with 50 requests an hour, which is enough to get started. Part 11 covers production access.

---

## Part 5: Claude Code token from your Pro plan

All AI steps run through the official Claude Code GitHub Action, using your Claude Pro plan. You create a token once on your own computer. There's no API key, no billing setup and no per-article charge.

**Before you start:**
- Use the Claude account that holds the Pro plan.
- The blog uses that plan's limits, and your own Claude use draws on the same limits.
- The token stops working if the Pro plan ends. Appendix B shows how to switch to an API key.

### Check whether the `claude` command is available

The Claude app includes Claude Code in its **Code** tab, but the token can only be created with the `claude` terminal command. The app's documentation treats that command as a separate install, so check first.

1. Open your computer's normal terminal: **Terminal** on macOS, **PowerShell** on Windows.
2. Run:

   ```bash
   claude --version
   ```

3. If you see a version number, skip to **Create the token**.
4. If the command isn't found, install it below. This doesn't change or replace your Claude app.

### Install the `claude` command (only if needed)

**macOS or Linux**

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

**Windows PowerShell**

```powershell
irm https://claude.ai/install.ps1 | iex
```

The installer shows no progress while it downloads. When it finishes, open a **new** terminal window and run `claude --version` again. You should see a version number.

### Create the token

1. Run:

   ```bash
   claude setup-token
   ```

2. A browser window opens. Sign in with your Pro account and approve access.
3. The token appears in the terminal. Copy all of it right away, because Claude Code doesn't save it anywhere.
4. Close the terminal window.
5. Note today's date, because the token lasts one year. You'll enter it in Part 7.

Treat the token like a password. Anyone who has it can use your Pro plan's limits. It can only make model requests, not open your Claude chats or connectors.

Run this in your normal terminal, not by asking Claude in the app or a chat, so the token doesn't end up in a conversation. Part 7 shows where to paste it.

---

## Part 6: GitHub email notifications

There's no bot to set up. When something needs your attention, the system opens a GitHub Issue that mentions `@DJMOSTAR`, and GitHub emails you. You'll get one for each of these:

- A post went live, with its title and URL
- A post failed its checks and was skipped
- All limit retries failed
- The Claude token expires within 30 days, or stops working

The repository is public, so these Issues are public too. They contain no keys or tokens. Publish notices close automatically, while problems stay open until you close them.

### Turn on the emails

1. Sign in as `DJMOSTAR` and go to https://github.com/settings/notifications.
2. Under **Default notifications email**, check that the address is one you actually read. If you want these emails to go elsewhere, add and verify that address at https://github.com/settings/emails, then select it here.
3. Under **Subscriptions** → **Participating, @mentions and custom**, tick **Email**.

### Optional: phone alerts

Install the **GitHub** mobile app, sign in as `DJMOSTAR`, and allow notifications to get push alerts as well.

You'll test this during the dry run. If you see an Issue on GitHub but no email, check your spam folder and repeat the steps above.

---

## Part 7: GitHub secrets and variables

Go to the repository → **Settings** → **Secrets and variables** → **Actions**.

### Add the secrets

For each row: on the **Secrets** tab, click **New repository secret**, enter the name exactly as written, paste the value with no extra spaces or line breaks, and click **Add secret**.

| Name | Value |
|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | The token from Part 5 |
| `UNSPLASH_ACCESS_KEY` | The Access Key from Part 4 |

GitHub won't show a secret again after you save it. To change one, click its pencil icon and enter the new value.

### Add the variables

For each row: on the **Variables** tab, click **New repository variable**, enter the name and value, and click **Add variable**.

| Name | Value | Meaning |
|---|---|---|
| `AUTO_PUBLISH` | `true` | Posts that pass every check publish automatically |
| `DRY_RUN` | `true` | Test mode: generates a preview but opens no PR and publishes nothing |
| `CLAUDE_TOKEN_CREATED` | Today's date as `YYYY-MM-DD` | Lets the system warn you 30 days before the token expires |

**Keep `DRY_RUN` at `true` until you've finished the testing checklist.** It's what stands between your first test and a live post. The system treats a missing `DRY_RUN` as `true` too, so you must set it to `false` on purpose to go live.

---

## Part 8: Upload the site, custom domain and HTTPS

### Upload the files

1. Unzip `djmostar-blog.zip` on your computer.
2. Open https://github.com/DJMOSTAR/djmostar-blog.
3. Click **Add file** → **Upload files**.
4. Open the unzipped `djmostar-blog` folder and select **everything inside it**, including the `.github` folder and the `.gitignore` and `.eleventyignore` files. If you can't see those, turn on hidden files in your file manager.
5. Drag it all onto the GitHub page. Upload the contents, not the outer folder.
6. Wait for the file list to finish, then click **Commit changes**.
7. Check that `.github/workflows/deploy.yml` now exists in the repository. If it's missing, the folder didn't upload, so repeat with just `.github`.
8. Open the **Actions** tab and wait for **Deploy site** to show a green tick.

### Connect the domain

1. Go to the repository → **Settings** → **Pages**.
2. Under **Custom domain**, enter `blog.djmostar.de` and click **Save**.
3. Wait for the DNS check to show a green tick.
4. Once it's available, tick **Enforce HTTPS**. If the box is greyed out, the certificate isn't ready. Wait and try again later.
5. Open https://blog.djmostar.de and check that the padlock appears.

You don't need a `CNAME` file. GitHub ignores it when deploying through a custom workflow, so this setting is the one that counts.

---

## Part 9: Search Console

Your existing **domain property** `djmostar.de` already covers `blog.djmostar.de`, because domain properties include all subdomains. You don't need to verify anything new.

### Submit the sitemap

1. Go to https://search.google.com/search-console.
2. In the property selector (top left), choose **djmostar.de**.
3. In the sidebar, click **Sitemaps**.
4. Under **Add a new sitemap**, enter the full address: `https://blog.djmostar.de/sitemap.xml`
5. Click **Submit**.

It can take a while for the status to show **Success**, and new sites can take days or weeks to appear in results.

### See only blog traffic

1. In the sidebar, click **Performance** → **Search results**.
2. Click **+ Add filter** → **Page**.
3. Keep **URLs containing** and enter `blog.djmostar.de`.
4. Click **Apply**.

The filter resets, so bookmark the filtered page.

---

## Part 10: Datenschutz text on OnePage

Paste the text from `docs/datenschutz-blog.md` into the Datenschutz section on https://djmostar.de/impressum **before the blog goes live**.

---

## Part 11: Unsplash production access

Apply after the first post is live, because Unsplash needs to see the credits on a real page.

1. Take a screenshot of a live post showing the photo credit "Foto: [Name] auf Unsplash".
2. Go to https://unsplash.com/oauth/applications and open **DJ MOSTAR Blog**.
3. Click **Apply for production** and complete the form, using the blog address and your screenshot.

The blog keeps working in demo mode while you wait.

---

## Appendix A: Search Console API (optional, for later)

Skip this for now. The feature stays off until the secret below exists, and you can turn it on later with no code changes.

**This must be done with a Google account that owns the `djmostar.de` Search Console property.** If Mo's account owns it, he has to add the service account in step 4, or make you an owner first.

### 1. Create a Google Cloud project

1. Go to https://console.cloud.google.com.
2. Click the project picker (top left) → **New Project**.
3. Name it `djmostar-blog` and click **Create**, then select the new project.

### 2. Enable the API

1. Open **APIs & Services** → **Library**.
2. Search for **Google Search Console API**.
3. Click **Enable**.

### 3. Create the service account and key

1. Open **IAM & Admin** → **Service Accounts**.
2. Click **Create service account**, name it `blog-readonly`, then click **Create and continue** → **Done**. Don't give it any project roles.
3. Copy its email address, which ends in `.iam.gserviceaccount.com`.
4. Click the account → **Keys** → **Add key** → **Create new key** → **JSON** → **Create**.
5. A file downloads. It's a password in file form, so don't email it or commit it.

### 4. Give it read-only access

1. In Search Console, select **djmostar.de**.
2. Open **Settings** → **Users and permissions** → **Add user**.
3. Paste the service account's email address.
4. Set the permission to **Restricted**.
5. Click **Add**.

### 5. Add the secret

1. Go to the GitHub repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
2. Enter the name `GSC_SERVICE_ACCOUNT_JSON`.
3. Open the downloaded file in a text editor and paste its entire contents as the value.
4. Click **Add secret**, then delete the downloaded file from your computer.

The monthly report and Search Console topic ideas will then work from the next run. To turn them off again, delete the secret.

---

## Appendix B: Switch from Pro to an API key (optional, for later)

No code changes are needed. Every AI step goes through one shared file that passes both credentials. Claude Code uses an API key ahead of an OAuth token when both are present.

1. Go to https://platform.claude.com and sign in, or create an account.
2. Open **Settings** → **Billing** and buy credits. Leave **auto-reload off**.
3. Open **Settings** → **Limits**, click **Change Limit** and set a monthly limit. **This is your only spending stop**, because the blog system no longer has a dollar limit.
4. Open **Settings** → **API Keys** → **Create Key**, name it `djmostar-blog-github`, and copy it.
5. In GitHub, go to **Settings** → **Secrets and variables** → **Actions** → **New repository secret**, enter the name `ANTHROPIC_API_KEY`, and paste the key.
6. Delete the `CLAUDE_CODE_OAUTH_TOKEN` secret, so the setup is unambiguous.

To go back to Pro, reverse steps 5 and 6.

---

## Appendix C: Upload a new version of the files

Use this whenever you get a new `djmostar-blog.zip`.

1. Save the zip to **Downloads**.
2. Open PowerShell and paste this block:

   ```powershell
   cd $HOME\repo-fix
   git pull
   $zip = Get-ChildItem "$HOME\Downloads\djmostar-blog*.zip" | Sort-Object LastWriteTime | Select-Object -Last 1
   Remove-Item -Recurse -Force "$HOME\blog-files" -ErrorAction SilentlyContinue
   Expand-Archive -Path $zip.FullName -DestinationPath "$HOME\blog-files" -Force
   Test-Path "$HOME\blog-files\djmostar-blog\src\_includes\base.njk"
   ```

3. The last line must print **True**. If it doesn't, stop.
4. Paste this block:

   ```powershell
   Copy-Item -Path "$HOME\blog-files\djmostar-blog\*" -Destination . -Recurse -Force
   git add -A
   git commit -m "Update the blog files"
   git push
   ```

5. Open the **Actions** tab and check that **Deploy site** goes green.

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| GitHub's **Verify** fails | The TXT record hasn't spread yet, or the host was entered with `.djmostar.de` | Check the first link in Part 3, Step 5. Try again later, up to 24 hours. |
| **Deploy site** shows a red cross | The build or site check failed | Open the failed run and copy the error message. No secrets appear in it. |
| Site shows "There isn't a GitHub Pages site here" | The custom domain isn't saved, or no deploy has succeeded | Check Part 8 and the **Actions** tab. |
| **Enforce HTTPS** stays greyed out | The certificate is pending, or a CAA record blocks it | Wait, then check for CAA records. See the table in Part 3, Step 2. |
| Workflow error mentioning a Pull Request or permissions | Part 2 settings are missing | Repeat "Let the workflows create Pull Requests". |
| Claude step fails with a login or authentication error | The token is wrong, expired or revoked, or the Pro plan ended | Repeat "Create the token" in Part 5, update the secret, and update `CLAUDE_TOKEN_CREATED`. |
| An Issue says the Pro limit was reached | Your Pro usage ran out | The system retries later that day, up to 3 times. If all fail, that article is skipped. Nothing partial is published. |
| Claude step reports the model isn't available | Your plan doesn't include the model set in `config/content.yml` | Change the model in `config/content.yml`. |
| Unsplash error 401 | The Secret Key was used instead of the Access Key | Update the secret with the Access Key. |
| Issues appear but no email arrives | Email is off for participating notifications, or it went to spam or another address | Repeat Part 6 and check your spam folder. |
