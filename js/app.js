// OneTrip — rendering + event wiring. Vanilla DOM, no framework.

const root = document.getElementById('app');

// Every state change re-renders by tearing down and rebuilding the whole
// screen (no diffing) — simple, but on its own that throws the scroll
// position back toward the top on every single tap, which is exactly the
// kind of thing that makes a long checklist miserable to fill out one-
// handed. Preserve scroll position across a same-screen re-render (tapping
// Pass on item 14 of 27 shouldn't yank you back up); only reset to the top
// when actually navigating to a different screen.
let lastRenderedScreen = null;

// Where to return after editing truck/driver info from mid-walk (see
// renderPhaseHeader's edit-info link) — null means "starting fresh from
// Setup," not "editing," so the Begin button knows which to do.
let editInfoReturnScreen = null;

// The completion screen's ring+check should play once per actual arrival
// at that screen, not replay every time the upload status ticks along
// (uploading -> uploaded) and triggers another same-screen re-render.
let completeMarkHasPlayed = false;

function render() {
  const scrollY = window.scrollY;
  const sameScreen = inspection.screen === lastRenderedScreen;
  lastRenderedScreen = inspection.screen;
  if (!sameScreen) completeMarkHasPlayed = false;

  root.innerHTML = '';
  root.appendChild(renderAppHeader());

  let screenNode;
  switch (inspection.screen) {
    case 'setup':
      screenNode = renderSetupScreen();
      break;
    case 'phase1':
      screenNode = renderPhase1Screen();
      break;
    case 'transition-1-2':
      screenNode = renderTransitionScreen();
      break;
    case 'phase2':
      screenNode = renderPhase2Screen();
      break;
    case 'phase3':
      screenNode = renderPhase3Screen();
      break;
    case 'summary':
      screenNode = renderSummaryScreen();
      break;
    case 'complete':
      screenNode = renderCompleteScreen();
      break;
    default:
      screenNode = renderSetupScreen();
  }

  // The header above stays put across a navigation; only the screen body
  // slides in — and only on an actual navigation to a new screen, never on
  // a same-screen re-render (tapping Pass on item 14 of 27).
  if (!sameScreen) screenNode.classList.add('screen-enter');
  root.appendChild(screenNode);

  window.scrollTo(0, sameScreen ? scrollY : 0);
}

// The OneTrip mark — a shield outline containing a checkmark, both drawn
// as simple line strokes. This exact geometry is reused for the PWA home-
// screen icon (icons/icon.svg) — the two must stay visually identical.
function buildShieldCheckmarkIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 30 34');
  svg.innerHTML =
    '<path d="M15 2 L28 7 V17 C28 25 22 30 15 33 C8 30 2 25 2 17 V7 Z" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
    '<path d="M9 17 L14 22 L22 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>';
  return svg;
}

// Persistent top bar on every screen: the shield-checkmark mark + OneTrip
// wordmark as one lockup, plus the current truck/date once a driver has
// entered them. Kept static (no slide animation) while the screen body
// beneath it transitions.
function renderAppHeader() {
  const header = el('div', { class: 'app-header' });

  const brand = el('div', { class: 'app-header-brand' });
  const iconWrap = el('span', { class: 'app-header-icon' });
  iconWrap.appendChild(buildShieldCheckmarkIcon());
  brand.appendChild(iconWrap);
  brand.appendChild(el('span', { class: 'app-header-wordmark', text: 'OneTrip' }));
  header.appendChild(brand);

  if (inspection.truckNumber.trim()) {
    const meta = el('div', { class: 'app-header-meta' });
    meta.appendChild(el('span', { text: `Unit ${inspection.truckNumber.trim()}` }));
    meta.appendChild(el('span', { text: inspection.date }));
    header.appendChild(meta);
  }

  return header;
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) {
    if (child) node.appendChild(child);
  }
  return node;
}

// ---------- Setup screen ----------

function renderSetupScreen() {
  const container = el('div', { class: 'screen setup-screen' });
  const isEditing = editInfoReturnScreen !== null;

  container.appendChild(el('h1', { class: 'app-title', text: isEditing ? 'Edit Truck / Driver Info' : 'Pre-Trip Inspection' }));
  if (isEditing) {
    container.appendChild(el('p', { class: 'done-copy', text: 'Your inspection progress is untouched — this only changes the truck number and driver name.' }));
  }

  const form = el('div', { class: 'setup-form' });

  const truckLabel = el('label', { class: 'field-label', for: 'truckNumber', text: 'Truck Number' });
  const truckInput = el('input', {
    id: 'truckNumber',
    class: 'text-input',
    type: 'text',
    inputmode: 'text',
    autocomplete: 'off',
    placeholder: 'e.g. 4471',
    value: inspection.truckNumber,
    oninput: (e) => {
      inspection.truckNumber = e.target.value;
      saveInspection();
      updateBeginButtonState();
    },
  });

  const driverLabel = el('label', { class: 'field-label', for: 'driverName', text: 'Driver Name' });
  const driverInput = el('input', {
    id: 'driverName',
    class: 'text-input',
    type: 'text',
    autocomplete: 'off',
    placeholder: 'e.g. J. Alvarez',
    value: inspection.driverName,
    oninput: (e) => {
      inspection.driverName = e.target.value;
      saveInspection();
      updateBeginButtonState();
    },
  });

  const dateLabel = el('label', { class: 'field-label', for: 'inspDate', text: 'Date' });
  const dateInput = el('input', {
    id: 'inspDate',
    class: 'text-input',
    type: 'date',
    value: inspection.date,
    oninput: (e) => {
      inspection.date = e.target.value;
      saveInspection();
    },
  });

  form.appendChild(truckLabel);
  form.appendChild(truckInput);
  form.appendChild(driverLabel);
  form.appendChild(driverInput);
  form.appendChild(dateLabel);
  form.appendChild(dateInput);

  container.appendChild(form);

  const beginBtn = el('button', {
    id: 'beginBtn',
    class: 'btn btn-primary btn-block btn-large',
    text: isEditing ? 'Save & Continue' : 'Begin Inspection — Phase 1',
    onclick: () => {
      if (!inspection.truckNumber.trim() || !inspection.driverName.trim()) return;
      inspection.screen = editInfoReturnScreen || 'phase1';
      editInfoReturnScreen = null;
      saveInspection();
      render();
    },
  });
  container.appendChild(beginBtn);
  container.appendChild(renderSoundToggle());

  setTimeout(updateBeginButtonState, 0);
  return container;
}

