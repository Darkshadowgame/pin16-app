# Gateway installation list research, 2026-11-28

Scope: read-only web research. Quotes are verbatim from fetch results unless marked "(paraphrase)". Fetch tool returns short excerpts, so some quotes are fragments.

## Key finding

Fault 01305 is labelled as a data bus, not a module, in the logs found: "01305 - Databus for Infotainment" with "80-10 - Single-Wire Operation - Intermittent" (radio log) and "No Signal/Communication - Intermittent" (gateway log, 1K0 907 530 L, paraphrase of search summary). An installation list entry stops "no communication with module X" faults. It is not shown to stop a data bus fault. Not found: a source saying removing 56 Radio from the list clears 01305.

## Priority 1: Leon 1P / PQ35 gateway J533 (1K0 907 530)

How the list is held (two sources disagree on where):

| Module or entry | Byte/bit or command | Verbatim label | Source URL | Grade |
|---|---|---|---|---|
| Installation list, general | Separate function in VCDS: Open Controller 19, [Installation List] button, checkboxes, [Write coding] | "use the [Installation List] button in the Open Controller screen for 19 -CAN Gateway to access this screen." / "[Write coding] will tell the Gateway to "register" each of the checked modules." | https://www.ross-tech.com/vcds/tour/installation-list.php | High |
| Installation list as long coding | "On many newer vehicles, the Gateway Installation is not accessible via Long Coding." (implies older ones may be) | same page as above | https://www.ross-tech.com/vcds/tour/installation-list.php | High |
| Direct coding of the list | [Write direct coding] sends a bitfield | "The Direct coding shows the value of the bitfield coding in the Gateway Installation List and allows you to edit it." / "This only works on UDS Gateways and some CAN Gateways." / "[Write direct coding] will send the contents of the Direct coding box to the CAN Gateway." | same | High |
| Gateway long coding (1K0 907 530 L example) | Byte 5, bit 1 | "☑ bit 1 [56] Radio (analog)" | https://vagcode.info/components/ebf13ce5325ee20008ec3f463e9d1cf3.html | Medium |
| Same, digital radio | Byte 5, bit 0 | "☐ bit 0 [0F] Radio (digital)" | same | Medium |
| Same, other infotainment | Byte 4 bit 4 / bit 6 / bit 7 | "bit 4 [47] Sound System", "bit 6 [37] Navigation", "bit 7 [57] TV-Tuner" | same | Medium |
| Same, gateway entry | Byte 6 bit 1 | "bit 1 [19] CAN-Gateway (Standard)" | same | Medium |
| Same, byte values | Byte 5 = [02] binary 00000010; page coding string "ED807F060002021003" (9 bytes, Byte 0 to 8) | "Byte 5 [02]" | same | Medium |
| Retrofit step | Update list, activate 56 | "Update the Installation List in the Gateway (J533 / #19)." / "Address 56 - Radio should also be activated in case there was no Radio installed prior to the Retrofit." | https://wiki.ross-tech.com/wiki/index.php/Navigation_System_(RNS510)_Retrofitting | High |
| Removal precedent | Remove from list and unplug | "If the vehicle had a factory installed 0F - Radio (Digital) module it will need to be removed" "from the Gateway installation list and unplugged/removed from the vehicle." | same | High (for 0F and 1C only) |
| Leon's own coding | 7D 3F 03 40 07 00 02 03 (8 bytes) | not found on any page. The vagcode.info example has 9 bytes (ED 80 7F 06 00 02 02 10 03), which does not match the owner's 8 bytes. | n/a | n/a |

Where sources disagree: Ross-Tech describes the list as a separate function with checkboxes, and says direct coding "only works on UDS Gateways and some CAN Gateways". vagcode.info shows module bits (including [56] Radio) inside the 1K0 907 530 L coding bytes. Both could be true (list mirrored in coding) but no source says so. Which applies to the owner's PQ35 gateway is not found.

Fault 01305:

