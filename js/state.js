// OneTrip state management — in-memory object backed by localStorage so
// progress survives a refresh mid-inspection. Photo bytes are NOT stored
// here — they live in IndexedDB (photoStore.js) since localStorage's ~5-10MB
// quota can't reliably hold two dozen+ real camera photos. This object only
// tracks a photoCaptured flag per station. No network/Drive calls here;
// this session's scope is local-only state shaped to map cleanly onto the
// Drive folder/file convention next session.

const STORAGE_KEY = 'onetrip-inspection-v1';

// One beta fleet today — this becomes a real per-fleet identifier once a
// second fleet customer exists (see the TODO(multi-tenant) note in
// onetrip-drive-function/index.js). Tagged into every export and upload
// from day one so beta data is never ambiguous about which fleet it came
// from, even while there's only one.
const FLEET_ID = 'default';

function todayISO() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function buildStationState(stationDef) {
  return {
    id: stationDef.id,
    photoFilename: stationDef.photoFilename,
    photoCaptured: false, // the actual photo bytes live in IndexedDB (photoStore.js), not here
    subItems: stationDef.subItems.map((si) => ({
      id: si.id,
      status: null, // 'pass' | 'fail' | 'na'
      value: null, // numeric entries (tread depth, PSI, Station 11 thresholds, ...)
    })),
  };
}

function freshInspection() {
  const stations = {};
  for (const zone of [...PHASE1_ZONES, ...PHASE2_ZONES]) {
    for (const station of zone.stations) {
      stations[station.id] = buildStationState(station);
    }
  }
  for (const station of PHASE3_STATIONS) {
    stations[station.id] = buildStationState(station);
  }
  return {
    truckNumber: '',
    driverName: '',
    date: todayISO(),
    // 'setup' | 'phase1' | 'transition-1-2' | 'phase2' | 'phase3' |
    // 'summary' | 'complete'
    screen: 'setup',
    transitionLog: null, // { confirmedAt: ISOString }
    certifiedAt: null, // ISOString, set when the driver certifies the final summary
    // 'not_started' | 'uploading' | 'uploaded' | 'error' — set only after
    // certification; upload is auto-triggered right when certify happens.
    uploadStatus: 'not_started',
    uploadedAt: null,
    uploadError: null,
    // Filenames already confirmed saved to Drive, persisted as each one
    // succeeds (not just at the end) — so if the upload stalls or errors
    // partway through a long sequence of photos and the driver hits Retry,
    // already-uploaded files are skipped instead of being sent again and
    // duplicated in the Drive folder.
    uploadedFiles: [],
    stations,
  };
}

function loadInspection() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshInspection();
    const parsed = JSON.parse(raw);
    // Guard against a schema that's missing stations added since the save
    // (e.g. data.js changed) by filling in any absent station state.
    const fresh = freshInspection();
    parsed.stations = { ...fresh.stations, ...(parsed.stations || {}) };
    return { ...fresh, ...parsed };
  } catch (e) {
    console.error('Failed to load saved inspection, starting fresh', e);
    return freshInspection();
  }
}

let inspection = loadInspection();

function saveInspection() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(inspection));
}

function resetInspection() {
  localStorage.removeItem(STORAGE_KEY);
  inspection = freshInspection();
  saveInspection();
  clearAllPhotos().catch((err) => console.error('Failed to clear stored photos', err));
}

function getStationDef(stationId) {
  for (const zone of [...PHASE1_ZONES, ...PHASE2_ZONES]) {
    const found = zone.stations.find((s) => s.id === stationId);
    if (found) return found;
  }
  return PHASE3_STATIONS.find((s) => s.id === stationId) || null;
}

function stationNeedsPhoto(stationDef) {
  return stationDef.subItems.some((si) => si.checkType === 'PHOTO' || si.checkType === 'PHOTO+HAND');
}

function isStationComplete(stationId) {
  const def = getStationDef(stationId);
  const st = inspection.stations[stationId];
  if (!def || !st) return false;
  if (stationNeedsPhoto(def) && !st.photoCaptured) return false;
  return st.subItems.every((si) => si.status !== null);
}