// The only settings control in the app right now — no dedicated Settings
// screen exists, so this lives on Setup (the screen every session passes
// through). Defaults to on.
function renderSoundToggle() {
  const row = el('label', { class: 'sound-toggle-row' });
  const checkbox = el('input', {
    type: 'checkbox',
    onchange: (e) => setCaptureSoundEnabled(e.target.checked),
  });
  checkbox.checked = isCaptureSoundEnabled();
  row.appendChild(checkbox);
  row.appendChild(el('span', { text: 'Capture sound' }));
  return row;
}

function updateBeginButtonState() {
  const btn = document.getElementById('beginBtn');
  if (!btn) return;
  const ready = inspection.truckNumber.trim().length > 0 && inspection.driverName.trim().length > 0;
  btn.disabled = !ready;
}

// ---------- Phase screens (shared renderer) ----------

function renderPhaseScreen(title, zones, progress, footer) {
  const container = el('div', { class: 'screen phase-screen' });

  container.appendChild(renderPhaseHeader(title, progress));

  const list = el('div', { class: 'zone-list' });
  for (const zone of zones) {
    list.appendChild(el('h2', { class: 'zone-heading', text: `Zone ${zone.zone} — ${zone.zoneName}` }));
    for (const station of zone.stations) {
      list.appendChild(renderStationCard(station));
    }
  }
  container.appendChild(list);

  container.appendChild(footer);
  return container;
}

function renderPhase1Screen() {
  return renderPhaseScreen('Phase 1 — Engine Off', PHASE1_ZONES, phase1Progress(), renderPhase1Footer());
}

function renderPhase2Screen() {
  const backTarget = { screen: 'phase1', label: 'Back to Phase 1' };
  return renderPhaseScreen('Phase 2 — Full Exterior Walk', PHASE2_ZONES, phase2Progress(), renderPhase2Footer(backTarget));
}

// Phase 3 has no zone grouping (it's one location, in-cab), so it renders
// stations directly rather than going through renderPhaseScreen.
function renderPhase3Screen() {
  const backTarget = { screen: 'phase2', label: 'Back to Phase 2' };
  const container = el('div', { class: 'screen phase-screen' });
  container.appendChild(renderPhaseHeader('Phase 3 — In-Cab Finale', phase3Progress()));

  const list = el('div', { class: 'zone-list' });
  for (const station of PHASE3_STATIONS) {
    list.appendChild(renderStationCard(station));
  }
  container.appendChild(list);

  container.appendChild(renderPhase3Footer(backTarget));
  return container;
}

function renderPhaseHeader(title, progress) {
  const header = el('div', { class: 'phase-header' });

  // Once certified the record is locked and none of this applies — the
  // phase screens already switch to a read-only "Back to Summary" footer
  // in that state, so these links would be redundant/misleading there.
  if (!isCertified()) {
    const metaRow = el('div', { class: 'phase-meta-row' });
    metaRow.appendChild(el('button', {
      class: 'phase-nav-link phase-edit-info-link',
      text: `Edit — Truck ${inspection.truckNumber} — ${inspection.driverName}`,
      onclick: () => {
        editInfoReturnScreen = inspection.screen;
        inspection.screen = 'setup';
        saveInspection();
        render();
      },
    }));
    header.appendChild(metaRow);
  }

  header.appendChild(el('h1', { class: 'phase-title', text: title }));

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const labelRow = el('div', { class: 'progress-label-row' });
  labelRow.appendChild(el('span', { text: 'Progress' }));
  labelRow.appendChild(el('span', { text: `${progress.done} of ${progress.total}` }));
  header.appendChild(labelRow);

  const barWrap = el('div', { class: 'progress-bar-wrap' });
  const bar = el('div', { class: 'progress-bar-fill' });
  bar.style.width = `${pct}%`;
  barWrap.appendChild(bar);
  header.appendChild(barWrap);
  return header;
}

function renderStationCard(stationDef) {
  if (!isStationUnlocked(stationDef.id)) {
    return renderLockedStationCard(stationDef);
  }

  const st = inspection.stations[stationDef.id];
  const complete = isStationComplete(stationDef.id);
  const card = el('div', { class: `station-card${complete ? ' station-complete' : ''}` });

  const headerRow = el('div', { class: 'station-header' });
  headerRow.appendChild(el('span', { class: 'station-id', text: `Station ${stationDef.id}` }));
  headerRow.appendChild(el('span', { class: `station-status-pill ${complete ? 'pill-complete' : 'pill-incomplete'}`, text: complete ? 'Complete' : 'Incomplete' }));
  card.appendChild(headerRow);

  card.appendChild(el('p', { class: 'station-label', text: stationDef.label }));

  if (stationNeedsPhoto(stationDef)) {
    card.appendChild(renderPhotoControl(stationDef, st));
  }

  const subList = el('div', { class: 'subitem-list' });
  for (const si of stationDef.subItems) {
    subList.appendChild(renderSubItemRow(stationDef, si, st));
  }
  card.appendChild(subList);

  return card;
}

