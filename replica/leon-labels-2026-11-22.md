# Pin16: Leon 1P1 value groups, coding and adaptation, search of 22 Nov 2026

Scope: every module on the owner's 2007 SEAT Leon Cupra (01, 03, 08, 09, 15, 16, 17, 19, 25, 42, 44, 46, 52, 55). Companion to `leon-groups.md` and `leon-sources.md` (not repeated here). Quotes are verbatim from the page text returned by the fetch tool on 22 Nov 2026. Ross-Tech label files (.lbl) were not opened, to keep the rule in `leon-groups.md`. Where the owner's module has a different Ross-Tech page from the car's family, it is marked "sibling".

Confidence: High = Ross-Tech, or 2 sources that agree for this module family. Medium = 1 detailed source for this family. Low = sibling or vague.

Headline: the Ross-Tech wiki for these modules documents almost no measuring block fields. Nothing new reached High or Medium beyond what the app already holds.

## Per module

### 01 Engine (MED9.1, 2.0 TFSI)

Source: https://wiki.ross-tech.com/wiki/index.php/2.0l_TFSI_(AXX/BGB/BPJ/BPY/BWA) (family page; BWJ is not named, same EA113 TFSI family). Already in the app.

| Group | Field | Verbatim label | Unit or values | Confidence |
|---|---|---|---|---|
| 103 | 1 | "Fuel Pressure (Low), Specification: 2800...7200 mbar" | mbar | High |
| 103 | 2 | "Fuel Pump Adaptation, Specification: -1000...+1000 %" | % | High |
| 106 | 2 | "Fuel Rail,Pressure (actual): (A value ≈ 35 to 55% is considered normal at idle)" | % | Medium (Audizine posters read it as pump duty, see `leon-groups.md`) |
| 140 | 3 | "Fuel Rail Pressure (High), Specification: 25.0...110.0 bar" | bar | High |
| 230 | 1 | "Specified Fuel Rail Pressure (High)" | bar (unit not stated) | High |
| 230 | 2 | "Actual Fuel Rail Pressure (High), Specification: 25.0...110.0 bar" | bar | High |
| 230 | 3 | "Deviation between specified and actual fuel pressure, Specification: max. 5.0 bar" | bar | High |

The page does not mention oil temperature. Other groups (001 to 020, 031 to 034, 091 to 140): see `leon-groups.md`.

### 03 ABS (MK60)

Source: https://wiki.ross-tech.com/wiki/index.php/Seat_Leon_(1P)_Brake_Electronics_(MK60) (exact family).

| Group | Field | Verbatim text | Unit | Confidence |
|---|---|---|---|---|
| 004 | 1 | Steering Angle Sensor G85: "Check field 1, the value has to be between -1.5 and +1.5 °." | deg | High |
| 004 | 2 | Lateral Acceleration Sensor G200: "Check field 2, the value has to be between -1.5 and +1.5 m/s²." | m/s² | High |
| 005 | 1 | Brake Pressure Sensor 1 G201: "Check field 1, the value has to be between -8.0 and +8.0 bar." Also "-3.8 and +3.8 bar" after basic setting | bar | High |
| 006 | 1 | Longitudinal Acceleration Sensor G251: "Check field 1, the value has to be between -1.5 and +1.5 m/s²." | m/s² | High |

Search for MK60 group 001 wheel speed fields: no MK60 source gives field order (see Not found).

### 08 Climate (Climatronic PQ35)

Source: https://wiki.ross-tech.com/wiki/index.php/VW_Golf_(1K)_Climatronic. Basic setting only: "Group 001", "The basic setting takes approximately 40 seconds." No measuring block fields. 0 labels. Sibling only: Audi A4 Cabriolet workshop manual groups 002 to 004 (different module family, not added).

### 09 Central electronics (Bordnetz-SG, 23-byte coding)

Source: https://wiki.ross-tech.com/wiki/index.php/Seat_Leon_(1P)_Central_Electronics (page content is a 2006 Passat example). No measuring blocks. 0 labels. Adaptation channels:

