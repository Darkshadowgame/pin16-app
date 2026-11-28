# 2007 SEAT Leon 1P: numeric bytes and open labels, research of 28 Nov 2026

Read-only web research. Nothing committed or pushed. Companion to `leon-mods-2026-11-27.md` (sections 2 and 3 read first).

Method note: pages were read through a fetch tool that summarises. Quotes are as returned by it. A quote marked "(paraphrase)" came from a search-tool summary or the fetch tool said it paraphrased. Where a page said "unbekannt" or gave no label, that is stated. Nothing is filled from memory.

Grades: High = Ross-Tech wiki, or 2 independent sources that agree for this part family and coding length. Medium = 1 detailed source for the exact family and length. Low = other (sibling family, other car, search summary).

Independence caveat: VAGData and Cool Car carry word-for-word the same Passat B6 (3C) tables, so they count as 1 source, not 2. vagcode.info, vag-coding.net, igorweb.org and the Ross-Tech wiki are separate from them.

Car bytes used below (09, 23 bytes): A3 0E 1E 07 00 04 10 01 50 32 00 32 32 00 00 00 00 41 FF 07 32 40 00.
Car bytes (46, 19 bytes): 90 80 08 00 7F 83 CC 7F 00 06 0F 0F E0 08 DF 84 10 5C 80.

## 1. Module 09, 3C0 937 049 AE, 23-byte coding (label 3C0-937-049-23-H)

### 1a. Numeric bytes

Where the label text comes from: VAGData and Cool Car list "Bordnetz (STG 09)" bytes 07 to 20 for the Passat B6 [3C], the same 3C0 937 049 family and the same 23-H label. vagcode.info (3C0 937 049 E, label 3C0-937-049-23-H.lbl) confirms that bytes 7 to 16 and 20 are decimal fields but gives no name. Neither German source gives bytes 21 and 22.

URLs:
- VAGData: https://vagdata.de/passat-b6/
- Cool Car: https://www.coolcar.ch/fahrzeug-codierung/codierung-vw-passat-b6-3c/
- vagcode.info 3C0 937 049 E (21-byte string, 23-H label): https://vagcode.info/en/components/7756fed0e8d08ce7ea9b8c9e3d94ad63.html
- vag-coding.net Golf 5 US-mode turn signals: https://www.vag-coding.net/vw/golf-5-1k/golf-5-1k-activate-turn-signals-in-us-mode/
- vag-coding.net Golf 5 DRL with fog lights: https://www.vag-coding.net/vw/golf-5-1k/golf-5-1k-activate-daytime-running-lights-with-fog-lamps-drl/
- Ross-Tech Golf/Jetta/Bora 1K tweaks: https://wiki.ross-tech.com/wiki/index.php/VW_Golf/Jetta/Bora_(1K/5M)_Tweaks
- igorweb.org VCDS list: https://igorweb.org/eng/vcds.html

