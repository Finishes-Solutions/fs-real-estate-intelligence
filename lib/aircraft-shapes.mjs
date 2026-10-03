// Which map icon a plane gets: from its ICAO type designator (the "t" the ADS-B feeds send, e.g. B738, C172, R44),
// else from the ADS-B emitter category (A1 light … A7 rotorcraft, B1 glider, B2 balloon, B6 drone, C1/C2 ground vehicle).
// src/planes.js draws one silhouette per shape and scales it by SIZE, so a 747 is visibly bigger than a Cessna.
export const SHAPES = ['heavy4', 'heavy2', 'jet', 'regional', 'bizjet', 'fighter', 'turboprop2', 'turboprop1', 'twin', 'single', 'heli', 'glider', 'balloon', 'drone', 'ground'];
// relative to the old one-size icon: small planes stay about that size (still easy to click), airliners grow
export const SIZE = { heavy4: 1.45, heavy2: 1.35, jet: 1.12, regional: 1, bizjet: .92, fighter: .9, turboprop2: 1, turboprop1: .88, twin: .86, single: .8, heli: .86, glider: .86, balloon: .78, drone: .7, ground: .62 };

const set = s => new Set(s.split(/\s+/).filter(Boolean));
// four engines, wide body
const HEAVY4 = set('A388 A343 A345 A346 A342 A340 B741 B742 B743 B744 B748 B74S B74R BLCF A124 A225 C5 C5M IL96 IL76 E3TF E3CF E6 VC25 K35R KC135 C135 B52 A400 C17 P3 C130 C30J AN12 L188');
// two (or three) engines, wide body
const HEAVY2 = set('A306 A30B A310 A332 A333 A337 A338 A339 A359 A35K B762 B763 B764 B772 B77L B773 B77W B778 B779 B788 B789 B78X MD11 DC10 L101 KC10 K46 KC46 B76F A3ST IL86');
// narrow-body airliners and other wing-mounted twin jets
const JET = set('A318 A319 A320 A321 A19N A20N A21N B712 B717 B721 B722 B731 B732 B733 B734 B735 B736 B737 B738 B739 B37M B38M B39M B3XM B752 B753 BCS1 BCS3 E190 E195 E290 E295 E75L E75S E170 E175 MD80 MD81 MD82 MD83 MD87 MD88 MD90 DC93 DC95 C919 SU95 T204 B701 P8 E737 C40');
// small rear-engine and regional jets
const REGIONAL = set('CRJ1 CRJ2 CRJ7 CRJ9 CRJX E135 E145 E35L E45X F28 F70 F100 B461 B462 B463 RJ70 RJ85 RJ1H AJ27');
// helicopters
const HELI = set('R22 R44 R66 B06 B06T B105 B212 B222 B230 B407 B412 B427 B429 B430 B47G B505 EC20 EC25 EC30 EC35 EC45 EC55 EC75 EC120 EC130 EC135 EC145 EC155 EC175 H125 H130 H135 H145 H155 H160 H175 AS32 AS35 AS50 AS55 AS65 A109 A119 A139 A149 A169 A189 AW09 S61 S64 S70 S76 S92 H47 H53 H60 H64 UH1 UH60 MH60 CH47 MD52 MD60 EXPL H269 H500 S300 EN28 EN48 CABR G2CA');
// fighters, trainers and other fast military jets
const FIGHTER = set('F16 F15 F18 F18S F18H F22 F35 F14 F4 F5 T38 T45 T7 A10 AV8B EUFI RFAL TOR GRIF MIG29 SU27 SU30 SU35 L39 L159 M346 HAWK AJET TEX2 T6 PC21 PC9 A29');
// single-engine turboprops
const TURBOPROP1 = set('C208 C08T PC12 PC6T TBM7 TBM8 TBM9 TBM850 P46T KODI AT3T AT5T AT6T AT8T M600 EPIC SR3T C210T GA8');
// twin turboprops
const TURBOPROP2 = set('AT43 AT44 AT45 AT46 AT72 AT73 AT75 AT76 DH8A DH8B DH8C DH8D DHC6 DHC7 SF34 SB20 B190 BE99 BE20 BE30 BE35T B350 BE9L BE9T BE10 C425 C441 C12 PAY1 PAY2 PAY3 PAY4 P180 SW3 SW4 MU2 JS31 JS32 JS41 E120 E110 D228 D328 F27 F50 CN35 C295 L410 AN26 AN28 SH36 SH33 C27J G222 CVLT');
// twin pistons
const TWIN = set('BE55 BE56 BE58 BE60 BE76 BE95 PA23 PA27 PA30 PA31 PA34 PA39 PA44 C303 C310 C320 C335 C340 C401 C402 C404 C411 C414 C421 DA42 DA62 P68 AEST BN2P TOBA G21 G44');
// business jets
const BIZJET_RE = /^(C25[ABC]|C25M|C500|C501|C510|C525|C526|C550|C551|C55B|C560|C56X|C650|C680|C68A|C700|C750|GLF\d|GLEX|GL5T|GL6T|GL7T|GL8T|G150|G200|G280|GALX|ASTR|CL30|CL35|CL60|CL64|CRJ10?|LJ\d\d|LJ\d\d\d|FA10|FA20|FA50|FA5X|FA6X|FA7X|FA8X|F2TH|F900|E50P|E55P|E545|E550|E35L|PC24|BE40|PRM1|H25A|H25B|H25C|HA4T|HDJT|SF50|EA50|C501|SBR1|SBR2|WW24|J328|ULTR|E135L)$/;
// single-engine pistons: everything Cessna/Piper/Cirrus/Beech/Mooney/Diamond-ish that wasn't caught above
const SINGLE_RE = /^(C1\d\d|C2\d\d|C17\d|C18\d|C77R|P28[A-Z0-9]|PA1\d|PA2[0-9]|PA3[2-6]|PA46|PA38|PA18|J3|J5|CUB|SR20|SR22|S22T|BE19|BE23|BE24|BE33|BE35|BE36|M20[A-Z]|DA20|DA40|DV20|RV\d+|GLAS|LNC\d|AA1|AA5|TRIN|TB\d+|AC11|BL8|CH7A|ARCT|CH60|GA7|DR40|P210|C210|T210|COL3|COL4|LA4|EVSS|EV97|ULAC|IR23|NAVI|BU31|AP22|SIRA|M7|AVIA|S108|L8|CH2T)$/;
const GLIDER_RE = /^(GLID|ASK\d+|AS\d\d|DG\d+|LS\d|DUO|ARCP|NIMB|VENT|JANU|PIK\d+|SZD\d+|G102|G103|G109)$/;
const BALLOON = set('BALL SHIP GBAL');

