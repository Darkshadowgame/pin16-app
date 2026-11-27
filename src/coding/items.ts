// Coding changes Pin16 can write, each a bit (or bits) in a module's
// long coding (UDS DID 0600). Every item names its public sources and a
// confidence; see replica/coding-sources.md. An item is only offered when the
// module answers and its coding is exactly the length the source describes.
import { CATALOGUE_ITEMS } from './catalogue';
import { ENRICHED_ITEMS } from './enriched';

export interface CodingItem {
  id: string;
  title: string;
  summary: string;
  category: 'Instrument cluster' | 'Lights' | 'Locking and alarm' | 'Comfort' | 'Mirrors' | 'Wipers' | 'Warnings and chimes' | 'Driving' | 'Infotainment' | 'Parking';
  platforms: string[];
  // Module id from src/obd/modules.ts.
  module: string;
  // Coding length (bytes) the sources describe; when not given, any coding
  // long enough to hold the byte is accepted.
  length?: number;
  byte: number;
  // Bits set together when the item is on (cleared when off).
  bits: number[];
  // A multi-bit field instead: the bits under mask hold on or off.
  field?: { mask: number; on: number; off: number };
  // low: listed under "Try these". The switch writes at once like any other.
  confidence: 'high' | 'medium' | 'low';
  // Login code the module asks for before this change, when sources give one.
  login?: number;
  // Old 3-byte short coding (a 3-byte big-endian number, shown as 7 digits):
  // the value floor(code / divisor) % modulo holds the flag bit. When given,
  // byte and bits are not used (write byte 0 and no bits).
  short?: { divisor: number; modulo: number; flag: number };
  // Part-number starts (spaces and dashes removed, upper case) the source
  // describes, for a module whose coding layout depends on its part. Offered
  // only once the module's part number has been read and starts with one.
  parts?: string[];
  // A reason this setting is kept back for now. Held items are never offered.
  held?: string;
  note?: string;
  sources: { label: string; url: string }[];
}

const CLUSTER_SOURCES = [
  { label: 'Ross-Tech label for the C7 cluster (vagcode.info, 2012 A7)', url: 'https://vagcode.info/en/components/31efa0ba8917e512d6ff0c1465c23711.html' },
  { label: 'AudiWorld: VCDS coding for A6/A7 C7', url: 'https://www.audiworld.com/forums/a6-c7-platform-discussion-194/vag-com-vcds-coding-2016-fl-a6-a7-2882436/' },
  { label: 'Ross-Tech wiki: A4/A5 (8K/8T) tweaks (MLB sibling)', url: 'https://wiki.ross-tech.com/wiki/index.php/Audi_A4/S4/A5/S5_(8K/8T)_Tweaks' },
];

const C7_DOC = { label: 'Audi C7 VCDS tweaks (community document)', url: 'https://docs.google.com/document/d/1v-dzsYc6OlPT-RGjtRTecjr8Shj85WCZhlQpruSH5XM/mobilebasic' };
const MQB_DALBY = { label: 'Stuart Dalby: Golf Mk7 VCDS coding', url: 'https://www.stuartdalby.co.uk/vwgolfmk7/VCDS' };
const MQB_AUTOINSTRUCT = { label: 'AutoInstruct: MK7 Golf OBDeleven / VCDS tweaks (2017)', url: 'https://www.autoinstruct.com.au/manufacturer/volkswagen/mk7-golf/mk7-golf-obdeleven-vcds-tweaks/' };
const EVO_SWEEP = { label: 'vag-coding.net: Q7 (4M) needle check', url: 'https://www.vag-coding.net/audi/q7-4m/q7-4m-needle-check' };
const EVO_LAP = { label: 'vag-coding.net: A7 (C8) lap timer', url: 'https://www.vag-coding.net/audi/a7-c8/a7-c8-lap-timer' };
const MLB_TWEAKS = { label: 'Ross-Tech wiki: A4/A5 (8K/8T) tweaks (MLB sibling)', url: 'https://wiki.ross-tech.com/wiki/index.php/Audi_A4/S4/A5/S5_(8K/8T)_Tweaks' };

const SEEN_ON_CAR = { label: 'Seen changing on this car, Listen recording of 21 Nov 2026', url: '' };

