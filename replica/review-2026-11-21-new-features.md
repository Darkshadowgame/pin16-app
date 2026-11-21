# Review: new car features, 21 Nov 2026

Scope: uncommitted work in Pin16 (kwpAdapt, adaptations, oil reset, calibrations, fault detail, Customise adjustable values, CodeRow, elm.ts wrappers). Review only, nothing edited. Ground truth: replica/leon-listen-2026-11-21.md and 2026-11-21T12-38-24.dec.

Checks run: `npx tsc --noEmit` clean. `npx jest` 48 suites, 684 tests, all pass.

Scores: BUGS 7/10. FUNCTIONALITY 8/10.

No high findings. Two medium, the rest low.

## Confirmed correct (checked byte for byte)

1. Adaptation sequence matches the recording: enter `31 B8 01 03`, `31 BA 01 03`, select `31 B9 01 03 <ch>`, read `31 BA 01 03`, test `31 B9 01 03 <hi> <lo>`, `31 BA 01 03`, save `31 BB 01 03 <hi> <lo> <wsc 6>`, leave `32 B8 01 03` (dec lines 185 to 204). Answer parse `71 BA 01 03 82 03 <hi> <lo>` matches.
2. Save goes out once: `s.request(..., 12000, true)` (kwpAdapt.ts:115) and `once` stops the resend in tp20.ts:219. A lost answer ends in an error and a read-back, never a second save.
3. Workshop code is `id.slice(22, 28)` of the `5A 9B` answer (kwpAdapt.ts:84). Against the dec: bytes 22 to 27 of `5A 9B 31 50 30 39 32 30 39 32 35 43 58 20 30 34 32 32 03 00 19 01 0B 7D B1 A4 12 9D` are `0B 7D B1 A4 12 9D`. Correct. If `1A 9B` fails or is short, `workshopCodeFrom` gives null and the function returns before `10 89` and `31 B8`. No save goes out with a made-up code.
4. `32 B8 01 03` is in a `finally` on read and save. On a closed channel `request` throws ObdError (checkOpen), `soft` swallows it, nothing is sent on the dead channel. LinkLost is rethrown.
5. Basic settings: `31 B8 00 g`, `31 B9 00 g`, poll `31 BA 00 g`, `32 B8 00 g` in a `finally` on every path (cancel, time, closed, failed, refused, thrown). Group 1 on address 2C and group 0x3C on address 01 match the dec (lines 311 to 555). `parseBasicData` fits both recorded answers (text `5F 14 ...` and four 3-byte cells). Keep-alive between polls is `s.idle` (A3 about every 0.9 s).
6. Fault detail parse matches both recorded examples (`52 00 6C 01 24 02 01 C8 02 56 46` gives status 0x24, priority 2, frequency 1, reset counter 200, 153158 km). It reads only on tap, so the fault list never waits. Miles follow `settings.speed === 'mph'`, as the rest of the app does.
7. Locks: `readAdaptation`, `saveAdaptation`, `runBasicSetting`, `readFaultDetail` all go through `this.tp20` and so `exclusive` (elm.ts:423). Each rethrows LinkLost.
8. adaptations.ts against vag-tweaks.md (SEAT Leon section): all 14 rows match module, channel, range, step and meanings (LEON-015, 017, 041, 042, 051 to 053, 056, 058 to 060, 062). Remote key matching and clearing (ch 0 and 1), alarm horn (13), load management (6), service interval and oil-minimum channels are absent. No invented range or meaning.
9. Customise: reads run after the coding read and are not awaited (`void readAdaptRef.current?.()`), a missing channel gives null and the row is hidden, the original is kept once (`saved[key]` check) and put back through `valueFromHex(orig)`, the controls lock while reading or writing, chips only offer listed values, the stepper clamps to min and max on the step grid.

## Findings

### M1 (medium). No identity check before an adaptation write
- Where: kwpAdapt.ts:100 to 115 (save), elm.ts:621 (`saveAdaptation`). Compare elm.ts:2299 to 2301, where coding writes check `TP20_EXPECT[def.id]` against the module's own part number before writing.
- Trigger: the TP2.0 address mapping in modules.ts comes from one car's recordings ("not always the workshop address numbers", tp20.ts:513). On a PQ35 car where 0x20, 0x21 or 0x07 is not the module meant, the oil reset or an adjustable value goes to whatever answers. The `PQ35` platform gate covers every PQ35 car, while the evidence is one 2007 Leon.
- Effect: a write of channel N to the wrong module.
- Fix: in `kwpSaveAdaptation`, read `1A 9B` (already done for the workshop code), run `parseKwpIdent`, test the part number and component text against `TP20_EXPECT[def.id]` (pass it in `opts`) and return `ok:false` with "The module at this address says it is ..." before `31 B8`. Same rule as `writeTp20Coding`.

