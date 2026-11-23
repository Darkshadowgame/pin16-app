# Pin16 design review, 23 Nov 2026

Reviewed from code against anti-ui-slop, impeccable (native audit and critique, Operate mode) and taste-skill. Fixed items (name, colours, port icon, tool-first, no confirm on coding switches) are not flagged. Nothing was run; findings come from reading the files.

## Scores

- LOOKS: 7 / 10. The palette, type scale, grouped lists and single orange accent are disciplined and read as a tool. Marks are lost on the Car tab and Live data, where too many coloured surfaces and controls compete.
- CONSISTENCY: 6 / 10. The token layer is strong, but toggles, icon cards, steppers and figure type are rebuilt per screen with different sizes, radii and padding.

Count: 2 high, 5 medium, 5 low.

## Findings, most severe first

### 1. Car tab (connected) has no clear second level (high)
- Where: src/app/(tabs)/(car)/index.tsx:243-306, tile gradient at 349.
- Wrong: after the health card come 4 tiles in 4 hues, each with a colour wash (blue, green, purple, indigo), a Learn my car card, then 3 groups holding 16 equal-weight rows with 8 square colours. "Learn my car" is also named again in the Expert footer (300).
- Rule broken: hierarchy comes from size, weight and space, not from every item carrying a colour; one accent, colour only where it carries meaning.
- Fix: delete the LinearGradient at 349 so tiles are flat surface with the tool square as the only colour. Merge "Driving" (293) and "Expert" (300) into one group headed "More tools" and fold the Expert rows behind one ListRow that toggles in place (the `showMissing` pattern in diagnostics.tsx, about line 650: `noChevron`, chevron-down/up as `right`). Drop "Learn my car, above," from the footer.

### 2. Live data puts controls above the data (high)
- Where: src/screens/LiveScreen.tsx:215-279 (intro, Choose/Pause/Reset row, Record row, recording line) before the tile grid at 281.
- Wrong: on a drive tool the readings are the job, yet two button rows and a 2-line intro sit above the first tile. On a phone the first value is below the fold. Five equal compact buttons look alike.
- Rule broken: show the real subject first; primary content leads, controls recede (Operate: scanability over expression).
- Fix: render the grid first. Move Record into the header with `HeaderButton` (`trailing`, `filled`, icon `record-circle-outline`, label "Record"). Put Choose / Pause / Reset in one row under the grid. Cut the intro to "Watching {n} of {m}. Fewer values update faster." The sensor hub card and the sensor Group (436-447, 470-480) should also follow the grid.

