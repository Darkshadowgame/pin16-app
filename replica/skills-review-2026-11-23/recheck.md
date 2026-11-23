# Re-check of the fixes, 23 Nov 2026

Review only. Nothing edited except this file. No build, tsc, Jest, browser or commit. Nothing was run on a phone or a car, so VoiceOver and timing points come from reading the code.

## What was sampled and holds

Opened in code and found fixed as the "Fixes applied" tables say:

- Security 4 (`src/vehicle/identity.ts`, `src/state.tsx:264`, callers in Customise x2, Workshop x2, service reset x2, calibrations, diagnostics clear). A car that gives no VIN at all is let through, as the report says. No confirm was added and Customise switches still write at once (`customise/index.tsx:662` calls `run` from the switch).
- Security 3 (`src/coding/restoreLink.ts`, `customise/index.tsx:213`): the link only sets a message. The Put back original button at `customise/index.tsx:845` still writes by tap.
- Security 5 and 12 (`sendBack.ts`): `sendingOn` starts true, `DEFAULTS.sendFindings` is true, `!== false` is used everywhere, the start-up flush waits for the saved settings (`_layout.tsx` `StartUp`), the manual buttons pass `manual` or `flushOutbox(true)`. Today's behaviour is kept. The 422 check matches GitHub's "sha wasn't supplied" reply.
- Engineering 2, 3, 4 (`garage.tsx`, `storageRead.ts`, history, diary, emissions, DPF, knock, MOT, monitors, discovery, KB, outbox, settings): a failed read skips the write, a first run with nothing stored (null raw) returns empty and saves, damaged text is copied to `.damaged` first. `diary` and `history` run in turn.
- Engineering 1, 6 (`LiveScreen.tsx`, `dashboard.tsx`): every series, hist and stats update builds a new object (`push`, the spread in `setHist` and `setStats`), so the shallow `React.memo` compare cannot show a stale reading. Props to `LiveTile` and `DashTile` are stable or change with the data. Hooks sit above the early return.
- Charts throttle (`Charts.tsx`): `emit` is reset on grant, `pan` rebuilds when `span` changes, so no stale span. Route view resets `lastIdx` on grant.
- Layout and accessibility (`ui.tsx`, `CodeRow.tsx`, `ListRow` split, `Stepper`, `ToggleRow`): no Pressable lost its `onPress` (diff of removed against added `onPress` lines checked file by file). `right` controls in a `control` row are siblings of the row Pressable, so touch reaches them. `Stack.SearchBar` exists in the installed expo-router 58.0.30.

## New verified findings

