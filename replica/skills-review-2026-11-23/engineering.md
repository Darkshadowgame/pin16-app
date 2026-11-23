# Pin16 engineering review, 23 November 2026

Scope: render cost on live screens, storage, structure, error handling. Read only. Nothing was run, nothing was edited. `src/obd/tp20.ts` was not reviewed. Lenses used: audit-as-perf-eng, audit-as-frontend-eng, audit-as-structural-eng, vercel-react-best-practices (web-only rules ignored). Findings come from reading the code; no profiler was used, so cost claims are from the code path, not from a measurement on a phone.

## Scores

| Area | Score | Reason |
|---|---|---|
| PERFORMANCE | 6 / 10 | One high and four medium findings on live screens, storage and the logger. |
| STRUCTURE | 7 / 10 | One oversize mixed file (LiveScreen), a few large screen components, some duplication. |
| BUGS | 6 / 10 | Three medium findings on swallowed or unhandled errors and read-failure overwrites; one latent hook-order fault. |

Count by severity: 1 high, 8 medium, 6 low (15 findings).

What is already solid: the coding, value-name and history stores queue their writes and refuse to write over a failed read (`coding/historyStore.ts`, `data/valueNamesStore.ts`); the logger throttles its status to 5 per second (`recorder.ts:237`); Live data pauses when another screen is on top (`useIsFocused`); intervals and loops in the screens read have cleanup; charts in the log viewer are decimated; the Customise write path (`src/app/customise/index.tsx:262-420`) keeps the original, reads back, records the result in History and the diary, and reports a failed or broken-off write. Nothing in `src` uses `React.memo`, `FlatList`, `FlashList` or `SectionList`; that sits behind findings 1 and 6.

## Findings, most severe first

### 1. Every poll pass re-renders the whole Live screen, and each tile draws 60 child views (HIGH)