// Collapsed, non-interactive placeholder — no controls, no sub-item labels
// to preview. Forces the driver through stations in physical-walk order
// instead of filling out a whole phase from one spot.
function renderLockedStationCard(stationDef) {
  const card = el('div', { class: 'station-card station-locked' });

  const headerRow = el('div', { class: 'station-header' });
  headerRow.appendChild(el('span', { class: 'station-id', text: `Station ${stationDef.id}` }));
  headerRow.appendChild(el('span', { class: 'station-status-pill pill-locked', text: 'Locked' }));
  card.appendChild(headerRow);

  card.appendChild(el('p', { class: 'station-label', text: stationDef.label }));
  card.appendChild(el('p', { class: 'station-locked-note', text: 'Complete the previous station to unlock.' }));

  return card;
}

// Once certified, the record is locked — no toggles, no numeric edits, no
// retaking photos. Without this, "Certify & Complete Inspection" would be
// decorative: the review buttons on the complete screen drop straight back
// into fully editable phase screens, so a driver could certify, then quietly
// flip a Fail to a Pass or retake a photo with no trace and no re-certifying.
function isCertified() {
  return !!inspection.certifiedAt;
}

// A plain static camera glyph — not an icon library, just one inline SVG
// shown centered in the empty photo slot before anything's been captured.
function buildCameraGlyph() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'photo-slot-icon');
  svg.innerHTML =
    '<path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>' +
    '<circle cx="12" cy="13.5" r="3.25" fill="none" stroke="currentColor" stroke-width="1.5"/>';
  return svg;
}

function renderPhotoControl(stationDef, st) {
  const wrap = el('div', { class: 'photo-control' });

  if (st.photoCaptured) {
    // The photo lives in IndexedDB, not in `st`, so it loads in async —
    // the thumbnail fills in a beat after the rest of the card renders.
    const img = el('img', { class: 'photo-thumb', alt: `${stationDef.id} photo` });
    wrap.appendChild(img);
    getPhoto(stationDef.id)
      .then((dataUri) => {
        if (dataUri) img.src = dataUri;
      })
      .catch((err) => console.error('Failed to load stored photo', err));
  } else if (isCertified()) {
    wrap.appendChild(el('p', { class: 'done-copy', text: 'No photo on record.' }));
  } else {
    const emptySlot = el('div', { class: 'photo-slot-empty' });
    emptySlot.appendChild(buildCameraGlyph());
    wrap.appendChild(emptySlot);
  }

  if (!isCertified()) {
    wrap.appendChild(el('button', {
      class: 'btn btn-primary btn-block',
      text: st.photoCaptured ? 'Retake Station Photo' : 'Capture Photo',
      onclick: () => openCamera(stationDef.id),
    }));
  }

  return wrap;
}

// ---------- In-page live camera capture ----------
// Deliberately does NOT fall back to a file picker: a picker lets a driver
// select an old photo from their gallery instead of shooting the truck live,
// which defeats the whole point of the app. getUserMedia + a canvas
// snapshot forces a live shot straight from the device camera.

let cameraStream = null;
let cameraTargetStationId = null;

// A locked phone or a backgrounded app mid-photo is a realistic scenario in
// the field — without this the camera stream would keep running (draining
// battery, camera indicator staying lit) until the driver manually returns
// and taps Cancel.
function handleCameraVisibilityChange() {
  if (document.hidden) closeCamera();
}

function openCamera(stationId) {
  cameraTargetStationId = stationId;
  const overlay = buildCameraOverlay(stationId);
  document.body.appendChild(overlay);
  document.addEventListener('visibilitychange', handleCameraVisibilityChange);

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    overlay.querySelector('.camera-error').textContent =
      'Camera capture is not supported in this browser.';
    return;
  }

  navigator.mediaDevices
    .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
    .then((stream) => {
      cameraStream = stream;
      const video = overlay.querySelector('video');
      video.srcObject = stream;
    })
    .catch((err) => {
      overlay.querySelector('.camera-error').textContent =
        `Camera unavailable (${err.name}). Check camera permission for this site.`;
    });
}

function closeCamera() {
  document.removeEventListener('visibilitychange', handleCameraVisibilityChange);
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
  const overlay = document.getElementById('camera-overlay');
  if (overlay) overlay.remove();
  cameraTargetStationId = null;
}

const CAMERA_CAPTURE_MAX_EDGE = 1600; // px — plenty for evidence photos, keeps files small