| # | Where | Trigger | Effect | Fix | Severity |
|---|---|---|---|---|---|
| 1 | `src/vehicle/identity.ts:25-34`, `src/state.tsx:179-215`, `src/obd/elm.ts:991-1025` | First write (Customise switch, Workshop, service reset, fault clear) of a connection when the saved VIN came from the modules (`source` is `modules`), was remembered (`remembered`, every later connect of a car with no OBD VIN, such as the 2007 Leon) or was typed (`owner`). | The check reads the VIN again before the write: OBD 09 02 with a 6000 ms timeout on a car that never answers it, then `readVinFromModules` (UDS 22 F190 with a 1500 ms wait, then TP2.0 sessions to 0x01 and 0x07). The first switch of each connection waits several seconds with only the busy spinner. `state.tsx:182` already says asking the modules takes 30 to 60 commands, which is why connect skips it for a remembered car. Case `modules` is the same VIN read seconds earlier, so the re-read adds nothing. | Treat `modules` like `car` (return null). For `remembered` and `owner`, skip the 09 02 request (it already failed at connect) and read the modules in the background after connect, caching the result, so the first write only awaits a finished read. | Medium |
| 2 | `src/vehicle/identity.ts:34` | First check of a connection fails for a passing reason (ignition off, adapter busy, one dropped frame): the `catch` or a null reply stores `null` in `readIn`. | The check is silently off for the rest of the connection. Fails open, which matches "a car with no VIN goes through", but a wrong car is then not caught after one hiccup. | Do not cache a thrown or empty read; cache only a valid VIN. | Low |
| 3 | `src/vehicle/identity.ts:36-37` | Owner-typed or remembered VIN differs from the VIN held by the engine or cluster (a swapped cluster or engine computer, a VIN typed from the log book). | Every write is refused with "not the right car". The message gives both tails and says to pick the right car on the Car tab, so the owner can retype the VIN, but there is no "use this car anyway". | Offer a one-tap accept that stores the module VIN for the connection, or say how to retype the VIN. | Low |
| 4 | `src/kb.ts:74-77`, `:163` | A stored or synced entry fails `cleanKbEntry` (empty `car.make`, `kind` missing from the list) and one new entry arrives. | `loadKbStrict` drops the bad entry and `storeKb(list)` writes the shortened list, so the entry is gone for good (no `.damaged` copy). Also `e.kind as string in KB_KIND_LABEL` (line 52) accepts `constructor` and `toString`. | Keep the rejected raw entries aside, or only filter when reading for display. Use `Object.hasOwn`. | Low |
| 5 | `src/discover.ts:171` | Stored discovery text that cannot be parsed. | Counted as nothing stored and the next save replaces it, with no `.damaged` copy (the other stores keep one). | Copy the text to `<key>.damaged` before returning the empty discovery. | Low |
| 6 | `src/ui.tsx:1285-1292` (`ProgressBar`), `src/ui.tsx` `Notice`, `customise/index.tsx:461`, `:653` | A bar reused for a second run; a Notice or Customise result with a live region that also calls `announce`. | The bar says nothing on the second run because `spoken` never resets when `pct` falls. On Android a result is spoken twice (live region plus `announceForAccessibility`). A Notice with an ok or danger tone that is on screen at open is announced on mount. | Reset `spoken` when `pct` drops; use the live region or `announce`, not both; skip `announce` on first mount. | Low |
| 7 | `src/app/customise/index.tsx:336`, `:489` | Non-durable `garage.update` for `codingCache` after a write, and the app is killed within about 1 second. | Put back then decides from a cache older than what the module holds. The write, History and diary are saved at once, so only the cache is stale. | Pass `{ durable: true }` on these two updates (the write has happened, so a short wait costs nothing). | Low |
| 8 | `src/app/learn-car.tsx:285`, `src/learn/runLearn.ts:690` | Settings, Send findings off, then Learn my car with "Send what this run finds" on. | The row says "On: sent when the run ends" but `sendBack` refuses. The result note then says sending is off, so the owner is told, just after the wrong promise. | Subtitle: "On: sent when the run ends, if Send findings is on in Settings". | Low |
| 9 | `src/app/customise/index.tsx:206-214` | Put back for an adjustable value opened from History. | Needs a second tap on a button further down the page, and the page does not scroll to it. Intended by Security 3, but it is two taps where a switch is one. | Scroll to the row, or open the same confirm sheet the coding put back uses. | Low |

No high findings. No Pressable without an `onPress`. No stale-reading path in the memoised tiles.

## Scores (8 = solid, no high and only a few low or medium)

| Area | Score | Why |
|---|---|---|
| EXPO FIT | 8 | Native tabs, header search bar, large title, keyboard insets, `useIsFocused` for polling. Header search and a sheet route left by choice. |
| LOOKS | 7 | Contrast and tokens fixed, tile grid and groups reordered. Not seen on a phone; several design items left with reasons. |
| CONSISTENCY | 8 | One `Toggle`, `ToggleRow`, `Stepper` and `type.*` set. A few rows still use their own layout. |
| ACCESSIBILITY | 8 | Rows split into separate controls, adjustable stepper, announcements. Finding 6 and the unlisted Field error link remain. Not tested with VoiceOver. |
| PERFORMANCE | 8 | Memoised tiles with immutable series, one polyline spark, throttled scrub, joined garage writes. Long-drive checkpoint copy left. |
| STRUCTURE | 7 | Dead write path moved aside, one `sleep`, shared store reader. Large route files and duplicated sheet pages left. |
| BUGS | 7 | One medium (finding 1: delay on the first write) and a few low. No write is wrongly allowed or blocked by the new checks except when module and saved VIN differ. |
| SECURITY AND PRIVACY | 7 | Code side: restore link, URL checks, KB checks, upload scrub, switch, VIN check all hold. Left: VIN in the upload path, per-install id, traffic-log masking, fail-open on no VIN (findings 2, 3). The upload token in the bundle is the owner's call and is scored separately (not counted here). |

## Fixes applied (23 Nov 2026)

