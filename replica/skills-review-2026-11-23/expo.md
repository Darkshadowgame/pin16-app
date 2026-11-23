# Pin16 review against the Expo skills, 23 November 2026

Skills applied: expo-native-ui, expo-router, expo-project-structure, expo-animation, eas-update (all loaded through the Skill tool).
Scope: src/, app.json, eas.json, package.json, .fingerprintignore, .github/workflows/build-sideload.yml. Nothing was edited, built or run.

## Score: 7 / 10 for fit with Expo guidance

Solid: native tabs (`NativeTabs`, SF Symbols with Material fallbacks), a native stack with large titles and blur header, `src/app` holds routes only, screens sit under `src/screens`, `contentInsetAdjustmentBehavior="automatic"` and `keyboardShouldPersistTaps="handled"` on the shared `Screen`, reduced motion is respected, `expo-haptics`, `expo-audio`, `expo-image-picker` and `react-native-safe-area-context` are used correctly, the fingerprint policy and `.fingerprintignore` are consistent, and no removed React Native modules are used. The findings below are mostly keyboard handling, render cost and small API drift. All are fixable in JavaScript or TypeScript (one in the workflow file) and need no native change.

Left out on purpose, as they need native changes or are the owner's choices: Reanimated or Gesture Handler for chart scrubbing, `react-native-keyboard-controller`, `@expo/ui`, `FlashList`, the old "caristini" names, brand colours, no-confirm coding switches.

## Findings, most severe first

### 1. High: the keyboard covers the field and the primary action on scrolling pages
- Where: `src/ui.tsx:236-241` (shared `Screen` ScrollView). Affects `src/app/diary-add.tsx:36-73` (Notes field and "Save entry" sit at the bottom of a modal form), `src/app/listen.tsx:158` (Marker note field while recording), the value picker in `src/screens/LiveScreen.tsx` (about line 930, "Name for these values" and "Save set"), and the ScrollViews at `src/app/dashboard.tsx:505, 573, 618`, `src/app/logger.tsx:328`, `src/live/LiveTiles.tsx:187`. A search of `src/` finds no `automaticallyAdjustKeyboardInsets`.
- Breaks: a form's primary action must never sit under the keyboard.
- Fix: add `automaticallyAdjustKeyboardInsets` to `Screen`'s ScrollView and to the modal ScrollViews listed (a plain ScrollView prop, JS only on iOS). Add `keyboardDismissMode="interactive"` to the same views.

### 2. Medium: "Save entry" can be tapped twice and has no failure path
- Where: `src/app/diary-add.tsx:57-73`.
- What: the `onPress` awaits `addDiary` and then `router.back()`. There is no `busy` state, so a second tap during the write saves a duplicate diary entry. A rejected write is an unhandled promise and the form stays with no message.
- Breaks: async saves need pending and failure states and must keep the draft until the save succeeds.
- Fix: a `saving` state passed to `Button busy`, `try/catch` with a `Notice` on failure, `router.back()` only after success.

### 3. Medium: chart scrubbing re-renders the whole log page on every touch move
- Where: `src/logger/Charts.tsx:58-68` (line chart) and `178-190` (route map) call `onScrub`; `src/app/log-view.tsx:159, 180, 207` pass `setCursor` straight in, and `log-view.tsx:25` holds `cursor` in page state.
- What: each pan event is a `setState` on a page holding three charts and a readout list. On a long log this drops frames. The route map also returns `true` from `onMoveShouldSetPanResponder`, so a vertical swipe that starts on the map scrubs first and only then hands over to the page scroll.
- Breaks: never `setState` per frame from a gesture handler; `PanResponder` is on the "never ship" list (the proper fix, Gesture Handler plus shared values, is a native dependency and out of scope here).
- Fix within JS: call `setCursor` only when the snapped value changes (route map: when the nearest index changes; line chart: round to the sample step), batch to one update per animation frame with `requestAnimationFrame`, and wrap the chart readouts in `React.memo`. Use `onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > Math.abs(g.dy)` on the route map as the line chart already does.

