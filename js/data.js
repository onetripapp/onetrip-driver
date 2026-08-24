// OneTrip inspection schema — Phase 1 (Engine Off), Phase 2 (Full Exterior
// Walk), Phase 3 (In-Cab Finale).
// Each station maps 1:1 to a single photo file per the Drive naming convention
// (Trucks/[Truck]/[YYYY-MM]/[YYYY-MM-DD]_[Driver]/[stationId]-[slug].jpg) —
// a station only needs photoFilename if at least one sub-item is PHOTO or
// PHOTO+HAND (Station 11 has neither, so it's photo-free, matching the spec).
// The station photo is shared evidence for every PHOTO / PHOTO+HAND sub-item
// inside that station — sub-items do not carry their own separate photo.
//
// checkType: 'PHOTO' | 'HAND' | 'PHOTO+HAND'
// Every sub-item always stores a status of 'pass' | 'fail' | 'na' (or null
// until set), regardless of checkType.
//
// mode: defaults to 'toggle' (driver taps Pass/Fail/N/A directly) when
// omitted. Sub-items with a stated numeric threshold instead use
// mode: 'numeric' — the driver types a value, status is auto-computed via
// thresholdType ('max' | 'maxExclusive' | 'min' | 'range') + thresholdMax/thresholdMin,
// and N/A remains available as an override.

const PHASE1_ZONES = [
  {
    zone: 1,
    zoneName: 'Driver-Side Engine Bay',
    stations: [
      {
        id: '1a',
        label: 'Oil dipstick area, belts, battery, air intake housing',
        photoFilename: '01a-driver-engine-bay.jpg',
        subItems: [
          { id: '1a-oil-level', label: 'Oil level', checkType: 'HAND' },
          { id: '1a-belts', label: 'Belts (cracking, fraying, glazing)', checkType: 'PHOTO' },
          {
            id: '1a-belt-tension',
            label: 'Belt tension (deflection test)',
            checkType: 'HAND',
            mode: 'numeric',
            unit: 'in',
            thresholdType: 'max',
            thresholdMax: 0.75,
          },
          { id: '1a-battery', label: 'Battery/terminals (corrosion, mounting, cracked case)', checkType: 'PHOTO' },
          { id: '1a-air-intake', label: 'Air intake housing (cracks, loose clamps)', checkType: 'PHOTO' },
        ],
      },
      {
        id: '1b',
        label: 'Driver-side brake chamber / slack adjuster',
        photoFilename: '01b-driver-brake-chamber.jpg',
        subItems: [
          { id: '1b-slack-adjuster', label: 'Slack adjuster travel', checkType: 'HAND' },
          { id: '1b-brake-chamber', label: 'Brake chamber (cracks, leaks, mounting)', checkType: 'PHOTO' },
          { id: '1b-air-lines', label: 'Air lines to chamber (chafing, cracking)', checkType: 'PHOTO' },
        ],
      },
      {
        id: '1c',
        label: 'Driver-side steering linkage / pitman arm',
        photoFilename: '01c-driver-steering-linkage.jpg',
        subItems: [
          { id: '1c-pitman-arm', label: 'Pitman arm (movement, cracks, fasteners)', checkType: 'PHOTO+HAND' },
          { id: '1c-steering-gear-box', label: 'Steering gear box (leaks, mounting bolts)', checkType: 'PHOTO' },
          { id: '1c-steering-damper', label: 'Steering damper (BOGE unit)', checkType: 'PHOTO' },
          { id: '1c-ps-fluid', label: 'Power steering fluid level', checkType: 'HAND' },
        ],
      },
    ],
  },
  {
    zone: 2,
    zoneName: 'Passenger-Side Engine Bay',
    stations: [
      {
        id: '2a',
        label: 'Coolant reservoir, washer fluid, fuel/water separator',
        photoFilename: '02a-passenger-engine-bay.jpg',
        subItems: [
          { id: '2a-coolant-level', label: 'Coolant level', checkType: 'PHOTO' },
          { id: '2a-coolant-hoses', label: 'Coolant hoses (leaks, bulging)', checkType: 'PHOTO' },
          { id: '2a-washer-fluid', label: 'Washer fluid level', checkType: 'PHOTO' },
          { id: '2a-fuel-water-separator', label: 'Fuel/water separator (level + sediment)', checkType: 'PHOTO' },
        ],
      },
      {
        id: '2b',
        label: 'Passenger-side brake chamber / slack adjuster',
        photoFilename: '02b-passenger-brake-chamber.jpg',
        subItems: [
          { id: '2b-slack-adjuster', label: 'Slack adjuster travel', checkType: 'HAND' },
          { id: '2b-brake-chamber', label: 'Brake chamber (cracks, leaks, mounting)', checkType: 'PHOTO' },
          { id: '2b-air-lines', label: 'Air lines (chafing, cracking)', checkType: 'PHOTO' },
        ],
      },
      {
        id: '2c',
        label: 'Passenger-side steering/suspension linkage',
        photoFilename: '02c-passenger-steering-linkage.jpg',
        subItems: [
          { id: '2c-tie-rod-ends', label: 'Tie rod ends / drag link (looseness, cracks)', checkType: 'PHOTO+HAND' },
          { id: '2c-leaf-spring', label: 'Leaf spring / suspension mount (cracks, sagging)', checkType: 'PHOTO' },
        ],
      },
    ],
  },
];