| Byte (car value) | Verbatim label | Source URL | Grade |
|---|---|---|---|
| 7 (01) | "Zusatzfunktion Blinker vorne links/rechts als Standlicht vorne links/rechts (USA und Canada)", "Resolution 1 %", default "0 %" | VAGData; same text on Cool Car: "(Auflösung: 1 % / Standard: 0 %)" | High (see supporting rows) |
| 7, supporting | "Byte 7: Set value 32 in Dec box (value in % of intensity, origin: 0)"; "14 (corresponds to a 20% variation in the indicator lights)"; "1E (corresponds to a 30% variation in the indicator lights)"; "28 (corresponds to a 40% variation in the indicator lights)"; purpose "Enables the US turn signals." (the page does not mention parking lights or side markers) | https://www.vag-coding.net/vw/golf-5-1k/golf-5-1k-activate-turn-signals-in-us-mode/ | Medium |
| 7, supporting | "in byte 7 select% luminosity (eg 2%)" under "Lights > Front turn signals as parking lights", module 09 | https://igorweb.org/eng/vcds.html | Low |
| 8 (50) | "Dimmung Tagfahrlicht", Resolution "1 %", default "0 %" | VAGData; Cool Car same | High (see next row) |
| 8, supporting | Ross-Tech: "Select the Byte with 'Daytime Running Lights Dimming' 'Decimal Value (Resolution: 1%)' and alter the value." and "If DRLs are Halogen bulbs (not Xenon) the dimming resolution may be adjusted." Byte number is not stated on that page. A search summary also says a Scribd guide names byte 8 for DRL dimming (paraphrase, page not readable) | https://wiki.ross-tech.com/wiki/index.php/VW_Golf/Jetta/Bora_(1K/5M)_Tweaks | High |
| 9 (32) | "Zusatzfunktion Bremslicht links/rechts als Schlusslicht", Resolution "1 %", default "22 %" | VAGData; Cool Car same | Medium |
| 10 (00) | "Zusatzfunktion Nebelschlussleuchte links/rechts als Schlusslicht", Resolution "1 %", default "0 %" | VAGData; Cool Car same | Medium |
| 11 (32) | "Zusatzfunktion Standlicht vorne links/rechts", no resolution given, default "0%" | VAGData; Cool Car: "Zusatzfunktion Standlicht vorne links/rechts (Standard: 0%)" | Medium |
| 12 (32) | "Dimmung Standlicht hinten links/rechts", Resolution "1 %", default "20 %" | VAGData; Cool Car same | Medium |
| 13 (00) | "Ersatzfunktion Blinker vorne links/rechts als Standlicht vorne links/rechts", Resolution "1 %", default "0 %" | VAGData; Cool Car same | Medium |
| 14 (00) | "Ersatzfunktion Standlicht vorne links/rechts als Blinker vorne links/rechts", Resolution "1 %", default "0 %" | VAGData; Cool Car same | Medium |
| 15 (00) | "Ersatzfunktion Rückleuchten links/rechts als Blinker hinten links/rechts", Resolution "1 %", default "0 %" | VAGData; Cool Car same | Medium |
| 16 (00) | "Ersatzfunktion Nebelleuchten vorne links/rechts als Abblendlicht links/rechts", Resolution "1 %", default "0 %" | VAGData; Cool Car same | Medium |
| 20 (32) | "Dimmung Nebelscheinwerfer", Resolution "1 %", default "0 %" | VAGData; Cool Car same | High (see supporting rows) |
| 20, supporting | "Byte 20 (brightness): Change the value in the Dec box." and "Adjusting the fog light intensity (from 1% to 99%)." with byte 17 bit 4 "Daytime Running Light via Fog Lights" | https://www.vag-coding.net/vw/golf-5-1k/golf-5-1k-activate-daytime-running-lights-with-fog-lamps-drl/ | Medium |
| 20, supporting | "in byte 17 check bit 4 and in byte 20 choose luminosity in %" | https://igorweb.org/eng/vcds.html | Low |
| 20, supporting | vagcode.info 3C0 937 049 E shows byte 20 [5C] as "Decimal Value (Resolution: 1%)" (0x5C = 92) | https://vagcode.info/en/components/7756fed0e8d08ce7ea9b8c9e3d94ad63.html | Medium |
| 21 (40) | not found for the 23-byte label | | |
| 22 (00) | not found for the 23-byte label | | |

Allowed range: every source gives only "Resolution 1 %". The one stated range is the fog light value "from 1% to 99%" (Golf 5 page, byte 20). No source states a range for bytes 7 to 16 beyond the 1 % resolution: not found. The Golf 5 US-mode page gives 14, 1E and 28 (hex) as example values.

Cross-checks on the car, as a plain match of the owner's notes against the labels (not a source):
- Byte 7: the owner's capture 00 to 64 for "side marker 100 %" fits a percentage byte for "Blinker vorne ... als Standlicht ... (USA und Canada)". What byte 7 = 01 means for "side light as parking light": not found.
- Byte 8 = 0x50 = 80 matches "Dimmung Tagfahrlicht" and the 80 % display.
- Passat defaults (byte 9 22 %, byte 12 20 %) differ from the car (50 %): the car is not on the default.