### 4. Medium: History renders up to 500 entries in one ScrollView and recomputes every diff on each render
- Where: `src/app/history.tsx:114-119` (`days.map`, then `diffScans(previousFull(list, e), e)` per scan row); the list is capped at 500 in `src/history.ts:71`.
- What: every `setOpen` (expanding a row) re-renders all rows and re-runs `previousFull` (a search of the list) and `diffScans` for each scan entry, so cost grows with the square of the history. There is also no loading state: before `list` loads the page shows only the chips and the timeline row.
- Breaks: long lists belong in a virtualised list; never show a half-built screen while the first load resolves.
- Fix: compute the per-entry diff once in a `useMemo` keyed on `list`, and build the expanded body only for the open row. Render the day groups through a `SectionList` (core React Native) with `contentInsetAdjustmentBehavior="automatic"`, or page the list ("Show earlier"). Show an `ActivityIndicator` while `list` is null.

### 5. Low: every screen gets about 120 pt of bottom padding, including pushed screens with no tab bar
- Where: `src/ui.tsx:196-199, 238` (`Math.max(120, insets.bottom + TAB_BAR_CLEARANCE)`).
- What: the clearance is meant for the floating tab bar on the four tab roots. Pushed screens (Live data, Health check, Service and about 30 more) have no tab bar, so users scroll past a blank band at the end.
- Breaks: safe-area handling should come from insets and `contentInsetAdjustmentBehavior`, not a fixed constant on every page.
- Fix: apply the clearance only when `title` is set (the tab roots pass it, per the comment at `ui.tsx:201`); otherwise use `insets.bottom + space.xl`. Check on a device whether `contentInsetAdjustmentBehavior="automatic"` already adds the tab bar inset on the roots, which would let the constant shrink there too.

### 6. Low: help and picker sheets are hand-built Modals, not router form sheets
- Where: `src/ui.tsx:383-440` (`HelpSheet`, opened from about 40 header buttons), the value picker in `src/screens/LiveScreen.tsx` (about line 895) and the sheets in `src/app/dashboard.tsx`.
- Breaks: present a sheet as a route with `presentation: 'formSheet'` and detents; a custom modal component is the thing to avoid.
- Fix: a `help` route (`/help?id=...`) with `presentation: 'formSheet'`, `sheetAllowedDetents: [0.5, 1]`, `sheetGrabberVisible: true`, and `HelpButton` calling `router.push`. This also removes a `Modal` and state from every header button. Lower priority, since the current page sheet looks native on iOS.

### 7. Low: deprecated large-title option name
- Where: `src/tabStack.tsx:20` (`headerLargeTitle: true`).
- Breaks: on SDK 56 and later the option is `headerLargeTitleEnabled`; `headerLargeTitle` is deprecated.
- Fix: rename the option. The other large-title options on lines 22-24 are unchanged.

### 8. Low: Lookup uses an in-page search field, not the header search bar
- Where: `src/app/(tabs)/(lookup)/lookup.tsx:21`, `src/ui.tsx:974-999` (`SearchField`).
- Breaks: prefer `Stack.SearchBar` for search on a screen.
- Fix: put `Stack.SearchBar` (with `onChangeText`, `placeholder`, `autoCapitalize="characters"`) in the Lookup screen's `Stack.Screen` options and keep `SearchField` for the Android and web fallback. The value picker's search sits in a modal and can stay.

### 9. Low: error and notice text cannot be selected or copied
- Where: `src/ui.tsx:698-705` (`Notice`); also error lines such as `detailError` in `src/app/code/[code].tsx` and the `ended` notice in `src/app/listen.tsx`.
- Breaks: add `selectable` to text that shows data or error messages.
- Fix: add `selectable` to the `Text` in `Notice` (one change covers every notice). Fault text and adapter errors are what the owner would paste into a message.