// Shared shapes for tire checks, which recur across every tire station in
// Phase 2: tread depth auto-flags against the stated federal minimum,
// PSI is simply logged (no minimum was specified in the spec).
function treadDepthItem(id, label, minDepth) {
  return {
    id,
    label,
    checkType: 'HAND',
    mode: 'numeric',
    unit: '/32"',
    thresholdType: 'min',
    thresholdMin: minDepth,
  };
}

function psiItem(id, label) {
  return { id, label, checkType: 'HAND', mode: 'numeric', unit: 'psi' };
}

const PHASE2_ZONES = [
  {
    zone: 3,
    zoneName: 'Front of Truck',
    stations: [
      {
        id: '3a',
        label: 'Windshield & front lighting — all lit',
        photoFilename: '03a-windshield-front-lighting.jpg',
        subItems: [
          { id: '3a-windshield-cracks', label: 'Windshield cracks in sightline', checkType: 'PHOTO' },
          { id: '3a-headlights', label: 'Headlights (hi/low beam)', checkType: 'PHOTO+HAND' },
          { id: '3a-front-turn-signals', label: 'Front turn signals', checkType: 'PHOTO' },
          { id: '3a-front-marker-lights', label: 'Front marker/clearance lights', checkType: 'PHOTO' },
          { id: '3a-wiper-blades', label: 'Wiper blades/function', checkType: 'PHOTO+HAND' },
          { id: '3a-front-bumper', label: 'Front bumper condition', checkType: 'PHOTO' },
        ],
      },
      {
        id: '3b',
        label: 'Steer axle tires & wheels',
        photoFilename: '03b-steer-axle-tires.jpg',
        subItems: [
          treadDepthItem('3b-tread-depth', 'Tread depth', 4),
          psiItem('3b-tire-psi', 'Tire PSI'),
          { id: '3b-sidewall', label: 'Sidewall condition', checkType: 'PHOTO' },
          { id: '3b-wheels-rims', label: 'Wheels/rims (cracks, bent)', checkType: 'PHOTO' },
          { id: '3b-lug-nuts', label: 'Lug nuts (missing, loose, rust trails)', checkType: 'PHOTO' },
        ],
      },
    ],
  },
  {
    zone: 4,
    zoneName: 'Back Half Truck / Front Trailer, Driver Side',
    stations: [
      {
        id: '4a',
        label: 'Drive tires & frame, driver side',
        photoFilename: '04a-drive-tires-frame-driver.jpg',
        subItems: [
          treadDepthItem('4a-tread-depth', 'Drive tire tread depth', 2),
          psiItem('4a-tire-psi', 'Drive tire PSI'),
          { id: '4a-sidewall-duals', label: 'Sidewall/mismatched duals', checkType: 'PHOTO' },
          { id: '4a-frame-rail', label: 'Frame rail/cross members', checkType: 'PHOTO' },
          { id: '4a-fuel-tank', label: 'Fuel tank (mounting, leaks)', checkType: 'PHOTO' },
        ],
      },
      {
        id: '4b',
        label: 'Drive-axle brake chamber, driver side',
        photoFilename: '04b-drive-brake-chamber-driver.jpg',
        subItems: [
          { id: '4b-slack-adjuster', label: 'Slack adjuster travel', checkType: 'HAND' },
          { id: '4b-brake-chamber', label: 'Brake chamber/air lines', checkType: 'PHOTO' },
          { id: '4b-air-bag', label: 'Air bag/suspension', checkType: 'PHOTO' },
        ],
      },
      {
        id: '4c',
        label: 'Catwalk, kingpin & fifth wheel, driver side',
        photoFilename: '04c-catwalk-kingpin-driver.jpg',
        subItems: [
          { id: '4c-catwalk-lines', label: 'Catwalk air/electrical lines', checkType: 'PHOTO' },
          { id: '4c-fifth-wheel-plate', label: 'Fifth wheel plate/locking jaw engagement', checkType: 'PHOTO+HAND' },
          { id: '4c-kingpin', label: 'Kingpin engagement', checkType: 'PHOTO' },
          { id: '4c-trailer-marker-lights', label: 'Trailer front marker lights, driver side', checkType: 'PHOTO' },
        ],
      },
    ],
  },
  {
    zone: 5,
    zoneName: 'Rear of Truck (Fifth Wheel / Truck Rear Lights)',
    stations: [
      {
        id: '5a',
        label: 'Fifth wheel connection & truck rear lighting',
        photoFilename: '05a-fifth-wheel-rear-lighting.jpg',
        subItems: [
          { id: '5a-release-arm', label: 'Fifth wheel release arm/safety latch', checkType: 'PHOTO+HAND' },
          { id: '5a-rear-lights', label: 'Truck brake/rear marker lights', checkType: 'PHOTO' },
          { id: '5a-glad-hands', label: 'Glad hand air connections', checkType: 'PHOTO+HAND' },
          { id: '5a-pigtail', label: 'Electrical pigtail connection', checkType: 'PHOTO' },
        ],
      },
    ],
  },
  {
    zone: 6,
    zoneName: 'Passenger Side',
    stations: [
      {
        id: '6a',
        label: 'Drive tires & frame, passenger side',
        photoFilename: '06a-drive-tires-frame-passenger.jpg',
        subItems: [
          treadDepthItem('6a-tread-depth', 'Drive tire tread depth', 2),
          psiItem('6a-tire-psi', 'Drive tire PSI'),
          { id: '6a-sidewall-duals', label: 'Sidewall/mismatched duals', checkType: 'PHOTO' },
          { id: '6a-frame-rail', label: 'Frame rail/cross members', checkType: 'PHOTO' },
          { id: '6a-fuel-tank', label: 'Fuel tank (mounting, leaks)', checkType: 'PHOTO' },
        ],
      },
      {
        id: '6b',
        label: 'Drive-axle brake chamber, passenger side',
        photoFilename: '06b-drive-brake-chamber-passenger.jpg',
        subItems: [
          { id: '6b-slack-adjuster', label: 'Slack adjuster travel', checkType: 'HAND' },
          { id: '6b-brake-chamber', label: 'Brake chamber/air lines', checkType: 'PHOTO' },
          { id: '6b-air-bag', label: 'Air bag/suspension', checkType: 'PHOTO' },
        ],
      },
      {
        id: '6c',
        label: 'Catwalk & kingpin, passenger side',
        photoFilename: '06c-catwalk-kingpin-passenger.jpg',
        subItems: [
          { id: '6c-catwalk-lines', label: 'Catwalk air/electrical lines', checkType: 'PHOTO' },
          { id: '6c-kingpin', label: 'Kingpin engagement', checkType: 'PHOTO' },
          { id: '6c-trailer-marker-lights', label: 'Trailer front marker lights, passenger side', checkType: 'PHOTO' },
        ],
      },
    ],
  },
  {
    zone: 7,
    zoneName: 'Driver-Side Rear of Trailer',
    stations: [
      {
        id: '7a',
        label: 'Trailer tandem tires & wheels, driver side',
        photoFilename: '07a-trailer-tandem-tires-driver.jpg',
        subItems: [
          treadDepthItem('7a-tread-depth', 'Tread depth', 2),
          psiItem('7a-tire-psi', 'Tire PSI'),
          { id: '7a-sidewall', label: 'Sidewall condition', checkType: 'PHOTO' },
          { id: '7a-lug-nuts-rim', label: 'Lug nuts/rim condition', checkType: 'PHOTO' },
        ],
      },
      {
        id: '7b',
        label: 'Trailer brake chamber & suspension, driver side',
        photoFilename: '07b-trailer-brake-chamber-driver.jpg',
        subItems: [
          { id: '7b-slack-adjuster', label: 'Slack adjuster travel', checkType: 'HAND' },
          { id: '7b-brake-chamber', label: 'Brake chamber/air lines', checkType: 'PHOTO' },
          { id: '7b-suspension', label: 'Suspension/air ride', checkType: 'PHOTO' },
        ],
      },
      {
        id: '7c',
        label: 'Trailer side marker lights & placard, driver side',
        photoFilename: '07c-trailer-marker-placard-driver.jpg',
        subItems: [
          { id: '7c-side-marker-lights', label: 'Side marker lights/reflectors', checkType: 'PHOTO' },
          { id: '7c-placard', label: 'UN1267 placard, driver side', checkType: 'PHOTO' },
        ],
      },
    ],
  },
  {
    zone: 8,
    zoneName: 'Absolute Rear of Trailer',
    stations: [
      {
        id: '8a',
        label: 'Rear wide shot, lit',
        photoFilename: '08a-rear-wide-shot.jpg',
        subItems: [
          { id: '8a-tail-brake-turn-lights', label: 'Tail/brake/turn lights', checkType: 'PHOTO' },
          { id: '8a-reflectors-tape', label: 'Rear reflectors/conspicuity tape', checkType: 'PHOTO' },
          { id: '8a-license-plate', label: 'License plate', checkType: 'PHOTO' },
          { id: '8a-mud-flaps', label: 'Mud flaps', checkType: 'PHOTO' },
          { id: '8a-underride-guard', label: 'Rear underride guard/ICC bumper', checkType: 'PHOTO' },
        ],
      },
      {
        id: '8b',
        label: 'Hazmat markings, rear',
        photoFilename: '08b-hazmat-markings-rear.jpg',
        subItems: [
          { id: '8b-spec-plate', label: 'Cargo tank spec plate', checkType: 'PHOTO' },
          { id: '8b-inspection-marking', label: 'Current inspection marking (49 CFR 180.407)', checkType: 'PHOTO' },
          { id: '8b-placard-rear', label: 'UN1267 placard, rear', checkType: 'PHOTO' },
        ],
      },
    ],
  },
  {
    zone: 9,
    zoneName: 'Passenger-Side Rear of Trailer',
    stations: [
      {
        id: '9a',
        label: 'Trailer tandem tires & wheels, passenger side',
        photoFilename: '09a-trailer-tandem-tires-passenger.jpg',
        subItems: [
          treadDepthItem('9a-tread-depth', 'Tread depth', 2),
          psiItem('9a-tire-psi', 'Tire PSI'),
          { id: '9a-sidewall', label: 'Sidewall condition', checkType: 'PHOTO' },
          { id: '9a-lug-nuts-rim', label: 'Lug nuts/rim condition', checkType: 'PHOTO' },
        ],
      },
      {
        id: '9b',
        label: 'Trailer brake chamber & suspension, passenger side',
        photoFilename: '09b-trailer-brake-chamber-passenger.jpg',
        subItems: [
          { id: '9b-slack-adjuster', label: 'Slack adjuster travel', checkType: 'HAND' },
          { id: '9b-brake-chamber', label: 'Brake chamber/air lines', checkType: 'PHOTO' },
          { id: '9b-suspension', label: 'Suspension/air ride', checkType: 'PHOTO' },
        ],
      },
      {
        id: '9c',
        label: 'Trailer side marker lights & placard, passenger side',
        photoFilename: '09c-trailer-marker-placard-passenger.jpg',
        subItems: [
          { id: '9c-side-marker-lights', label: 'Side marker lights/reflectors', checkType: 'PHOTO' },
          { id: '9c-placard', label: 'UN1267 placard, passenger side', checkType: 'PHOTO' },
        ],
      },
    ],
  },
];

