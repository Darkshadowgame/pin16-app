# Re-check of the 21 Nov 2026 fixes (review only, nothing edited)

Scores: BUGS 8, FUNCTIONALITY 8, LOOKS 8, CONSISTENCY 7.
Run: tsc clean; jest carFeatures2026-11-21: 33 of 33 pass. Not run on a car or in the app.

## Medium findings in both reports: all fixed in code

| Report item | Status | Where |
|---|---|---|
| Features M1, identity check before adaptation write | Fixed | kwpAdapt.ts:103-109 (check runs before 10 89 and 31 B8), elm.ts:629 passes TP20_EXPECT |
| Features M2, stale odometer stored as lastKm | Fixed | service-reset.tsx:233 stores markDoneKm(v) |
| Looks 2, throttle line twice | Fixed | calibrations.tsx: no footer, no extra line |
| Looks 3, two orange Start buttons | Fixed | calibrations.tsx:128-129, one primary, rest secondary |
| Looks 4, jargon in calibration wording | Fixed | calibrations.ts summary and technical lines lead with the effect |
| Looks 5, non-run logged with "Ran 0:00" | Fixed | calibrations.ts historyFor and didNotStart; run time dropped under 2 s |
| Looks 6, hero card wording | Fixed | service-reset.tsx hero says the built-in reset is one write and not put back |
| Looks 7, footer on the built-in row | Fixed | service-reset.tsx:287 shows "The built-in oil reset writes at once" whenever the row is listed |
| Looks 11, "Details" word missing | Fixed | CodeRow.tsx:107-111 text label, 44 pt target |
| Looks 12, silent unsupported, centred spinner | Fixed | CodeRow.tsx:113-119 gives a line for unsupported and failed; spinner left-aligned |
| Looks 14, chips on card | Fixed | customise/index.tsx:773 passes onCard and tall |
| Looks 15, jargon in adjustable values | Fixed in the row; see L4 | byte and bit only in the open detail; "outside the usual range" |
| Looks 1 (high, no confirm) | Intended by the owner | not counted |

## Specific checks

- Identity check cannot block the owner's modules. Tested the five patterns in elm.ts:36-52 against part number plus component text as parseKwpIdent builds it: vag-17 "1P0920925CX KOMBIINSTRUMENT VO3" true, vag-09 "3C0937049AE Bordnetz-SG H52" true, vag-46 "1K0959433BT KSG PQ35 G2" true, vag-08 "1P0907044 ClimatronicPQ35" true, engine "1P0907115C 2.0l R4/4V TFSI" true. Module ids match modules.ts:94-108. A module with no pattern or no identity text is not checked.
- Value range guard: kwpAdapt.ts:88-89 refuses non-integers, below 0 and above 65535, and channels outside 0 to 255, before any send. The per-row range is held by the screen (stepValue, clampToRow, choices), which is where it belongs.
- 32 B8 on every exit path: adaptation, after 31 B8 is sent, in the finally at kwpAdapt.ts:131. Basic setting group, in the finally at kwpAdapt.ts:224. Two returns send nothing (identity refusal, workshop code missing) and that is correct because nothing was entered.
- Help names match the screens: "Details", "Start", "Finish", "Technical", "Put back original", "Reset the oil service" all match.

## Findings

M1 (medium). Help contradicts the built-in oil row.
- help.ts:1089 (SECTIONS.serviceResets): "Tap one to see every step before anything is sent. Nothing is sent until you confirm." Tapping the oil row writes at once. help.ts:1090 says old values are put back; the oil reset does not put anything back.
- help.ts:306 (serviceReset guide) has the same claim for "every step", after the bullet at :300 that says the oil reset writes at once.
- Fix: in both places add "except the built-in oil reset, which writes at once and is not put back", or scope the three lines to learned resets.

L1 (low). A refused oil reset is logged as "did not take" when nothing was sent. service-reset.tsx:237 writes History and :248 sends the log for an identity refusal or no route (nothing changed). Fix: skip History when res is null or the reason contains "Nothing was changed", as calibrations does.

L2 (low). oilReset.ts:49 opens with "The cluster did not accept it." for an identity refusal, where the save was never sent. Fix: when the reason starts with "The module at this address", show the reason alone.

L3 (low). TP20_EXPECT now has vag-08 and engine (elm.ts:49-52), so coding writes to those modules over TP2.0 (elm.ts:2309) are also checked, and only these exact texts pass. Another PQ35 climate or engine part number would be refused with "Nothing was changed". Safe, but unannounced in the build note. Fix: say so in the note, or widen with the part number families when more recordings exist.

L4 (low). CodeRow.tsx:117 ends without a full stop, unlike the line at :119. CodeRow.tsx:152 uses a fixed 56 pt inset that matches one chip width; a longer chip text shifts it. Fix: add the stop; measure or fix the chip width.

L5 (low). SECTIONS.faultDetail (help.ts:721) is not opened from any screen. The Details word is covered in help.ts:737 (diagOlder), so nothing is wrong for the user. Fix: add help to the fault group header or delete the unused section.

L6 (low). help.ts:296 has `},  serviceReset: {` on one line (formatting only). help.ts:712 says each adjustable value names its source "under the row", but the source shows only in the open detail.

L7 (low). No test pins the owner's five identity strings to TP20_EXPECT (the table is not exported). Fix: export it and add the five cases above.

## Carried over, not fixed, as stated in the build note
One TP2.0 session per channel read (14 reads open 14 sessions); German-to-English lines (one entry); fault detail labels follow the VCDS convention only.