### 10. Low: the over-the-air publish step names no EAS environment
- Where: `.github/workflows/build-sideload.yml:118` (`eas-cli update --branch production ...`).
- Breaks: from SDK 55 an update should be published with an explicit environment so the exported code receives the intended variables.
- Fix: add `--environment production` (create the environment in EAS first). This is a workflow edit only and does not touch the fingerprint. It is not known from the repository how the current publish resolves `EXPO_PUBLIC_*`, so test with one update before relying on it.

### 11. Low: a haptic fires on every press, including navigation
- Where: `src/ui.tsx:177-179` (`tap`), called from `Button` (about line 531), `ListRow` (687-690), `Chip` (836), `HeaderButton` (272-275) and others.
- Breaks: haptics are for value ticks and commits, once per action; selection haptics suit steps through values.
- Fix: keep `tap()` on `Chip` selection, `Segmented` and `Stepper`; drop it from rows and buttons that navigate (a row with a chevron, `HeaderButton`); use `impactAsync(Light)` for commits such as Save.

### 12. Low: the progress bar animates `width` through the JS driver
- Where: `src/ui.tsx:1085-1100` (`ProgressBar`, `useNativeDriver: false`).
- Breaks: animate transform and opacity, not layout properties; reduced motion should shorten or drop the animation.
- Fix: draw the fill at full width and animate `transform: [{ scaleX }]` with `transformOrigin: 'left'` and `useNativeDriver: true`; skip the animation when `useReduceMotion()` is true (not checked here). The cost is small on a 4 pt bar, so this is polish.

## Checked and fine
- Routes: `/` resolves through `(tabs)/(car)/index.tsx`; `src/app` holds only routes plus stale `.old` files that the router ignores; dynamic routes read params with `useLocalSearchParams`.
- No `Dimensions.get`, `SafeAreaView`, legacy shadow or `elevation` styles, `PlatformColor` or `@react-navigation/*` imports.
- Core `Animated` loops in `ScanPulse` and `Arrive` use the native driver, animate only opacity and transform, and honour reduced motion.
- `.fingerprintignore` lists only `.gitignore`; the runtime-version policy and channel header in `app.json` match `eas.json`.
- No `+not-found` route exists, so a bad deep link shows Expo's default unmatched screen; minor and left out of the list.


## Fixes applied

Checked with `npx tsc --noEmit` (clean) and Jest (785 tests passed, 57 suites). Nothing was run on a phone. No commit.

| # | Result | What was done, or why it was left |
|---|---|---|
| 1 | Fixed | `automaticallyAdjustKeyboardInsets`, `keyboardShouldPersistTaps="handled"` and `keyboardDismissMode="interactive"` on the shared `Screen` and on the modal ScrollViews in `ui.tsx`, `LiveScreen.tsx`, `dashboard.tsx`, `logger.tsx` and `LiveTiles.tsx`. Diary add and Listen use `Screen`. |
| 2 | Fixed | Save entry has a busy state, ignores a second tap, keeps the draft, and shows a Notice when the save fails. `addDiary` now resolves true or false. |
| 3 | Fixed | Scrubbing updates once per animation frame and only when the snapped value changes; `LogChart`, `RouteView` and the readouts are memoised; the route map hands a vertical swipe to the page. |
| 4 | Fixed (part) | The diff is computed once in a `useMemo`, the expanded body is built for the open row only, and an ActivityIndicator shows while the list loads. Left: `SectionList` or "Show earlier" paging (changes the list structure and scroll behaviour). |
| 5 | Left | Layout and spacing change for the second pass. |
| 6 | Left | A new route and a structure change, lower priority as the report says. |
| 7 | Fixed | `headerLargeTitleEnabled` in `src/tabStack.tsx`; the installed expo-router reads both names. |
| 8 | Left | Moves search into the header: a layout and design change for the second pass. |
| 9 | Fixed | `selectable` on the `Notice` text. |
| 10 | Left | Workflow change. |
| 11 | Left | Haptic feel is a design decision for the second pass. |
| 12 | Left | Visual polish on a 4 pt bar; the scaled fill also distorts the rounded end. |