The vagcode.info 30-byte labels (3C0 937 049 AJ, label 30-H) differ: byte 8 holds bits there ("Seat Heating Deactivation with Transport Mode active", "Daytime Running Light (DRL) Deactivation while Blinking active" and others) and bytes 9 and 16 carry extra bit labels ("Rear Parking Lights with Energy Saving Function (Passat CC ONLY)", "Headlight Washer active with Daytime Running Light (DRL) active", "Ambient Lighting via Footwell Lighting active"). Bytes 21 and 22 on that 30-byte label hold bits ("Rear Fog Light as Brake Light", "Low Beam always active", "Personalization (0 = Variant 1 / 1 = Variant 2)", "Rear/Brake Light Function active" and others). These do not apply to a 23-byte coding, where byte 8 is the 80 % level. Source: https://vagcode.info/en/components/5d69e61e8e6d3e09f82d26aa044ee30c.html (Low for this car, other coding length).

### 1b. Front tear wipe after windscreen washing

| Place | Verbatim label | Source URL | Grade |
|---|---|---|---|
| 09 byte 3 bit 5 (rear window) | "Teardrop Wiping for Rear Window active" | https://vagcode.info/en/components/7756fed0e8d08ce7ea9b8c9e3d94ad63.html | Medium |
| 09 byte 3 bit 5 (German, no window named) | "Byte 03 Bit 5 Tropfenwischen/Tränenwischen" | https://vagdata.de/passat-b6/ | Medium |
| 09 byte 1 bit 7, byte 2 bit 0 (reversing wipe, not tear wipe) | "Byte 01 Bit 7 Rückfahrwischen mit Dauerwischen vorn", "Byte 02 Bit 0 Rückfahrwischen mit Intervallwischen vorn" | https://vagdata.de/passat-b6/ | Medium |
| Front, wiper slave | Ross-Tech: the coding table is not shown, "Due to different Control Modules and Vehicle Equipment, the actual Coding Table is not shown here but will automatically be used by the Long Coding Helper with VCDS" (search-tool rendering of that page). The fetched page says to select the wiper subsystem as in its "Coding of Slave Modules" section | https://wiki.ross-tech.com/wiki/index.php/VW_Golf_(1K)_Wiper_Electronics | High that no table is published |
| Front, other car (Audi A4 8EC/8ED) | in module 09 adaptation channel 013: "-> Kanal 013 (Wischereinstellungen)", "Standardwert: 115", "+008 - Nachwischen nach Waschen (Tropfen-/Tränenwischen)". The post cites http://de.openobd.org/audi/a4_8ec.htm#09 and does not confirm the channel exists on other cars | https://community.dieselschrauber.org/en/viewtopic.php?p=56802 | Low |

So on the 23-byte coding a bit exists for tear wipe on the rear window (byte 3 bit 5). A front tear wipe bit on this layout or in the wiper slave coding: not found.

## 2. Module 46 Comfort, 1K0 959 433 BT, 19-byte coding

The only per-bit tables found are for the Passat B6 [3C] (VAGData, Cool Car), which are the sibling family. They give no part number and no coding length. Grade is Low for this car by the rules, with two points in favour: igorweb.org (no car named) agrees on "Comfort > Synchronous mirror adjustment: in byte 14 check bit 6", and the car's bytes read in a way that fits the labels (byte 14 = DF). The earlier 27 Nov report placed synchronised mirrors at byte 9 bit 6 from one older post; the two disagree.

URLs: https://vagdata.de/passat-b6/ and https://www.coolcar.ch/fahrzeug-codierung/codierung-vw-passat-b6-3c/ (same text), https://igorweb.org/eng/vcds.html.