async function capturePhoto() {
  const overlay = document.getElementById('camera-overlay');
  const video = overlay.querySelector('video');
  if (!video.videoWidth) return; // stream not ready yet

  let { videoWidth: w, videoHeight: h } = video;
  if (Math.max(w, h) > CAMERA_CAPTURE_MAX_EDGE) {
    const scale = CAMERA_CAPTURE_MAX_EDGE / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(video, 0, 0, w, h);
  const dataUri = canvas.toDataURL('image/jpeg', 0.85);

  const stationId = cameraTargetStationId;
  closeCamera();

  let saved = false;
  try {
    await savePhoto(stationId, dataUri);
    setStationPhotoCaptured(stationId, true);
    saved = true;
  } catch (err) {
    console.error('Failed to save photo', err);
    alert('Could not save that photo (storage error). Please try taking it again.');
  }
  render();

  // Confirmation feedback only plays on an actual successful save — never
  // on the error path above, which already has its own alert().
  if (saved) {
    playCaptureSound();
    await showCaptureConfirmation();
  }
}

// ---------- Capture confirmation (shared with the completion screen) ----------

// Both shapes are plain SVG path geometry, not icons from a library. The
// ring is built from two explicit clockwise arcs (sweep-flag 1) rather
// than a <circle> element, since a circle's own path direction is
// browser-determined and not guaranteed to draw clockwise.
function buildConfirmationMark() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('class', 'confirm-ring-svg');

  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  ring.setAttribute('class', 'confirm-ring');
  ring.setAttribute('d', 'M32,6 A26,26 0 0 1 32,58 A26,26 0 0 1 32,6');

  const check = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  check.setAttribute('class', 'confirm-check');
  check.setAttribute('d', 'M19,33 L28,42 L46,20');

  svg.appendChild(ring);
  svg.appendChild(check);
  return svg;
}

// Draws the ring in over 350ms, then — only once that's finished, not
// overlapping — strokes the checkmark in over 250ms. Both timings and the
// sequencing are driven by measuring each path's own real length and
// transitioning stroke-dashoffset, so this works identically regardless
// of exactly how the path geometry above is drawn.
function playConfirmationMark(svg) {
  const ring = svg.querySelector('.confirm-ring');
  const check = svg.querySelector('.confirm-check');

  return new Promise((resolve) => {
    for (const shape of [ring, check]) {
      const length = shape.getTotalLength();
      shape.style.strokeDasharray = String(length);
      shape.style.strokeDashoffset = String(length);
    }

    requestAnimationFrame(() => {
      ring.style.transition = 'stroke-dashoffset 350ms ease-out';
      ring.style.strokeDashoffset = '0';

      setTimeout(() => {
        check.style.transition = 'stroke-dashoffset 250ms ease-out';
        check.style.strokeDashoffset = '0';
        setTimeout(resolve, 250);
      }, 350);
    });
  });
}

// Brief, non-blocking-to-the-eye confirmation shown after a photo has
// actually saved — removed automatically once its animation finishes.
function showCaptureConfirmation() {
  const overlay = el('div', { class: 'capture-confirm-overlay' });
  const badge = el('div', { class: 'capture-confirm-badge' });
  const mark = buildConfirmationMark();
  badge.appendChild(mark);
  overlay.appendChild(badge);
  document.body.appendChild(overlay);
  return playConfirmationMark(mark).then(() => overlay.remove());
}

// ---------- Capture sound ----------
// A single short, quiet tone on successful capture only — nothing on
// navigation, taps, or errors. Synthesized rather than an audio file, so
// there's nothing extra to host or load. Toggleable, defaulting to on.

const SOUND_PREF_KEY = 'onetrip-capture-sound-enabled';
let sharedAudioContext = null;

function isCaptureSoundEnabled() {
  const raw = localStorage.getItem(SOUND_PREF_KEY);
  return raw === null ? true : raw === 'true';
}

function setCaptureSoundEnabled(enabled) {
  localStorage.setItem(SOUND_PREF_KEY, String(enabled));
}

function playCaptureSound() {
  if (!isCaptureSoundEnabled()) return;
  try {
    sharedAudioContext = sharedAudioContext || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = sharedAudioContext;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.16);
  } catch (err) {
    console.error('Capture sound failed', err);
  }
}

// Baseline reference guide: if this truck has a confirmed "gold standard"
// wide-angle photo for the zone this station belongs to, show it as a
// fixed, translucent overlay on the live feed so the driver can line up
// their shot before capturing. No toggle for now (per product decision) —
// trucks/stations with no reference on file just get the plain camera,
// unaffected.
function buildCameraOverlay(stationId) {
  const overlay = el('div', { id: 'camera-overlay', class: 'camera-overlay' });

  const videoWrap = el('div', { class: 'camera-video-wrap' });
  videoWrap.appendChild(el('video', { class: 'camera-video', autoplay: '', playsinline: '', muted: '' }));

  const zoneNumber = getZoneNumberForStation(stationId);
  const referenceUrl = getBaselineReferenceImage(inspection.truckNumber.trim(), zoneNumber);
  if (referenceUrl) {
    videoWrap.appendChild(el('img', {
      class: 'camera-reference-overlay',
      src: referenceUrl,
      alt: 'Baseline reference framing guide',
    }));
  }
  overlay.appendChild(videoWrap);

  overlay.appendChild(el('p', { class: 'camera-error' }));

  const controls = el('div', { class: 'camera-controls' });
  controls.appendChild(el('button', { class: 'btn btn-secondary camera-cancel', text: 'Cancel', onclick: closeCamera }));
  controls.appendChild(el('button', { class: 'btn btn-primary camera-shutter', text: 'Capture', onclick: capturePhoto }));
  overlay.appendChild(controls);

  return overlay;
}