// The ordered station sequence a given station belongs to — its own
// phase, flattened past zone grouping — so unlocking can walk it in order.
function getPhaseStationOrder(stationId) {
  if (PHASE1_ZONES.some((zone) => zone.stations.some((s) => s.id === stationId))) {
    return PHASE1_ZONES.flatMap((zone) => zone.stations);
  }
  if (PHASE2_ZONES.some((zone) => zone.stations.some((s) => s.id === stationId))) {
    return PHASE2_ZONES.flatMap((zone) => zone.stations);
  }
  return PHASE3_STATIONS;
}

// A station unlocks only once every station before it in the same phase is
// complete — this forces the driver through stations in the order they'd
// actually walk the truck, instead of filling out the whole phase from one
// spot. The first station in a phase is always unlocked.
function isStationUnlocked(stationId) {
  const order = getPhaseStationOrder(stationId);
  const idx = order.findIndex((s) => s.id === stationId);
  if (idx <= 0) return true;
  return order.slice(0, idx).every((s) => isStationComplete(s.id));
}

function stationsProgress(stations) {
  let total = 0;
  let done = 0;
  for (const station of stations) {
    const st = inspection.stations[station.id];
    if (stationNeedsPhoto(station)) {
      total += 1;
      if (st.photoCaptured) done += 1;
    }
    for (const si of station.subItems) {
      total += 1;
      const state = st.subItems.find((s) => s.id === si.id);
      if (state && state.status !== null) done += 1;
    }
  }
  return { done, total };
}

function isStationsComplete(stations) {
  return stations.every((station) => isStationComplete(station.id));
}

function zonesProgress(zones) {
  return stationsProgress(zones.flatMap((zone) => zone.stations));
}

function isZonesComplete(zones) {
  return isStationsComplete(zones.flatMap((zone) => zone.stations));
}

function isPhase1Complete() {
  return isZonesComplete(PHASE1_ZONES);
}

function phase1Progress() {
  return zonesProgress(PHASE1_ZONES);
}

function isPhase2Complete() {
  return isZonesComplete(PHASE2_ZONES);
}

function phase2Progress() {
  return zonesProgress(PHASE2_ZONES);
}

function isPhase3Complete() {
  return isStationsComplete(PHASE3_STATIONS);
}

function phase3Progress() {
  return stationsProgress(PHASE3_STATIONS);
}

// Guards the actual certification action. The summary screen lets a driver
// navigate back and edit any phase (e.g. clearing a numeric field resets its
// status to null), so completeness has to be re-checked right here, not just
// assumed from having reached this screen once.
function isInspectionComplete() {
  return isPhase1Complete() && isPhase2Complete() && isPhase3Complete();
}

function overallProgress() {
  const p1 = phase1Progress();
  const p2 = phase2Progress();
  const p3 = phase3Progress();
  return { done: p1.done + p2.done + p3.done, total: p1.total + p2.total + p3.total };
}

// Every sub-item currently marked 'fail', with zone/station context, for
// the final summary screen.
function getAllFailedItems() {
  const failed = [];
  for (const { zoneName, station } of getAllStationsWithZoneContext()) {
    const st = inspection.stations[station.id];
    for (const si of station.subItems) {
      const state = st.subItems.find((s) => s.id === si.id);
      if (state && state.status === 'fail') {
        failed.push({ zoneName, stationId: station.id, stationLabel: station.label, label: si.label, value: state.value, unit: si.unit });
      }
    }
  }
  return failed;
}

// Belt-and-suspenders lock: the UI already stops rendering any interactive
// control once certified, but these setters guard themselves too, so a
// stray code path (or a console poke) can't mutate a certified record.
function setSubItemStatus(stationId, subItemId, status) {
  if (inspection.certifiedAt) return;
  const st = inspection.stations[stationId];
  const si = st.subItems.find((s) => s.id === subItemId);
  if (si) si.status = status;
  saveInspection();
}

