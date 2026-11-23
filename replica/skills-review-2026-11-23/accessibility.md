# Pin16 accessibility review, 23 Nov 2026

Scope: VoiceOver on iPhone, Dynamic Type, contrast, Reduce Motion. Method: the a11y-check, contrast, accessibility-review and audit-as-a11y-eng skills, mapped to React Native. Files read in full or in the relevant parts: `src/theme.ts`, `src/ui.tsx`, `src/app/(tabs)/*`, `src/app/diagnostics.tsx`, `src/screens/LiveScreen.tsx`, `src/app/workshop/[id].tsx`, `src/app/customise/index.tsx`, `src/app/find-switch.tsx`, `src/components/NameValue.tsx`, `src/components/CodingHistoryList.tsx`, `src/components/CodeRow.tsx`. Nothing was run on a device. Findings marked "check on device" rest on React Native behaviour I am confident of but did not observe.

**ACCESSIBILITY score: 6 / 10.** Findings: 3 high, 6 medium, 5 low (14 in all).

What is already good: every text colour token passes 4.5:1 on its surfaces in both themes; most Pressables have a role and label; `Button`, `Chip`, `Segmented` and `ListRow` carry selected, disabled, checked and busy state; `ConfirmSheet` uses the native iOS action sheet; Reduce Motion is honoured in `ScanPulse`, `ModuleRing` and `Arrive`; Dynamic Type is not capped anywhere (no `maxFontSizeMultiplier`, no `allowFontScaling={false}`); decorative `PinMark` is hidden from VoiceOver; the live tiles say "past the alert limit" in words.

## 1. Contrast (WCAG 2.1 AA)

Computed from the token values in `src/theme.ts`. Translucent tokens (`muted`, `faint`, `border`, the `*Soft` washes) were composited over the surface they sit on. All text tokens (`text`, `muted`, `accentText`, `danger`, `ok`, `info`, `warn`, `onAccent`, `onDanger`) pass 4.5:1 on `bg`, `surface`, `raised`, `sunken`, the three glow gradients and their own soft wash, in both themes, except the marginal cases listed below. `faint` is used only for icons and chevrons (needs 3:1), never for text, so its 3.93 to 4.5 readings on a few washes do not fail.

Lowest text results, for reference:

| Pair | Light | Dark |
|---|---|---|
| `muted` on `sunken` | 6.59 | 7.18 |
| `accentText` on `sunken` | 5.14 | 6.39 |
| `accentText` on `accentSoft` over `sunken` | 4.49 | 5.09 |
| `danger` on `dangerSoft` over `sunken` | 4.42 | 5.15 |
| `onAccent` on `accent` (primary button) | 5.25 | 5.25 |
| `onDanger` on `danger` (badge) | 6.59 | 7.49 |
| `warn` on `warnSoft` over `sunken` | 5.32 | 7.43 |

### Pairs below the threshold

