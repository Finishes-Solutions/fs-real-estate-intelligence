// FBI NIBRS offense codes -> plain names (Houston Police reports by these codes). Shared by the API, the crime report and the assistant.
export const NIBRS = {
  '09A': 'Murder', '09B': 'Negligent manslaughter', '09C': 'Justifiable homicide', '100': 'Kidnapping', '11A': 'Rape', '11B': 'Sodomy', '11C': 'Sexual assault with an object', '11D': 'Fondling',
  '120': 'Robbery', '13A': 'Aggravated assault', '13B': 'Simple assault', '13C': 'Intimidation', '200': 'Arson', '210': 'Extortion', '220': 'Burglary', '23A': 'Pocket-picking',
  '23B': 'Purse-snatching', '23C': 'Shoplifting', '23D': 'Theft from a building', '23E': 'Theft from a coin machine', '23F': 'Theft from a vehicle', '23G': 'Theft of vehicle parts',
  '23H': 'Other theft', '240': 'Vehicle theft', '250': 'Counterfeiting / forgery', '26A': 'Fraud: false pretenses', '26B': 'Fraud: credit card / ATM', '26C': 'Fraud: impersonation',
  '26D': 'Fraud: welfare', '26E': 'Fraud: wire', '26F': 'Identity theft', '26G': 'Hacking', '26H': 'Money laundering', '270': 'Embezzlement', '280': 'Stolen property', '290': 'Vandalism',
  '35A': 'Drug offenses', '35B': 'Drug equipment', '36A': 'Incest', '36B': 'Statutory rape', '370': 'Pornography / obscene material', '39A': 'Gambling', '39B': 'Gambling: promoting',
  '39C': 'Gambling equipment', '39D': 'Sports tampering', '40A': 'Prostitution', '40B': 'Promoting prostitution', '40C': 'Purchasing prostitution', '510': 'Bribery',
  '520': 'Weapon law violations', '64A': 'Human trafficking: sex', '64B': 'Human trafficking: labor', '720': 'Animal cruelty', '90A': 'Bad checks', '90B': 'Curfew / loitering',
  '90C': 'Disorderly conduct', '90D': 'Driving under the influence', '90E': 'Drunkenness', '90F': 'Family offenses (nonviolent)', '90G': 'Liquor law violations', '90H': 'Peeping Tom',
  '90I': 'Runaway', '90J': 'Trespassing', '90Z': 'All other offenses'
};
export const offenseName = code => NIBRS[String(code || '').toUpperCase()] || 'Offense ' + code;
export const CAT_NAME = { v: 'Violent', p: 'Property', o: 'Other' };
