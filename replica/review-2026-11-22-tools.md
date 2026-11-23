# Review 2026-11-22: coding history, Find a switch, value names

Review only. `npx tsc --noEmit`: clean. `npx jest` (excluding .claude): 53 suites, 748 tests pass.

Scores: BUGS 7, FUNCTIONALITY 8, LOOKS 8, CONSISTENCY 8.

## Verified, no finding
1. Put back goes through `askWrite('putback')` (preflight) then `writeCoding` then `client.writeCoding`. That path does the compare against a fresh read, the read-back and the restore (`writeDid`, `writeTp20Coding`). Length is blocked in `putBackBlock` (CodingHistoryList.tsx) and again in `writeCoding`/`writeDid` ("different length", nothing changed). Entries are keyed by VIN then module id, so another car or module cannot be offered. Typed entries are stored only after `validateCodingHex` against the current length. A 3-byte coding works (same length rule, `shortNumber` 00 19 01 gives 0006401).
2. Storage: one write per changed coding (`next === before` skips), cap 30, errors swallowed, writes serialised by a queue. `codingCache` and `codingOriginal` are not touched by recording.
3. `diffCodings` 98 80 08 vs 90 80 08 gives byte 0, 0x98 to 0x90, bit 3 off. Different lengths give `lengthChanged`.
4. Find a switch: loop ends on `liveRef` false (Stop, blur, unmount, LeaveRunGuard), on `LinkLost` and after 4 failed reads. It uses `watchMeasuringGroups` and so the existing `tp20` lock. A group that answers nothing in round 1 and answers in round 2 takes that value as its baseline, not as a change. Memory is bounded (groups x 4 fields). `useStayAwake('find-switch', running)` releases on stop and unmount.
5. Value names are stored per VIN under key module:group:field. They never touch groupLabels.ts. `sendBack('names')` is fire-and-forget with `.catch`, uses the same token and outbox as 'learned', and carries car brand, model, year, platform, VIN, part and the typed name and note (the form says so). Logger: the label only gains the owner's name. Nothing parses labels, and old saved logs keep their text.
6. Owner rule holds: no change to Customise switch writes. Only put back and the existing confirms ask.

## Findings

1. MEDIUM, `src/screens/LiveScreen.tsx:729,736`. Trigger: open Name on field 2 of group 5, type a name, then pick another group or module. `naming` (the field index) stays set and `NameValueForm` has no key, so the form (with the old typed text) now shows under field 2 of the new group, and Save stores the name against the new group and field. Effect: a name on the wrong value, then sent to the findings store. Fix: `setNaming(null)` in `read()` and when the module changes, and give the form `key={`${module.id}.${group}.${i}`}`.
2. LOW, `src/coding/historyStore.ts:11-17,34-40` (same pattern in `valueNamesStore.ts:11-17`). Trigger: `getItem` fails once (not corrupt data), then `setItem` works. `loadCodingHistory` returns `{}`, and the save overwrites the stored history with one entry. Effect: history lost. Fix: have an internal load that rethrows, and skip the save when the read failed.
3. LOW, `src/app/find-switch.tsx:92`. Trigger: module not already on the older route, tap Start, then Stop. `findTp20Modules()` scans every module and cannot be cancelled, so Stop does nothing for several seconds and the screen looks hung. Fix: show "Looking for the module" while it runs, or skip the scan when `routeOf(def)` is known.
4. LOW, `src/app/find-switch.tsx:105-110`. Trigger: the adapter link drops. `watchMeasuringGroups` returns true on `LinkLost` and after 4 failed reads, so the screen shows "Stopped." with no reason. The catch branch rarely fires. Fix: when the run ends and `liveRef` was still true, set a "The module stopped answering" message.
5. LOW, `src/coding/history.ts:120-127,42`. A typed date in the future sorts to the top and shows as "latest" in Customise. A typed date older than the 30th entry is dropped by the cap, yet the screen says "Coding added". Fix: reject future dates and say when an entry is older than the kept ones.
6. LOW, `src/app/workshop/[id].tsx:592-593`. The put back confirm shows only the date. For a typed entry it should say "This coding was typed in, not read from the car." Fix: add that line when the entry's source is 'typed' (pass the source in `confirm`).
7. LOW (consistency), `src/app/workshop/[id].tsx:363` and `src/screens/LiveScreen.tsx:755,763`. Workshop's group values and the saved-group lists use only built-in labels, but help.ts says "Your name shows wherever that value appears". Fix: use `lookupValueName` and `NamedText` there, or reword the help to list the three places.
8. NOT VERIFIED. Learn (`runLearn.ts:309`) records TP2.0 module codings. `codingCache` leaves those out on purpose (`runLearn.ts:310`, `[id].tsx:268`). Both read through `readCoding`/`tp20ReadCoding`, so the form should match, but this was not run on a car. Put back is still bound by the length rule and the TP2.0 compare.