| # | Pair | Where used | Needs | Light | Dark | Replacement that passes |
|---|---|---|---|---|---|---|
| C1 | Text field well `sunken` against `surface` (no border, no ring) | `Field`, `SearchField` (`ui.tsx:783`, `:977`) | 3:1 boundary | 1.27 | 1.11 | Add `borderWidth: 1` with new token `outline`: light `#7A7A84` (4.25 on surface, 3.70 on bg, 3.35 on sunken), dark `#7C7C88` (4.17 on surface, 4.50 on bg, 3.74 on sunken) |
| C2 | Unselected chip `surface` or `sunken` against page | `Chip` (`ui.tsx:827`) | 3:1 boundary | surface/bg 1.15, sunken/surface 1.27 | surface/bg 1.08, sunken/surface 1.11 | Same `outline` token as a 1 pt border on unselected chips (selected chip is orange fill: 3.29 on bg light, 4.92 dark, passes) |
| C3 | Segmented track `sunken` against page | `Segmented` (`ui.tsx:913`) | 3:1 boundary | sunken/bg 1.10 | sunken/bg 1.20 | `outline` border on the track; selected segment `surface` on `sunken` is 1.27 / 1.11, so also give the selected segment a 1 pt `outline` border (its label is already bold) |
| C4 | Switch off track `sunken` against `surface` | `trackColor={{ false: t.sunken }}` at `workshop/[id].tsx:478`, `:533`, `customise/index.tsx:643`, `:707`, `:748` | 3:1 boundary | 1.27 | 1.11 | `false: t.grey` (`#8E8E93`: 3.26 on white, 5.27 on dark surface) or `t.outline` |
| C5 | Stepper button `accentSoft` against surface | `Stepper` (`ui.tsx:959`) | 3:1 boundary (glyph is text, passes) | about 1.1 | about 1.3 | `outline` border, or accept as low: the "+" and "−" glyphs pass at 5.1 or more |
| C6 | White glyph on dark `red` tool square | `onTool('red')` (`theme.ts:104-106`), used by the Clear tool row and diary "Faults cleared" | 3:1 (icon) | 4.31 pass | **2.97** | In dark, use `#0A0A0A` on red: 6.66. `onTool` needs the theme: `onTool(colour, dark)` |
| C7 | White "!" on tab badge `t.red` | `badgeBackgroundColor={t.red}` (`(tabs)/_layout.tsx:11`) | 4.5 (small text) | 4.31 | **2.97** | Fixed badge fill `#C4112F` in both themes: white on it is 6.05 |
| C8 | Light `accentText` `#A63A00` on `accentSoft`/`dangerSoft`/`infoSoft` washes that sit on `sunken` | Pill, secondary Button inside a sunken card | 4.5 | 4.36 to 4.49 | pass | `accentText` light `#9A3500`: 4.88 to 5.03 on the same washes |
| C9 | Light `danger` `#B8123A` on `dangerSoft` over `sunken` | Pill, danger chip on card | 4.5 | 4.42 | pass | `danger` light `#A00F33`: 5.39 |

Passes and notes, no change needed:

- Tool squares in light theme (green 2.22, teal 2.57, gold 2.65 against `surface`) are decorative, each row carries a text title. Exempt.
- Glyph on tool square: light red 4.31, blue 4.02, purple 4.13, grey 3.26; dark blue 3.65, purple 3.52, grey 3.26, indigo 5.06. All at or above 3:1 for icons.
- Module ring dots: "pending" (`sunken`, 1.1 to 1.27 on surface) and "none" (`faint` at 50%, 2.08 light, 2.53 dark) are dim by design and mean "nothing yet". They are also colour-only; see finding 5.
- Hairline `border` (1.2 to 1.4:1) separates rows and cards. It is the only boundary of a control only where C1 to C3 apply.
- Disabled controls at 0.4 opacity are exempt.
- Live tile alert state: `danger` on `dangerSoft` over page is 4.86 light and 5.99 dark. Passes.

## 2. Shared components (`src/ui.tsx`)

| Component | Role | Label | State | Target | Verdict |
|---|---|---|---|---|---|
| `Button` | button | label | disabled, busy | 44 to 50 | Good. No way to give a different spoken label (finding 7) |
| `HeaderButton` | button | label | none | 36 + 10 slop = 56 | Good |
| `HelpButton` | button | "Help: title" | none | 44 via slop | Good |
| `ListRow` | button, checkbox when a choice | title, subtitle, value | checked | 50 | Nested controls in `right` are lost (finding 1); no `expanded` (finding 11) |
| `Chip` / `Chips` | button, radio, tab | text (count read separately) | selected, checked, disabled | 36 + 8 slop = 44 high | Good. Boundary C2 |
| `Segmented` | tab, radio | text, or "label: option" | selected, checked | 44 | Good. When `label` is set the badge count is dropped from the spoken label (no caller sets both today) |
| `Stepper` | button x 2 | "Lower" / "Higher" | disabled | 44 | Ambiguous label, value not announced (finding 7) |
| `Field` | text field | label or placeholder | none | 44 | No error association; boundary C1 |
| `SearchField` | text field | placeholder | none | 44 | Good. Clear button 16 + 24 slop = 40 on Android only |
| `Notice` | none | text | none | n/a | Never announced (finding 3) |
| `ProgressBar` | progressbar | none | value 0 to 100 | n/a | View is not `accessible`, so role and value are probably not reachable (check on device) |
| `ModuleRing` | none | "n of m modules checked" | none | n/a | Label sits on a non-accessible View (check on device) |
| `Label` / `Group header` | none | text | none | n/a | Not marked as headers (finding 8) |
| `ConfirmSheet` | native action sheet on iOS | title, message, options | none | native | Good |

## 3. Findings, most severe first