const VC_E = { label: 'vagcode.info: 09 Cent. Elect. 3C0 937 049 E labels (label file 3C0-937-049-23-H)', url: 'https://vagcode.info/en/components/7756fed0e8d08ce7ea9b8c9e3d94ad63.html' };
const VC_30 = { label: 'vagcode.info: 09 Cent. Elect. 3C8 937 049 E labels (30-byte layout, same bits)', url: 'https://vagcode.info/en/components/aa581e2bc3b035872013a4c4ea95c133.html' };
const SHOWN = { label: 'Shown by another tool on this car, screen recording of 15 Nov 2026', url: '' };
const RT_1K_TWEAKS = { label: 'Ross-Tech wiki: Golf/Jetta/Bora (1K/5M) tweaks (names the option, no byte)', url: 'https://wiki.ross-tech.com/wiki/index.php/VW_Golf/Jetta/Bora_(1K/5M)_Tweaks' };
const RT_LEON_CLUSTER = { label: 'Ross-Tech wiki: SEAT Leon (1P) instrument cluster', url: 'https://wiki.ross-tech.com/wiki/index.php/Seat_Leon_(1P)_Instrument_Cluster' };
const GOLF5 = 'https://www.vag-coding.net/vw/golf-5-1k/golf-5-1k-';
const GOLF5_BULB = { label: 'vag-coding.net: Golf 5 (1K) deactivate burnt-out bulb display', url: GOLF5 + 'deactivate-burnt-out-bulb-display/' };
const GOLF5_DRL = { label: 'vag-coding.net: Golf 5 (1K) daytime running lights with fog lights', url: GOLF5 + 'activate-daytime-running-lights-with-fog-lamps-drl/' };
const GOLF5_RWIPER = { label: 'vag-coding.net: Golf 5 (1K) disable rear wiper when reversing', url: GOLF5 + 'disable-rear-wiper-when-reversing/' };
const GOLF5_CLOSE = { label: 'vag-coding.net: Golf 5 (1K) one-touch window closing', url: GOLF5 + 'one-touch-window-closing/' };
const EOS_CLOSE = { label: 'vag-coding.net: Eos (1F) one-touch window closing (same bit)', url: 'https://www.vag-coding.net/vw/eos-1f/eos-1f-one-touch-window-closing/' };
const GOLF5_FOLD = { label: 'vag-coding.net: Golf 5 (1K) page titled fold down mirrors (its bit is byte 6 bit 7)', url: GOLF5 + 'fold-down-mirrors-with-ignition-off-and-door-open/' };
const GOLF5_UNLOCK_KEY = { label: 'vag-coding.net: Golf 5 (1K) door unlock confirmation (key)', url: GOLF5 + 'door-unlock-confirmation-key/' };
const GOLF5_UNLOCK_REMOTE = { label: 'vag-coding.net: Golf 5 (1K) door unlock confirmation (remote control)', url: GOLF5 + 'door-unlock-confirmation-remote-control/' };
const GOLF5_LOCK_KEY = { label: 'vag-coding.net: Golf 5 (1K) door lock confirmation (key)', url: GOLF5 + 'door-lock-confirmation-key/' };
const GOLF5_LOCK_REMOTE = { label: 'vag-coding.net: Golf 5 (1K) door lock confirmation (remote control)', url: GOLF5 + 'door-lock-confirmation-remote-control/' };
const GOLF5_PAD = { label: 'vag-coding.net: Golf 5 (1K) deactivate brake pad warning light', url: GOLF5 + 'deactivate-brake-pad-warning-light/' };
const GOLF5_WASHER = { label: 'vag-coding.net: Golf 5 (1K) deactivate windshield washer indicator', url: GOLF5 + 'deactivate-windshield-washer-indicator/' };