// Phase 3 has no zone grouping in the spec — it's one location (in-cab),
// so PHASE3_STATIONS is a flat station list rather than zones-of-stations
// like Phase 1/2.
const PHASE3_STATIONS = [
  {
    id: '10',
    label: 'Dash / instrument cluster',
    photoFilename: '10-dash-instrument-cluster.jpg',
    subItems: [
      { id: '10-def-level', label: 'DEF fluid level', checkType: 'PHOTO' },
      { id: '10-warning-lights', label: 'Warning lights (check engine, ABS, air, oil)', checkType: 'PHOTO' },
      { id: '10-odometer', label: 'Odometer reading', checkType: 'PHOTO' },
      { id: '10-gauges', label: 'Gauges functional', checkType: 'HAND' },
    ],
  },
  {
    id: '11',
    label: 'Air brake system check',
    // No photoFilename: every sub-item here is HAND-only, so this station
    // never needs a station-level photo (matches the spec's "NO PHOTO").
    subItems: [
      {
        id: '11-air-build-rate',
        label: 'Air pressure build rate (85→100 psi)',
        checkType: 'HAND',
        mode: 'numeric',
        unit: 'sec',
        thresholdType: 'max',
        thresholdMax: 45,
      },
      {
        id: '11-governor-cutout',
        label: 'Governor cut-out',
        checkType: 'HAND',
        mode: 'numeric',
        unit: 'psi',
        thresholdType: 'range',
        thresholdMin: 120,
        thresholdMax: 140,
      },
      {
        // Must activate BEFORE pressure drops to 60 psi — i.e. while
        // pressure is still at or above 60, as an early warning. Activating
        // any later (a lower psi reading) is unsafe and should fail.
        id: '11-low-air-warning',
        label: 'Low air warning activation',
        checkType: 'HAND',
        mode: 'numeric',
        unit: 'psi',
        thresholdType: 'min',
        thresholdMin: 60,
      },
      {
        // This rig always runs with a trailer attached (Phase 2 covers a
        // full trailer walk), so this defaults to the combination-vehicle
        // threshold (≤4 psi/min) rather than the single-vehicle one (≤3).
        id: '11-static-pressure-loss',
        label: 'Static pressure loss (combination vehicle)',
        checkType: 'HAND',
        mode: 'numeric',
        unit: 'psi/min',
        thresholdType: 'max',
        thresholdMax: 4,
      },
      {
        id: '11-spring-brake-popout',
        label: 'Spring brake pop-out',
        checkType: 'HAND',
        mode: 'numeric',
        unit: 'psi',
        thresholdType: 'range',
        thresholdMin: 20,
        thresholdMax: 40,
      },
      { id: '11-parking-brake-holds', label: 'Parking brake holds against gentle pull in low gear', checkType: 'HAND' },
    ],
  },
  {
    id: '12',
    label: 'Cab equipment & documentation',
    photoFilename: '12-cab-equipment-docs.jpg',
    subItems: [
      { id: '12-horn', label: 'Horn function', checkType: 'HAND' },
      { id: '12-steering-play', label: 'Steering wheel play', checkType: 'HAND' },
      { id: '12-seat-belt', label: 'Seat belt', checkType: 'HAND' },
      { id: '12-mirrors', label: 'Mirrors', checkType: 'PHOTO' },
      { id: '12-fire-extinguisher', label: 'Fire extinguisher (10 B:C, charged, gauge green)', checkType: 'PHOTO' },
      { id: '12-warning-triangles', label: 'Warning triangles (3, present)', checkType: 'PHOTO' },
      { id: '12-spare-fuses', label: 'Spare fuses', checkType: 'PHOTO' },
      { id: '12-dot-number', label: 'DOT number/company name displayed', checkType: 'PHOTO' },
      { id: '12-registration', label: 'Registration/permits/shipping papers', checkType: 'PHOTO' },
      { id: '12-inspection-sticker', label: 'Annual inspection sticker current', checkType: 'PHOTO' },
    ],
  },
];

const TRANSITION_1_TO_2 = {
  id: 'transition-1-2',
  instructions: 'Close hood. Start engine. Turn on headlights, marker lights, hazard flashers. Exit cab.',
};

// Flat [{ zoneName, station }] across all three phases, for screens (the
// final summary) that need every station regardless of phase/zone shape.
function getAllStationsWithZoneContext() {
  const result = [];
  for (const zone of PHASE1_ZONES) {
    for (const station of zone.stations) result.push({ zoneName: zone.zoneName, station });
  }
  for (const zone of PHASE2_ZONES) {
    for (const station of zone.stations) result.push({ zoneName: zone.zoneName, station });
  }
  for (const station of PHASE3_STATIONS) result.push({ zoneName: 'In-Cab', station });
  return result;
}