### 1. Controls nested inside a Pressable cannot be reached with VoiceOver (high)

`src/components/CodeRow.tsx:85-111`, `src/ui.tsx:683-695` with `right` content, `src/screens/LiveScreen.tsx:~930-940`, `src/app/customise/index.tsx:595-636`.

On iPhone, a Pressable that is itself an accessibility element hides its children. In `CodeRow` the whole fault row is a Pressable with a fixed label, and the "Details for fault P0420" button sits inside it. In `ListRow` the `right` slot is inside the row Pressable, so the trash button on each saved set in the live-values picker ("Delete the set X") is inside the set row. In Customise the "Technical" button and the "Source" link sit inside the item Pressable. A VoiceOver user never hears these buttons, so they cannot read fault detail, delete a saved set or open a source.

Fix (JS only): make the nested control a sibling of the row Pressable (row is a `View` with two Pressables side by side), or keep one Pressable and add `accessibilityActions` with `onAccessibilityAction`, for example `[{ name: 'activate' }, { name: 'details', label: 'Show details' }]`. In `ListRow`, render `right` outside the Pressable when `right` is interactive.

### 2. A Customise switch tells VoiceOver nothing about what the write did (high)

`src/app/customise/index.tsx:595-636` (and `:704-750`).

Switches write at once, as the owner chose, so the result is the only feedback. The outcome text (`message.text`, ok or danger, line 631) and the working text (`WRITING`, line 632) sit inside the item Pressable whose `accessibilityLabel` is fixed to "title, show details". VoiceOver reads the fixed label and never the result. The description of the current state (`stateText`) is also hidden by the override. The Switch next to it only says its title and on or off.

Fix: drop the label override and let the children speak, or build the label from `title, stateText, message?.text, working ? WRITING : ''`. Announce the result (finding 3). Put `expanded` in `accessibilityState` and leave the words "hide" and "show" out of the label.

### 3. Results and errors appear with no announcement (high)

`src/ui.tsx:698-707` (`Notice`), used at `src/app/diagnostics.tsx:545-546`, `src/app/workshop/[id].tsx:335`, `src/app/customise/index.tsx:538`, `:872`, `src/app/(tabs)/(car)/index.tsx:49-57`, `src/screens/LiveScreen.tsx` (share error).

"Faults cleared", "The check stopped: ...", "Clearing stopped", "No control module answered" and the write result all arrive as a `Notice` above the list. Nothing moves VoiceOver focus or speaks. Success also gives a haptic only (`success()` at `diagnostics.tsx:156`, `:270`). There is no `announceForAccessibility`, `setAccessibilityFocus` or live region anywhere in `src`.

Fix: in `Notice`, when `tone` is `danger` or `ok` and a new text mounts, call `AccessibilityInfo.announceForAccessibility(text)` in a `useEffect([text])`. Add `accessibilityLiveRegion="polite"` for Android and `accessibilityRole="alert"` for danger. One change covers every screen.

### 4. Long runs and live changes are silent (medium)

`src/app/diagnostics.tsx:478-510` (percent, "Reading X", faults so far), `src/ui.tsx:1080-1109` (`ProgressBar`), `src/app/find-switch.tsx:166-217` (changed list and seconds counter), `src/screens/LiveScreen.tsx:289-320` (value tiles and alert limit).

- The health check shows a percentage, the module being read and a running fault count. None is spoken. The module ring label is on a non-accessible View, and `ProgressBar` has a role and value on a View that is not `accessible` (check on device).
- Find a switch exists to show which value changes when a switch is pressed. A new row in "Changed since the baseline" is silent, so a VoiceOver user cannot use the tool.
- Live tiles put the value in the label, so it is current only when focus lands on the tile. Crossing an alert limit changes colour and the label but makes no sound or speech (the Dashboard buzzes; Live data does not).

Fix: announce progress at 25% steps and on finish; announce each new changed field in find-switch ("Group 3 field 2, now 1"); announce when a tile first crosses its limit ("Coolant temperature, 112 degrees, past the alert limit"), at most once per crossing. Add `accessible` to the `ProgressBar` and `ModuleRing` wrappers.

### 5. Severity and change are shown by colour or icon only (medium)