export const CODING_ITEMS: CodingItem[] = [
  // PQ35 (2007 SEAT Leon), from the owner's recording of another tool.
  {
    id: 'pq35-seat-belt-warning',
    title: 'Seat belt warning',
    summary: 'The seat belt warning light and chime in the instrument cluster. This is a safety warning: keep it on unless you have a reason.',
    category: 'Warnings and chimes',
    platforms: ['PQ35'],
    module: 'vag-17',
    byte: 0,
    bits: [],
    short: { divisor: 1000, modulo: 100, flag: 2 },
    confidence: 'high',
    sources: [{ label: 'Ross-Tech wiki: SEAT Leon (1P) instrument cluster', url: 'https://wiki.ross-tech.com/wiki/index.php/Seat_Leon_(1P)_Instrument_Cluster' }, SEEN_ON_CAR],
  },
  {
    id: 'pq35-rear-side-bulb-check',
    title: 'Rear side bulb check',
    summary: 'This is the name the owner noted for the setting. Its effect has not been confirmed, so check what it does on the car.',
    category: 'Lights',
    platforms: ['PQ35'],
    module: 'vag-09',
    length: 23,
    byte: 18,
    bits: [7],
    confidence: 'medium',
    sources: [SEEN_ON_CAR],
  },
  // More PQ35 settings for the owner car, from the research of 27 Nov 2026 (replica/leon-mods-2026-11-27.md).
  // The 09 bits sit in the 23-byte layout, checked against the settings the other tool showed on this car.
  // The 46 bits are the Golf 5 (1K0 959 433, 19-byte) layout of vag-coding.net.
  {
    id: 'pq35-bulb-brake',
    title: 'Warn me when a brake light bulb fails',
    summary: 'The car warns you when a brake light bulb has failed.',
    category: 'Lights',
    platforms: ['PQ35'],
    module: 'vag-09',
    length: 23,
    byte: 18,
    bits: [1],
    confidence: 'high',
    sources: [VC_E, VC_30, SHOWN],
  },
  {
    id: 'pq35-bulb-rear-fog',
    title: 'Bulb check: rear fog light',
    summary: 'The car warns you when the rear fog light bulb has failed.',
    category: 'Lights',
    platforms: ['PQ35'],
    module: 'vag-09',
    length: 23,
    byte: 18,
    bits: [3],
    confidence: 'high',
    sources: [VC_E, VC_30, SHOWN],
  },
  {
    id: 'pq35-bulb-reverse',
    title: 'Warn me when a reversing light bulb fails',
    summary: 'The car warns you when a reversing light bulb has failed.',
    category: 'Lights',
    platforms: ['PQ35'],
    module: 'vag-09',
    length: 23,
    byte: 18,
    bits: [6],
    confidence: 'high',
    sources: [VC_E, VC_30, SHOWN],
  },
  {
    id: 'pq35-bulb-number-plate',
    title: 'Bulb check: number plate lights',
    summary: 'The car warns you when a number plate light bulb has failed.',
    category: 'Lights',
    platforms: ['PQ35'],
    module: 'vag-09',
    length: 23,
    byte: 18,
    bits: [0],
    confidence: 'high',
    sources: [VC_E, VC_30, GOLF5_BULB],
  },
  {
    id: 'pq35-bulb-high-beam',
    title: 'Bulb check: high beam',
    summary: 'The car warns you when a high beam bulb has failed.',
    category: 'Lights',
    platforms: ['PQ35'],
    module: 'vag-09',
    length: 23,
    byte: 18,
    bits: [4],
    confidence: 'medium',
    note: 'Label only (two label dumps of the same family). Reads on in this car.',
    sources: [VC_E, VC_30],
  },
  {
    id: 'pq35-bulb-check-all',
    title: 'Bulb checks, master switch',
    summary: 'The car checks its bulbs and warns about failed ones. Off hides every bulb warning.',
    category: 'Lights',
    platforms: ['PQ35'],
    module: 'vag-09',
    length: 23,
    byte: 2,
    bits: [2],
    confidence: 'high',
    note: 'Turning this off hides failed bulbs: keep it on unless a check misfires.',
    sources: [VC_E, VC_30, GOLF5_BULB],
  },
  {
    id: 'pq35-drl-fog',
    title: 'Daytime lights from the front fogs',
    summary: 'The front fog lights run as daytime lights.',
    category: 'Lights',
    platforms: ['PQ35'],
    module: 'vag-09',
    length: 23,
    byte: 17,
    bits: [4],
    confidence: 'high',
    note: 'Reads off in this car and the other tool shows it off. Use one daytime light method at a time.',
    sources: [VC_E, VC_30, GOLF5_DRL, RT_1K_TWEAKS, SHOWN],
  },
  {
    id: 'pq35-extra-high-beam',
    title: 'Extra high beam with bi-xenon',
    summary: 'The extra high beam lamps switch on with the high beam. Needs bi-xenon headlights.',
    category: 'Lights',
    platforms: ['PQ35'],
    module: 'vag-09',
    length: 23,
    byte: 17,
    bits: [],
    field: { mask: 0x02, on: 0x00, off: 0x02 },
    confidence: 'high',
    note: 'The source bit is "Deactivation of Additional High Beam with Bi-Xenon", so on here means that bit is clear. Reads on in this car.',
    sources: [VC_E, VC_30, SHOWN],
  },
  {
    id: 'pq35-us-side-markers-off',
    title: 'US-style side lights off',
    summary: 'Switches off the US-style side marker lights. Leave on for a UK car.',
    category: 'Lights',
    platforms: ['PQ35'],
    module: 'vag-09',
    length: 23,
    byte: 17,
    bits: [6],
    confidence: 'high',
    note: 'The source bit is "Parking Light Function inactive (USA/Canada)". Reads on in this car and the other tool shows the same.',
    sources: [VC_E, VC_30, SHOWN],
  },
  {
    id: 'pq35-rear-wiper-continuous',
    title: 'Rear wiper in reverse, front wipers on fast',
    summary: 'The rear wiper joins the front wipers when they run continuously and reverse is selected.',
    category: 'Wipers',
    platforms: ['PQ35'],
    module: 'vag-09',
    length: 23,
    byte: 1,
    bits: [7],
    confidence: 'high',
    note: 'Reads off in this car and the other tool shows it off.',
    sources: [VC_E, VC_30, GOLF5_RWIPER, SHOWN],
  },
  {
    id: 'pq35-rear-wiper-interval',
    title: 'Rear wiper in reverse, front wipers on interval',
    summary: 'The rear wiper joins the front wipers when they run on interval and reverse is selected.',
    category: 'Wipers',
    platforms: ['PQ35'],
    module: 'vag-09',
    length: 23,
    byte: 2,
    bits: [0],
    confidence: 'high',
    note: 'Reads off in this car and the other tool shows it off.',
    sources: [VC_E, VC_30, GOLF5_RWIPER, SHOWN],
  },
  {
    id: 'pq35-comfort-close-remote',
    title: 'Windows close when you lock with the remote',
    summary: 'The windows close when you lock the car with the remote.',
    category: 'Comfort',
    platforms: ['PQ35'],
    module: 'vag-46',
    length: 19,
    byte: 6,
    bits: [6],
    confidence: 'medium',
    note: 'Needs the window and sunroof remote options on and adaptation channel 17 set to on. Reads on in this car.',
    sources: [GOLF5_CLOSE, EOS_CLOSE, RT_1K_TWEAKS],
  },
  {
    id: 'pq35-windows-after-door',
    title: 'Windows work after a door opens',
    summary: 'The comfort window and sunroof functions still work after a door has been opened.',
    category: 'Comfort',
    platforms: ['PQ35'],
    module: 'vag-46',
    length: 19,
    byte: 6,
    bits: [],
    field: { mask: 0x80, on: 0x00, off: 0x80 },
    confidence: 'medium',
    note: 'The source bit is "Power Windows/Sunroof disabled after door Opening", so on here means that bit is clear. Reads off in this car.',
    sources: [GOLF5_FOLD],
  },
  {
    id: 'pq35-confirm-unlock-key-flash',
    title: 'Flash on unlock with the key',
    summary: 'The indicators flash when the key in the door lock unlocks the car.',
    category: 'Locking and alarm',
    platforms: ['PQ35'],
    module: 'vag-46',
    length: 19,
    byte: 10,
    bits: [0],
    confidence: 'medium',
    note: 'Reads on in this car. Adaptation channel 8 sets the same thing.',
    sources: [GOLF5_UNLOCK_KEY],
  },
  {
    id: 'pq35-confirm-unlock-key-horn',
    title: 'Horn on unlock with the key',
    summary: 'The horn sounds when the key in the door lock unlocks the car.',
    category: 'Locking and alarm',
    platforms: ['PQ35'],
    module: 'vag-46',
    length: 19,
    byte: 10,
    bits: [1],
    confidence: 'medium',
    note: 'Reads on in this car. Adaptation channel 8 sets the same thing.',
    sources: [GOLF5_UNLOCK_KEY],
  },
  {
    id: 'pq35-confirm-unlock-remote-flash',
    title: 'Flash on unlock with the remote',
    summary: 'The indicators flash when the remote unlocks the car.',
    category: 'Locking and alarm',
    platforms: ['PQ35'],
    module: 'vag-46',
    length: 19,
    byte: 10,
    bits: [2],
    confidence: 'medium',
    note: 'Reads on in this car. Adaptation channel 7 sets the same thing.',
    sources: [GOLF5_UNLOCK_REMOTE],
  },
  {
    id: 'pq35-confirm-unlock-remote-horn',
    title: 'Horn on unlock with the remote',
    summary: 'The horn sounds when the remote unlocks the car.',
    category: 'Locking and alarm',
    platforms: ['PQ35'],
    module: 'vag-46',
    length: 19,
    byte: 10,
    bits: [3],
    confidence: 'medium',
    note: 'Reads on in this car. Adaptation channel 7 sets the same thing.',
    sources: [GOLF5_UNLOCK_REMOTE],
  },
  {
    id: 'pq35-confirm-lock-key-flash',
    title: 'Flash on lock with the key',
    summary: 'The indicators flash when the key in the door lock locks the car.',
    category: 'Locking and alarm',
    platforms: ['PQ35'],
    module: 'vag-46',
    length: 19,
    byte: 11,
    bits: [0],
    confidence: 'medium',
    note: 'Reads on in this car. Adaptation channel 11 sets the same thing.',
    sources: [GOLF5_LOCK_KEY],
  },
  {
    id: 'pq35-confirm-lock-key-horn',
    title: 'Horn on lock with the key',
    summary: 'The horn sounds when the key in the door lock locks the car.',
    category: 'Locking and alarm',
    platforms: ['PQ35'],
    module: 'vag-46',
    length: 19,
    byte: 11,
    bits: [1],
    confidence: 'medium',
    note: 'Reads on in this car. Adaptation channel 11 sets the same thing.',
    sources: [GOLF5_LOCK_KEY],
  },
  {
    id: 'pq35-confirm-lock-remote-flash',
    title: 'Flash on lock with the remote',
    summary: 'The indicators flash when the remote locks the car.',
    category: 'Locking and alarm',
    platforms: ['PQ35'],
    module: 'vag-46',
    length: 19,
    byte: 11,
    bits: [2],
    confidence: 'medium',
    note: 'Reads on in this car. Adaptation channel 10 sets the same thing.',
    sources: [GOLF5_LOCK_REMOTE],
  },
  {
    id: 'pq35-confirm-lock-remote-horn',
    title: 'Horn on lock with the remote',
    summary: 'The horn sounds when the remote locks the car.',
    category: 'Locking and alarm',
    platforms: ['PQ35'],
    module: 'vag-46',
    length: 19,
    byte: 11,
    bits: [3],
    confidence: 'medium',
    note: 'Reads on in this car. Adaptation channel 10 sets the same thing.',
    sources: [GOLF5_LOCK_REMOTE],
  },
  {
    id: 'pq35-brake-pad-warning',
    title: 'Brake pad wear warning',
    summary: 'The cluster shows the brake pad wear warning.',
    category: 'Warnings and chimes',
    platforms: ['PQ35'],
    module: 'vag-17',
    byte: 0,
    bits: [],
    short: { divisor: 1000, modulo: 100, flag: 1 },
    confidence: 'high',
    note: 'Short coding, digits 3 and 4, +01. Turn off only if the pads have no wear sensor. Reads off in this car and the other tool shows it off.',
    sources: [RT_LEON_CLUSTER, GOLF5_PAD, SHOWN],
  },
  {
    id: 'pq35-washer-warning',
    title: 'Washer fluid level warning',
    summary: 'The cluster warns when the washer fluid is low. Works only with a fluid level sensor.',
    category: 'Warnings and chimes',
    platforms: ['PQ35'],
    module: 'vag-17',
    byte: 0,
    bits: [],
    short: { divisor: 1000, modulo: 100, flag: 4 },
    confidence: 'high',
    note: 'Short coding, digits 3 and 4, +04. Reads on in this car and the other tool shows it on.',
    sources: [RT_LEON_CLUSTER, GOLF5_WASHER, SHOWN],
  },
  // MQB (Golf 7, Octavia III, A3 8V, Leon 5F) and MLB evo: same cluster bits (replica/vag-sources.md section 3).
  {
    id: 'mqb-needle-sweep',
    title: 'Needle sweep',
    summary: 'The dials sweep to the end and back when you switch on.',
    category: 'Instrument cluster',
    platforms: ['MQB', 'MQB evo'],
    module: 'vag-17',
    byte: 1,
    bits: [0],
    confidence: 'high',
    sources: [MQB_DALBY, MQB_AUTOINSTRUCT],
  },
  {
    id: 'mqb-lap-timer',
    title: 'Lap timer',
    summary: 'Adds a lap timer to the driver information display.',
    category: 'Instrument cluster',
    platforms: ['MQB', 'MQB evo'],
    module: 'vag-17',
    byte: 1,
    bits: [3],
    confidence: 'medium',
    sources: [MQB_AUTOINSTRUCT],
  },
  {
    id: 'evo-needle-sweep',
    title: 'Needle sweep',
    summary: 'The dials sweep to the end and back when you switch on.',
    category: 'Instrument cluster',
    platforms: ['MLB evo'],
    module: 'vag-17',
    byte: 1,
    bits: [0],
    confidence: 'medium',
    sources: [EVO_SWEEP],
  },
  {
    id: 'evo-lap-timer',
    title: 'Lap timer',
    summary: 'Adds a lap timer to the driver information display.',
    category: 'Instrument cluster',
    platforms: ['MLB evo'],
    module: 'vag-17',
    byte: 1,
    bits: [3],
    confidence: 'medium',
    sources: [EVO_LAP],
  },
  {
    id: 'c7-needle-sweep',
    title: 'Needle sweep',
    summary: 'The speedo and rev counter needles sweep to the end and back when you switch on.',
    category: 'Instrument cluster',
    platforms: ['MLB'],
    module: 'vag-17',
    length: 11,
    byte: 1,
    bits: [0],
    confidence: 'high',
    note: 'Some clusters ignore it.',
    sources: CLUSTER_SOURCES,
  },
  {
    id: 'c7-lap-timer',
    title: 'Lap timer',
    summary: 'Adds a lap timer to the driver information display, worked with the wiper stalk.',
    category: 'Instrument cluster',
    platforms: ['MLB'],
    module: 'vag-17',
    length: 11,
    byte: 1,
    bits: [3],
    confidence: 'high',
    sources: CLUSTER_SOURCES,
  },
  {
    id: 'c7-drl-off-indicating',
    title: 'Daytime light dims with the indicator',
    summary: 'The daytime running light on the indicating side goes off while that indicator flashes.',
    category: 'Lights',
    platforms: ['MLB'],
    module: 'vag-09',
    length: 30,
    byte: 3,
    bits: [7],
    confidence: 'medium',
    sources: [C7_DOC, MLB_TWEAKS],
  },
  {
    id: 'c7-drl-mmi',
    title: 'Daytime lights switchable in MMI',
    summary: 'Adds an on/off setting for the daytime running lights to the MMI.',
    category: 'Lights',
    platforms: ['MLB'],
    module: 'vag-09',
    length: 30,
    byte: 3,
    bits: [0],
    confidence: 'medium',
    sources: [C7_DOC],
  },
  {
    id: 'c7-tail-with-drl',
    title: 'Tail lights with daytime lights',
    summary: 'The rear lights come on with the daytime running lights.',
    category: 'Lights',
    platforms: ['MLB'],
    module: 'vag-09',
    length: 30,
    byte: 2,
    bits: [7],
    confidence: 'medium',
    sources: [C7_DOC],
  },
  {
    id: 'c7-tourist',
    title: 'Tourist light mode in MMI',
    summary: 'Adds the tourist (drive on the other side) headlight setting to the MMI.',
    category: 'Lights',
    platforms: ['MLB'],
    module: 'vag-09',
    length: 30,
    byte: 4,
    bits: [6],
    // Two sources since the 12 Nov 2026 research (replica/a6-enrich.md).
    confidence: 'high',
    sources: [C7_DOC, { label: 'vag-coding.net: A6 C7 display travel mode on MMI', url: 'https://www.vag-coding.net/audi/a6-c7/a6-c7-display-travel-mode-on-mmi/' }],
  },
  {
    id: 'c7-lock-horn',
    title: 'Horn chirp when locking',
    summary: 'A short horn chirp confirms locking with the key. Needs the factory alarm.',
    category: 'Locking and alarm',
    platforms: ['MLB'],
    module: 'vag-46',
    length: 30,
    byte: 1,
    bits: [2],
    confidence: 'medium',
    sources: [C7_DOC],
  },
  {
    id: 'c7-adaptive-brake',
    title: 'Flashing brake lights in an emergency stop',
    summary: 'The brake lights flash under very hard braking.',
    category: 'Lights',
    platforms: ['MLB'],
    module: 'vag-46',
    length: 30,
    byte: 8,
    bits: [0, 1],
    confidence: 'medium',
    sources: [C7_DOC],
  },
];