| Byte (car value) and bit | Verbatim label | Source URL | Grade |
|---|---|---|---|
| 12 (E0), all bits | Cool Car: "Alle Bits sind als 'unbekannt' gelistet" (paraphrase). VAGData has no byte 12 entry. Bit 7 label: not found | Cool Car URL above | Low |
| 13 (08) bit 0 | "FFB inaktiv" | VAGData | Low |
| 13 bit 1 | "FFB bei „Klemme 15 EIN“ aktiv" | VAGData; Cool Car same | Low |
| 13 bit 2 | "Reichweitenbegrenzung für Komfortbedienung" | VAGData | Low |
| 13 bit 3 | "Manuelles Funkanlernen/-verlernen aktiv" | VAGData | Low |
| 13 bits 4 and 5 | "nicht relevant/unbekannt" | VAGData | Low |
| 13 bit 6 | "DWA schärfen mit Blinklicht quittieren" | VAGData | Low |
| 13 bit 7 | "DWA schärfen mit Horn quittieren" | VAGData | Low |
| 14 (DF) bit 0 | "Türen (0 = 2-türig / 1 = 4-türig)" | VAGData | Low |
| 14 bit 1 | "eFH vorn verbaut" | VAGData | Low |
| 14 bit 2 | "eFH hinten verbaut" | VAGData | Low |
| 14 bit 3 | "Zentralverriegelung verbaut" | VAGData | Low |
| 14 bit 4 | "Ausführung (0 = Linkslenker / 1 = Rechtslenker)" | VAGData | Low |
| 14 bit 5 | "nicht relevant/unbekannt" | VAGData | Low |
| 14 bit 6 | "synchrone Spiegelverstellung" | VAGData; igorweb "in byte 14 check bit 6" | Low |
| 14 bit 7 | VAGData: "Spiegelabsenkung bei Rückwärtsfahrt (nur mit Sitz-Memory)"; Cool Car: "Spiegelabsenkung bei Rückwärtsfahrt" | VAGData and Cool Car | Low |
| 15 (84) bit 0 | "DWA-Funktion inaktiv" | VAGData | Low |
| 15 bit 1 | "DWA-Entschärfen nur via FFB/Transponder" | VAGData | Low |
| 15 bit 2 | VAGData: "DWA scharf bei bewusstem Entsafen/Innenraumüberwachung inaktiv" (spelling as returned by the tool) | VAGData; Cool Car same | Low |
| 15 bit 3 | VAGData: "Alarmverzögerung bei mech. Öffnung (Thatcham) inaktiv" | VAGData | Low |
| 15 bit 4 | "nicht relevant/unbekannt" | VAGData | Low |
| 15 bit 5 | "DWA Passive Arming" | VAGData | Low |
| 15 bit 6 | "Neigungssensor verbaut" | VAGData | Low |
| 15 bit 7 | "Innenraumüberwachung verbaut" | VAGData | Low |
| 16 (10) bits 0 to 3 | "nicht relevant/unbekannt" | VAGData | Low |
| 16 bit 4 | "DWA-Sirenen Schnittstelle aktiv" | VAGData | Low |
| 16 bit 5 | "Sirenen Tontyp (0 = frequenzmoduliert / 1 = diskontinuierlich)" | VAGData | Low |
| 16 bit 6 | "Sirenen Alarmtyp (0 = 10 Tamper Alarme / 1 = 1 Tamper Alarm)" | VAGData | Low |
| 16 bit 7 | "Anpassungskanal für Sirenen Einstellungen gesperrt" | VAGData | Low |
| 17 (5C), all bits | Cool Car: all bits listed as "unbekannt" (paraphrase). VAGData has no byte 17 entry | Cool Car URL | Low |
| 18 (80) | no entry on either page | | not found |

Plain reading of the car's bytes against these labels (not a source claim): byte 14 = DF has bits 0, 1, 2, 3, 4, 6, 7 set and bit 5 clear, which fits a 4-door, right-hand-drive car with synchronised mirrors and reverse mirror lowering flagged. Byte 15 = 84 has bits 2 and 7 set. Byte 13 = 08 has bit 3 set.