function setSubItemValue(stationId, subItemId, value) {
  if (inspection.certifiedAt) return;
  const st = inspection.stations[stationId];
  const si = st.subItems.find((s) => s.id === subItemId);
  if (si) si.value = value;
  saveInspection();
}

function setStationPhotoCaptured(stationId, captured) {
  if (inspection.certifiedAt) return;
  const st = inspection.stations[stationId];
  st.photoCaptured = captured;
  saveInspection();
}

// Station 12 (In-Cab, Phase 3) asks the driver to reconfirm the same DOT
// number/company name already photographed and typed once at Station
// 1-door (driver door, Phase 1) — this pre-fills it instead of asking
// twice. Called once, at the Phase 2 -> 3 transition button (the one point
// this app's forced walk order guarantees 1-door is already complete and
// Station 12 hasn't been touched yet); the field stays fully editable
// afterward for a correction, and this never overwrites a value already
// there.
function seedDotNumberFromDoorStation() {
  const doorSubItem = inspection.stations['1-door'].subItems.find((s) => s.id === '1-door-dot-number');
  const dashSubItem = inspection.stations['12'].subItems.find((s) => s.id === '12-dot-number');
  if (doorSubItem.value && !dashSubItem.value) {
    setSubItemValue('12', '12-dot-number', doorSubItem.value);
  }
}

function certifyInspection() {
  inspection.certifiedAt = new Date().toISOString();
  saveInspection();
}

// Deliberately NOT guarded by the certifiedAt lock above — upload only ever
// runs after certification, so it needs to be able to write status fields
// on an already-certified record. It never touches station/sub-item data.
function setUploadStatus(status, extra = {}) {
  inspection.uploadStatus = status;
  if ('uploadedAt' in extra) inspection.uploadedAt = extra.uploadedAt;
  if ('uploadError' in extra) inspection.uploadError = extra.uploadError;
  saveInspection();
}

// A certified inspection that hasn't successfully reached Drive yet is the
// one thing "Start New Inspection" must not be allowed to wipe silently.
function isUploadPending() {
  return !!inspection.certifiedAt && inspection.uploadStatus !== 'uploaded';
}

// Everything that goes into inspection-data.json — a clean export shape,
// not the raw internal state object (which also carries UI-only fields
// like `screen`).
function buildInspectionExport() {
  const stations = {};
  for (const { zoneName, station } of getAllStationsWithZoneContext()) {
    const st = inspection.stations[station.id];
    stations[station.id] = {
      zoneName,
      label: station.label,
      photoFilename: station.photoFilename || null,
      photoCaptured: st.photoCaptured,
      subItems: station.subItems.map((si) => {
        const itemState = st.subItems.find((s) => s.id === si.id);
        return {
          id: si.id,
          label: si.label,
          checkType: si.checkType,
          status: itemState.status,
          value: itemState.value,
          unit: si.unit || null,
        };
      }),
    };
  }
  return {
    fleetId: FLEET_ID,
    truckNumber: inspection.truckNumber,
    driverName: inspection.driverName,
    date: inspection.date,
    transitionLog: inspection.transitionLog,
    certifiedAt: inspection.certifiedAt,
    summary: overallProgress(),
    failedItems: getAllFailedItems(),
    stations,
  };
}

function formatCertifiedAt(isoString) {
  if (!isoString) return 'Unknown';
  const d = new Date(isoString);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${yyyy}-${mm}-${dd} ${hours}:${minutes} ${ampm}`;
}

// A unit like "psi" or "sec" reads better with a space ("40 psi"); one
// like the tread-depth `/32"` reads better without one ("4/32""), matching
// how that same value is written throughout the app's own station labels.
function formatValueWithUnit(value, unit) {
  if (value === null || value === undefined || value === '') return 'not recorded';
  if (!unit) return String(value);
  return /^[a-zA-Z]/.test(unit) ? `${value} ${unit}` : `${value}${unit}`;
}