| Channel | Verbatim name | Notes (verbatim) | Confidence |
|---|---|---|---|
| 000 | "Reset Adaptation Channels" | | High |
| 001 | "Coming-Home Time" | "10–60 s, in 10 s steps"; "Only active if Byte 00 Bit 7 of Long Coding active." | High |
| 002 | "Leaving-Home Time" | "Only active if Byte 00 Bit 5 of Long Coding active." | High |
| 003 | "Rear Window & Outside Mirror Heater Activation Time" | "1–254 min" | High |
| 004 | "Headlight Washer Activation Time" | "50–10000 ms" | High |
| 005 | "Footwell Lighting Dimming" | "20–100%"; "Only active if Byte 00 Bit 1 of Long Coding active." | High |
| 006 | "Load Management" | "0–3" | High |
| 007 | "Highbeam with Assistance Driving Light" | 0 inactive, 1 active | High |
| 008 | "Assistance Driving Light Activation/Deactivation Delay" | "0–10200 ms, in 40 ms steps" | High |

Other modules in this family: https://vagcode.info/en/components/cddc9f204c3648882336b88664c54c8b.html shows a 1K0 937 087 AK "BCM PQ35 H 112 0771" (30-byte coding string, no labels, no measuring blocks). Sibling (different part family).

### 15 Airbag (3C0 909 605)

Source: https://wiki.ross-tech.com/wiki/index.php/VW_Golf_(1K)_Airbag: no measuring blocks, no coding values; "Channel 000" only. 0 labels. Only sibling: the Passat B6 readout (DS1 in `leon-groups.md`, Low).

### 16 Steering wheel electronics (1K0 953 549)

Source: https://wiki.ross-tech.com/wiki/index.php/VW_Golf_(1K)_Steering_Wheel: coding tables only (Byte/Bit lists, for example "Byte 01 Bit 6" and "[32] Differential Locking" in the Index L section). No measuring blocks, adaptation or basic settings. 0 labels.

### 17 Instrument cluster (1P0 920 9xx)

Source: https://wiki.ross-tech.com/wiki/index.php/VW_Golf_(1K)_Instrument_Cluster. No measuring blocks. 0 labels. Adaptation channel names (verbatim, High): 002 "Service Reminder"; 003 "Consumption Correction" (page spells "Channe 003"); 004 "Language"; 009 "Mileage/Odometer"; 022 "Production Mode"; 030 "Fuel Gauge Adaptation"; 035 "Speed Threshold"; 038 "Oil Minimum Detection"; 039 "Oil Level Sensor Adaptation"; 040 "Mileage since Service"; 041 "Time since Service"; 042 "Minimum Distance to Service"; 043 "Maximum Distance to Service"; 044 "Maximum Time to Service"; 045 "Oil Quality"; 046 "Total Consumption"; 047 "Soot Entry"; 048 "Thermal Load"; 049 "Minimum Time to Service".

### 19 CAN gateway (1K0 907 530)

Source: https://wiki.ross-tech.com/wiki/index.php/VW_Golf_(1K)_CAN-Gateway: coding byte/bit tables only. Examples verbatim: "Byte 06 Bit 1" with "[19] CAN-Gateway (Standard)"; "Byte 03 Bit 0" with "[65] Tire Pressure Monitoring". No measuring blocks, adaptation or basic settings. 0 labels. Gateway groups 125 to 140 remain sibling only (Skoda Fabia, `leon-groups.md` WM2, Low).

### 25 Immobiliser (in cluster)

Source: https://wiki.ross-tech.com/wiki/index.php/VW_Golf_(1K)_Immobilizer: only links to "Key Matching", "Engine Control Unit (ECU) Swapping", "Instrument Cluster Swapping". 0 labels.

### 42 Door driver and 52 Door passenger (1T0 959 70x)