- Where: `src/screens/LiveScreen.tsx:163-176` (state updates), `281-323` (tiles), `826-847` (`Spark`), `341-342` and `214` (children).
- Trigger: any open Live data page with a few values chosen. Each pass of `readLiveMany` calls `setSeries` (new object for the whole record), `setRate`, and while recording `setRecCount`.
- Effect: the whole `LiveScreen` function runs again each pass, including `SensorHub`, `MakerData`, `MeasuringBlocks`, the pickers and every tile. No component is memoised. `Spark` renders one `View` per sample, up to 60 per tile, so 20 tiles is about 1,200 small views reconciled per pass, plus inline style arrays and closures per tile. This competes with the Bluetooth callbacks on the same JS thread and drains the battery.
- Fix: (a) pull the tile into `LiveTile` wrapped in `React.memo`, with props `p`, `series` (that pid's entry only), `rule`, `level`, `unitLabel`, and a stable `onOpen(pid)`; (b) draw `Spark` as one `react-native-svg` `Polyline` (already used by `LineChart` in `src/live/LiveTiles.tsx`) or at least memo it on `points`; (c) wrap `MakerData`, `MeasuringBlocks` and `SensorHub` in `React.memo` (they take no props, so they then render only on their own state); (d) keep `rate` in a small child component so a rate change does not re-render the grid.
- Risk of fix: low for (b) to (d), medium for (a) because tile state and alert levels must be passed per pid.

### 2. The whole garage is written to one key on every update, and every update re-renders the app (MEDIUM)

- Where: `src/vehicle/garage.tsx:203-211` (`save`), `213-250` (`value` memo); fan-out through `src/state.tsx:249-311` (`value` depends on `garage`).
- Trigger: any `garage.update`. During a sensor search it runs every 5 seconds (`src/app/sensors.tsx:164`); Learn my car updates it per step (`src/learn/runLearn.ts:312-671`, including `sensorsAsked` and `sensorsFound` lists of thousands of keys, `learnSnapshot`, `codingCache`, `knowledge`, `ids`).
- Effect: `JSON.stringify` of every car and one `AsyncStorage.setItem` of the full blob each time, on the JS thread that is also polling the adapter. Each update also changes `GarageContext` and so `ConnectionContext`, which re-renders every `useGarage` and `useConnection` consumer, including the Live data page underneath.
- Fix: debounce the write (about 1 second, flush on app background and on `remove`), keeping `current.current` and `setVehicles` immediate. Longer term, split large per-car lists (`sensorsAsked`, `learnSnapshot`, `codingCache`) into their own per-car keys, as `valueNamesStore` already does.
- Risk of fix: low for the debounce with a flush on `AppState` change; medium for splitting keys (migration).

### 3. A failed read of History or the diary is treated as empty, then written over (MEDIUM)

- Where: `src/history.ts:74-82` (`loadHistory` returns `[]` on any error), used by `addHistory` (`98-110`) and `removeHistory` (`127-137`); `src/diary.ts:24-31` and `34-51` (`addDiary`, `removeDiary`) have the same shape.
- Trigger: a transient `AsyncStorage.getItem` failure or unreadable value at the moment a setting change, clear or scan is logged.
- Effect: the next write saves a list of one entry (or an empty list on remove) over up to 500 stored entries. The change timeline (before and after coding of every write to the car) and the service diary are lost without a message. The two stores written later (`coding/historyStore.ts`, `data/valueNamesStore.ts`) already avoid this.
- Fix: give History and the diary the same pattern: a `read` that throws on a failed read, and writers that skip the write (and leave the stored list alone) when the read threw. Keep "unparseable counts as empty" only after copying the raw text aside, as `garage.tsx:194` does with `.damaged`.
- Risk of fix: low.

### 4. A failed garage save is silent, but the write to the car relies on it (MEDIUM)

- Where: `src/vehicle/garage.tsx:206-210` (`save` swallows the error, `update` resolves normally); relied on at `src/app/customise/index.tsx:270-275` (`codingOriginal` saved before the write, then the write at about `:300`) and again at `:417-419` (adaptation originals). The same lines exist in `src/coding/apply.ts:31-34`, but `applySetting` has no caller (finding 15).
- Trigger: `setItem` fails (storage full, protected data). The comment says "private browser windows"; on the phone it can still happen.
- Effect: the app writes the new coding to the car believing the original was kept. If it was not persisted, Put back and the "original coding" shown after a restart are wrong or missing. The owner is not told.
- Fix: have `save` return a boolean (or throw a typed `GarageSaveError`) and let `update` return it. In the Customise write path (`index.tsx:275`), stop before the write, with a clear line, when the original could not be stored. This adds no confirm; the coding switch still writes at once when storage works.
- Risk of fix: medium (changes the `update` return type; callers that ignore the result stay as they are).

### 5. The logger's 45 second checkpoint serialises the whole log each time, so stalls grow with the log (MEDIUM)

- Where: `src/logger/recorder.ts:414-428` (copy and checkpoint), `src/logger/store.ts:69-78` (`JSON.stringify(log)` then read and rewrite of `index.json`), `src/logger/format.ts:14` (`MAX_ROWS = 180_000`).
- Trigger: any long recording. At about 10 rows a second, an hour is 36,000 rows; each checkpoint copies `rows` and stringifies all of them, then reads and writes the index.
- Effect: a JS-thread stall every 45 seconds that gets longer through the drive (a few milliseconds early, tens to hundreds of milliseconds near the 180,000 row cap; these sizes are estimates, not measured). Adapter reads wait, so the reading rate dips on the beat, and the screen stutters.
- Fix: scale the interval with the log size (for example 45 s up to 5 minutes once rows exceed 20,000), and skip the `[...snap.rows]` copy by serialising synchronously before the next `await`. Append-only chunk files are a larger change and are not needed for this update.
- Risk of fix: low for the interval, medium for dropping the copy (the builder keeps appending between the `finish` call and the write).

### 6. The dashboard renders every page's gauges on every pass, with no memo and 3 state updates per pass (MEDIUM)

- Where: `src/app/dashboard.tsx:154-164` (`setValues`, `setHist`, `setStats`), `257-285` (all pages mapped into the pager), `276-280` (inline `onPress`, `onLongPress`), `383-457` (`DashTile`, not memoised).
- Trigger: any dashboard with more than one page, or the dial and graph styles (SVG per tile).
- Effect: only the page on screen is read, but the pager renders all pages, so every pass re-renders every tile of every page, with `Dial` and `LineChart` SVG trees. The `hist` and `stats` records are rebuilt for every pid in `got`.
- Fix: wrap `DashTile` in `React.memo` and pass stable handlers (`onPress(pi, i)` through one `useCallback` taking arguments); render only the current page and its neighbours in the pager, or memo each page by its own pids. Optionally merge `values`, `hist` and `stats` into one state object so there is one update per pass.
- Risk of fix: low for the memo, medium for limiting the pager (scroll and `goTo` positions).

### 7. Live recording grows without a cap, and its summary recomputes on every pass after Stop (MEDIUM)

- Where: `src/screens/LiveScreen.tsx:67` and `152` (`recRef` push per reading, no limit), `279` and `798-815` (`RecordingSummary`), `782-796` (`toCsv`).
- Trigger: record for a long drive, press Stop, stay on the page. Polling continues, so the parent re-renders about every pass.
- Effect: `RecordingSummary` runs `rows.map`, `new Set`, and for each value `rows.filter` plus `Math.min(...vals)` and `Math.max(...vals)` on every render: O(rows x values) per pass. Spreading an array of many tens of thousands of numbers into `Math.min` can throw `RangeError` (the device limit was not tested here). The array has no cap, unlike the logger (`MAX_ROWS`). `toCsv` also calls `pids.find` per row.
- Fix: `useMemo` the summary on `[recorded, pids, settings]` (or `React.memo` the component); replace the spreads with a loop; stop recording at a cap (for example 180,000 rows, matching the logger) with a one-line notice; build a pid to `LivePid` map once in `toCsv`.
- Risk of fix: low.

### 8. Older-VW read buttons have no error handling, so a failed read shows nothing (MEDIUM)

- Where: `src/screens/LiveScreen.tsx:637-684` (`find`, `read`, `scanAll` use `try/finally` with no `catch`; `toggleLive` has neither).
- Trigger: the car or the TP2.0 link fails during Look for older VW modules, a group read, Live or Read every group.
- Effect: the promise rejects out of the `onPress` handler (unhandled rejection). The owner sees the spinner stop and no message. In `toggleLive`, a throw leaves `liveRef.current` and `live` true, so the page shows Stop with nothing updating until Stop is tapped.
- Fix: catch in each handler and set a `Notice` ("Could not read: <message>. Check the ignition is on."); in `toggleLive` reset `liveRef` and `live` in a `finally`. `find-switch.tsx:92-113` is the model to follow.
- Risk of fix: low.

### 9. `LiveScreen.tsx` is 1,045 lines of five screens and four helpers (MEDIUM)

- Where: `src/screens/LiveScreen.tsx`.
- Contents: `LiveScreen` (49-380), `SensorHub` (384-481), `MakerData` (484-586), `MeasuringBlocks` (594-779, older VW), `toCsv` and `RecordingSummary` (782-816), `push` (818), `Spark` (826), `Picker` (849-999), styles (1001-1045).
- Seams that move out with no behaviour change (cut and paste, then import):
  - `src/live/recording.ts`: `Reading`, `toCsv`, summary maths; the module-level `keptRecording`.
  - `src/live/Spark.tsx` and `src/live/series.ts`: `Spark`, `push`, `Series`, `HISTORY`.
  - `src/screens/live/Picker.tsx` (shares the sheet scaffold with finding 14).
  - `src/screens/live/SensorHub.tsx`, `MakerData.tsx`, `MeasuringBlocks.tsx`: each already takes no props.
  - `LiveScreen.tsx` keeps the poll loop and the tile grid (about 350 lines).
- This also makes findings 1, 7 and 8 small, local edits.
- Risk of fix: low (pure moves). Do it before the render fixes, as a separate step, with the 758 tests as the check.

### 10. A hook sits after an early return in `MeasuringBlocks` (LOW, latent)

- Where: `src/screens/LiveScreen.tsx:634` (`return null`) above the `useEffect` at `659`.
- Trigger: `conn.vehicle?.group` or `client.supportsModules` changes while the Live page is mounted. The one real path is a car with no VIN (group `other`) becoming `vag` when `inferredFromParts` runs (`src/learn/runLearn.ts:376-377`) while Live is still in the stack.
- Effect: React throws "Rendered more hooks than during the previous render"; the page falls to the error boundary.
- Fix: move the `useEffect` at 659 above the early return (it already guards on `focused`).
- Risk of fix: low.

### 11. The dashboard keeps polling when another screen is on top (LOW)

- Where: `src/app/dashboard.tsx:130-192` (no `useIsFocused`; `LiveScreen.tsx:52` and `:119` and `fuel-trims.tsx:17` do this); keep-awake at `64-67`.
- Trigger: any screen pushed above the dashboard.
- Effect: the dashboard still asks the adapter for values, so the screen on top waits behind it (`moduleBusy` only protects module conversations), and the phone stays awake.
- Fix: gate the effect on `useIsFocused()` as Live data does, and the keep-awake with it.
- Risk of fix: low.

### 12. Logic inside route files, and screens built as one function of 600 to 925 lines (LOW)

- Where: `src/app/customise/index.tsx:53-976`, `src/app/diagnostics.tsx:46-837`, `src/app/workshop/[id].tsx:40-624`; and `src/app/performance.tsx:18-208`, which holds the whole run model (`stepRun`, `crossingTime`, `integrateDistance`, `customTest`, `TESTS`) in a route file that `__tests__/perf.test.ts:12` and `__tests__/perfUncertainty.test.ts:1` import from. `src/app/dashboard.tsx:25-46` exports `dashAlerts` and the thresholds the same way.
- Effect: every file in `src/app` is a route, so logic there is harder to find and to test, and the three large components mix state, car I/O and markup (Customise and Diagnostics have 19 and 18 `useState` calls).
- Fix, no behaviour change: move the run model to `src/diag/perfRun.ts` (re-export from the route until tests are repointed); move `dashAlerts` and the limits to `src/live/dashAlerts.ts`; in Customise and Diagnostics, lift the write and scan routines into hooks (`useCustomiseWrite`, `useHealthScan`) one at a time.
- Risk of fix: low for the two logic moves, medium for the hook extractions.

### 13. The traffic log copies 4,000 entries on every adapter line once full (LOW)

- Where: `src/obd/trafficLog.ts:20-27` (`entries = entries.slice(-MAX)` on each `add` past 4,000), with two regex passes per line.
- Trigger: any long session; the log is on by default (`settings.tsx:53`, `debugLog: true`).
- Effect: about 4,000 element copies per request and again per reply, at 20 to 40 lines a second, on the polling thread.
- Fix: trim in blocks (when length passes `MAX + 500`, `splice(0, length - MAX)` and adjust `sent`), or use a ring buffer.
- Risk of fix: low.

### 14. Duplicated helpers and scaffolding (LOW)

- Sheet scaffold (page-sheet `Modal`, Cancel and Done bar, and the styles `sheetBar`, `barButton`, `sheetWeb`) is copied in `src/screens/LiveScreen.tsx:895-911` and `1022-1024`, `src/app/dashboard.tsx:494-504` (three sheets), `src/app/logger.tsx:317-327` and `390-395`, and `src/live/LiveTiles.tsx:256-259`. `Picker` (Live), `PidPicker` (dashboard) and `ValuePicker` (logger) are three versions of one searchable value chooser.
- `const sleep = ...` is defined six times: `src/app/battery.tsx:35`, `dashboard.tsx:51`, `knock.tsx:19`, `performance.tsx:211`, `trip.tsx:16`, `src/logger/recorder.ts:144`.
- Two different classes named `RateMeter`: `src/live/rate.ts:3` (readings and updates a second) and `src/logger/scheduler.ts:89` (reads a second).
- `HISTORY = 60`, `RPM = 0x0c`, `COOLANT` are redefined in `LiveScreen.tsx` and `dashboard.tsx`; the coolant rule (110 C) lives separately at `LiveScreen.tsx:153-155` and `dashboard.tsx:25,37`.
- Fix: one `SheetPage` component in `src/ui.tsx` (or `src/sheet.tsx`), one `sleep` in a new `src/async.ts`, rename the second `RateMeter` to `ReadRateMeter`, and share the coolant limit.
- Risk of fix: low.

### 15. Dead code (LOW)

- `src/screens/LiveScreen.tsx:25-26`: `void Title;` keeps an unused import alive; the styles `scrim`, `sheet`, `option` and `box` (1019, 1027-1038) are never read.
- Exports with no caller anywhere in `src` or `__tests__` (checked by a word search of every file): `applySetting` (`src/coding/apply.ts:15`, a 40-line copy of the Customise write path; its header says "used by Customise", which is not true now, and a fix applied to only one copy would diverge), `checkBeforeWrite` (`src/coding/preflight.ts:22`), `goneSince` (`src/history.ts:147`), `saveKb` (`src/kb.ts:73`), `searchEverything` (`src/kb.ts:158`), `sensorById` (`src/obd/sensors.ts:95`), `CATEGORY_COLOUR` (`src/obd/sensors.ts:187`), `wasSeenSinceClear` (`src/obd/uds.ts:69`). `COMMIT` in `src/version.ts:7` has no import; the build sets `EXPO_PUBLIC_COMMIT` (`.github/workflows/build-sideload.yml:64`), so leave it.
- Exported but used only by tests: `integrateDistance`, `valueLabel`, `forgetDetails`, `countFaults`, `GUIDE_ORDER`, `estimateMinutes`, `parseGroupKey`, `SIM_TIMING`, `themes`. Fine to keep.
- `.old` files, kept on purpose and not to be deleted (note only): `App.tsx.old`, `index.ts.old`, `src/ai/agent.ts.old`, `src/ai/claude.ts.old`, `src/ai/parts.ts.old`, `src/ai/research.ts.old`, `src/app/ask.tsx.old`, `src/app/(tabs)/(ai)/ai.tsx.old`, `src/app/(tabs)/(ai)/_layout.tsx.old`, `src/brand/Mascot.tsx.old`, `src/old/garage-tab.old` (and its two `.old` files), `src/screens/CarScreen.tsx.old`, `src/screens/CodesScreen.tsx.old`, `src/screens/ServiceScreen.tsx.old`, `__tests__/agent.test.ts.old`.
- Fix: remove the four styles and the `void Title` line; delete `applySetting` (or make Customise call it, so there is one write path); review the other unused exports one by one.
- Risk of fix: low.

## Other notes (not in the 15)

- `src/settings.tsx:76-82` writes to storage inside a `setSettings` updater, which should be pure (React may call it twice in development). Also `set` before the first load finishes would save defaults over saved settings. Low; fix by writing after the state change with the merged value.
- `src/app/mot.tsx:88-100` calls `saveDraft` inside `setDraft` updaters, the same impure pattern.
- `src/logger/store.ts`: the index `readIndex` then `writeIndex` is not queued against `deleteLog` from the log viewer; a delete during the unmount save of a recording could lose an index line (rebuilt from files if the index is damaged). Low.
- Files over 800 lines that are data (`dtcLibrary.ts`, `vagFaults.ts`, `catalogue.ts`, `sensors.ts`, `help.ts`, `mot/rules.ts`, `data/cars/leonCupra.ts`, `fuses.ts`) are fine as they are. `src/obd/elm.ts` (2,878 lines, protocol and client together) and `src/obd/simTransport.ts` (917) are the largest logic files; splitting them is out of scope here because a move can change ordering or timing on the car and needs a car test. `src/ui.tsx` (1,304 lines of primitives, help sheet and tool registry) could split into `ui/` files with a barrel, with no behaviour change; it is not in the 15 because it has no runtime cost.
- Checked and fine: poll loops in `fuel-trims.tsx`, `knock.tsx`, `boost.tsx`, `dpf.tsx`, `battery.tsx` clean up and catch; `ElmClient.batteryVoltage`, `readLive` and `preflightCheck` never throw; `sendLogNow`, `sendBack` and `recordCodings` do not reject, so their `void` calls are safe; the `void` calls found by search were checked.


## Fixes applied

Checked with `npx tsc --noEmit` (clean) and Jest (785 tests passed, 57 suites). Nothing was run on a phone or a car. No commit.

| # | Result | What was done, or why it was left |
|---|---|---|
| 1 | Fixed | `LiveTile` in `React.memo` with that pid's series only, stable `onOpen`; `Spark` is one memoised `react-native-svg` Polyline; `SensorHub`, `MakerData`, `MeasuringBlocks` memoised; the rate lives in a small store read by a child (`src/live/rateStore.ts`). |
| 2 | Fixed (debounce) | Garage writes are joined: stored about 1 second after the last change, and at once on app background, unmount, `remove` and `update(..., { durable: true })`. A failed first read blocks writes until a read works. Splitting large per-car lists into their own keys left: needs a migration. |
| 3 | Fixed | `src/storageRead.ts` (`readJsonStrict`). History and diary writers skip the write when the read fails; damaged text is copied to `<key>.damaged` first. `addDiary` and `removeDiary` now run in turn and resolve true or false. The same pattern is in the emissions, DPF, knock, MOT draft, monitors (runs, trips, ranges), discovery, knowledge base and outbox stores. |
| 4 | Fixed | `garage.update(vin, patch, { durable: true })` resolves false when storage did not keep it. Customise (coding and adjustable values) and Workshop stop before the write, with a plain message, when the original could not be saved. No confirm added. |
| 5 | Fixed (interval) | The checkpoint wait grows from 45 s (up to 20,000 rows) to 5 minutes near the row limit. Dropping the `[...snap.rows]` copy left: medium risk, needs a test on a long drive. |
| 6 | Fixed (memo) | `DashTile` in `React.memo` with two stable handlers. Limiting the pager to the current page and its neighbours left: it changes scroll and `goTo` positions. |
| 7 | Fixed | Summary in `useMemo`, loops in place of the `Math.min` and `Math.max` spreads, 180,000 row cap with a one-line notice, one pid map in `toCsv` (`src/live/recording.ts`). |
| 8 | Fixed | Older-VW find, read and scan-all catch and show a Notice; `toggleLive` resets in a `finally`. |
| 9 | Left | Large file split (moves hundreds of lines). |
| 10 | Fixed | The `useEffect` sits above the early return. |
| 11 | Fixed | The dashboard poll and keep-awake follow `useIsFocused`. |
| 12 | Left | Logic moves out of route files and hook extractions move hundreds of lines. |
| 13 | Fixed | The traffic log trims in blocks; readers still see at most 4,000 lines. |
| 14 | Part fixed | One `sleep` in `src/async.ts`; the second `RateMeter` is now `ReadRateMeter`. Left: one `SheetPage` component and one value picker (large, touches layout); shared `HISTORY`, `RPM` and coolant limit constants. |
| 15 | Part fixed | `src/coding/apply.ts` moved aside to `apply.ts.old` (it had no caller and a copy of the Customise write path); `void Title` and the four unused styles removed from `LiveScreen.tsx`. The other unused exports left: to be reviewed one by one. |
| Other notes | Part fixed | `src/settings.tsx` writes after the state change with the merged value, keeps early changes until the stored settings are read, and saves nothing over settings it could not read. `src/app/mot.tsx` saves outside the state updater. The `logger/store.ts` index race with `deleteLog` is left: low and rare, and the index rebuilds from files. |
