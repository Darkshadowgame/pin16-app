# Pin16 security and privacy review, 23 Nov 2026

Method: read-only review of the tracked tree at HEAD, `private/publish_public.sh`, both workflows and the car-write paths, with the audit-as-prod-readiness lens. The security-review skill failed to start (it needs an `origin/HEAD` ref that does not exist here), so a standard review was done by hand. No file with "key" or "token" in its name was opened. `src/share/secrets.ts` was read; it holds no secret value. Searches of all 86 commits on `master` and `public-main` for token, key and PEM patterns found nothing (counts only, no values shown).

Not findings (owner's choice): coding switches write at once with no confirm; faults clear with the engine running.

**SECURITY AND PRIVACY: 5 / 10.** One high and seven medium findings. The code itself is careful: no secret is committed, the car-write paths read back and restore, and the publish script fails closed on most patterns. The score drops because the upload credential ships inside the app.

---

## Findings

### 1. HIGH: the upload token is built into the app and its public builds

- Where: `.github/workflows/build-sideload.yml:55-62` (the repository secret is put in `EXPO_PUBLIC_UPLOAD_TOKEN`), `src/share/secrets.ts:13-15` (read from `process.env` into the JavaScript bundle), `src/share/github.ts:18-25`, `src/share/sendBack.ts:36-43` (sent as a Bearer token). Reachability: `docs/SIDELOAD.md:32` says the app is built in the public `pin16-app` repo and attached to a release; `src/version.ts:17` links to that repo's releases; the release job is `build-sideload.yml:322-345`; the OTA update URL and project id are in the tracked `app.json` (`updates.url`).
- How it goes wrong: any `EXPO_PUBLIC_` value is a plain string in `main.jsbundle`. Anyone can download the release IPA (or the update bundle from the public update URL) and read the token with `strings`. This holds if the secret is set in whichever repo runs the build. I cannot see the repo settings, so the owner needs to confirm that.
- Scope of a leaked token, from the code only: `github.ts` uses it to list the whole tree of `Darkshadowgame/pin16-data` (`/git/trees/HEAD?recursive=1`), read any file, and create or replace any file (`PUT /contents`, with the current sha, so it overwrites). So a holder can read every upload (full VINs, registration, typed notes, adapter logs) and write or forge any file, including `kb/entries/*` that every install pulls on launch (finding 2). The token type, expiry and whether it is limited to that one repo are not visible in the code. The comment in `sendBack.ts:4-5` says "write access to the private findings repo only"; that is the intended limit and needs checking in GitHub.
- Fix: keep the token out of the bundle. Options: type it in Settings (SecureStore, as the code already supports); or send uploads to a small relay you control that holds the token, accepts create-only writes and rate-limits. If any IPA or update was built with the secret since 14 Nov, rotate the token now and delete old releases and artifacts.

### 2. MEDIUM: knowledge entries pulled from the data repo are trusted without checks

- Where: `src/kb.ts:104-105` (only `id` and `title` are checked), `src/app/knowledge.tsx:151-152` (`e.sources.map`, then `Linking.openURL(s.url)`), `src/app/car-ids.tsx:129,179,235` (stored source URLs opened as given), `src/kb.ts` `kbSettings` (casts `data.module`, `data.byte`, `data.bits`).
- How it goes wrong: with the token from finding 1, an attacker writes a `kb/entries/` file. Every install then stores it. A missing `sources` array crashes the Knowledge screen on open; a `url` with any scheme (`tel:`, `sms:`, a phishing page) opens from a tap that looks like a source link. The coding items are read-only notes today, so no write to the car follows, but that depends on `kbSettings` never being offered as a switch.
- Fix: validate each entry (string lengths, `sources` is an array, `url` starts with `https://`, `kind` in the allowed list) before storing it; apply the same `https://` check before every `Linking.openURL` of stored data.

### 3. MEDIUM: a link from outside the app can write an adjustable value with no confirm

- Where: `app.json:72` (scheme `caristini`), `src/app/customise/index.tsx:60-63` (the `restore` URL parameter), `:196-207` (adaptation restore calls `changeAdaptRef.current(... putBack ...)` straight away). The coding restore at `:210-220` opens the confirm sheet; the adaptation one does not.
- How it goes wrong: another app, a web page or a QR code can open `caristini://customise?restore=<adaptation key>`. If the car is connected, the key has a saved original (`codingOriginal`) and the live value differs, `saveAdaptation` runs with no tap. The owner's "no confirm on switches" choice covers taps inside the app, not a trigger from outside. Effect is limited to putting back a saved original, but the owner did not ask for it.
- Fix: ignore `restore` when it arrives from a URL (pass it through in-app navigation state, or add `src/app/+native-intent.tsx` that drops external `restore`); or show the same ConfirmSheet for the adaptation case.

### 4. MEDIUM: no check that the connected car is the saved car before a write

- Where: `src/state.tsx:167-180` (a car that gives no VIN is matched to the most recently seen `noObdVin` car, source `remembered`); `src/components/WhichCar.tsx:15-36` (shows a prompt, blocks nothing); write paths `src/coding/apply.ts:22-34`, `src/app/customise/index.tsx:300-302`, `src/app/workshop/[id].tsx:255-261`, `:617-619`.
- How it goes wrong: with an unread VIN, a second car is treated as the first. "Put back original" and "put back from history" then write the first car's saved coding to the second car's module when the length matches. The only guard is that the live value equals what was just read (`src/obd/elm.ts:2420-2423`, `:2315`), which says nothing about whose car it is. The module identity check `TP20_EXPECT` (`elm.ts:36-49`) covers 7 module ids on TP2.0 only, has patterns matching only the owner's Leon for the engine and climate modules, and passes when the module gives no identity text (`elm.ts:2314`, `src/obd/kwpAdapt.ts:92-94`). UDS writes (`writeDid`) have no identity check.
- Fix: before any write, when `vinSource` is not `car`, require the owner to confirm the car by name; for restore and put-back, compare the module part number (already saved in `ids.modules`) with the live one and refuse on a mismatch. Make the identity check fail closed when identity text is empty for modules that have a pattern.

### 5. MEDIUM: only the adapter log has a sending switch

- Where: `src/settings.tsx:53` and `src/app/settings.tsx:127` (`autoSendLog`, read in `src/share/sendLog.ts:211`); ungated `sendBack` calls: `src/app/listen.tsx:83`, `src/app/customise/learn.tsx:147,179`, `src/app/sensors.tsx:181` ("Always tried"), `src/components/NameValue.tsx:37`, `src/app/discover.tsx:169,223`, `src/kb.ts:77`; `src/app/_layout.tsx:31` flushes the outbox on every launch.
- How it goes wrong: with "Send the log automatically" off, sensor results, Listen recordings, Learn from Carista before/after codings, discovered modules and named values still upload. Learn my car has its own per-run switch (`learn-car.tsx:72,291`), which works. `settings.tsx:169` states "Sending works the same with this section hidden", so there is no way to stop sending short of removing the token. Items queued before a switch-off still go on the next launch.
- Fix: one `sendFindings` setting checked inside `toGitHub` and `flushOutbox`; when off, keep items in the outbox and do not send them. Show the setting outside Developer options.

### 6. MEDIUM: uploads carry personal data that no setting covers

- Where: `src/share/sendBack.ts:164-166` (full VIN in the repo path, file name and commit message); `src/components/NameValue.tsx:37-47` (typed name and free-text note sent verbatim); `src/app/settings.tsx:326-337` ("saved" upload sends `ids`, `codingBackup`, `knowledge`); `src/vehicle/ids.ts:31` (registration is a field in `ids.codes`), `ids.ts:15` (module serials), `ids.notes`; `src/vehicle/garage.tsx:174-177` and `discover.tsx:170`, `runLearn.ts:692` (`car.title` is the nickname, which may be a name or plate); `src/obd/trafficLog.ts` (raw adapter lines include the `49 02` VIN reply and module serials).
- GPS: no `sendBack` caller includes a position. The route leaves the phone only through the share sheet (`src/logger/store.ts:107-114`) when the owner taps it. Nothing found there.
- How it goes wrong: the data repo is private, so the exposure is to whoever holds the token (finding 1) or the repo. Registration and notes in particular are not needed to build the next version.
- Fix: send an allowlist of fields; drop `ids.codes.registration`, `ids.notes` and the nickname; use a per-install id in the path and keep the last 8 characters of the VIN only, as the file name already does; mask the VIN and serial bytes in `trafficLog.unsentText`.

### 7. MEDIUM: secrets are in the environment of every workflow step, and actions are not pinned

- Where: `build-sideload.yml:55-64` (workflow-level `env`), `:96-97` (`npm ci` runs with them), `:103-104` (tests), `:106-120` (`EXPO_TOKEN` with `npx --yes eas-cli@latest`), action tags `@v7`, `@v6` and others at `:79,91,131,143,168,249,265,277,284,298,313,331` (tags, not commit SHAs).
- How it goes wrong: any npm install script or test code, or a retagged action, can read both app secrets and `EXPO_TOKEN`. `eas-cli@latest` is unpinned. `CLAUDE_API_KEY` is exported (`:62`) but no source file reads `EXPO_PUBLIC_CLAUDE_KEY` (the only user was `src/ai/claude.ts.old`), so it adds exposure for no use. Nothing is echoed to the logs; secrets are masked; `check.yml` uses none, has `contents: read` and runs on `pull_request` only. Run steps use no untrusted input (the commit subject goes through `$( )` into a quoted argument, which is safe).
- Fix: delete the Claude key line; move the token line to the single build step that needs it; pin `eas-cli` to a version; pin actions to SHAs.

### 8. MEDIUM: updates are unsigned and any push to main or master ships to the phone

- Where: `build-sideload.yml:27-33` (push trigger), `:106-119` (publish to the `production` channel), `app.json:73-82` (no `codeSigningCertificate`).
- How it goes wrong: whoever can push to `main` or `master`, or holds `EXPO_TOKEN`, can ship JavaScript to the owner's phone on its next launch. That code can write codings to the car and read stored data. Nothing on the phone checks a signature.
- Fix: turn on EAS code signing for updates; protect the branch and put the OTA job behind a GitHub Environment with a required approval.

### 9. LOW: the publish scan missed a first name that is already public

- Where: `private/publish_public.sh:15`; `__tests__/functionalityB.test.ts:235,240-243` ("[owner’s first name]’s Cupra", also present in `public-main`).
- How it goes wrong: `git grep -E "\bNAME\b"` did not match "[first name]’s" (curly apostrophe) on this machine, so the scan passed. A real first name with the car model is now in the public repo.
- Fix: change the fixture to "Test Cupra"; make the pattern `b<first name>b` without `\b`, or `b<first name>b([^a-z]|$)`; republish a clean snapshot (a new commit does not remove the old one; follow the clean-repo rule if this matters).

### 10. LOW: gaps in the other scan patterns

- Where: `publish_public.sh:15-21`.
- Gaps found:
  - No UK registration pattern at all (for example `[A-Z]{2}[0-9]{2} ?[A-Z]{3}`).
  - VIN pattern (`:17`) needs six final digits, is upper-case only, and drops a whole line if it contains `0000[01]` or `123456` anywhere, so a real VIN sharing a line with one of those passes. Whole files are exempt (`vagFaults.ts`, tests `gateway`, `tp20`, `vinFallback`, `simTransport`).
  - Names: only the listed words; a surname, other person, address, postcode or phone number is not scanned.
  - Secrets: no `gho_`, `ghs_`, `AKIA`, or unprefixed Expo and generic tokens.
  - Under `set -o pipefail`, `git grep ... | head -5 | grep . && block` can pass on large match output, because `git grep` is killed by SIGPIPE when `head` exits and the pipeline status is then non-zero (reproduced with a test pipeline).
- Fix: add the missing patterns; apply the VIN exclusions to the matched string, not the line; replace the pipelines with `out=$(git grep ...) || true; [ -n "$out" ] && block`.

### 11. LOW: files the script copies that should stay private

- Where: `publish_public.sh:21` (block list); tracked `replica/` (60+ research and review files), `.claude/`, `.impeccable/`.
- How it goes wrong: nothing sensitive was found in them today, but they are internal notes, and the block list does not cover images. New screenshot folders already exist untracked (`replica/review-2026-11-20/shots/`, `replica/brand/shots/`, `replica/ux-review-2026-11-16/`, `replica/brand/png/`). Screenshots of the app can show a VIN or registration, and the text scan cannot read pixels. `recording-review-cupra/` is blocked by name; the others are not.
- Fix: block `\.(png|jpe?g|heic|mp4|mov)$` outside `assets/`, and `replica/.*/shots/`; consider keeping `replica/` and `.claude/` out of the public tree.

### 12. LOW: upload status handling and VIN in the URL

- Where: `src/share/sendBack.ts:44-45` (422 counts as sent), `:39` and `:166` (VIN placed in the URL path without encoding), `src/obd/elm.ts:991-1003` (`readVin` accepts any 17 characters from 0x30 to 0x5A, which includes `?`, `#`, `:`).
- How it goes wrong: the file name has one-second resolution, so two sends of the same kind in one second collide; GitHub also returns 422 for other rejections (invalid or oversized content). Both are treated as "already there", the data is lost and the item leaves the outbox. A VIN from a faulty adapter containing `?` or `#` truncates the request path. `github.ts` already uses `encodeURI`; `sendBack.ts` does not.
- Fix: add a short random suffix to the file name and treat 422 as sent only when the response says the file exists; check `isValidVin` before using a read VIN as a key; `encodeURI` the path.

---

## Answers to the six questions

1. Credential route: build-time `EXPO_PUBLIC_UPLOAD_TOKEN` from a repository secret into the JavaScript bundle (not Constants, not committed source). The tracked tree and all 86 commits are clean. The built app, release IPA and OTA bundle are readable; scope is read, create and overwrite on the data repo (finding 1).
2. VIN, registration, notes and value names are not covered by a sending setting, except the adapter log (finding 5). Yes, uploads happen with sending off. No GPS is uploaded.
3. Script gaps and files: findings 9, 10 and 11.
4. Workflow: findings 7 and 8. Permissions are `contents: read` by default with `contents: write` only on the release job; no untrusted input in run steps; no secret echoed.
5. Car writes: findings 3 and 4. Every other path reads back, restores and confirms where a stored hex is applied (history put-back checks length only, and the typed hex is validated when typed, not again at write: low, covered by the confirm sheet).
6. Deep links: finding 3; URLs opened from stored or synced data: finding 2; the VIN is also copied to the clipboard before opening a parts site (`car-ids.tsx:234`), readable by other apps.


## Fixes applied

Checked with `npx tsc --noEmit` (clean) and Jest (785 tests passed, 57 suites). Nothing was run on a phone or a car. No commit. `src/obd/tp20.ts` was not changed.

| # | Result | What was done, or why it was left |
|---|---|---|
| 1 | Left | The upload token in the bundle: the owner decides (type it in Settings, or a relay). Rotate the token if a build used it since 14 Nov. |
| 2 | Fixed | `cleanKbEntry` in `src/kb.ts` checks every entry before it is stored or loaded (string lengths, kind in the list, `sources` an array, `https://` only). `openWeb` (`src/openWeb.ts`) opens only `https://` links from stored data. |
| 3 | Fixed | The adaptation restore from `customise?restore=` no longer writes. It shows a line pointing at Put back original, which the owner taps (`src/coding/restoreLink.ts`). The coding restore still opens its confirm sheet. A test reads the effect and checks it has no write call. |
| 4 | Part fixed | `conn.verifyCar()` runs before every write to a module (coding, adjustable values, basic setting, service reset, fault clear, Workshop) when the VIN was not read from the car in this connection: it reads the VIN (OBD, then the modules), once per connection, and refuses on a mismatch. A car that gives no VIN at all cannot be checked and goes through. Left: comparing module part numbers and failing closed on empty identity text in `elm.ts` (`TP20_EXPECT`, `writeDid`). |
| 5 | Fixed | New switch Send findings (Settings, What leaves this phone, outside Developer options). Off: `sendBack` sends and queues nothing for sensors, Listen, Learn compare and learned, named values, Discover and Learn my car; `flushOutbox` leaves waiting files alone. A button the owner taps (Send each car's saved findings, Discover send, Send waiting files) still sends. The adapter log keeps its own switch. The switch is applied after the saved settings load, before the start-up flush. |
| 6 | Part fixed | Uploads drop the registration, the notes kept with parts and IDs, and the car nickname (`scrubForUpload`). Left: a per-install id and last-8-characters VIN in the path (it changes how the findings repo is laid out, the owner's call), a field allowlist for typed value notes, and masking the VIN and serial bytes in the traffic log. |
| 7 | Left | Workflow change. |
| 8 | Left | Workflow, EAS and `app.json` change. |
| 9 | Fixed | The name pattern is the first name followed by a non-letter, so a first name before any apostrophe is caught and a word such as NAMElips is not. The fixture the named fixture is now "Test Cupra" in `__tests__/functionalityB.test.ts`. The scan reads the committed tree, so it still blocks until this is committed. |
| 10 | Fixed | Added: UK registration (in code, tests and docs), phone number, UK postcode with country, more token prefixes, long quoted secrets, lower-case VINs. The VIN exemptions apply to the matched text. Every scan collects its output first, so no pipeline is cut short by `head`. File-level exemptions remain for hex test data (`tp20`, `gateway`, `vinFallback`, `simTransport`) and `vagFaults.ts`. A copy of the old script is `private/publish_public.sh.old`. |
| 11 | Fixed (script) | The block list now stops pictures and video outside `assets/` and any `/shots/` folder. Keeping `replica/` and `.claude/` out of the public tree is left for the owner to decide. |
| 12 | Fixed | File names carry a random suffix; 422 counts as sent only when the reply mentions the missing sha; the path is encoded and a VIN with odd characters is cleaned before use. `elm.ts` `readVin` was not changed. |