### M2 (medium). Oil reset restarts the service count from a stale odometer figure
- Where: service-reset.tsx:226 and :235. The learned-reset path at :189 stores `lastKm: markDoneKm(v)`.
- Trigger: a typed odometer figure older than 1 day (`markDoneKm` returns undefined on purpose).
- Effect: `km = markDoneKm(v) ?? v.odometerKm` falls back to the stale figure and `lastKm: km` stores it. The next service count starts from the wrong place, and the notice that follows (`markDoneSkipsKm`) then says the distance was not restarted when it was.
- Fix: keep `km` for History and diary only, and store `lastKm: markDoneKm(v)` as :189 does.

### L1 (low). Value is not validated inside the writer
- kwpAdapt.ts:97 `value & 0xffff`. 65536 becomes 0, -1 becomes 65535, NaN becomes 0, and the read-back then compares against the wrapped number and can report success.
- Effect today: none from the screens (values come from chips, clamped steps or a 3-digit range field), except `valueFromHex(orig)` on a corrupt stored original (NaN gives a write of 0).
- Fix: at the top, `if (!Number.isInteger(value) || value < 0 || value > 0xffff) return { ok: false, before: null, after: null, reason: ... }`. Same for `channel`.

### L2 (low). Basic setting that ends while idle is reported as failed, not closed
- kwpAdapt.ts:202. `s.idle` throws ObdError when the module sends A8, and it sits outside the try, so it leaves the loop as an exception. The `finally` still sends the end command (safe), but elm.ts:635 turns the error into `'failed'` ("The module stopped answering") where `'closed'` is the true end.
- Fix: wrap the idle in the same try and return `'closed'` when `s.closed`.

### L3 (low). Read-back after a save ignores a failed reopen
- kwpAdapt.ts:130. `await opts.reopen()` ignores the false result. `kwpReadAdaptation` then sends on a channel that never opened and waits 5 s per request, up to 3 tries, about 15 s or more before the ObdError.
- Fix: `if (!(await opts.reopen())) { reason ??= 'The module did not answer again, so the value could not be read back.'; }` and skip the read.

### L4 (low). Oil reset wording claims more than the read-back proves
- oilReset.ts:29 and tests. In the recording channel 2 already reads `00 00` before any save (dec 94.706, 123.325) and again after each of the 3 saves. A read-back of 0 therefore says nothing; the real evidence is the module's positive `71 BB 01 03`. "Took. Read before: 0. Read back: 0." can look like proof when it is not.
- Fix: word the result as "The cluster accepted the save" and show before and after as information only.

### L5 (low). Fault detail cache keeps failures and goes stale
- CodeRow.tsx:74 to 76. `.catch(() => null)` and the `null` that `readFaultDetail` returns for any non-LinkLost error both land in `detailCache` for the life of the app, which means "not supported": the button disappears after one dropped link or timeout. A fault cleared and happening again shows the old mileage and count.
- Fix: cache only a real `7F 12 11` (return a distinct value for that), and clear the entries for a car after a fault clear or a new scan.

### L6 (low). Customise swallows LinkLost and reads one channel per TP2.0 session
- customise/index.tsx:384 `.catch(() => null)` hides LinkLost, so a lost adapter runs through all remaining items. Each of the 14 items also opens its own channel. Reading all channels of a module in one session (enter once, select and read each, leave once) would cut the read time and the lock hold.

### L7 (low). Typed value outside the range is dropped silently; stepper from outside the range
- customise/index.tsx:783 to 788. A value above max or below min is discarded and the draft is reset with no message (the brief says clamp).
- adaptations.ts `stepValue`: from a current value below min, the lower button writes min, which is an increase (0 gives 10 on coming home time). Above max, the higher button lowers it.
- Fix: clamp the typed value, or say "20 to 100 only". Disable the direction that points away from the range.

### L8 (low). Text that is not in the sources
- calibrations.ts:42 and help.ts:578 say "Ignition on, engine off, and keep off the pedals ... (the usual way this is done)". The recording and leon-listen md do not state this. The test in carFeatures2026-11-21.test.ts pins the sentence. Cite a source or drop "the usual way this is done".
- Fault detail labels "priority", "Happened n times", "Logged at" are not defined in the md. They match the VCDS convention but no file in replica says so.
- help.ts:722 says "Tap Details", but the control is an info icon with no visible label.
- adaptations.ts footwell row drops the md note that sources disagree on which coding bit it needs.

### L9 (low). Test gaps and stale comments
- No test for: `1A 9B` failing (no save goes out), a closed channel during save, the reopen path, a value outside 0 to 65535, LinkLost rethrow, `'closed'` or `'failed'` basic-setting ends, `parseBasicData` with a mixed text and cell answer.
- "Sends once" is tested for success and refusal only, not a timeout.
- The range test ("copies the source ranges") repeats the numbers in the code and does not read the md.
- File headers name tests that do not exist: oilReset.test.ts, calibrations.test.ts, faultDetail.test.ts (the tests are in carFeatures2026-11-21.test.ts).

## Not defects, noted

- A basic setting stays on in the module if the app is killed or the link drops before the end command can go. Nothing in the app can fix that; the module ends it when the channel times out.
- Oil reset and Customise changes write at once with no confirm or block, as the owner chose. `preflightCheck` only adds a note after a failure.