`src/components/CodeRow.tsx:87`, `:94-95`; `src/app/(tabs)/(lookup)/lookup.tsx:190`, `:250-251`; `src/app/diagnostics.tsx:~683-684`; `src/app/workshop/[id].tsx:509-516`; `src/ui.tsx:1280`.

- A serious fault code is a red chip (`serious` in `CodeRow`) and, in Lookup, a red octagon square or a danger chip. The spoken label has the code, title and state, never "serious".
- Workshop byte buttons show "changed" by `accentText` and a raised fill, "has named bits" by an orange 1.5 pt outline, and "open" by an orange wash. The label is "Byte 3, 98" only, and `selected` or `expanded` is not set.
- Module ring dots distinguish clear, faults and not fitted by colour only.

Fix: add the word to the label: `${code}. Serious. ${title}. ${sub}`; `Byte 3, 98, changed, has named bits` with `accessibilityState={{ selected: openByte === i }}`; give the ring an accessible text summary ("3 clear, 1 with faults, 2 not fitted"). In Lookup, add "Serious" to the row subtitle for high severity.

### 6. Control boundaries below 3:1 (medium)

`src/ui.tsx:783`, `:827`, `:913`, `:977`; Switch off tracks at `workshop/[id].tsx:478`, `:533`, `customise/index.tsx:643`, `:707`, `:748`. Ratios in table rows C1 to C5.

A low-vision user in light or dark mode sees a text field, an unselected chip or an off switch as a faint smudge on the page (1.1 to 1.3:1). The off-state switch track is `sunken`, which makes "off" almost invisible on the controls that write to the car.

Fix: add `outline` to both themes in `theme.ts` (light `#7A7A84`, dark `#7C7C88`), use it as a 1 pt border on `Field`, `SearchField`, unselected `Chip` and the `Segmented` track, and as `trackColor.false` (or `t.grey`) on every Switch.

### 7. Stepper and plus/minus buttons are ambiguous and silent (medium)

`src/ui.tsx:946-972` (`Stepper`), `src/screens/LiveScreen.tsx:718-720`, `src/app/customise/index.tsx:801`.

Every `Stepper` button says "Lower" or "Higher", so on Customise a list of adaptations reads "Lower, Higher, Lower, Higher" with no setting name. The value between them is a separate stop and is not read after a press, so the user hears a haptic and nothing else. In the Live data module reader the buttons are `Button label="−"` and `"+"`, which VoiceOver says as "minus" and "plus" with no object ("Group 12" is a third stop).

Fix: give `Stepper` a `label` prop and wrap it as one adjustable element: `accessible`, `accessibilityRole="adjustable"`, `accessibilityLabel={label}`, `accessibilityValue={{ text: value }}`, `onAccessibilityAction` for `increment` and `decrement`. For the group stepper add an optional `accessibilityLabel` to `Button` ("Previous group", "Next group") and announce the new group number.

### 8. Section headers are not headers (medium)

`src/ui.tsx:345-354` (`Label`, used by `Group header`).

`Title` and `Heading` set `accessibilityRole="header"`, but the uppercase section label that heads every grouped list does not. The VoiceOver Headings rotor on the Car tab, Diagnostics or Customise finds none of the sections ("Driving", "Expert", "No faults", "Could not read").

Fix: add `accessibilityRole="header"` to both `Text` elements in `Label`.

### 9. Large text is cut short in the headline stats and tiles (medium)

`src/app/(tabs)/(car)/index.tsx:322-330` (Stat: `numberOfLines={1}`, three across), `:355` (Tile value `numberOfLines={2}`, two across), `src/screens/LiveScreen.tsx:301` (tile label one line), `src/app/diagnostics.tsx:~501` ("Reading X…" one line), `src/ui.tsx:659` (ListRow value two lines).

Text scales (good), but the three Stat columns, "Engine light / Self-tests / Battery", and the two-column tile grid truncate at the larger Accessibility sizes. The tile comment says the value "is never cut short", yet `numberOfLines={2}` cuts "Learn my car first" and "Reminder and reset" at those sizes. The battery voltage can read "12…".

Fix: read `useWindowDimensions().fontScale`; above about 1.3, stack the Stats vertically and make Tiles full width; remove `numberOfLines` on the `Tile` value and the Stat label, or raise it to 4. Do not add `maxFontSizeMultiplier`.

### 10. Spoken label differs from visible text (low)

`src/screens/LiveScreen.tsx:734-737`, `src/app/find-switch.tsx:198`.