Requested functions, per the same tables:

| Function | Byte, bit | Verbatim label | Grade |
|---|---|---|---|
| Lower passenger mirror in reverse | 14 bit 7 | "Spiegelabsenkung bei Rückwärtsfahrt (nur mit Sitz-Memory)" (VAGData). The door modules also carry settings: vag-coding.net pages for other cars set the passenger door module byte 4 bit 2 "Reserve Gear Mirror Dipping active" (Q2) and byte 4 bit 3 "Mirror Lowering With Reverse Rear" (Yeti 5L), search-tool rendering. No Golf 5 page found | Low |
| Remote buttons active with ignition on | 13 bit 1 | "FFB bei „Klemme 15 EIN“ aktiv". The source does not expand "FFB" | Low |
| Alarm auto-arm | 15 bit 5 | "DWA Passive Arming" | Low |
| Interior monitoring | 15 bit 7 and bit 2 | "Innenraumüberwachung verbaut"; "DWA scharf bei bewusstem Entsafen/Innenraumüberwachung inaktiv" | Low |
| Tilt sensor | 15 bit 6 | "Neigungssensor verbaut" | Low |
| Open boot from remote (Heckklappe) | no remote-specific bit found. Heckklappe bits in the same table: byte 1 bit 7 "ZV-Heck: Heckklappe in Zentralverriegelung"; bit 4 "ZV-Heckklappe Softtouch (direkter Auswurf/keine Freigabe)"; bit 5 "ZV-Heckklappe kontaktgesteuert"; bit 6 "ZV-Heck: ZV-Steller verbaut anstelle ZV-Motor"; byte 2 bit 3 "ZV-Heckklappe 1-Motoren- statt 2-Motoren-Schloss verbaut"; byte 2 bit 1 "ZV-Heckklappe „Security Lock“" | Low |

Disagreement on the boot bits: the Golf 5 page https://www.vag-coding.net/vw/golf-5-1k/golf-5-1k-automatic-tailgate-opening-retrofit/ puts "Central Locking (Rear Lid) Softtouch (direct open/no release)" at byte 1 bit 4 for a Golf V before 2006 and byte 2 bit 3 from 2006 (module 46, no coding length stated). VAGData has the same label at byte 1 bit 4 and puts byte 2 bit 3 on "ZV-Heckklappe 1-Motoren- statt 2-Motoren-Schloss verbaut". The 27 Nov report used byte 2 bit 3 as "Boot opens from the key button". Two labels now exist for that bit.

Byte 0 labels in the same table, for reference (VAGData): bit 3 "Auto-Unlock (Annahme des alten Zustandes nach abziehen des Zündschlüssels)", bit 4 "Auto-Lock (autom. verriegeln bei ab 15 km/h)", bit 0 "Selektive Zentralverriegelung (Einzeltürverriegelung)". These agree with the 27 Nov report.