// One item per setting (platform, module, byte, bits). When several sources
// describe the same setting, the best-supported one is kept (higher
// confidence, then more sources; hand-checked first on a tie), with every
// source listed, and the coding length taken from whichever gives one.
const RANK = { high: 3, medium: 2, low: 1 } as const;
export function mergeItems(lists: CodingItem[][]): CodingItem[] {
  const key = (i: CodingItem) => `${i.platforms.join()}|${i.module}|${i.byte}|${i.bits.join()}|${i.field?.mask ?? ''}|${i.short?.divisor ?? ''}|${i.short?.flag ?? ''}`;
  const out = new Map<string, CodingItem>();
  for (const list of lists) {
    for (const i of list) {
      const k = key(i);
      const old = out.get(k);
      if (!old) {
        out.set(k, i);
        continue;
      }
      const better = RANK[i.confidence] > RANK[old.confidence] || (RANK[i.confidence] === RANK[old.confidence] && i.sources.length > old.sources.length);
      const keep = better ? i : old;
      const urls = new Set(keep.sources.map((x) => x.url));
      const other = better ? old : i;
      out.set(k, { ...keep, length: keep.length ?? other.length, sources: [...keep.sources, ...other.sources.filter((x) => !urls.has(x.url))] });
    }
  }
  return [...out.values()];
}