| Item | Verbatim label | Source URL | Grade |
|---|---|---|---|
| 01305 in radio (address 56) log, 2007 | "01305 - Datenbus Infotainment" / "80-10 - im Eindrahtbetrieb - Sporadisch"; English: "01305 - Databus for Infotainment" / "80-10 - Single-Wire Operation - Intermittent" | https://a2-freun.de/forum/forums/topic/12713-fehler-01317-steuerger-im-schalttafeleinsatz-j285 | Low |
| 01305 listed among faults on 1K0 907 530 L gateway page | "00474, 01305, 00469, and 00532" (fault numbers only, fetch summary) | https://vagcode.info/components/ebf13ce5325ee20008ec3f463e9d1cf3.html | Low |
| 01305 on a Ross-Tech wiki page | not found (the CAN Gateway and Golf 1J gateway pages fetched do not mention it) | https://wiki.ross-tech.com/wiki/index.php/Audi_CAN_Gateway_using_CAN_protocol | n/a |
| Gateway fault pairing for 01305 | gateway log with 01305 and "004" (search summary, paraphrase) | https://vagcode.info/en/components/6b661b5ca11171bbd425f21f006b8175.html (page returned 404 on fetch) | Low |
| Old gateway cannot talk to new head unit | (paraphrase, German forum search summary) older gateway software did not communicate with RNS 310, newer gateway 7N0 907 530 AK fixed it | https://www.motor-talk.de/forum/problem-fse-premium-und-rns-310-t6340764.html (not fetched) | Low |

Safe procedure and risk, quoted:
- "[Restore original value] will undo any of the changes you have just made." / "It will NOT restore the values that were originally in the car from the factory." (https://www.ross-tech.com/vcds/tour/installation-list.php)
- "older versions of the Gateways were not compatible and caused the Databus to stay active even with the Ignition turned OFF" "which resulted in excessive Battery Draw and failure." (RNS510 page, about gateway software, not about removal)
- "Direct coding allows for an easy transfer of the installation list information in case of control module replacement." (tour page): read and note the original list before any change.
- Risk of removing the wrong module: no source states it. Not found. (Practical inference, not sourced: an unregistered module that is present may be reported as not registered, as in a T6 forum report of Address 56 "Not registered" and "Cannot be reached", paraphrase from search summary, https://t6forum.com/threads/retrofited-cc-works-but-error-codes.52225.)

## Priority 2: other cars

Audi A6 C7 (4G): Ross-Tech states "Because Coding does not cover the installed control modules it is necessary to use the Installation List function" (https://wiki.ross-tech.com/wiki/index.php/Audi_CAN_Gateway_using_CAN_protocol). Retrofit pages say "Update the Installation List in the Gateway (J533 / #19)." Tour page says Direct coding "only works on UDS Gateways". UDS routine or DID for read/write: not found. Removing an entry: not found in the sources, only adding. Grade Low to Medium.

Ford Focus: Ford's PMI guide (https://www.ford-trucks.com/ford-manuals/pmiguide.pdf, not read in full) is about programming replacement modules. Quote from search summary (paraphrase): "if a module is not listed, then it is not a programmable module." U2101 is "Control Module Configuration Incompatible" (paraphrase, https://www.go-parts.com/garage/obd-u2101-ford-focus-2011-2018). A way to mark a module absent via As-Built: not found.

Mazda6 GJ: As-Built and module configuration are described only for programming replacement modules (paraphrase, FORScan and M-MDS references). Marking a module absent: not found. U0140 is a body control module lost-communication code (paraphrase, https://www.go-parts.com/garage/obd-u0140-mazda-6-2013-2021).

## Not found

- Exact installation list byte/bit for the Leon's gateway (7D 3F 03 40 07 00 02 03) and whether it is part of the 8-byte long coding.
- Ross-Tech wiki page for 01305.
- Whether 01305 ("Databus for Infotainment") clears when 56 Radio is unregistered.
- Whether the owner's J533 supports Direct coding.
- Any documented risk statement for removing a module from the list.
- UDS routine or DID for the A6 4G installation list.
- Ford and Mazda "module absent" configuration.
- Not reachable: Ross-Tech wiki Gateway_Installation_List (404), motor-talk A1 01305 and Gatewaytausch threads (403), vagcode.info F component page (404).

## Verdicts per car (feasibility of a "Modules fitted" toggle from public sources)

- Leon 1P: Partly. Registering and unregistering exists in VCDS, but 01305 is a bus fault, so the toggle may not stop it. Needs a test on the car with the original list saved first.
- Audi A6 C7: Unproven. Installation list exists, no UDS command or removal procedure found.
- Ford Focus: Not feasible from public sources.
- Mazda6 GJ: Not feasible from public sources.