Sources: https://wiki.ross-tech.com/wiki/index.php/VW_Golf_(1K)_Door_Electronics_Driver and https://wiki.ross-tech.com/wiki/index.php/VW_Golf_(1K)_Door_Electronics_Passenger. No measuring blocks or adaptation. Short coding values (additive), both pages: "+0000002 = Ambient Mirror Illumination", "+0000004 = Mirror Turn Signals", "+0000008 = Interior Door Handle Illumination installed", "+0000016 = Automatic Run active", "+0000032 = Mirror Heater installed", "+0000064 = Door Exit/Warning Light installed", "+0000128 = 5-Door Chassis", "+0000256 = Seat Memory installed", "+0000512 = Right Hand Steering", "+0001024 = Safe-Motor not installed", "+0002048 = Pinch Protection inactive", "+0004096 = Folding Mirrors installed (MY 2008+)". The driver page alone also has "+0000001 = Rear Lid Remote Unlock Button (E233)". Confidence: Medium (Golf 1K page; the Leon module 1T0 959 701 G is from the Touran 1T part range, see the Xenon coding list for the same family overlap).

### 44 Power steering (1K2 909 144)

Source: https://wiki.ross-tech.com/wiki/index.php/VW_Golf_(1K)_Steering_Assist.

| Group | Field | Verbatim label | Confidence |
|---|---|---|---|
| 001 | 2 | "Steering Torque Sensor (G269)" (values should change turning fully left and right) | High |
| 004 | 2 | "Power Supply (Terminal 15)", "Term. 15 ON" | High |
| 007 | 1 | steering angle sensor reading, "has to be between -1.5 and +1.5 °" | High |

Basic setting 060 for G85: "applies only to Conti/Teves MK70 ABS/ASR models".

### 46 Comfort (1K0 959 433, KSG PQ35 G2)

Source: https://wiki.ross-tech.com/wiki/index.php/VW_Golf_(1K)_Comfort_System. No measuring block groups. 0 labels. Adaptation (verbatim names): 000 "Remote Control Clearing"; 001 "Remote Control Matching" (up to 4 remotes); 003 "Selective (Single) Door Locking" (0 off, 1 on); 004 "Auto-Lock" (locks at 15 km/h or 10 mph); 005 "Auto-Unlock" (unlocks when the key leaves the ignition); 007 and 008 "Unlocking Confirmation" (remote control, key switch); 010 and 011 "Locking Confirmation"; 012 "Safe Confirmation"; 013 "Alarm Horn Adjustment"; 017 "Comfort Function"; 018 "Alarm Delay"; 019 "Factory Mode". Confirmation key: 0 off, 1 turn signal, 2 horn beep, 3 horn beep and turn signal. Special Notes: "Check the ignition S-contact switching and driver door latch measuring block switching" (no group number given). Confidence: High for the Golf 1K family.

### 55 Headlight range (5M0 907 357 A, AFS)

Source: https://wiki.ross-tech.com/wiki/index.php/Seat_Leon_(1P)_Headlight_Aim_Control_(Xenon_with_AFS). No measuring block groups. Basic setting group 001 (part numbers up to -D): the meas. block field shows "Wait" then "Adjust Headlights" (V1) or "Running" (V2 and later), result "Finished Correctly". Adaptation channel 002 "Tourist Solution" (0 = Disabled, 1 = Enabled). Security access "15284 = Adaptation Enabling". Short coding examples: "0000015 = Seat Altea/Toledo (5P) and Leon (1P) Left-Hand-Drive", "0000016 = Seat Altea/Toledo (5P) and Leon (1P) Right-Hand-Drive". 0 group labels (basic setting status text is not a group label, so not added).

### Count of labels found (measuring block fields with a source label)

01: 7 (all in app). 03: 4 (in app by G-number). 44: 3 (in app). 08, 09, 15, 16, 17, 19, 25, 42, 46, 52, 55: 0.

## Boot, doors and locks

Every statement found, by source.