Checked with `npx tsc --noEmit` (clean) and Jest (57 suites, 808 tests passed; 797 before). Nothing run on a phone or a car.

| # | Status | What changed |
|---|---|---|
| 1 | Fixed | `identity.ts`: source `modules` counts as read from the car, no second read. A remembered or typed VIN is read from the modules once in the background after connect (`startVinCheck`, called from `state.tsx` for `remembered` and after `assignVin`), waiting for `whenIdle` and using the client's module lock. The 09 02 request is not repeated. The result is cached. A write that starts before the read ends goes ahead without waiting. A car with no VIN goes through. |
| 2 | Fixed | Only a valid VIN is cached. A failed or empty read is tried again at the next check, at most once per 60 seconds, in the background. |
| 3 | Fixed | The message gives both VIN tails. `verifyCar` also shows an alert with "This is the right car", which accepts the car's VIN for this connection (`acceptCarVin`). The saved VIN is not changed. One alert covers all 8 callers. |
| 4 | Fixed | `kb.ts`: writers keep rejected raw entries in `caristini.kb.v1.damaged` before the shortened list is saved. Display reads write nothing. Kind check uses `Object.hasOwn`. |
| 5 | Fixed | `discover.ts`: unparsable text is copied to `<key>.damaged` first. |
| 6 | Part fixed | `ProgressBar` resets when the percentage falls. Live regions apply on Android only and `announceResult` runs on iOS only (`ui.tsx`, `Notice`, Customise). Left: skipping `announce` on first mount of a Notice, because a result Notice that mounts with its text needs the announcement. |
| 7 | Fixed | Both `codingCache` updates after a write pass `{ durable: true }`. |
| 8 | Fixed | Learn my car row says "On, but Send findings is off in Settings: kept on this phone" when the setting is off. |
| 9 | Fixed | Put back from History for an adjustable value opens the confirm sheet (kind `adaptRestore`). The write happens only on the sheet's Put back. No scroll added. |
| 10 | Part fixed | One `SheetPage` in `ui.tsx` replaces the page-sheet scaffold in `LiveScreen`, `dashboard` (3 sheets), `logger` and `LiveTiles`, with their duplicated styles removed. Left: the three value pickers differ in content (saved sets, alerts, sections), so merging them is not a no-behaviour-change move. Logger bar text now uses `type.body` and `type.heading` like the others. |
| 11 | Fixed | `trafficLog.unsentText` (the upload text, header included) masks a 17-character VIN keeping the last 8 and replaces UK plates with `[plate]`. The upload path `findings/<VIN>/` is unchanged. The owner's own copy (`text`) is not masked. |

Tests added in `__tests__/reviewFixes.test.ts` for 1 to 4, 5 and 11.

## Final re-check (23 Nov 2026)

Review only, read in code (`git diff HEAD --ignore-cr-at-eol`). Nothing run, built or committed. Nothing tried on a phone or a car.

### The 9 findings

| # | Result | What was read |
|---|---|---|
| 1 | Fixed | `identity.ts` returns null for source `car` and `modules`, so a VIN from the modules is not read again. 09 02 is not repeated. `state.tsx:221` and `:306` start the read in the background for `remembered` and after `assignVin`. The read waits on `whenIdle` and runs each step through `withModule` or `tp20`, both inside the client lock. A write never calls the read and never awaits `pending` (see N1 for the queue wait). |
| 2 | Fixed | Only a valid VIN is stored in `live`. A throw or empty read leaves `live` null, and `carMismatch` starts a new read at most once per 60 s. |
| 3 | Fixed | `state.tsx:269-281` shows the alert with "This is the right car". `acceptCarVin` is held in a `WeakMap` keyed by the client, so it ends with the connection (a reconnect makes a new client). The saved VIN is not changed. All 8 callers go through `verifyCar`. |
| 4 | Fixed | `kb.ts:79-100`: writers (`saveKb`, `syncKb`) copy rejected raw entries to `caristini.kb.v1.damaged` (capped at 200) before the shorter list is saved. `loadKb` writes nothing. `Object.hasOwn` is used. |
| 5 | Fixed | `discover.ts:171-178` copies the unparsable text to `<key>.damaged` before returning the empty discovery. |
| 6 | Part fixed, as stated | `liveRegion` is Android only and `announceResult` is iOS only, so a result is spoken once. `ProgressBar` resets `spoken` when the step falls. Left: a Notice announces on mount, which is wanted for a result that mounts with its text. |
| 7 | Fixed | `customise/index.tsx:351` and `:504` pass `{ durable: true }`. |
| 8 | Fixed | `learn-car.tsx:287` shows "On, but Send findings is off in Settings: kept on this phone" when the setting is off. |
| 9 | Fixed | `customise/index.tsx:206-218` only sets a message or `pending: adaptRestore`. The write runs from the sheet's Put back (`run`, line 273). Opening from History never writes. |