The value-name button shows the field's name and "Rename" but speaks "Name field 3"; the actual name and value (a separate Text) are not in it. In find-switch the button shows "Name this value" but speaks "Name group 3 field 2". Voice Control users who say "tap Name this value" get no match, and VoiceOver users do not hear the field name with the Name button.

Fix: label `${nameOrField}: ${value}. ${own ? 'Rename' : 'Name'} this value`, or drop the override on find-switch so the visible text is the label.

### 11. Disclosure and selection state not exposed (low)

`src/app/diagnostics.tsx:~665-672` ("n modules not found" / "Hide"), `src/ui.tsx:684-686`, `src/app/customise/index.tsx:597`, `:791`, `src/app/workshop/[id].tsx:509`.

A row that opens or closes in place says only "button". `ListRow` has no `expanded` prop; Customise puts "hide" or "show" in the label words; the byte button has no `selected`.

Fix: add `expanded?: boolean` to `ListRow` and pass `accessibilityState={{ expanded }}`; use the same in Customise rows.

### 12. Dark-mode contrast of the red glyph and tab badge (low)

`src/theme.ts:104-106`, `src/ui.tsx:647-648`, `src/app/(tabs)/_layout.tsx:11`. See C6 and C7: 2.97:1 for the white glyph on the dark red square and for the badge. The glyph rows also have a text title, so the loss is small.

Fix: `onTool(colour, dark)` returns `#0A0A0A` for red in dark; badge `#C4112F`.

### 13. Small targets (low)

`src/app/(tabs)/(car)/index.tsx:52` ("Stop trying": 20 pt text plus 10 slop each side is 40 pt), `src/app/customise/index.tsx:624`, `:842` (Source link: text plus 6 slop, about 30 pt), `src/screens/LiveScreen.tsx:734` (name button about 34 pt), `src/screens/LiveScreen.tsx:904-909` (picker Cancel and Done rely on `barButton`).

Fix: `minHeight: 44` on each, or `hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}`.

### 14. Switch rows read twice and without their description (low)

`src/app/workshop/[id].tsx:461-481`, `src/app/customise/index.tsx:594-648`, `:700-750`.

The row title is a Text and also the Switch label, so VoiceOver says it twice; the "Changed" pill, the place label and "not tested on this car" are separate stops, after the Switch. Fix: make the row one `accessible` element with `accessibilityRole="switch"`, label `title`, `accessibilityHint` for the description and "changed", and `onAccessibilityAction`/`onPress` toggling the Switch, or hide the duplicate Text with `accessibilityElementsHidden`.

## 4. Screens read, short notes

| Screen | Result |
|---|---|
| `(tabs)/_layout.tsx` | Native tabs with labels. Badge colour C7. The "!" badge speaks as "exclamation mark"; the Car tab does not say the engine light is on |
| `(tabs)/(car)/index.tsx` | Stat, Tile and learn rows have role and labels. Fault count is text as well as colour. Findings 3, 9, 13 |
| `(tabs)/(diary)/diary.tsx` | Add and Delete buttons have labels and 44 pt targets. Entry rows are loose Texts (several stops per entry): low, fold into one `accessible` View |
| `(tabs)/(lookup)/lookup.tsx` | Search, chips and rows are labelled. Finding 5. Result count changes and "No matches" are silent: low |
| `(tabs)/(settings)` | Wrapper only; the page itself (`src/app/settings.tsx`) was not in scope |
| `diagnostics.tsx` | Findings 1, 3, 4, 5, 11. Clear rows have role and 48 pt height |
| `LiveScreen.tsx` | Findings 1, 4, 7, 10, 13. Alert limit in the label: good. The `Spark` bars are hidden: good |
| `workshop/[id].tsx` | Findings 5, 6, 14. Fields have labels |
| `customise/index.tsx` | Findings 1, 2, 6, 7, 11, 14. Field for wide values has a label with range: good |
| `find-switch.tsx` | Findings 4, 10 |
| `NameValue.tsx` | Fields labelled, buttons fine. No finding |
| `CodingHistoryList.tsx` | Entries are loose Texts; every "Put back this coding" button has the same label, so the user cannot tell which entry it acts on. Low: pass an `accessibilityLabel` with the date |

## 5. Reduce Motion and Dynamic Type