| Module | Item | Verbatim | Source | Confidence |
|---|---|---|---|---|
| 42 | Short coding +0000001 | "Rear Lid Remote Unlock Button (E233)" | https://wiki.ross-tech.com/wiki/index.php/VW_Golf_(1K)_Door_Electronics_Driver | Medium |
| 46 | Adaptation 003 | "Selective (Single) Door Locking" | https://wiki.ross-tech.com/wiki/index.php/VW_Golf_(1K)_Comfort_System | High |
| 46 | Adaptation 004, 005 | "Auto-Lock" at 15 km/h; "Auto-Unlock" on key removal | same | High |
| 46 | Adaptation 007, 008, 010, 011, 012 | Locking and unlocking confirmation, 0 to 3 | same | High |
| 46 | Adaptation 017 | "Comfort Function", "no effect if comfort functions are disabled in module coding" | same | High |
| 46 | Special note | "Check the ignition S-contact switching and driver door latch measuring block switching" (group not given) | same | High |
| 46 | Coding byte 1 bit 4 | "Central Locking (Rear Lid) Softtouch (direct open/no release)"; poster: pressing the fob's middle button makes the boot "pop's" open slightly | SeatCupra.net, ross27, post 200, 5 May 2010, Leon 1P thread https://www.seatcupra.net/forums/threads/leon-1p-vag-com-cable-canbus-obd-diagnostics.259591/page-10 | Low (one forum poster, 2010, not verified by poster) |
| 46 / 09 | Coding byte 1 bit 5 | "Rear Lid Remote Opening" (post 182, 4 May 2010, "Im sure its in module 46, byte 1 or 2"); post 200 lists it under 09 | same thread | Low (poster unsure of module; two posts differ) |
| 09 | Coding byte 3 bit 3 | "Reverse Light While Boot Open." | same thread, post 200 | Low |
| 09 | Adaptation 003 | "Rear Window & Outside Mirror Heater Activation Time" (rear window heater, not the lid) | https://wiki.ross-tech.com/wiki/index.php/Seat_Leon_(1P)_Central_Electronics | High (not a lid item) |
| fault text | "00896 - Trunk Lock Unit (F256)", "008 - Implausible Signal - Intermittent"; poster asks if the "micro switch in the boot lock" is worn; reply "you cant code out boot lock im affraid new part mate" | SeatCupra.net, jnbeck, Leon 1.9 TDI, 1 Feb 2013 https://www.seatcupra.net/forums/threads/couple-of-fault-codes-advice-please.373175 | Low (fault code, not a value group) |
| sibling | Passat 3C Trunk Electronics, address 6D: "This control module does not support Coding."; "measuring block data for the F5/F256/V254 rear latch motor assembly" (no groups listed) | https://wiki.ross-tech.com/wiki/index.php/VW_Passat_(3C)_Trunk_Electronics | Low (sibling, not on this car) |

No source gives a value group, field or label for the tailgate handle switch, rear lid contact or door contacts on any module of this car. Door modules 42 and 52 carry no adaptation channels on the Ross-Tech pages.

## Not found

Searched and not found in any readable source:

- Measuring block labels (any group) for modules 08, 09, 15, 16, 17, 19, 25, 42, 46, 52, 55. Ross-Tech pages for these list coding, adaptation or basic settings only.
- Tailgate, boot lid switch or door contact value group on 09, 42, 46, 52 (Golf 1K, Passat 3C, Leon 1P pages; seatcupra.net; vwvortex; Golf and Leon searches in German and English).
- MK60 group 001 wheel speed field order. The only 001 text found is an old Audi manual (display fields 1 to 4 show wheel speeds in km/h), a sibling, not recorded as a label.
- Climatronic groups for 1K0 907 044 (only Audi A4 Cabriolet workshop text seen, sibling).
- Instrument cluster groups 001 to 004 for 1K0 920 / 1P0 920 (only the Audi A2 table, already in `leon-groups.md`, Low).
- Steering wheel 16 groups, gateway 19 groups for this family.
- Airbag 15 groups for 3C0 909 605 L on a Leon or Golf.
- Engine BWJ or BWA groups beyond 103, 106, 140, 230 on Ross-Tech; vwvortex and uk-mkivs.net lists were not readable or not returned by search.
- Ross-Tech label files exist for 1K0-959-433-46, 1K0-953-549, 1K0-907-044, 1K0-907-530, 1K0-920-xxx-17, 5M0-907-357 (downloads on ross-tech.com). They were not opened: copyrighted, and excluded by the rule in `leon-groups.md`. They are the likely place for the missing labels, readable on the owner's own VCDS install.
- Only search snippets, no page body, were available for forum posts on tailgate switch checks (T6 and A4); these are other cars and are not recorded.