function renderSubItemRow(stationDef, subItemDef, stationState) {
  const state = stationState.subItems.find((s) => s.id === subItemDef.id);
  const row = el('div', { class: 'subitem-row' });

  const labelRow = el('div', { class: 'subitem-label-row' });
  labelRow.appendChild(el('span', { class: 'subitem-label', text: subItemDef.label }));
  labelRow.appendChild(el('span', { class: 'checktype-badge', text: subItemDef.checkType }));
  row.appendChild(labelRow);

  if (subItemDef.mode === 'numeric') {
    row.appendChild(renderNumericControl(stationDef, subItemDef, state));
  } else {
    row.appendChild(renderToggleControl(stationDef, subItemDef, state));
  }

  if (state.status === 'fail') {
    // Station 11 has no photo at all (no PHOTO-type sub-items) — don't
    // claim photo evidence exists where it doesn't.
    const note = stationNeedsPhoto(stationDef)
      ? 'Flagged — station photo documents this item.'
      : 'Flagged.';
    row.appendChild(el('p', { class: 'fail-flag-note', text: note }));
  }

  return row;
}

const STATUS_LABELS = { pass: 'Pass', fail: 'Fail', na: 'N/A' };

function renderReadOnlyStatus(status) {
  return el('span', {
    class: `readonly-status-pill readonly-${status || 'unset'}`,
    text: STATUS_LABELS[status] || 'Not recorded',
  });
}

function renderToggleControl(stationDef, subItemDef, state) {
  if (isCertified()) {
    return renderReadOnlyStatus(state.status);
  }

  const toggles = el('div', { class: 'status-toggles' });
  const options = [
    { value: 'pass', label: 'Pass', cls: 'toggle-pass' },
    { value: 'fail', label: 'Fail', cls: 'toggle-fail' },
    { value: 'na', label: 'N/A', cls: 'toggle-na' },
  ];
  for (const opt of options) {
    const active = state.status === opt.value;
    toggles.appendChild(el('button', {
      class: `toggle-btn ${opt.cls}${active ? ' active' : ''}`,
      text: opt.label,
      onclick: () => {
        setSubItemStatus(stationDef.id, subItemDef.id, opt.value);
        render();
      },
    }));
  }
  return toggles;
}

// Threshold sub-items (mode: 'numeric') auto-compute pass/fail from the
// entered value instead of trusting the driver's own judgment call.
function evaluateThreshold(subItemDef, rawValue) {
  if (rawValue === null || rawValue === '' || rawValue === undefined) return null;
  const v = parseFloat(rawValue);
  if (Number.isNaN(v)) return null;
  switch (subItemDef.thresholdType) {
    case 'max':
      return v <= subItemDef.thresholdMax ? 'pass' : 'fail';
    case 'maxExclusive':
      return v < subItemDef.thresholdMax ? 'pass' : 'fail';
    case 'min':
      return v >= subItemDef.thresholdMin ? 'pass' : 'fail';
    case 'range':
      return v >= subItemDef.thresholdMin && v <= subItemDef.thresholdMax ? 'pass' : 'fail';
    default:
      return null;
  }
}

// Compact form for the input placeholder, e.g. "min 4/32"".
function thresholdDescription(subItemDef) {
  const u = subItemDef.unit || '';
  switch (subItemDef.thresholdType) {
    case 'max':
      return `max ${subItemDef.thresholdMax}${u}`;
    case 'maxExclusive':
      return `under ${subItemDef.thresholdMax}${u}`;
    case 'min':
      return `min ${subItemDef.thresholdMin}${u}`;
    case 'range':
      return `${subItemDef.thresholdMin}–${subItemDef.thresholdMax}${u}`;
    default:
      return '';
  }
}

// Natural-language form for the pass/fail badge, e.g. "at least 4/32"".
function thresholdRequirement(subItemDef) {
  const u = subItemDef.unit || '';
  switch (subItemDef.thresholdType) {
    case 'max':
      return `at most ${subItemDef.thresholdMax}${u}`;
    case 'maxExclusive':
      return `under ${subItemDef.thresholdMax}${u}`;
    case 'min':
      return `at least ${subItemDef.thresholdMin}${u}`;
    case 'range':
      return `between ${subItemDef.thresholdMin} and ${subItemDef.thresholdMax}${u}`;
    default:
      return '';
  }
}