// Hand-checked items, the catalogue (replica/vag-tweaks.md) and the A6 C7
// research of 12 Nov 2026 (src/coding/enriched.ts).
export const ALL_ITEMS: CodingItem[] = mergeItems([CODING_ITEMS, CATALOGUE_ITEMS, ENRICHED_ITEMS]);

export function codingItemsFor(group: string, platform: string | null): CodingItem[] {
  if (group !== 'vag' || !platform) return [];
  return ALL_ITEMS.filter((i) => i.platforms.includes(platform));
}

// Short coding: the 3 bytes as one number, at most 23 bits.
const SHORT_MAX = 0x7fffff;
function shortValue(coding: number[]): number | null {
  if (coding.length !== 3 || coding.some((b) => !Number.isInteger(b) || b < 0 || b > 0xff)) return null;
  const n = (coding[0] << 16) | (coding[1] << 8) | coding[2];
  return n > SHORT_MAX ? null : n;
}

// A short item belongs on short-coded modules; byte and bit items on the others.
export function fitsStyle(item: CodingItem, style: string | null | undefined): boolean {
  return item.short ? style === 'short' : style !== 'short';
}

// Bytes that hold a number (a percentage or a time), not switches, on a layout
// the owner's car reads: 09 Central electronics, 23 bytes (replica/leon-mods-2026-11-27.md,
// section 2: bytes 7 to 16 are "Decimal Value (Resolution: 1%)" and byte 20 reads 32 hex, 50).
// No switch may write into them.
export const NUMERIC_BYTES: { module: string; length: number; bytes: number[] }[] = [{ module: 'vag-09', length: 23, bytes: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 20] }];