- Reduce Motion: `ScanPulse`, `ModuleRing` and `Arrive` stop or shorten. `ProgressBar` still glides (400 ms, JS driver, harmless). Button press scale (0.97) stays: acceptable.
- Dynamic Type: scaling is not disabled and no cap is set. The risk is truncation, finding 9. `adjustsFontSizeToFit` is used in `Stat` and the Workshop address with a floor of 0.85 and one line, which truncates the text at large sizes where a wrap would keep it.

## 6. Order of fixes (all JavaScript or TypeScript)

1. `Notice` announcement (finding 3): one component, fixes the most.
2. Un-nest controls and stop label overrides (findings 1, 2).
3. `Label` header role (finding 8) and `ListRow` `expanded` (finding 11): two lines each.
4. `outline` token and Switch off colour (finding 6, C1 to C4).
5. `Stepper` adjustable (finding 7).
6. Severity words in labels (finding 5).
7. Announcement policy for progress, find-switch and live alerts (finding 4).
8. Large text layout (finding 9), then the lows.


## Fixes applied

Checked with `npx tsc --noEmit` (clean) and Jest (797 tests passed, 57 suites; 12 new contrast tests for the `outline` and `switchOff` tokens, the dark red glyph and the tab badge). Nothing was run on a device, so VoiceOver behaviour is not observed. No commit.

| # | Result | What was done, or why it was left |
|---|---|---|
| C1 | Fixed | `outline` token (light `#7A7A84`, dark `#7C7C88`) as a 1 pt border on `Field` and `SearchField`. |
| C2 | Fixed | The same border on unselected chips. |
| C3 | Fixed | Border on the segmented track and the selected segment. |
| C4 | Fixed | `switchOff` token on every switch through `Toggle`. |
| C5 | Left | Stepper button fill is decorative; the glyph passes at 5.1 or more, as the report allows. |
| C6 | Fixed | `onRed` token and `onTool(colour, theme)`: dark glyph on the dark red square. |
| C7 | Fixed | Tab badge uses the `badge` token `#C4112F`. |
| C8, C9 | Fixed | Light `accentText` `#9A3500` and `danger` `#A00F33` (text tokens; brand fills unchanged). |
| 1 | Fixed | `CodeRow`, `ListRow` with `control` (picker delete, speed ranges, auto-start steppers) and Customise rows are plain containers with separate buttons. Technical, Source and the switch are siblings. |
| 2 | Fixed | Customise: the label override is gone, so the description is read; `expanded` state; result text is a live region and is announced; "Writing" is announced. |
| 3 | Fixed | `announce()` in `src/ui.tsx`. `Notice` announces ok and danger results (alert role, live region, default icon). Used for Customise results, Live recording, find-switch and the health check. |
| 4 | Fixed | `ProgressBar` and `ModuleRing` are accessible elements; progress is spoken at each quarter and at the end; find-switch announces each changed value; Live data announces a value crossing its alert limit. |
| 5 | Fixed | "Serious" in fault row and Lookup labels; byte buttons say changed and has named bits, with selected state; ring label gives clear, faults and not fitted counts. |
| 6 | Fixed | See C1 to C4. |
| 7 | Fixed | `Stepper` is one adjustable element with a `label`; the group steppers use it; `Button` takes an `accessibilityLabel`. |
| 8 | Fixed | `Label` has the header role. |
| 9 | Fixed (part) | Above a font scale of 1.3 the Stats stack and Tiles go full width; the Tile value, Stat label, live tile label and "Reading X" lines wrap. Left: the Workshop address still shrinks to fit on one line. |
| 10 | Fixed | Name buttons speak the visible words. |
| 11 | Fixed | `ListRow` takes `expanded`; used for the disclosure rows in Health check, Parts and IDs, Car reference, Discover, Fuses and Customise. |
| 12 | Fixed | See C6 and C7. |
| 13 | Fixed | 44 pt on Stop trying, the Source links, Technical and the name buttons; the search clear button has `hitSlop` 16. |
| 14 | Fixed (part) | Settings, Learn my car, Logger and Workshop rows are one switch element with the description as the hint. Customise keeps a separate switch beside its details button, so Technical and Source stay reachable. |

Also done: `accessibilityState` on switches, steppers and busy buttons; the Coding history Put back button says which entry; diary entries read as one element. Left: Field error association and the silent Lookup result count (low, not numbered).