function renderNumericControl(stationDef, subItemDef, state) {
  // Two shapes share this control: items with a stated threshold (e.g. tread
  // depth) auto-compute pass/fail from the number, so only N/A is manual.
  // Items with no stated threshold (e.g. tire PSI) just log the number —
  // the driver still has to set Pass/Fail/N/A themselves, same as a toggle.
  const hasThreshold = !!subItemDef.thresholdType;
  const wrap = el('div', { class: 'numeric-control' });

  if (isCertified()) {
    const valueText = state.value !== null && state.value !== undefined && state.value !== ''
      ? `${state.value}${subItemDef.unit || ''}`
      : 'Not recorded';
    wrap.appendChild(el('span', { class: 'numeric-readonly-value', text: valueText }));
    if (hasThreshold) {
      if (state.status === 'pass' || state.status === 'fail') {
        wrap.appendChild(el('span', {
          class: `auto-flag-badge auto-flag-${state.status}`,
          text: state.status === 'pass' ? `Pass — must be ${thresholdRequirement(subItemDef)}` : `Fail — must be ${thresholdRequirement(subItemDef)}`,
        }));
      } else {
        wrap.appendChild(renderReadOnlyStatus(state.status));
      }
    } else {
      wrap.appendChild(renderReadOnlyStatus(state.status));
    }
    return wrap;
  }

  const inputRow = el('div', { class: 'numeric-input-row' });
  const input = el('input', {
    type: 'number',
    inputmode: 'decimal',
    step: 'any',
    class: 'numeric-input',
    placeholder: hasThreshold ? thresholdDescription(subItemDef) : subItemDef.unit || '',
    value: state.value === null || state.value === undefined ? '' : state.value,
    oninput: (e) => {
      const raw = e.target.value;
      setSubItemValue(stationDef.id, subItemDef.id, raw === '' ? null : raw);
      if (hasThreshold) {
        setSubItemStatus(stationDef.id, subItemDef.id, evaluateThreshold(subItemDef, raw));
      }
      // No render() here — re-rendering on every keystroke would steal
      // focus from the input. The badge/progress bar catch up on blur.
    },
    // Deferred one frame: blurring this input is also the exact moment a
    // phone's on-screen keyboard starts closing. Tearing the DOM down
    // (render() replaces this very element) synchronously in that instant
    // is a known mobile Safari/Chrome trigger for snapping scroll straight
    // to the top of the page. Waiting a frame lets the browser's own
    // blur/focus bookkeeping finish first, so our render doesn't collide
    // with it.
    onblur: () => requestAnimationFrame(() => render()),
  });
  inputRow.appendChild(input);
  if (subItemDef.unit) inputRow.appendChild(el('span', { class: 'numeric-unit', text: subItemDef.unit }));

  // N/A must not be a way to launder a failing reading off the record: once
  // the entered value computes to 'fail', N/A is unavailable until the
  // value is corrected or cleared. The check re-evaluates the live value at
  // click time (not just at render time) so a fast tap right after typing
  // a bad number — before blur has re-rendered the card — can't slip through.
  if (hasThreshold && evaluateThreshold(subItemDef, state.value) !== 'fail') {
    const naActive = state.status === 'na';
    inputRow.appendChild(el('button', {
      class: `toggle-btn toggle-na${naActive ? ' active' : ''}`,
      text: 'N/A',
      onclick: () => {
        if (evaluateThreshold(subItemDef, state.value) === 'fail') {
          alert('This item currently shows a failing measurement. Correct or clear the value before marking it N/A.');
          render();
          return;
        }
        setSubItemStatus(stationDef.id, subItemDef.id, 'na');
        render();
      },
    }));
  }
  wrap.appendChild(inputRow);

  if (hasThreshold) {
    if (state.status === 'pass' || state.status === 'fail') {
      wrap.appendChild(el('span', {
        class: `auto-flag-badge auto-flag-${state.status}`,
        text: state.status === 'pass' ? `Pass — must be ${thresholdRequirement(subItemDef)}` : `Fail — must be ${thresholdRequirement(subItemDef)}`,
      }));
    }
  } else {
    wrap.appendChild(renderToggleControl(stationDef, subItemDef, state));
  }

  return wrap;
}

function renderReadOnlyFooter() {
  const footer = el('div', { class: 'sticky-footer' });
  footer.appendChild(el('button', {
    class: 'btn btn-secondary btn-block',
    text: 'Back to Summary',
    onclick: () => {
      inspection.screen = 'summary';
      saveInspection();
      render();
    },
  }));
  return footer;
}

function renderPhase1Footer() {
  if (isCertified()) return renderReadOnlyFooter();
  const footer = el('div', { class: 'sticky-footer' });
  const ready = isPhase1Complete();
  const btn = el('button', {
    class: 'btn btn-primary btn-block btn-large',
    text: ready ? 'Proceed to Phase 2' : 'Complete all items to proceed',
    onclick: () => {
      if (!isPhase1Complete()) return;
      inspection.screen = 'transition-1-2';
      saveInspection();
      render();
    },
  });
  btn.disabled = !ready;
  footer.appendChild(btn);
  return footer;
}

function renderBackButton(backTarget) {
  return el('button', {
    class: 'btn btn-secondary btn-block',
    text: `← ${backTarget.label}`,
    onclick: () => {
      inspection.screen = backTarget.screen;
      saveInspection();
      render();
    },
  });
}

function renderPhase2Footer(backTarget) {
  if (isCertified()) return renderReadOnlyFooter();
  const footer = el('div', { class: 'sticky-footer' });
  footer.appendChild(renderBackButton(backTarget));
  const ready = isPhase2Complete();
  const btn = el('button', {
    class: 'btn btn-primary btn-block btn-large',
    text: ready ? 'Proceed to Phase 3' : 'Complete all items to proceed',
    onclick: () => {
      if (!isPhase2Complete()) return;
      inspection.screen = 'phase3';
      saveInspection();
      render();
    },
  });
  btn.disabled = !ready;
  footer.appendChild(btn);
  return footer;
}

function renderPhase3Footer(backTarget) {
  if (isCertified()) return renderReadOnlyFooter();
  const footer = el('div', { class: 'sticky-footer' });
  footer.appendChild(renderBackButton(backTarget));
  const ready = isPhase3Complete();
  const btn = el('button', {
    class: 'btn btn-primary btn-block btn-large',
    text: ready ? 'Review & Certify Inspection' : 'Complete all items to proceed',
    onclick: () => {
      if (!isPhase3Complete()) return;
      inspection.screen = 'summary';
      saveInspection();
      render();
    },
  });
  btn.disabled = !ready;
  footer.appendChild(btn);
  return footer;
}

// ---------- Transition screen ----------