Ross-Tech Golf 1K Comfort System page (https://wiki.ross-tech.com/wiki/index.php/VW_Golf_(1K)_Comfort_System): no long coding byte table, no label file name, no interior monitoring or rear lid entry. It lists adaptation channels (for example "013: Alarm Horn Adjustment", "018: Alarm Delay", "017: Comfort Function").

## 3. Instrument cluster 1P0 920 925, short coding 0004401

Source: https://wiki.ross-tech.com/wiki/index.php/Seat_Leon_(1P)_Instrument_Cluster (as returned by the fetch tool, "No paraphrased text is included").

| Digit group label on page | Verbatim values | Grade |
|---|---|---|
| "00??x0x": "Options" | "+01 = Brake Pad Warning"; "+02 = Seatbelt Warning"; "+04 = Washer Fluid Warning"; "+16 = Sedan (only VW Jetta)" | High |
| "00xx?0x": "Country" | "1 = Europe (EU)"; "2 = USA (US)"; "3 = Canada (CDN)"; "4 = Great Britain (GB)"; "5 = Japan (JP)"; "6 = Saudi Arabia (SA)"; "7 = Australia (AUS)" | High |

These are all the "+NN" options and all the country values the page gave. The car's 0004401 has country 4 and options 04 + 01 minus 02 as already recorded on 27 Nov.

## 4. ABS MK60 short coding, TPMS

Source: https://wiki.ross-tech.com/wiki/index.php/VW_Golf_(1K)_Brake_Electronics_(MK60) (fetch tool: lines below are "exact quotes"; group names are its paraphrase).

| Item | Verbatim | Parts | Grade |
|---|---|---|---|
| TPMS group, heading | "Tire Pressure Monitoring (TPMS)" | | High |
| TPMS value 0 | "+0000000 = with ABS based Tire Pressure Monitoring (PR-7K1/7K6)" | PR codes as given. Page names ABS parts 1K0-907-379-D and 1K0-907-379-K | High |
| TPMS value 16384 | "+0016384 = without ABS based Tire Pressure Monitoring (PR-7K0/7K4/7K8)" | same | High |
| Model group | "+0000000 = Audi A3 (8P) / Seat Leon (1P) / VW Golf/Jetta (1K) / Skoda Octavia (1Z)" | | High |

Reading against the car: 0006792 contains no 16384 term, so by this page its TPMS term is the "+0000000 = with ABS based Tire Pressure Monitoring" one. The other tool showed "TPMS warning light DISABLED" on 15 Nov. Whether the car has the PR code 7K1 or 7K6 is not in any source read: not found. The page also says the original coding cannot be moved between -D and -K or newer parts (paraphrase).

## Not found

- 09 bytes 21 and 22 label text on the 23-byte coding (VAGData and Cool Car stop at byte 20; vagcode.info 3C0 937 049 E has a 21-byte string).
- Allowed range for bytes 7 to 16 beyond "Resolution 1 %"; only the fog value range 1 % to 99 % (byte 20) is stated.
- What byte 7 = 01 means for "side light as parking light" on the 23-byte layout.
- Any 23-byte page for 3C0 937 049 AE, H, J or AH on vagcode.info (search found only E and AJ).
- A front tear wipe bit on the 23-byte 09 coding or in the wiper slave coding (Ross-Tech publishes no wiper table).
- 46 byte 12 and byte 17 labels (listed as unknown) and any byte 18 entry.
- A source that ties the Passat B6 comfort table to part 1K0 959 433 or a 19-byte length.
- A remote-specific bit for opening the boot ("Heckklappe") in 46.
- A Golf 5 (1K) vag-coding.net page for the passenger mirror in reverse, alarm, interior monitoring or remote with ignition on.
- Whether the car has PR code 7K1 or 7K6 (TPMS).
- Pages blocked or unreadable: Scribd documents (page text not exposed), motor-talk.de (403), briskoda.net (403), vwvortex.com (402 on the redirect), Google Docs export (compressed PDF). Not retried. No GitHub repository holding VCDS label text for PQ35 modules turned up.


## Auto-headlight light sensor, 28 Nov 2026

Scope: read-only web research for the owner's 2007 SEAT Leon 1P (09 Central electronics, 3C0 937 049 family, 23-byte long coding, reads A3 0E 1E 07 ...). Already known and not repeated: byte 0 bit 6 "rain/light sensor installed", byte 2 bit 4 "coming-home via light sensor", 09 channels 1, 2, 4, 7, 8. Quotes were read on the page itself (Ross-Tech pages via the fetch tool, which can paraphrase; vag-coding.net pages read raw by curl). Anything marked "(paraphrase)" is a search-result summary or fetch-tool summary, not verbatim. Blocked and skipped: myturbodiesel.com and ttforum.co.uk (307 redirect to a paywall host), urotuning.com (429), ecstuning install PDF (image-only, no text), motor-talk.de, Scribd.

### Question 1: must byte 0 bit 6 be set for auto headlights?

Answer: not found as an explicit rule. No source says "set this bit or the auto light will not work". What the sources say:

- Ross-Tech, Golf/Jetta/Bora (1K/5M) Tweaks, https://wiki.ross-tech.com/wiki/index.php/VW_Golf/Jetta/Bora_(1K/5M)_Tweaks lists under Coming Home the bit names "Rain-/Light sensor installed", "Coming-Home active", "Coming-Home Logic (0 = Old / 1 = New)" and states "If the vehicle is not equipped with an "Auto" headlight switch and a (RLS) light sensor the results may vary."
- Same page, Rain Light Sensor entry: "Requires the (RLS) Rain Light Sensor. This will require coding the [46] - Comfort System module AND the [09] - Central Electronics module", and "choose the Sub-System RLS (from the drop-down menu)". That entry is about rain closing of windows, not the headlights.
- vagcode.info, label for 3C0 937 049 E, https://vagcode.info/en/components/7756fed0e8d08ce7ea9b8c9e3d94ad63.html names the bit "Rain-/Light sensor installed" (bit 6 of byte 0). No dependency text.
- TT Forum, https://www.ttforum.co.uk/threads/mk5-headlight-switch-with-auto-headlights-on-8j.1893075/ (page not fetchable; search summary only): coding is needed for OEM installs because the central electronics module needs to know there is a sensor to talk to over LIN (paraphrase). Low.
- Retrofit guide, https://www.myturbodiesel.com/d2/1000q/multi/rain-sensor-auto-wiper-retrofit-vw.htm (page not fetchable; search summary only): if the module long coding has a checkbox for the rain sensor it should work, and the sensor needs power, ground and a communication wire (paraphrase). Low.
- Aftermarket kit pages (Urotuning, AONED, Park Automotorsports) say no coding is needed for their kits (paraphrase of search summaries). Sources disagree with the two retrofit posts above on whether coding is needed; the kits may use a stand-alone module. Not tested here.

"Auto" switch plus the bit: no source states this is enough, and no source states a separate coding on the sensor is required for the lights. Ross-Tech only shows the RLS sub-system in the 09 drop-down (question 3).

### Question 2: light-level or sensitivity adaptation channel on 09

Not found on the 09 adaptation list. Ross-Tech Leon 1P Central Electronics, https://wiki.ross-tech.com/wiki/index.php/Seat_Leon_(1P)_Central_Electronics and Golf 1K Central Electronics, https://wiki.ross-tech.com/wiki/index.php/VW_Golf_(1K)_Central_Electronics list channels 000 to 008 only. None is a light level.

What exists is a long coding byte on the rain/light sensor sub-system (not an adaptation channel); see the table.

### Question 3: separate module and addressing

- Ross-Tech names no address for the sensor. The only route given is the 09 coding screen: "choose the Sub-System RLS (from the drop-down menu)" (Golf/Jetta/Bora Tweaks page above).
- vag-coding.net reaches a sub-system from 09: "Click on "Coding 07"", then "Select the "2 EPIRBs" module from the drop-down list and click on "Long Coding Helper"". "2 EPIRBs" is the site's own wording and looks like a translation error; I do not know what it was meant to read. Confirmation that it is the RLS entry: not found.
- Ross-Tech has a Rain/Light Sensor page with its own 3-byte coding, https://wiki.ross-tech.com/wiki/index.php/Seat_Leon_(1P)_Rain/Light_Sensor . It lists no address, no adaptation channels and nothing on TP2.0 or LIN. TP2.0 addressing of the sensor: not found.

### Question 4: leaving-home brightness threshold, hysteresis

Not found. Only on/off bits and times are published (channels 1, 2, 8). Channel 8 is a delay, not a hysteresis: "Assistance Driving Light Activation/Deactivation Delay", "Range: 0...10200 ms", "Resolution: 40 ms".

### Table

| where | channel/byte/bit | verbatim label and range | source URL | grade |
|---|---|---|---|---|
| 09, RLS sub-system long coding (Golf 5 1K) | byte 2, bits 0-7 | "(187, 205 or 237 to increase sensitivity, or 45, 40 or 33 to decrease sensitivity)"; purpose "Adjusts the sensitivity of the light sensor." Sub-system entry named "2 EPIRBs" on the page | https://www.vag-coding.net/vw/golf-5-1k/golf-5-1k-set-light-sensor-sensitivity/ | Medium (1 source, sub-system label garbled) |
| 09, RLS sub-system long coding (Golf 6 5K, other platform) | byte 0, bits 3-4 | "00 Normal light activation threshold", "08 Earlier light activation threshold (+20%)", "10 Light Activation Threshold earlier (+40%)", "08 Light Activation Threshold earlier (+60%)" (08 appears twice on the page). Older cars: "Byte 2 : Bits 0-7 : Light Sensor Correction" | https://www.vag-coding.net/vw/golf-6-5k/golf-6-5k-set-light-sensor-sensitivity/ | Low (different platform) |
| Rain/light sensor coding (Leon 1P, Ross-Tech) | byte 01 (counted right to left) | "Byte 01: Light Sensor Correction (Transperency)"; example "Byte 01 = 50 (hex) = 80 (dec) = Light Sensor Correction value is 80%" | https://wiki.ross-tech.com/wiki/index.php/Seat_Leon_(1P)_Rain/Light_Sensor | High for the label; unit and effect on switch-on level not stated |
| Same page | byte 00 | "Byte 00: Rain Sensor Correction (Infrared Transperency at 880nm)" | same URL | High (label only) |
| Same page | byte 02 | "+1 = Highway Light", "+2 = Rain Light", "+4 = Rain Closing" | same URL | High (label only) |
| 09 long coding | byte 0 bit 6 | "Rain-/Light sensor installed" | https://wiki.ross-tech.com/wiki/index.php/VW_Golf/Jetta/Bora_(1K/5M)_Tweaks | High (known) |
| 09 long coding, Golf 5 | byte 0 bit 5 | "Assistance Driving Light Leaving Home active"; page title "Activate Leaving Home without light sensor"; "The headlights will come on whether it's day or night. They stay on for about 30 sec." | https://www.vag-coding.net/vw/golf-5-1k/golf-5-1k-activate-leaving-home-without-light-sensor/ | Medium |
| 09 sub-system, Golf 5 | byte 0 bit 1 | "Check "Rain Light Function Active"" (lights on when wipers are triggered) | https://www.vag-coding.net/vw/golf-5-1k/golf-5-1k-lights-on-automatically-when-it-rains/ | Medium (sub-system label "2 EPIRBs" again) |
| 09 adaptation (Audi A4 B7, other platform) | channel 20 | "Rain/Light Sensor Setup", "Add +1 to existing value" (lights on above 140 km/h) | https://www.vag-coding.net/audi/a4-b7/a4-b7-automatic-headlight-activation-from-140-km-h/ | Low (not this car; no such channel on Ross-Tech's Leon list) |

Sources leave a gap on byte numbering: Ross-Tech counts the sensor coding bytes right to left with light correction in byte 01; the vag-coding.net Golf 5 page says byte 2 (direction not stated). They may or may not be the same byte. Not found: how the correction value maps to a switch-on light level, and what 187, 205, 237, 45, 40, 33 mean in per cent.

### Not found

- Any statement that byte 0 bit 6 must be set for the automatic headlights.
- Any statement that "Auto" on the switch plus the bit is enough.
- Any statement that the sensor needs coding on its own control module for the lights (the only route found is the sub-system entry in the 09 coding screen).
- A diagnostic address or TP2.0 detail for the sensor.
- A light-level or sensitivity adaptation channel on 09 for the Leon 1P or Golf 5 (1K).
- Hysteresis or leaving-home brightness threshold.
- Effect and units of the sensor coding values, and a readable label for the "2 EPIRBs" entry.
- Passat B6 tables (vagdata.de, coolcar.ch): not reached in this pass.