### Checks asked for

- Background VIN read and a module conversation: it cannot start inside one. `whenIdle` waits for the lock tail and for `addressed` to clear, and `readVinFromModules` then queues behind any running sequence. Learn my car (`deepScan`, `listen` are single locked sequences) and the logger (`whenIdle`, standard requests held while `addressed`) are not broken by it. No caller uses `withModule(..., false)`, so no sequence relies on the adapter staying addressed between locked steps.
- Does a write wait for it: not on purpose, but see N1.
- "This is the right car" lasts for the connection only: yes.
- A VIN from the modules skips the read: yes (`source === 'modules'`).
- `.damaged` copies in `kb.ts` and `discover.ts`: correct, no repeat growth in `kb.ts` because the saved list no longer holds the rejected entries.
- Traffic-log masking (`trafficLog.ts:11-20`): hex lines stay intact. The adapter runs `ATS0` and `ATH0`, so replies are unspaced hex of even length and start with a digit. The VIN pattern needs exactly 17 letters or digits with no neighbour, which an even-length hex line cannot be. The plate patterns need a letter at the start and a 5 to 7 character token, which a hex reply does not give. The test line with spaced frames passes unchanged. `listenInner` frames do not go to the log.
- `SheetPage` (`ui.tsx:1201`) and its 4 files (`LiveScreen`, `dashboard` x3, `logger`, `LiveTiles`): same Modal props, same Cancel and Done handlers (`onClose(selected)` or `onClose(draft)` kept), same styles (moved into `ui.tsx:1448-1450`), `ConfirmSheet` stays inside the Modal. The "Choose a value" sheet still has no Done. Only change: the `LiveTiles` ScrollView gained keyboard props.
- `customise/index.tsx` put back from History: as in finding 9.

### New verified findings

| # | Where | Trigger | Effect | Fix | Severity |
|---|---|---|---|---|---|
| N1 | `identity.ts:3-4` (comment), `elm.ts:432`, `:1009-1031`, `:1176` | A write starts while the background read is mid-step, or `carMismatch` starts a read just before the write. | The write's `withModule` queues behind one read step (UDS 22 F190 up to 1500 ms, or one TP2.0 session to 0x01 or 0x07). The wait is short and not a hang, but "A write never waits for it" is not exact. A write that starts before the read ends is also not checked, so a wrong car in the first seconds is not caught. | Reword the comment to "waits for at most one step"; accept the open window as the report says. | Low |
| N2 | `identity.ts:75-83` | A car whose modules never answer (remembered or typed VIN), several writes over a long session. | Every 60 s a failed read is started again (up to 30 to 60 commands, TP2.0 time-outs) and can sit between multi-step jobs; live values pause while it holds the adapter. | Stop retrying after 2 failed reads in a connection. | Low |
| N3 | `trafficLog.ts:11-20`, `share/sendLog.ts:19` | A 09 02 or 22 F190 reply is logged as unspaced hex. | The VIN is readable as hex in an upload, and the upload path is `findings/<VIN>/`, so the masking hides the VIN only where it appears as text. Hex is left alone on purpose. | Say in the privacy text that the VIN is in the upload path and in the hex; no code change needed unless the owner wants it hidden. | Low |

No high or medium findings. No new bug from the fixes.

### Final scores

| Area | Score | Why |
|---|---|---|
| STRUCTURE | 8 | One `SheetPage`, one `identity.ts`, one store reader. Large route files and 3 different value pickers remain. |
| BUGS | 8 | All 9 fixed or part fixed as stated. Three low findings (N1 to N3), no medium or high. |
| SECURITY AND PRIVACY | 8 | Write check, restore link, KB and URL checks, upload masking hold. Left: VIN in the upload path and in hex, fail-open on no VIN, short unchecked window (N1, N3). The upload token in the bundle is not counted. |