### 3. Toggle rows are hand-built five times, and the off track is nearly invisible in dark (medium)
- Where: src/app/settings.tsx:49-57 (`toggle` helper, `paddingVertical` 12), src/app/learn-car.tsx:279-295 (padding 10), src/app/customise/index.tsx:640, 704, 745 (row via `styles.item`, line 988); `trackColor` is repeated 11 times across the app.
- Wrong: three row paddings (10, 12, and ListRow's 50 pt minimum) for the same control, so settings rows are shorter than the list rows around them. Off track is `t.sunken` (#24242A) on `t.surface` (#1B1B1F), about 1.2:1, so the control edge disappears (non-text contrast needs 3:1).
- Rule broken: one component per job; controls must be perceivable in both appearances.
- Fix: add `ToggleRow({ title, subtitle, value, onChange, first, disabled })` to src/ui.tsx on the `ListRow` row shell (`minHeight: 50`, hairline, `paddingLeft: space.lg`), with `trackColor={{ true: t.green, false: t.switchOff }}` and `ios_backgroundColor={t.switchOff}`. Add `switchOff` to theme.ts: dark `#6A6A74`, light `#8E8E93` (about 3:1 on surface; check with the contrast test). Replace the five call sites.

### 4. Health check result: destructive action first and equal to the rest (medium)
- Where: src/app/diagnostics.tsx:558-575.
- Wrong: the next-steps group opens with "Clear all faults" (red broom square), then Make health report, MOT check, Check again, Emissions self-tests as 5 rows of equal weight. "Check again" is a primary Button on the Car tab (index.tsx:234) but a quiet row here.
- Rule broken: one clear primary action per screen; the same action looks the same everywhere; do not lead with the riskiest control.
- Fix: put `<Button label="Check again" icon={TOOLS.health.icon} variant={total ? 'secondary' : 'primary'} onPress={() => scan()} disabled={!!busy} />` directly under the hero card and delete the row at 561. Reorder the group: Make health report, MOT check, Emissions self-tests, then Clear all faults last with `iconColour="grey"` (the ConfirmSheet already guards it).

### 5. Figure and tile type bypass the scale (medium)
- Where: src/app/(tabs)/(car)/index.tsx:372 (`big` 56/62), src/app/diagnostics.tsx:885 (`pct` 34/41) and 888 (`big` 56/62), src/screens/LiveScreen.tsx:1009 (13), 1014 (26), 1015 (14), 1024-1026 (17, 13), 1040-1044 (15, 12), src/app/workshop/[id].tsx:629 (20 mono).
- Wrong: `type.figure` (56/62) and `type.display` (34/41) exist and `type.figure` has zero uses; the same numbers are typed again in three files. The Live tile value is 26 pt, a size on no step of the scale.
- Rule broken: one type scale of 4 to 5 steps; no off-scale sizes.
- Fix: `...type.figure` in place of the `big` styles (index.tsx:372, diagnostics.tsx:888) and `...type.display` for `pct` (diagnostics.tsx:885). Add `tile: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.5 }` to `type` in theme.ts and use it for `tileValue`; map `tileLabel`, `barText`, `makerLabel` to `type.small`, `type.body`, `type.sub`, and `minmax`, `makerSource` to `type.caption`.

### 6. Icon cards drawn three ways with four radii (medium)
- Where: src/app/(tabs)/(car)/index.tsx:257-279 (`styles.learn`, icon 42 / radius 13) and 336-358 (`Tile`, icon 38 / radius 12); src/screens/LiveScreen.tsx:436-447 (`styles.hub`, icon 44 / radius 14); `ListRow` icon is 30 / radius 7 (ui.tsx:1246).
- Wrong: the same idea (tool square, title, one line, chevron) is drawn at four icon sizes and four corner radii; Learn my car and the sensor hub are ListRows with a gradient.
- Rule broken: do not rebuild a shared component; one radius scale.
- Fix: render Learn my car and the sensors hub as `<Group><ListRow {...tool('learn')} title="Learn my car" subtitle={learnLine} onPress={...} /></Group>`. Keep `Tile` for the 4 home tiles with the icon radius set to `radius.md`. Delete `styles.learn`, `styles.learnIcon`, `styles.hub`, `styles.hubIcon` and the unused `welcomeIcon`, `circleButton`, `healthIcon` (index.tsx:367, 369, 373).

### 7. Diary: no loading state, empty state has no action, row copies ListRow (medium)
- Where: src/app/(tabs)/(diary)/diary.tsx:439-447 (empty), 458-494 (rows), 518 (`add` unused).
- Wrong: while `entries` is null nothing draws, so the page flashes blank. The empty state explains but has no button, although the tab exists to add entries. Each row repeats a red bin (488), so a list of services reads as a column of danger marks. The row is a hand-built ListRow (30 pt square, radius 7).
- Rule broken: design empty and loading states; do not repeat a warning colour on every row.
- Fix: when `entries === null` render `<ActivityIndicator color={t.muted} style={{ marginTop: space.xxl }} />`. In the empty block add `<Button label="Add an entry" icon="plus" onPress={() => router.push('/diary-add')} style={{ marginTop: space.lg, alignSelf: 'stretch' }} />`. Change the bin to `color={t.muted}`; the ConfirmSheet already carries the danger.

### 8. White glyphs hard-coded on tool squares (low)
- Where: src/app/(tabs)/(car)/index.tsx:259, 272; src/screens/LiveScreen.tsx:439; src/app/learn-car.tsx:202 (also discover.tsx:290, sensors.tsx:332, modules.tsx:117, mot.tsx:409, knowledge.tsx:137, outside the review set).
- Wrong: `#FFFFFF` bypasses `onTool()`. It is safe today only because those squares are indigo, blue or purple; moving a tool to gold, teal or green leaves white under 3:1.
- Rule broken: colour from tokens only.
- Fix: `color={onTool(TOOLS.learn.colour)}`, and likewise for `learnSetting` and `sensors`. In learn-car.tsx:202 use `running ? t.accent : onTool(TOOLS.learn.colour)`.

### 9. Find a switch says its instructions twice in one card (low)
- Where: src/app/find-switch.tsx:154 (footer ends with `${INSTRUCTIONS}`) and 165 (`<Text>{INSTRUCTIONS}</Text>`, constant at 21).
- Wrong: an identical 22-word sentence appears inside the card and under it.
- Rule broken: copy says a thing once, in plain words.
- Fix: footer becomes `` `${groups.length} value group${groups.length === 1 ? '' : 's'} read: ${groups.join(', ')}.` ``. Keep the body line.

### 10. Workshop group chooser is a hand-rolled stepper (low)
- Where: src/app/workshop/[id].tsx:362-367 (two 50 pt secondary Buttons labelled "−" and "+").
- Wrong: `Stepper` in ui.tsx:946 does this at the right size with Lower and Higher labels; here a screen reader hears "minus" and "plus", and the two large pills outweigh the Read group button below.
- Rule broken: reuse the shared control.
- Fix: `<Stepper value={`Group ${group}`} width={96} disabled={!!busy} noLower={group <= 1} noHigher={group >= 255} onStep={(d) => readGroup(Math.min(255, Math.max(1, group + d)))} />`.

### 11. Car tab (not connected) repeats other entry points (low)
- Where: src/app/(tabs)/(car)/index.tsx:92 (Lookup row), 94 (User guide row).
- Wrong: Lookup is the second tab and the guide is the `?` in the header, so two of the group's rows only duplicate other routes.
- Rule broken: one route to one place; no filler content.
- Fix: delete both rows; keep Service due, History, car records and Service reset guides; retitle the group "Without the adapter".

### 12. Text links under 44 pt (low)
- Where: src/app/customise/index.tsx:624 and 842 (`Source:` links; `type.small` 18 pt line plus `hitSlop={6}` gives about 30 pt), src/app/(tabs)/(car)/index.tsx:52 ("Stop trying", 20 pt plus 20 pt slop).
- Wrong: below the 44 pt minimum, among other small targets.
- Rule broken: touch targets of at least 44 pt.
- Fix: replace `marginTop: 6` with `minHeight: 44, justifyContent: 'center'` on both customise links; add `minHeight: 44` and `hitSlop={12}` to "Stop trying".

## What works (keep)

- Tokens: theme.ts documents contrast per colour and a test enforces it. `Screen`, `Group`, `ListRow`, `Chip`, `Segmented`, `Field`, `Notice` and `ConfirmSheet` cover most screens and are used consistently in settings, lookup and learn-car.
- One accent: orange only for the primary action, selection and accent text; green for on and ok; red for faults. The Meaning Rule holds in the screens read.
- Real states in most places: `Button` busy and disabled, `ListRow` disabled, Reduce Motion honoured, `NeedsConnection`.
- Copy is short and specific on the Car tab, Lookup and diagnostics.

## Not flagged, for the record

- Settings units as 6 rows (settings.tsx:78-89) could be two `Segmented` controls; skipped to stay inside 12.
- Learn my car footers (learn-car.tsx:277, 286) and customise footers run to 40 words; trim when touched.


## Fixes applied

Checked with `npx tsc --noEmit` (clean) and Jest (797 tests passed, 57 suites; 12 new contrast tests). Nothing was run on a phone. No commit.

| # | Result | What was done, or why it was left |
|---|---|---|
| 1 | Fixed (part) | Tile gradient removed, tiles flat with the tool square as the only colour (radius `radius.md`). Groups reordered to Driving, This car, Expert, so the drive tools lead. "Learn my car, above," dropped from the Expert footer. Left: folding the Expert rows behind one row, because a collapsed group hides 5 features by default. They stay visible under their heading. |
| 2 | Fixed | Tile grid first. Record and Stop moved to the header (`HeaderButton`, with the guide button beside it). Choose, Pause and Reset sit under the grid, then the intro, then the sensor hub and system group. A recording line shows above the grid while recording. |
| 3 | Fixed | `ToggleRow` and `Toggle` in `src/ui.tsx` with the `switchOff` token (dark `#6A6A74`, light `#8E8E93`). Replaces the Settings, Learn my car, Logger and Workshop rows. Customise, Sensors and the Workshop bit rows use `Toggle`. No `trackColor` is left outside ui.tsx. |
| 4 | Fixed | "Check again" is a Button under the result card. The group runs Make health report, MOT check, Emissions self-tests, then Clear all faults last with a grey square. |
| 5 | Fixed | `type.figure` and `type.display` used in the Car tab and Health check; `type.tile` added (28/34) for the live tile value; the Live data labels, units, min and max, Maker data and sheet bars use `type.*`; the Workshop address uses `type.title3`. |
| 6 | Fixed | Learn my car, Carry on learning and the sensors hub are `ListRow`s in a Group. The unused `learn`, `learnIcon`, `hub`, `hubIcon`, `welcomeIcon`, `circleButton` and `healthIcon` styles are gone. |
| 7 | Fixed | Diary shows a spinner while loading, an "Add an entry" button when empty, a muted bin, and each entry is one VoiceOver element. |
| 8 | Fixed | `onTool(colour, theme)` used on the Car tab, Learn my car, Discover, Sensors, Modules, MOT, History, Diary and Knowledge. |
| 9 | Fixed | Find a switch footer says the groups once; the instruction stays in the body. |
| 10 | Fixed | Workshop and the Live data module reader use `Stepper` (Group, Lower and Higher, limits 1 and 255). |
| 11 | Fixed | Lookup and User guide rows removed from the not-connected Car tab (both stay reachable from the Lookup tab and Settings). Group retitled "Without the adapter". |
| 12 | Fixed | The two Source links, Technical, the name buttons and "Stop trying" have 44 pt targets. |