// Station 11 (air brake system) is all individually-meaningful numeric
// readings, not a single overall Pass/Fail like every other station — it
// gets its own itemized section below instead of a one-line verdict.
const SUMMARY_STANDALONE_STATION_IDS = ['11'];

function stationVerdict(stationExport) {
  return stationExport.subItems.some((si) => si.status === 'fail') ? 'FAIL' : 'PASS';
}

// A plain-text companion to inspection-data.json for anyone opening the
// Drive folder directly (an auditor, an adjuster, a person, not a
// dashboard) — deliberately built from the exact same export object
// passed in, not a second read of `inspection`, so this can never say
// something different than the JSON sitting right next to it.
function buildInspectionSummaryText(exportData) {
  const orderedStations = getAllStationsWithZoneContext();
  const lines = [];

  lines.push('ONETRIP INSPECTION SUMMARY');
  lines.push('============================');
  lines.push(`Fleet:        ${exportData.fleetId}`);
  lines.push(`Truck:        ${exportData.truckNumber}`);
  lines.push(`Driver:       ${exportData.driverName}`);
  lines.push(`Date:         ${exportData.date}`);
  lines.push(`Certified at: ${formatCertifiedAt(exportData.certifiedAt)}`);
  lines.push('');
  lines.push(`RESULT: ${exportData.summary.done} / ${exportData.summary.total} items checked`);

  // Built directly from exportData.stations (not the separate failedItems
  // field) so this list and the per-station verdicts below are guaranteed
  // to agree — and so the subitem's own def is reachable for a threshold
  // description, without adding fields to the JSON export shape itself.
  const defectLines = [];
  for (const { station } of orderedStations) {
    const stationExport = exportData.stations[station.id];
    if (!stationExport) continue;
    for (const si of stationExport.subItems) {
      if (si.status !== 'fail') continue;
      const subDef = station.subItems.find((s) => s.id === si.id);
      const hasThreshold = subDef && subDef.thresholdType;
      const valueText = formatValueWithUnit(si.value, si.unit);
      const requirement = hasThreshold ? `, must be ${thresholdRequirement(subDef)}` : '';
      defectLines.push(`Station ${station.id} - ${si.label}: FAIL (recorded value: ${valueText}${requirement})`);
    }
  }

  lines.push(`DEFECTS FOUND: ${defectLines.length}`);
  lines.push('');

  if (defectLines.length > 0) {
    lines.push('⚠ DEFECTS FOUND — REVIEW REQUIRED ⚠');
    lines.push('');
    lines.push(...defectLines);
    lines.push('');
  }

  lines.push('--- ZONE BREAKDOWN ---');
  lines.push('');
  let currentZone = null;
  for (const { zoneName, station } of orderedStations) {
    if (SUMMARY_STANDALONE_STATION_IDS.includes(station.id)) continue;
    const stationExport = exportData.stations[station.id];
    if (!stationExport) continue;
    if (zoneName !== currentZone) {
      if (currentZone !== null) lines.push('');
      lines.push(zoneName);
      currentZone = zoneName;
    }
    lines.push(`  Station ${station.id} - ${station.label}: ${stationVerdict(stationExport)}`);
  }
  lines.push('');

  for (const standaloneId of SUMMARY_STANDALONE_STATION_IDS) {
    const stationExport = exportData.stations[standaloneId];
    const stationDef = getStationDef(standaloneId);
    if (!stationExport || !stationDef) continue;
    lines.push(`--- ${stationDef.label.toUpperCase()} (Station ${standaloneId}) ---`);
    for (const si of stationExport.subItems) {
      const hasValue = si.value !== null && si.value !== undefined && si.value !== '';
      const valueText = hasValue ? `${formatValueWithUnit(si.value, si.unit)} ` : '';
      lines.push(`${si.label}: ${valueText}(${si.status || 'not recorded'})`);
    }
    lines.push('');
  }

  lines.push('--- ANY FAILED ITEMS ---');
  lines.push(...(defectLines.length > 0 ? defectLines : ['None']));

  return lines.join('\n');
}
