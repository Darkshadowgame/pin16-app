# Review: TP2.0 write fix, short coding items (21 Nov 2026)

Scope: `git diff HEAD` excluding replica/. Ground truth: replica/leon-listen-2026-11-21.md and the decoded files in replica/findings/cupra-listen-2026-11-21.

Checks run: `npx tsc --noEmit` clean. `npx jest` (without .claude): 46 suites, 650 tests, all pass.

Score: BUGS 8/10 (no high, one medium, two low).

## Verified correct

- Write bytes: for 23 coding bytes the frames are `00 26 3B 9A 00 06 46 | 22 19 29 B2 30 30 32 | 10 18 E3 0E 1E 0F 00 | 04 10 00 50 32 00 32 | 32 00 00 00 00 41 FF | 07 32 40 00 FF`. This matches the recording (line 152 of 2026-11-21T12-43-34.dec) byte for byte. The short write `3B 9A 0B 7D B1 A4 12 9D 30 34 32 32 03 00 11 31` also matches.
- Software and workshop bytes from 1A 9B for a long-coded module: replica/findings/cupra/log-REPORTED-2026-11-13T12-41-40.json holds the module 20 answer `5A 9B 33 43 ... 20 B2 30 30 32 10 00 00 00 00 06 46 22 19 29`. Offsets 14 to 17 (software) and 22 to 27 (workshop code) in `tp20ReadCoding` are right for it.
- `writeTp20Coding` (elm.ts:2240) compares `coding` only (read-back, mismatch, error path). The restore uses the `now` record, so it still compares the right things.
- Single-frame requests and `fastFrames` false: no AT command is sent and the old 30 ms pause stays. No change.
- A resend from a later frame (`sendFrom(missing)`): ATR0 is sent again unless only the last frame is left, and ATR1 goes before the last. Correct.
- Short maths: 6401 (00 19 01) to 4401 (00 11 31) and back is right (`floor(n/1000) % 100` is digits 3 and 4 of 7; flag +02). Flag already set changes nothing. Values above 0x7FFFFF, bytes above 0xFF and arrays of other than 3 bytes are left alone in `isOn` and `withItem`. A pair of 97 to 99 cannot overflow into the hundreds. The cluster short coding is read as `id.slice(19, 22)`, 3 bytes big-endian, and written as `03 b0 b1 b2`.
- Style gating: `fitsStyle` is used in customise `ready`, workshop `items` and `applySetting`. A short item cannot reach a long or UDS module, or the reverse, once the coding has been read. `applySetting` re-reads the coding first, which sets the style, so it is a safe backstop.
- Rear side bulb check: Customise `ready` has no `length` gate (only `c.length > i.byte`), byte 18 exists in the 23-byte coding (value 7F, bit 7 clear), platform PQ35 is the Leon II (`vin.ts:87`), module `vag-09` is the central electronics. Offered. The workshop screen still gates on `draft.length === i.length`, which is fine for this car.

## Findings

1. MEDIUM. `src/obd/tp20.ts:268-277` and `:53`. Adapter can stay in AT R0 after a timed-out ATR0.
   - Trigger: ATR0 times out (`AdapterTimeout`, 800 ms, a Bluetooth stall) but the adapter processes it late.
   - Effect: the catch sets `fastFrames = false`, `quiet` stays false, so ATR1 is never sent, including by the `finally`. The last frame and every later request run with responses off (no answers heard). `tp20LeaveCommands` has no ATR1 either, so normal OBD after `leave()` stays deaf until the adapter is reset. `enter()` does not send ATR1 either. The same applies if the `finally` ATR1 times out.
   - Fix: on any ATR0 failure other than the "?" reply (a `?` is an ObdError from `cmd`), set `quiet = true` so ATR1 is still sent. Add `'ATR1'` to `tp20LeaveCommands` and to `enter()`. Check the test that pins the leave list, if any.

2. LOW. `src/obd/tp20.ts:279-281`. A failed ATR1 aborts the request before the last frame.
   - Trigger: `cmd('ATR1')` rejects with a non-LinkLost error (timeout or "?").
   - Effect: it throws out of `sendFrom` and `exchange`. The module holds n-1 frames, `txSeq` is not advanced, so the next request reuses the same sequence numbers. Before this change a failed frame send was swallowed. `finally` does resend ATR1, so the adapter is not left deaf.
   - Fix: wrap ATR1 in a try, retry once with `send`, and still send the last frame.

3. LOW. `__tests__/tp20.test.ts:573-607`. The test does not check what its title says in two places.
   - "quickly" is not asserted (the mock is instant).
   - `tp20ReadCoding` for a long module is not tested at all, so the new use of the 1A 9B software and workshop bytes (the core of the fix) has no test. Only `tp20WriteCoding` with hand-supplied `sw` and `wsc` is covered.
   - There is no test of the ATR0 or ATR1 failure paths in findings 1 and 2.
   - Fix: add a read test with the 1A 9B and 1A 9A answers from the recording and assert `sw` is B2 30 30 32. Add timeout tests for ATR0 and ATR1.

4. LOW (cosmetic). `src/coding/apply.ts:26` says "a long coding" for a short item on any non-short module (UDS or `did` too). `src/coding/items.ts:4` still says "exactly the length the source describes". `src/kb.ts:169` prints a short item as "byte 0, bit " (empty).

## Not a bug

- The `coding.test.ts` "guards the length" test also covers 0xFFFFFF; the name is slightly off but the assertions are real.
- Tests in coding.test.ts assert what they claim.