// What is known about the module the coding came from.
export interface FitContext {
  // How the module's coding is held: 'short', 'long', 'did' or 'uds' (null: not known).
  style?: string | null;
  // The module's part number as read, in any spacing (empty or missing: not read).
  part?: string | null;
}

const cleanPart = (p: string | null | undefined) => (p ?? '').replace(/[\s-]/g, '').toUpperCase();

// The 1 place that decides whether an item applies to a module's coding. Null
// when it does; otherwise the plain reason. Customise, the Car tab count, the
// Workshop list and the write itself all call it, so they always agree.
export function whyNotOffered(item: CodingItem, coding: number[] | null | undefined, ctx: FitContext = {}): string | null {
  if (item.held) return item.held;
  if (!coding || !coding.length) return 'The module has not given its coding.';
  if (!fitsStyle(item, ctx.style)) return item.short ? 'This setting is for modules with a short code, and this one does not have one.' : 'This setting is for modules with a long coding, and this one has a short code.';
  if (item.short) return coding.length === 3 ? null : `This setting needs a 3-byte short code, and this module has ${coding.length} bytes.`;
  if (coding.length <= item.byte) return `This module's coding has ${coding.length} bytes, too short for this setting.`;
  if (item.length != null && coding.length !== item.length) return `This setting is for a ${item.length}-byte coding, and this module has ${coding.length} bytes.`;
  if (NUMERIC_BYTES.some((n) => n.module === item.module && n.length === coding.length && n.bytes.includes(item.byte))) return `Byte ${item.byte} of this coding holds a number, not a switch.`;
  if (item.parts?.length) {
    const part = cleanPart(ctx.part);
    if (!part) return 'This setting depends on the module part number, which has not been read yet.';
    if (!item.parts.some((p) => part.startsWith(cleanPart(p)))) return 'This setting is for a different module part number.';
  }
  return null;
}