Wording check: British English, digits, no em dashes, no AI mentions in the new files and diffs. Screens use the shared Group, ListRow, Field, Button and ConfirmSheet. Names agree between screen, help and History ("Coding history", "Put back this coding", "Find a switch"). LOOKS is from code only.

## Re-check
Review only, after the fixes in the working tree. tsc and jest not re-run (54 suites, 758 tests pass).

1. Fixed. `LiveScreen.tsx`: `naming` now holds the module, group and field it was opened for, the form is keyed on them, Save uses that target, and an effect closes the form when the module or group changes. Find a switch derives the target from the row, and each row is keyed by group.field, so no name lands on another module, group or field.
2. Fixed. `historyStore.ts` and `valueNamesStore.ts`: `readCodingHistory` and `readValueNames` throw on a failed `getItem`; `recordCodings` and `change` catch that and skip the write. Corrupt stored data still counts as empty, as before. The public loaders still return `{}` for display only.
3. Fixed. `elm.ts` `findTp20Modules(cancelled)` checks before each module and route and still releases `holdRaw` and the raw channel in `finally`. `find-switch.tsx` passes `() => !liveRef.current` and skips the watch when cancelled. Start stays disabled until `start()` returns, so a quick Stop then Start cannot start a second loop.
4. Fixed. `find-switch.tsx:119`: a run that ends with `liveRef` still true (link lost or 4 failed reads) shows "The link to the car was lost". Stop, blur and unmount set it false first, so they show nothing. The catch branch sets its own message. Keep-awake follows `running`, which is cleared at the end of `start()` and released by the hook on unmount. The module channel is released by `tp20()`.
5. Fixed. `history.ts` `checkTypedWhen`: future dates are refused, dates older than the kept 30 are refused with a reason. Checked: empty input is now; a date-only today (before or after 12:00) is accepted as now or 12:00; yesterday date-only and `YYYY-MM-DD HH:MM` in the past are accepted; today with a later time is refused as future. `droppedByCap` uses the same index rule as `addCoding`.
6. Fixed. `workshop/[id].tsx`: `typed` is passed through `askWrite` and the confirm adds "This coding was typed in, not read from the car." The nested ternary is well formed.
7. Fixed by rewording. `help.ts` now lists the 3 places (Find a switch list, open group in Live data, logger label), which matches `LiveScreen.tsx`, `find-switch.tsx` and `recorder.ts:90`.
8. Still not verified on a car (unchanged).

New finding
- LOW, `src/app/workshop/[id].tsx:~247` (`saveByHand`) with `history.ts:40`. Trigger: type a coding equal to the entry just newer or older in time (for example the current coding, date empty). `addCoding` returns the history unchanged, yet the screen says "Coding added to the history." Effect: a message that is not true; nothing is lost. Fix: check `history[def.id]` for a neighbouring entry with the same hex and say "Already in the history."

BUGS score: 9/10 (no high or medium, one low).
