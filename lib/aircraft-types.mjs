// ICAO aircraft type designators -> plain names. The live ADS-B feeds send only the code ("A21N", "B38M"); this
// covers the airliners, regional jets, business jets, turboprops, pistons and helicopters seen over Texas.
// Unknown codes show as the code itself.
const T = {
  // Airbus
  A19N: 'Airbus A319neo', A20N: 'Airbus A320neo', A21N: 'Airbus A321neo', A318: 'Airbus A318', A319: 'Airbus A319', A320: 'Airbus A320', A321: 'Airbus A321',
  A332: 'Airbus A330-200', A333: 'Airbus A330-300', A339: 'Airbus A330-900neo', A343: 'Airbus A340-300', A346: 'Airbus A340-600', A359: 'Airbus A350-900', A35K: 'Airbus A350-1000',
  A388: 'Airbus A380', BCS1: 'Airbus A220-100', BCS3: 'Airbus A220-300', A306: 'Airbus A300-600', A30B: 'Airbus A300',
  // Boeing
  B712: 'Boeing 717', B733: 'Boeing 737-300', B734: 'Boeing 737-400', B735: 'Boeing 737-500', B736: 'Boeing 737-600', B737: 'Boeing 737-700', B738: 'Boeing 737-800', B739: 'Boeing 737-900',
  B37M: 'Boeing 737 MAX 7', B38M: 'Boeing 737 MAX 8', B39M: 'Boeing 737 MAX 9', B3XM: 'Boeing 737 MAX 10', B752: 'Boeing 757-200', B753: 'Boeing 757-300',
  B762: 'Boeing 767-200', B763: 'Boeing 767-300', B764: 'Boeing 767-400', B772: 'Boeing 777-200', B77L: 'Boeing 777-200LR', B773: 'Boeing 777-300', B77W: 'Boeing 777-300ER', B778: 'Boeing 777-8', B779: 'Boeing 777-9',
  B788: 'Boeing 787-8', B789: 'Boeing 787-9', B78X: 'Boeing 787-10', B744: 'Boeing 747-400', B748: 'Boeing 747-8', MD11: 'McDonnell Douglas MD-11', MD82: 'McDonnell Douglas MD-82', MD83: 'McDonnell Douglas MD-83', MD88: 'McDonnell Douglas MD-88', DC10: 'McDonnell Douglas DC-10',
  // regional
  E170: 'Embraer 170', E75L: 'Embraer 175', E75S: 'Embraer 175', E190: 'Embraer 190', E195: 'Embraer 195', E290: 'Embraer E190-E2', E295: 'Embraer E195-E2', E135: 'Embraer ERJ-135', E145: 'Embraer ERJ-145', E45X: 'Embraer ERJ-145XR',
  CRJ1: 'Bombardier CRJ100', CRJ2: 'Bombardier CRJ200', CRJ7: 'Bombardier CRJ700', CRJ9: 'Bombardier CRJ900', CRJX: 'Bombardier CRJ1000',
  DH8A: 'De Havilland Dash 8-100', DH8B: 'De Havilland Dash 8-200', DH8C: 'De Havilland Dash 8-300', DH8D: 'De Havilland Dash 8-400', AT43: 'ATR 42-300', AT45: 'ATR 42-500', AT72: 'ATR 72', AT75: 'ATR 72-500', AT76: 'ATR 72-600',
  SF34: 'Saab 340', SB20: 'Saab 2000', JS41: 'BAe Jetstream 41',
  // business jets
  C25A: 'Cessna Citation CJ2', C25B: 'Cessna Citation CJ3', C25C: 'Cessna Citation CJ4', C525: 'Cessna CitationJet', C510: 'Cessna Citation Mustang', C550: 'Cessna Citation II', C560: 'Cessna Citation V', C56X: 'Cessna Citation Excel',
  C650: 'Cessna Citation III', C680: 'Cessna Citation Sovereign', C68A: 'Cessna Citation Latitude', C700: 'Cessna Citation Longitude', C750: 'Cessna Citation X',
  CL30: 'Bombardier Challenger 300', CL35: 'Bombardier Challenger 350', CL60: 'Bombardier Challenger 600', GL5T: 'Bombardier Global 5000', GLEX: 'Bombardier Global Express', GL7T: 'Bombardier Global 7500',
  LJ35: 'Learjet 35', LJ45: 'Learjet 45', LJ60: 'Learjet 60', LJ75: 'Learjet 75', GLF4: 'Gulfstream IV', GLF5: 'Gulfstream V', GLF6: 'Gulfstream G650', G280: 'Gulfstream G280', GA5C: 'Gulfstream G500', GA6C: 'Gulfstream G600', GA7C: 'Gulfstream G700',
  F2TH: 'Dassault Falcon 2000', F900: 'Dassault Falcon 900', FA7X: 'Dassault Falcon 7X', FA8X: 'Dassault Falcon 8X', FA50: 'Dassault Falcon 50', E50P: 'Embraer Phenom 100', E55P: 'Embraer Phenom 300', E545: 'Embraer Legacy 450', E550: 'Embraer Praetor 600',
  H25B: 'Hawker 800', HA4T: 'Hawker 4000', PRM1: 'Beechcraft Premier', BE40: 'Beechcraft Beechjet 400', HDJT: 'HondaJet', SF50: 'Cirrus Vision Jet', PC24: 'Pilatus PC-24',
  // turboprops
  PC12: 'Pilatus PC-12', TBM7: 'Daher TBM 700', TBM8: 'Daher TBM 850', TBM9: 'Daher TBM 900', B350: 'Beechcraft King Air 350', BE20: 'Beechcraft King Air 200', BE9L: 'Beechcraft King Air 90', BE99: 'Beechcraft 99', BE1900: 'Beechcraft 1900', B190: 'Beechcraft 1900',
  C208: 'Cessna Caravan', C441: 'Cessna Conquest II', P46T: 'Piper Meridian', PAY3: 'Piper Cheyenne III', AC90: 'Aero Commander 690', DHC6: 'De Havilland Twin Otter', SW4: 'Fairchild Metro',
  // piston
  C150: 'Cessna 150', C152: 'Cessna 152', C172: 'Cessna 172 Skyhawk', C177: 'Cessna 177 Cardinal', C182: 'Cessna 182 Skylane', C206: 'Cessna 206', C210: 'Cessna 210', C310: 'Cessna 310', C340: 'Cessna 340', C414: 'Cessna 414', C421: 'Cessna 421',
  P28A: 'Piper Cherokee', P28B: 'Piper Cherokee', P28R: 'Piper Arrow', P32R: 'Piper Saratoga', PA31: 'Piper Navajo', PA32: 'Piper Cherokee Six', PA34: 'Piper Seneca', PA44: 'Piper Seminole', PA46: 'Piper Malibu', PA18: 'Piper Super Cub',
  SR20: 'Cirrus SR20', SR22: 'Cirrus SR22', S22T: 'Cirrus SR22T', BE33: 'Beechcraft Debonair', BE35: 'Beechcraft Bonanza', BE36: 'Beechcraft Bonanza', BE55: 'Beechcraft Baron 55', BE58: 'Beechcraft Baron 58', BE76: 'Beechcraft Duchess',
  M20P: 'Mooney M20', M20T: 'Mooney M20 Turbo', DA40: 'Diamond DA40', DA42: 'Diamond DA42', DA62: 'Diamond DA62', RV7: 'Van’s RV-7', RV8: 'Van’s RV-8', RV10: 'Van’s RV-10', AA5: 'Grumman Tiger', COL4: 'Cessna TTx',
  // helicopters
  R22: 'Robinson R22', R44: 'Robinson R44', R66: 'Robinson R66', EC35: 'Airbus H135', EC45: 'Airbus H145', EC30: 'Airbus H130', AS50: 'Airbus AS350 / H125', AS65: 'Airbus AS365 Dauphin', EC55: 'Airbus H155', EC75: 'Airbus H175',
  B06: 'Bell 206 JetRanger', B407: 'Bell 407', B412: 'Bell 412', B429: 'Bell 429', B505: 'Bell 505', S76: 'Sikorsky S-76', S92: 'Sikorsky S-92', A109: 'Leonardo AW109', A119: 'Leonardo AW119', A139: 'Leonardo AW139', A169: 'Leonardo AW169', H60: 'Sikorsky Black Hawk', MD52: 'MD 520N', MD60: 'MD 600N',
  // military / cargo seen locally
  C130: 'Lockheed C-130 Hercules', C30J: 'Lockheed C-130J', C17: 'Boeing C-17', K35R: 'Boeing KC-135', T38: 'Northrop T-38', T6: 'Beechcraft T-6 Texan II', F16: 'General Dynamics F-16', V22: 'Bell Boeing V-22 Osprey',
};
export const aircraftType = code => (code && T[String(code).toUpperCase()]) || null;