export const itemApplies = (item: CodingItem, coding: number[] | null | undefined, ctx: FitContext = {}): boolean => whyNotOffered(item, coding, ctx) === null;

// The items that apply, given every module's coding on the car.
export function offeredItems(items: CodingItem[], codings: Record<string, number[] | null | undefined>, ctxOf: (moduleId: string) => FitContext = () => ({})): CodingItem[] {
  return items.filter((i) => itemApplies(i, codings[i.module], ctxOf(i.module)));
}

export function isOn(item: CodingItem, coding: number[]): boolean {
  if (item.short) {
    const n = shortValue(coding);
    if (n == null) return false;
    return (Math.floor(n / item.short.divisor) % item.short.modulo & item.short.flag) !== 0;
  }
  const b = coding[item.byte] ?? 0;
  if (item.field) return (b & item.field.mask) === item.field.on;
  return item.bits.every((bit) => (b & (1 << bit)) !== 0);
}

// New coding with the item's bits set or cleared; everything else unchanged.
export function withItem(item: CodingItem, coding: number[], on: boolean): number[] {
  if (item.short) {
    const n = shortValue(coding);
    if (n == null) return [...coding];
    const { divisor, modulo, flag } = item.short;
    const pair = Math.floor(n / divisor) % modulo;
    const nextPair = on ? pair | flag : pair & ~flag;
    const m = n + (nextPair - pair) * divisor;
    if (m < 0 || m > SHORT_MAX) return [...coding];
    return [(m >> 16) & 0xff, (m >> 8) & 0xff, m & 0xff];
  }
  const next = [...coding];
  let b = next[item.byte];
  if (item.field) b = (b & ~item.field.mask) | (on ? item.field.on : item.field.off);
  else for (const bit of item.bits) b = on ? b | (1 << bit) : b & ~(1 << bit);
  next[item.byte] = b & 0xff;
  return next;
}

// Where the setting sits, for Technical lines: "byte 2, bit 4" or "digits 3 and 4, flag 2".
export function placeLabel(item: CodingItem): string {
  return item.short ? `digits 3 and 4 of the short code, flag +${String(item.short.flag).padStart(2, '0')}` : `byte ${item.byte}, ${bitsLabel(item)}`;
}

// "bit 2" or "bits 4 and 5" for a setting, including multi-bit fields.
export function bitsLabel(item: CodingItem): string {
  const bits = item.field ? [0, 1, 2, 3, 4, 5, 6, 7].filter((b) => (item.field!.mask >> b) & 1) : item.bits;
  return bits.length === 1 ? `bit ${bits[0]}` : `bits ${bits.slice(0, -1).join(', ')} and ${bits[bits.length - 1]}`;
}

// The setting's line in Customise, matching what the car has now: "Off now.
// When on, the headlights stay on ..." or "On now: the headlights stay on
// ...". The summary says what the
// setting does when on; source notes stay behind Technical.
export function stateText(item: Pick<CodingItem, 'summary'>, on: boolean): string {
  const what = item.summary.charAt(0).toLowerCase() + item.summary.slice(1);
  return on ? `On now: ${what}` : `Off now. When on, ${what}`;
}
