# 2007 Leon: Listen recordings of a Carista EVO, 21 Nov 2026

Source: 3 Listen recordings uploaded from the owner's car (VIN ending 070359), decoded with scripts/decode_listen.py. Raw and decoded copies: replica/findings/cupra-listen-2026-11-21 (kept on this PC only). Bytes below are verbatim. The owner's markers are quoted as he typed them.

## Long coding write, central electronics (TP2.0 address 20, part 3C0937049AE). Confidence: High (real capture, 4 writes, all accepted)

- `10 89` -> `50 89`
- `1A 9A` -> `5A 9A 00 06 46 22 19 29 32 30 30 32 10 18 <23 coding bytes> FF`
- `3B 9A 00 06 46 22 19 29 B2 30 30 32 10 18 <23 coding bytes> FF` -> `7F 3B 78`, then `7B 9A` about 0.75 s after the last frame
- `1A 9A` again to read back
- The software bytes in the write are those of `1A 9B` (B2 30 30 32). The `1A 9A` record shows 32 30 30 32.
- Frames of the write went out about 30 ms apart. The tester sends A3 often and the module answers A1.

Coding before any change: E3 0E 1E 0F 00 04 10 00 50 32 00 32 32 00 00 00 00 41 7F 07 32 40 00

| Owner's marker | Change |
|---|---|
| "Rear side bulb check on" | byte 18: 7F to FF (bit 7 set) |
| "Side marker 100%" | byte 7: 00 to 64 |
| "Sidemarker 0%" | byte 7: 64 to 00 |
| "Side light as parking light on" | byte 7: 00 to 01 |

Not known: what byte 7 = 01 means against the 0 to 100 scale.

## Short coding write, instrument cluster (TP2.0 address 07, part 1P0920925CX). Confidence: High (real capture)

- `10 89` -> `50 89`; `1A 9B` -> `7F 1A 78`, then `5A 9B ... 30 34 32 32 03 00 19 01 0B 7D B1 A4 12 9D ...`
- `3B 9A 0B 7D B1 A4 12 9D 30 34 32 32 03 00 11 31` -> `7F 3B 78`, then `7B 9A`
- Marker: "Disabled seatbelt". Coding 0006401 to 0004401 (digits 3 and 4: 06 to 04).

## Adaptation, instrument cluster. Confidence: High for the bytes (real capture)

- `10 89`; `31 B8 01 03` -> `71 B8 01 03`; `31 BA 01 03` -> `71 BA 01 03 81`
- select channel: `31 B9 01 03 <channel>` -> `71 B9 01 03`; read: `31 BA 01 03` -> `71 BA 01 03 82 03 <value hi> <value lo> ... FF`
- test a value: `31 B9 01 03 <hi> <lo>`; save: `31 BB 01 03 <hi> <lo> <workshop code 6 from 1A 9B>` -> `7F 31 78` several times, then `71 BB 01 03`
- leave: `32 B8 01 03` -> `72 B8 01 03 62`
- Marker "Reset oil": channel 02 saved as 00 00 with workshop code 0B 7D B1 A4 12 9D (3 saves in the recording).
- A channel the module does not have answers `7F 31 31`.

Central electronics channels read by the tool: channel 01 = 00 14 (20), channel 02 = 00 0A (10).

## Also in the recordings, not decoded yet

- "Hvac flap calibration" (address 2C) and "Throttle body calibration" (address 01): the sequences are in 2026-11-21T12-38-24.dec from line 310.
- A login try on address 09 (power steering): `27 03` -> `67 03 D0 D7 C7 F8`, `27 04 D0 D8 2F 6D` -> `7F 27 35` (refused).
- "Obd live data" and "Car health check" in 2026-11-21T12-44-56.dec (standard OBD requests only).

## What Pin16 did differently before 1.0.43

- It sent the software bytes of the `1A 9A` record (32 30 30 32) in the write, where the working tool sends those of `1A 9B` (B2 30 30 32).
- It spaced the frames of a long request 150 to 180 ms apart.
Which of the two made the module ignore the write is not known: Pin16's own log of a failed write was never uploaded.
