// Where the parcel lookups work. The Texas box is where the free state appraisal data (StratMap and the county appraisal
// districts) can answer; Regrid, OpenStreetMap and USGS lidar cover the whole country, so the building card and Regrid
// accept any US point (the 50 states and Puerto Rico, as a generous box) and only ask the Texas sources inside Texas.
export const inTexas = (lat, lon) => lat > 25 && lat < 37 && lon > -107 && lon < -93;
export const inUS = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && lat > 17 && lat < 72 && lon > -180 && lon < -64;