function renderTransitionScreen() {
  const container = el('div', { class: 'screen transition-screen' });

  container.appendChild(el('h1', { class: 'phase-title', text: 'Engine Off Phase Complete' }));
  container.appendChild(el('p', { class: 'transition-instructions', text: TRANSITION_1_TO_2.instructions }));

  if (inspection.transitionLog) {
    container.appendChild(el('p', { class: 'transition-logged', text: `Confirmed at ${new Date(inspection.transitionLog.confirmedAt).toLocaleTimeString()}` }));
  }

  container.appendChild(renderBackButton({ screen: 'phase1', label: 'Back to Phase 1' }));

  const btn = el('button', {
    class: 'btn btn-primary btn-block btn-large',
    text: 'Confirm — Ready for Phase 2',
    onclick: () => {
      inspection.transitionLog = { confirmedAt: new Date().toISOString() };
      inspection.screen = 'phase2';
      saveInspection();
      render();
    },
  });
  container.appendChild(btn);

  return container;
}

// ---------- Final summary + certification ----------

function renderReviewButtons() {
  const wrap = el('div', { class: 'review-buttons' });
  const targets = [
    ['Review Phase 1', 'phase1'],
    ['Review Phase 2', 'phase2'],
    ['Review Phase 3', 'phase3'],
  ];
  for (const [label, screen] of targets) {
    wrap.appendChild(el('button', {
      class: 'btn btn-secondary btn-block',
      text: label,
      onclick: () => {
        inspection.screen = screen;
        saveInspection();
        render();
      },
    }));
  }
  return wrap;
}

function renderStatTile(label, value, extraClass) {
  const tile = el('div', { class: `stat-tile${extraClass ? ' ' + extraClass : ''}` });
  tile.appendChild(el('div', { class: 'stat-value', text: String(value) }));
  tile.appendChild(el('div', { class: 'stat-label', text: label }));
  return tile;
}

function renderSummaryScreen() {
  const container = el('div', { class: 'screen summary-screen' });
  container.appendChild(el('h1', { class: 'phase-title', text: 'Inspection Summary' }));
  container.appendChild(el('p', { class: 'done-copy', text: `Truck ${inspection.truckNumber} — ${inspection.driverName} — ${inspection.date}` }));

  const overall = overallProgress();
  const failed = getAllFailedItems();

  const statsRow = el('div', { class: 'summary-stats' });
  statsRow.appendChild(renderStatTile('Total Items', overall.total));
  statsRow.appendChild(renderStatTile('Flagged Fail', failed.length, failed.length > 0 ? 'stat-fail' : 'stat-ok'));
  container.appendChild(statsRow);

  if (failed.length > 0) {
    container.appendChild(el('h2', { class: 'zone-heading', text: 'Flagged Items' }));
    const failList = el('div', { class: 'fail-summary-list' });
    for (const f of failed) {
      const row = el('div', { class: 'fail-summary-row' });
      row.appendChild(el('span', { class: 'fail-summary-station', text: `Station ${f.stationId} — ${f.zoneName}` }));
      const valueSuffix = f.value !== null && f.value !== undefined && f.value !== '' ? ` (${f.value}${f.unit || ''})` : '';
      row.appendChild(el('span', { class: 'fail-summary-label', text: f.label + valueSuffix }));
      failList.appendChild(row);
    }
    container.appendChild(failList);
  } else {
    container.appendChild(el('p', { class: 'done-copy', text: 'No items flagged — clean inspection.' }));
  }

  const alreadyCertified = isCertified();
  const ready = isInspectionComplete();
  if (!ready && !alreadyCertified) {
    container.appendChild(el('p', {
      class: 'done-copy',
      text: 'Something got un-completed after you left a phase (e.g. a cleared field). Review the phase below before certifying.',
    }));
  }
  const certifyBtn = el('button', {
    class: 'btn btn-primary btn-block btn-large',
    text: alreadyCertified ? 'View Certification' : (ready ? 'Certify & Complete Inspection' : 'Complete all items to certify'),
    onclick: () => {
      if (alreadyCertified) {
        inspection.screen = 'complete';
        saveInspection();
        render();
        return;
      }
      if (!isInspectionComplete()) return;
      certifyInspection();
      inspection.screen = 'complete';
      saveInspection();
      render();
      // Kicked off right here, in the same click handler, so the browser
      // still counts this as a direct user gesture — the Google sign-in
      // popup can get silently blocked otherwise.
      startUpload();
    },
  });
  certifyBtn.disabled = !ready && !alreadyCertified;
  container.appendChild(certifyBtn);

  container.appendChild(renderReviewButtons());

  return container;
}

function renderCompleteScreen() {
  const container = el('div', { class: 'screen done-screen' });

  const markWrap = el('div', { class: 'complete-mark-wrap' });
  const mark = buildConfirmationMark();
  markWrap.appendChild(mark);
  container.appendChild(markWrap);

  container.appendChild(el('h1', { class: 'complete-heading', text: 'Inspection Complete' }));

  const stationCount = Object.keys(inspection.stations).length;
  container.appendChild(el('p', {
    class: 'complete-subline',
    text: `Unit ${inspection.truckNumber} · all ${stationCount} stations cleared`,
  }));
  container.appendChild(el('p', {
    class: 'done-copy',
    text: `${inspection.driverName}${inspection.certifiedAt ? ` — certified ${new Date(inspection.certifiedAt).toLocaleString()}` : ''}`,
  }));

  const failed = getAllFailedItems();
  if (failed.length > 0) {
    container.appendChild(el('p', { class: 'done-copy', text: `${failed.length} item(s) flagged — see summary for details.` }));
  }
  container.appendChild(renderUploadStatus());

  container.appendChild(el('button', {
    class: 'btn btn-secondary btn-block',
    text: 'Back to Summary',
    onclick: () => {
      inspection.screen = 'summary';
      saveInspection();
      render();
    },
  }));

  container.appendChild(renderReviewButtons());
  container.appendChild(renderResetControl());

  if (!completeMarkHasPlayed) {
    completeMarkHasPlayed = true;
    requestAnimationFrame(() => playConfirmationMark(mark));
  } else {
    // Already played for this visit (this is a same-screen re-render, e.g.
    // the upload status ticking along) — show it fully drawn, not redrawn.
    for (const shape of mark.querySelectorAll('.confirm-ring, .confirm-check')) {
      shape.style.strokeDasharray = '0';
      shape.style.strokeDashoffset = '0';
    }
  }

  return container;
}

