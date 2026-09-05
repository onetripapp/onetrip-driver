// OneTrip — baseline calibration reference photos, per truck.
//
// Each zone image is a confirmed "gold standard" wide-angle framing
// reference for that truck, shown as a translucent overlay on the live
// camera feed during capture so the driver can line up their shot before
// taking it. One reference photo per zone today — it's shown for every
// station within that zone (e.g. the Zone 1 photo covers stations 1a/1b/1c
// alike), since only zone-level wide shots exist so far. More granular
// per-station references may be added later; when they exist, look them up
// first and fall back to the zone-level entry rather than replacing this
// shape outright.
//
// Trucks with no entry here simply get no overlay — the capture flow is
// unaffected, exactly like it was before this feature existed.

const BASELINE_REFERENCE_PHOTOS = {
  '826016': {
    1: 'assets/baseline-photos/826016/826016-zone1-driver-side-engine-bay.jpg',
    2: 'assets/baseline-photos/826016/826016-zone2-passenger-side-engine-bay.jpg',
    3: 'assets/baseline-photos/826016/826016-zone3-front-of-truck.jpg',
    4: 'assets/baseline-photos/826016/826016-zone4-back-half-driver-side.jpg',
    5: 'assets/baseline-photos/826016/826016-zone5-rear-fifth-wheel.jpg',
    6: 'assets/baseline-photos/826016/826016-zone6-back-half-passenger-side.jpg',
    7: 'assets/baseline-photos/826016/826016-zone7-driver-side-rear-trailer.jpg',
    8: 'assets/baseline-photos/826016/826016-zone8-absolute-rear-trailer.jpg',
    9: 'assets/baseline-photos/826016/826016-zone9-passenger-side-rear-trailer.jpg',
  },
};

function getBaselineReferenceImage(truckNumber, zoneNumber) {
  const truckSet = BASELINE_REFERENCE_PHOTOS[truckNumber];
  if (!truckSet || zoneNumber === null || zoneNumber === undefined) return null;
  return truckSet[zoneNumber] || null;
}