export function shapeOf(t, cat) {
  const c = String(t || '').trim().toUpperCase();
  if (c) {
    if (HEAVY4.has(c)) return 'heavy4';
    if (HEAVY2.has(c)) return 'heavy2';
    if (JET.has(c)) return 'jet';
    if (REGIONAL.has(c)) return 'regional';
    if (HELI.has(c)) return 'heli';
    if (FIGHTER.has(c)) return 'fighter';
    if (TURBOPROP1.has(c)) return 'turboprop1';
    if (TURBOPROP2.has(c)) return 'turboprop2';
    if (TWIN.has(c)) return 'twin';
    if (BIZJET_RE.test(c)) return 'bizjet';
    if (GLIDER_RE.test(c)) return 'glider';
    if (BALLOON.has(c)) return 'balloon';
    if (SINGLE_RE.test(c)) return 'single';
  }
  switch (String(cat || '').toUpperCase()) {
    case 'A1': return 'single';      // light, under 15,500 lb
    case 'A2': return 'bizjet';      // small, 15,500-75,000 lb (business jets, regional turboprops)
    case 'A3': case 'A4': return 'jet'; // large; A4 = B757-class
    case 'A5': return 'heavy2';      // heavy, over 300,000 lb
    case 'A6': return 'fighter';     // high performance
    case 'A7': return 'heli';
    case 'B1': return 'glider';
    case 'B2': return 'balloon';
    case 'B4': return 'single';      // ultralight
    case 'B6': return 'drone';
    case 'C1': case 'C2': case 'C3': return 'ground';
  }
  return 'jet';
}