function renderUploadStatus() {
  const wrap = el('div', { class: 'upload-status' });
  const status = inspection.uploadStatus;

  if (status === 'uploading') {
    wrap.appendChild(el('p', { class: 'upload-status-line upload-uploading', text: 'Uploading to Google Drive…' }));
  } else if (status === 'uploaded') {
    wrap.appendChild(el('p', {
      class: 'upload-status-line',
      text: `Uploaded to Google Drive${inspection.uploadedAt ? ` — ${new Date(inspection.uploadedAt).toLocaleString()}` : ''}`,
    }));
  } else if (status === 'error') {
    wrap.appendChild(el('p', { class: 'upload-status-line', text: `Upload failed: ${inspection.uploadError || 'unknown error'}` }));
    wrap.appendChild(el('button', {
      class: 'btn btn-secondary btn-block',
      text: 'Retry Upload',
      onclick: () => startUpload(),
    }));
  } else {
    wrap.appendChild(el('p', { class: 'upload-status-line', text: 'Not yet uploaded.' }));
    wrap.appendChild(el('button', {
      class: 'btn btn-secondary btn-block',
      text: 'Upload to Drive',
      onclick: () => startUpload(),
    }));
  }

  return wrap;
}

// A certified inspection that hasn't reached Drive yet must not be
// wipeable with a single casual confirm() — that's the exact data-loss
// gap this phase exists to close. The override stays available for a
// genuine edge case, but it's deliberately a second, harder step.
function renderResetControl() {
  if (isUploadPending()) {
    const wrap = el('div', { class: 'reset-blocked' });
    wrap.appendChild(el('p', {
      class: 'done-copy',
      text: 'This inspection hasn’t finished uploading yet. Starting a new one now would permanently delete it before it’s backed up.',
    }));
    wrap.appendChild(el('button', {
      class: 'btn btn-danger btn-block',
      text: 'Discard This Inspection Anyway',
      onclick: () => {
        if (!confirm('This inspection has NOT been uploaded to Drive. Starting a new one will permanently delete it, with no backup anywhere. This cannot be undone. Continue?')) return;
        resetInspection();
        render();
      },
    }));
    return wrap;
  }

  const resetBtn = el('button', {
    class: 'btn btn-danger btn-block',
    text: 'Start New Inspection',
    onclick: () => {
      if (!confirm('This clears all current inspection data. Continue?')) return;
      resetInspection();
      render();
    },
  });
  return resetBtn;
}

// ---------- Access gate ----------
//
// Sits entirely in front of the app's own render() cycle — nothing below
// this point knows or cares whether a gate exists. Once unlocked, boot()
// hands off to the normal render() and never runs again this session.

function renderGateScreen() {
  const container = el('div', { class: 'screen setup-screen' });
  container.appendChild(el('h1', { class: 'app-title', text: 'Enter Access Code' }));

  // A real <form> (not just a styled div) so both a physical Enter key and
  // a mobile keyboard's "Go"/"Done" action submit natively — a manual
  // keydown listener on the input alone misses some of those paths.
  const form = el('form', { class: 'setup-form' });
  form.appendChild(el('label', { class: 'field-label', for: 'gateCode', text: 'Access Code' }));

  const errorMsg = el('p', { class: 'fail-flag-note', text: 'Incorrect code, try again.' });
  errorMsg.hidden = true;

  const input = el('input', {
    id: 'gateCode',
    class: 'text-input',
    type: 'password',
    inputmode: 'numeric',
    autocomplete: 'off',
    placeholder: 'Enter code',
  });
  form.appendChild(input);
  form.appendChild(errorMsg);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!input.value) return;
    const ok = await tryUnlockGate(input.value);
    if (ok) {
      boot();
    } else {
      errorMsg.hidden = false;
      input.value = '';
      input.focus();
    }
  });

  form.appendChild(el('button', {
    type: 'submit',
    class: 'btn btn-primary btn-block btn-large',
    text: 'Unlock',
  }));

  container.appendChild(form);
  return container;
}

function boot() {
  if (isGateUnlocked()) {
    render();
    resumeStalledUploadIfNeeded();
  } else {
    root.innerHTML = '';
    root.appendChild(renderAppHeader());
    root.appendChild(renderGateScreen());
  }
}

// 'uploading' is only ever meaningful while the page that set it is still
// running — it can never legitimately survive a reload, since no fetch
// keeps running across one. If a driver's connection dropped mid-upload,
// or the app got closed/killed mid-upload, they'd otherwise reopen it to
// a permanently stuck "Uploading…" screen with no button and no way out,
// since only the 'error' status renders a Retry control. Automatically
// resuming here is safe because startUpload()/uploadOnce() already skip
// whatever previously made it to Drive, so this can't duplicate files.
function resumeStalledUploadIfNeeded() {
  if (inspection.certifiedAt && inspection.uploadStatus === 'uploading') {
    startUpload();
  }
}

boot();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.error('SW registration failed', err));
  });
}
