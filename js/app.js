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

// Resolved-defect acknowledgment gate (see renderResolutionAckScreen).
// Transient, UI-only state — never persisted to localStorage, unlike
// `inspection` itself: if the app closes mid-acknowledgment, reopening it
// simply re-checks and shows the same items again, which is correct, not a
// bug (nothing was marked acknowledged, so nothing should have been lost).
let pendingResolutionAcks = [];
// Where Begin Inspection was actually headed (usually 'phase1', but can be
// editInfoReturnScreen's target) — held here so the acknowledgment
// screen's Continue button lands in the right place once done.
let resolutionAckTargetScreen = null;

// --- render scheduling ---------------------------------------------------
//
// THE ACTUAL ROOT CAUSE of this app's recurring scroll-jump bug (fixed
// twice before — 7a27437, fe67313 — and it kept coming back): tearing down
// and rebuilding the DOM (root.innerHTML = '' below) is inherently
// destructive to whatever element currently has focus. On mobile Safari/
// Chrome, destroying the focused element in the SAME synchronous tick as
// the click/tap/blur event that focused it is a known trigger for the
// browser's own "scroll the next-focused thing into view" behavior firing
// independently of — and often *after* — this file's own scrollY-restore
// logic below, so it wins and the page visibly snaps.
//
// Both prior fixes patched this correctly, but only where someone happened
// to be looking: 7a27437 added the scrollY-restore machinery (necessary,
// but doesn't stop the race by itself); fe67313 discovered that deferring
// render() by one requestAnimationFrame — so the browser finishes its own
// focus/blur bookkeeping before this code demolishes the DOM — actually
// prevents the race, but applied that ONLY to one numeric input's onblur.
// Every OTHER control that calls render() straight from a click handler
// (the Pass/Fail/N/A toggles chief among them — by far the most-tapped
// control in the whole app) was left exactly as exposed as before, which
// is exactly why this kept resurfacing in a new spot instead of staying
// fixed.
//
// Rather than hunting down and re-patching every individual button (and
// leaving the same trap for the next new one), the deferral now lives
// inside render() itself: EVERY call to render(), from anywhere, present
// or future, is automatically deferred to the next frame — never runs
// synchronously in the same tick as whatever DOM event triggered it. A new
// button added later that calls render() straight from onclick gets this
// for free; there is no longer a "remember to defer this one" step to
// forget. `renderScheduled` coalesces multiple render() calls that land in
// the same frame (e.g. a state write plus a follow-up call) into one
// actual rebuild, so rapid taps don't queue up redundant re-renders.
//
// Manual test for anyone touching this function: scroll partway down a
// long station list (Phase 1 or 2), tap several Pass/Fail/N/A buttons in a
// row across different sub-items, and confirm the page never jumps. If it
// does, the regression is almost certainly a new render() call site that
// bypasses this scheduler somehow (e.g. mutating root's DOM directly
// instead of going through render()) — it should NOT be "fixed" by adding
// another local scrollY save/restore.
let renderScheduled = false;

function render() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    performRender();
  });
}

function performRender() {
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
    case 'resolutionAck':
      screenNode = renderResolutionAckScreen();
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

  // A dropdown, not free text: see KNOWN_TRUCKS in data.js for why — in
  // short, a truck not on that list simply can't start an inspection,
  // which is intentional (no near-duplicate Drive folders from typos).
  const truckLabel = el('label', { class: 'field-label', for: 'truckNumber', text: 'Truck Number' });
  const truckInput = el('select', {
    id: 'truckNumber',
    class: 'text-input',
    onchange: (e) => {
      inspection.truckNumber = e.target.value;
      saveInspection();
      updateBeginButtonState();
    },
  }, [
    el('option', { value: '', disabled: true, text: 'Select truck number' }),
    ...KNOWN_TRUCKS.map((truck) => el('option', { value: truck, text: truck })),
  ]);
  // A <select>'s current selection is a live DOM property, not something
  // reflected by an HTML attribute — el()'s generic attribute-setting path
  // can't express it, so it's set directly here instead.
  truckInput.value = inspection.truckNumber;

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
    text: isEditing ? 'Start Inspection' : 'Begin Inspection — Phase 1',
    onclick: async () => {
      if (!inspection.truckNumber.trim() || !inspection.driverName.trim()) return;
      const targetScreen = editInfoReturnScreen || 'phase1';
      editInfoReturnScreen = null;

      // Editing truck/driver info mid-walk re-enters an ALREADY-STARTED
      // inspection — the truck was already checked once, at the very start
      // of THIS inspection, so there's nothing new to check here. Only a
      // genuine fresh start (isEditing false) needs the resolution check.
      // Deliberately checking `isEditing`, not targetScreen's value —
      // targetScreen can legitimately equal 'phase1' even when editing
      // (if that's the screen the edit-info link was tapped from), so
      // comparing against 'phase1' would wrongly re-trigger the check.
      if (isEditing) {
        inspection.screen = targetScreen;
        saveInspection();
        render();
        return;
      }

      // Direct DOM mutation, not render(): this is transient, pre-
      // navigation UI state with nothing to persist, same pattern as
      // updateBeginButtonState() below.
      beginBtn.disabled = true;
      beginBtn.textContent = 'Checking truck status…';

      let items = [];
      try {
        items = await checkResolutionsForTruck(inspection.truckNumber.trim());
      } catch (err) {
        // Fail OPEN, deliberately: a network hiccup or a slow/erroring
        // backend must never block the core inspection flow. Nothing was
        // read successfully, so nothing here could possibly get marked
        // acknowledged either — if this truck genuinely has something to
        // acknowledge, the next attempt (by this driver or any other) will
        // see it exactly the same as this one would have.
        console.error('Resolution check failed, proceeding without it', err);
        items = [];
      }

      if (items.length > 0) {
        pendingResolutionAcks = items;
        resolutionAckTargetScreen = targetScreen;
        inspection.screen = 'resolutionAck';
      } else {
        inspection.screen = targetScreen;
      }
      saveInspection();
      render();
    },
  });
  container.appendChild(beginBtn);

  setTimeout(updateBeginButtonState, 0);
  return container;
}

function updateBeginButtonState() {
  const btn = document.getElementById('beginBtn');
  if (!btn) return;
  const ready = inspection.truckNumber.trim().length > 0 && inspection.driverName.trim().length > 0;
  btn.disabled = !ready;
}

// ---------- Resolved-defect acknowledgment screen ----------
//
// Shown between Setup and Phase 1, only when checkResolutionsForTruck()
// (js/drive.js) found something — see the Begin Inspection button above.
// Deliberately informational, not alarming: everything shown here has
// already been fixed and certified by a mechanic; this is a read receipt,
// not a re-inspection or a dispute mechanism. All pending items are shown
// on this one screen together (never one at a time across multiple
// screens), per the actual product decision this was built against.
function renderResolutionAckScreen() {
  const container = el('div', { class: 'screen resolution-ack-screen' });

  container.appendChild(el('h1', { class: 'app-title', text: 'Repairs Since Your Last Inspection' }));
  container.appendChild(el('p', {
    class: 'done-copy',
    text: `Truck ${inspection.truckNumber.trim()} had ${pendingResolutionAcks.length} item${pendingResolutionAcks.length === 1 ? '' : 's'} flagged and fixed since it was last inspected. Please review before continuing.`,
  }));

  const list = el('div', { class: 'resolution-ack-list' });
  for (const item of pendingResolutionAcks) {
    list.appendChild(renderResolutionAckCard(item));
  }
  container.appendChild(list);

  const continueBtn = el('button', {
    class: 'btn btn-primary btn-block btn-large',
    text: "I've Seen This — Continue",
    onclick: async () => {
      continueBtn.disabled = true;
      continueBtn.textContent = 'Saving…';

      try {
        await acknowledgeResolutions(pendingResolutionAcks, inspection.driverName.trim());
      } catch (err) {
        // Fail open here too, for the same reason as the check itself: a
        // network hiccup on THIS specific step must not trap a driver on
        // this screen and block them from starting the inspection. Because
        // nothing here writes anything unless the backend call actually
        // succeeds, a failure leaves these items genuinely unacknowledged
        // in Drive — they'll correctly reappear next time, never silently
        // dropped.
        console.error('Failed to record acknowledgment, proceeding anyway', err);
      }

      const nextScreen = resolutionAckTargetScreen || 'phase1';
      pendingResolutionAcks = [];
      resolutionAckTargetScreen = null;
      inspection.screen = nextScreen;
      saveInspection();
      render();
    },
  });
  container.appendChild(continueBtn);

  return container;
}

function renderResolutionAckCard(item) {
  const card = el('div', { class: 'resolution-ack-card' });
  const zoneLine = item.zoneName ? `${item.zoneName} — Station ${item.stationId}` : `Station ${item.stationId}`;
  card.appendChild(el('p', { class: 'resolution-ack-station', text: zoneLine }));
  card.appendChild(el('p', { class: 'resolution-ack-label', text: item.subItemLabel || item.stationLabel || 'Flagged item' }));

  const resolution = item.resolution || {};
  card.appendChild(el('p', {
    class: 'resolution-ack-meta',
    text: `Fixed by ${resolution.fixedBy || 'unknown'} on ${resolution.fixedDate || 'an unknown date'}`,
  }));
  card.appendChild(el('p', {
    class: 'resolution-ack-notes',
    text: resolution.repairNotes ? resolution.repairNotes : 'No repair notes were provided.',
  }));

  return card;
}

// ---------- Phase screens (shared renderer) ----------

function renderPhaseScreen(title, zones, progress, backTarget, footer) {
  const container = el('div', { class: 'screen phase-screen' });

  container.appendChild(renderPhaseHeader(title, progress, backTarget));

  const list = el('div', { class: 'zone-list' });
  for (const zone of zones) {
    list.appendChild(el('h2', { class: 'zone-heading', text: `Zone ${zone.zone} — ${zone.zoneName}` }));
    for (const station of zone.stations) {
      list.appendChild(renderStationCard(station));
    }
  }
  container.appendChild(list);

  // No footer at all once certified (see renderPhase1Footer etc.) — the
  // old certified-only bottom bar was nothing but a back button, which now
  // lives in the header instead, so there's nothing left to show here.
  if (footer) container.appendChild(footer);
  return container;
}

function renderPhase1Screen() {
  return renderPhaseScreen('Phase 1 — Engine Off', PHASE1_ZONES, phase1Progress(), null, renderPhase1Footer());
}

function renderPhase2Screen() {
  const backTarget = { screen: 'phase1', label: 'Back to Phase 1' };
  return renderPhaseScreen('Phase 2 — Full Exterior Walk', PHASE2_ZONES, phase2Progress(), backTarget, renderPhase2Footer());
}

// Phase 3 has no zone grouping (it's one location, in-cab), so it renders
// stations directly rather than going through renderPhaseScreen.
function renderPhase3Screen() {
  const backTarget = { screen: 'phase2', label: 'Back to Phase 2' };
  const container = el('div', { class: 'screen phase-screen' });
  container.appendChild(renderPhaseHeader('Phase 3 — In-Cab Finale', phase3Progress(), backTarget));

  const list = el('div', { class: 'zone-list' });
  for (const station of PHASE3_STATIONS) {
    list.appendChild(renderStationCard(station));
  }
  container.appendChild(list);

  const footer = renderPhase3Footer();
  if (footer) container.appendChild(footer);
  return container;
}

// A simple stroke-based "<" — same inline-SVG, currentColor-stroke style as
// buildCameraGlyph()/buildShieldCheckmarkIcon(), not a text glyph, so it
// renders identically to the app's other icons rather than depending on a
// device's own font for an arrow character.
function buildChevronBackIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'phase-back-icon');
  svg.innerHTML = '<path d="M15 5 L7 12 L15 19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
  return svg;
}

// Once certified, every phase screen is a locked, read-only review — the
// header's back chevron always goes to Summary in that state regardless of
// which phase is showing, the same destination the old certified-only
// bottom bar used to go to. Otherwise it's whatever normal previous-phase
// target the caller passed (null for Phase 1, which has nothing before it).
function resolveHeaderBackTarget(normalBackTarget) {
  if (isCertified()) return { screen: 'summary', label: 'Back to Summary' };
  return normalBackTarget || null;
}

function renderPhaseHeader(title, progress, backTarget) {
  const header = el('div', { class: 'phase-header' });

  // Once certified the record is locked and none of this applies — editing
  // truck/driver info on a locked record would be meaningless.
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

  const titleRow = el('div', { class: 'phase-title-row' });
  const resolvedBackTarget = resolveHeaderBackTarget(backTarget);
  if (resolvedBackTarget) {
    const backBtn = el('button', {
      class: 'phase-back-btn',
      'aria-label': resolvedBackTarget.label,
      onclick: () => {
        inspection.screen = resolvedBackTarget.screen;
        saveInspection();
        render();
      },
    });
    backBtn.appendChild(buildChevronBackIcon());
    titleRow.appendChild(backBtn);
  }
  titleRow.appendChild(el('h1', { class: 'phase-title', text: title }));
  header.appendChild(titleRow);

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const labelRow = el('div', { class: 'progress-label-row' });
  labelRow.appendChild(el('span', { text: 'Progress' }));
  // class (not just position) so updatePhaseHeaderProgress() below can
  // find this specific span directly, instead of relying on it always
  // being the row's last child.
  labelRow.appendChild(el('span', { class: 'progress-count', text: `${progress.done} of ${progress.total}` }));
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
  // id is load-bearing, not decorative: updateAfterToggleTap() looks up a
  // station's own card by this exact id, both to patch its complete/
  // incomplete pill in place and to detect + replace a NEXT station's card
  // the moment it transitions from locked to unlocked.
  const card = el('div', { id: `station-card-${stationDef.id}`, class: `station-card${complete ? ' station-complete' : ''}` });

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
  // Same id convention as the unlocked card above — updateAfterToggleTap()
  // checks for the 'station-locked' class on this exact element to know
  // whether the next station still needs swapping in once it unlocks.
  const card = el('div', { id: `station-card-${stationDef.id}`, class: 'station-card station-locked' });

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
// The active video track, only if THIS device/browser exposes real torch
// control on it (mainly Android Chrome with a rear LED flash) — null on
// anything that doesn't, which the flash button reflects honestly instead
// of pretending to work. Reset on every open/close.
let cameraTorchTrack = null;
let torchOn = false;

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

  // Full-frame exterior shots (the whole trailer, long shots) need
  // landscape, but the rest of the app stays portrait-locked (see
  // manifest.json's orientation: "portrait-primary") — so only unlock
  // rotation while the camera itself is open, and only where the Screen
  // Orientation API actually supports it. This is a standalone-app-only
  // capability (no Fullscreen API call needed here since this app already
  // runs in "standalone" display mode per the manifest); iOS Safari has
  // never implemented this API at all, so this is a silent no-op there —
  // consistent with iOS also just ignoring the manifest's portrait lock,
  // so neither side of this pairing does anything on iOS today.
  if (screen.orientation && screen.orientation.unlock) {
    try { screen.orientation.unlock(); } catch (err) { /* not supported here — ignore */ }
  }

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

      // Flash/torch support is real but inconsistent: mainly Android Chrome
      // exposes it for a rear camera with an actual LED flash; iOS Safari
      // has no torch API at all. There's also no usable "screen flash"
      // substitute here the way there is for front-camera selfie apps —
      // this app always uses the rear camera (facingMode: environment), and
      // the screen faces the opposite direction from whatever it's
      // photographing, so lighting up the screen wouldn't illuminate the
      // subject at all. Detect real support per-device and tell the driver
      // plainly either way, rather than a control that silently does
      // nothing on unsupported hardware.
      const videoTrack = stream.getVideoTracks()[0];
      const caps = videoTrack && videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
      cameraTorchTrack = caps.torch ? videoTrack : null;
      torchOn = false;
      updateFlashButtonUI();
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
  cameraTorchTrack = null;
  torchOn = false;
  const overlay = document.getElementById('camera-overlay');
  if (overlay) overlay.remove();
  cameraTargetStationId = null;

  // Re-lock back to the app's normal portrait orientation now that the
  // camera's closed — the matching unlock() is in openCamera() above.
  if (screen.orientation && screen.orientation.lock) {
    screen.orientation.lock('portrait-primary').catch(() => { /* not supported here — ignore */ });
  }
}

// Toggles the real hardware torch (only ever called when cameraTorchTrack
// is non-null — see the flash button's disabled state in buildCameraOverlay).
function toggleTorch() {
  if (!cameraTorchTrack) return;
  const next = !torchOn;
  cameraTorchTrack.applyConstraints({ advanced: [{ torch: next }] })
    .then(() => {
      torchOn = next;
      updateFlashButtonUI();
    })
    .catch((err) => {
      console.error('Failed to toggle flash', err);
      torchOn = false;
      updateFlashButtonUI();
    });
}

// The camera overlay is appended straight to document.body and never goes
// through the app's render() cycle, so its own controls are updated by
// direct DOM mutation instead — same pattern as updateBeginButtonState().
function updateFlashButtonUI() {
  const btn = document.getElementById('camera-flash-toggle');
  if (!btn) return;
  if (!cameraTorchTrack) {
    btn.textContent = 'Flash unavailable';
    btn.disabled = true;
    btn.classList.remove('flash-on');
  } else {
    btn.textContent = torchOn ? 'Flash: On' : 'Flash: Off';
    btn.disabled = false;
    btn.classList.toggle('flash-on', torchOn);
  }
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
  // Starts disabled/"unavailable" and is corrected once the stream resolves
  // and torch support is actually known (see openCamera) — never claims
  // support it hasn't confirmed yet.
  controls.appendChild(el('button', {
    id: 'camera-flash-toggle',
    class: 'btn btn-secondary camera-flash-toggle',
    type: 'button',
    text: 'Flash unavailable',
    disabled: true,
    onclick: toggleTorch,
  }));
  controls.appendChild(el('button', { class: 'btn btn-primary camera-shutter', text: 'Capture', onclick: capturePhoto }));
  overlay.appendChild(controls);

  return overlay;
}

// KEEP IN SYNC WITH updateAfterToggleTap() FURTHER DOWN. This function (and
// renderToggleControl below it) build a sub-item row from scratch on every
// full render() pass; updateAfterToggleTap() instead patches an
// ALREADY-RENDERED row in place after a Pass/Fail/N/A tap, without going
// through render() at all — see that function's own comment for why. The
// row's data-row-key attribute is how it finds this exact row again. If you
// change the fail-note's markup/text/class here, you must change it in
// updateAfterToggleTap() too, or a live tap and a fresh page load will
// disagree about what the same 'fail' state looks like.
function renderSubItemRow(stationDef, subItemDef, stationState) {
  const state = stationState.subItems.find((s) => s.id === subItemDef.id);
  const row = el('div', { class: 'subitem-row', 'data-row-key': `${stationDef.id}:${subItemDef.id}` });

  const labelRow = el('div', { class: 'subitem-label-row' });
  labelRow.appendChild(el('span', { class: 'subitem-label', text: subItemDef.label }));
  labelRow.appendChild(el('span', { class: 'checktype-badge', text: subItemDef.checkType }));
  row.appendChild(labelRow);

  if (subItemDef.mode === 'numeric') {
    row.appendChild(renderNumericControl(stationDef, subItemDef, state));
  } else if (subItemDef.mode === 'text') {
    row.appendChild(renderTextControl(stationDef, subItemDef, state));
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

// KEEP IN SYNC WITH updateAfterToggleTap() FURTHER DOWN — see the comment
// on renderSubItemRow above for what that means and why. Specifically: the
// 'active' class and the data-value each button carries are how
// updateAfterToggleTap() re-derives which button should look selected
// after a tap, without rebuilding any of these buttons. If the active-state
// class name, the option list, or the data attributes below ever change,
// updateAfterToggleTap() must change to match.
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
      'data-station-id': stationDef.id,
      'data-subitem-id': subItemDef.id,
      'data-value': opt.value,
      onclick: () => {
        setSubItemStatus(stationDef.id, subItemDef.id, opt.value);
        updateAfterToggleTap(stationDef, subItemDef);
      },
    }));
  }
  return toggles;
}

// THE ACTUAL POINT OF THIS FUNCTION: a Pass/Fail/N/A tap is by far the
// most frequent interaction in the whole app (tapped dozens of times per
// inspection), and until now every single one of those taps went through
// render(), tearing down and rebuilding the ENTIRE current screen — every
// other station, the header, the footer, all of it — just to reflect one
// sub-item's new status. That's the actual root of the scroll-jump/shake
// bug pattern (see render()'s own comment): destroying and recreating
// elements the driver isn't even interacting with is what gave mobile
// browsers' focus/transition handling something to react to. This function
// instead patches ONLY the handful of elements whose appearance can
// actually depend on one sub-item's status changing, and touches nothing
// else in the DOM at all — so there's nothing left for that bug class to
// attach to for this interaction, structurally, not just symptomatically.
//
// KEEP IN SYNC WITH renderToggleControl/renderSubItemRow/renderStationCard
// ABOVE — see their own comments. This function does NOT go through
// render(), so it has no access to a fresh, correct DOM tree the way a
// full render does; every element it touches has to already exist with a
// stable, addressable identity (an id, or a data- attribute) that those
// render functions are responsible for providing. If a future change
// there adds a new visual consequence of a sub-item's status (not just the
// four handled below), that new consequence must be added here too, or it
// will only ever show up after the next full-screen navigation instead of
// immediately.
function updateAfterToggleTap(stationDef, subItemDef) {
  const state = inspection.stations[stationDef.id].subItems.find((s) => s.id === subItemDef.id);

  // 1. The toggle buttons themselves — all three siblings for this exact
  //    sub-item, since only one can be active at a time.
  document
    .querySelectorAll(`.toggle-btn[data-station-id="${stationDef.id}"][data-subitem-id="${subItemDef.id}"]`)
    .forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.value === state.status);
    });

  // 2. The "Flagged" note directly below this row — inserted/removed
  //    entirely, not just restyled, since it doesn't exist at all outside
  //    the 'fail' state. Must match renderSubItemRow's own fail-note markup.
  const row = document.querySelector(`[data-row-key="${stationDef.id}:${subItemDef.id}"]`);
  if (row) {
    let note = row.querySelector('.fail-flag-note');
    if (state.status === 'fail' && !note) {
      const noteText = stationNeedsPhoto(stationDef)
        ? 'Flagged — station photo documents this item.'
        : 'Flagged.';
      row.appendChild(el('p', { class: 'fail-flag-note', text: noteText }));
    } else if (state.status !== 'fail' && note) {
      note.remove();
    }
  }

  // 3. This station's own header pill/border. Idempotent and cheap enough
  //    to just always reapply, rather than tracking whether it actually
  //    changed — a station can only go incomplete -> complete from a
  //    toggle tap (never the reverse; only clearing a numeric field can do
  //    that, a different code path), so this only ever has to move in one
  //    direction, but reapplying it unconditionally is simpler and no less
  //    correct than tracking that.
  const card = document.getElementById(`station-card-${stationDef.id}`);
  if (card) {
    const complete = isStationComplete(stationDef.id);
    card.classList.toggle('station-complete', complete);
    const pill = card.querySelector('.station-status-pill');
    if (pill) {
      pill.textContent = complete ? 'Complete' : 'Incomplete';
      pill.classList.toggle('pill-complete', complete);
      pill.classList.toggle('pill-incomplete', !complete);
    }
  }

  // 4. The next station in this phase's walk order may have just
  //    unlocked. renderStationCard() already knows how to render either
  //    state correctly — this just detects whether a swap is actually
  //    needed (the next card is still showing the locked placeholder, but
  //    isStationUnlocked() now says it shouldn't be) and, if so, replaces
  //    that ONE card wholesale. This is the one case here that's a real
  //    subtree replacement rather than an in-place patch, but it's still
  //    scoped to a single station, not the screen.
  const order = getPhaseStationOrder(stationDef.id);
  const idx = order.findIndex((s) => s.id === stationDef.id);
  const nextDef = order[idx + 1];
  if (nextDef) {
    const nextCard = document.getElementById(`station-card-${nextDef.id}`);
    if (nextCard && nextCard.classList.contains('station-locked') && isStationUnlocked(nextDef.id)) {
      nextCard.replaceWith(renderStationCard(nextDef));
    }
  }

  // 5. The phase header's progress bar/count — changes on every single
  //    tap, no exceptions.
  updatePhaseHeaderProgress();

  // 6. The footer's primary CTA (enabled state + label) — depends on
  //    overall phase completeness, which any tap can flip either way.
  updatePhaseFooterCta();
}

// Shared by the CURRENT screen only — this file has exactly one phase
// screen mounted at a time, so an unscoped querySelector for these is
// unambiguous. Returns null on non-phase screens (nothing to update).
function currentPhaseProgress() {
  if (inspection.screen === 'phase1') return phase1Progress();
  if (inspection.screen === 'phase2') return phase2Progress();
  if (inspection.screen === 'phase3') return phase3Progress();
  return null;
}

// KEEP IN SYNC WITH renderPhaseHeader ABOVE — same pct/text computation,
// just applied to the already-rendered .progress-bar-fill/.progress-count
// instead of building them fresh.
function updatePhaseHeaderProgress() {
  const progress = currentPhaseProgress();
  if (!progress) return;
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const countEl = document.querySelector('.progress-count');
  if (countEl) countEl.textContent = `${progress.done} of ${progress.total}`;
  const fillEl = document.querySelector('.progress-bar-fill');
  if (fillEl) fillEl.style.width = `${pct}%`;
}

// KEEP IN SYNC WITH updatePhaseFooterCta() BELOW — this is the single
// source of truth for "is this phase's primary CTA enabled, and what does
// it say" so the full-render footer functions (renderPhase1Footer, etc.)
// and the targeted update below can't drift apart on that specific
// question. Each phase's actual onclick behavior stays defined separately
// in its own footer function, since that part never needs a targeted
// update (footers only ever change via a full render triggered by real
// navigation).
function phaseFooterCtaState(screen) {
  if (screen === 'phase1') return { ready: isPhase1Complete(), readyText: 'Proceed to Phase 2' };
  if (screen === 'phase2') return { ready: isPhase2Complete(), readyText: 'Proceed to Phase 3' };
  if (screen === 'phase3') return { ready: isPhase3Complete(), readyText: 'Review & Certify Inspection' };
  return null;
}

function updatePhaseFooterCta() {
  const state = phaseFooterCtaState(inspection.screen);
  if (!state) return;
  const btn = document.querySelector('.sticky-footer .btn-primary');
  if (!btn) return;
  btn.disabled = !state.ready;
  btn.textContent = state.ready ? state.readyText : 'Complete all items to proceed';
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
    // render() itself now always defers to the next frame (see its own
    // comment) — no manual requestAnimationFrame needed here anymore.
    onblur: () => render(),
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

// Plain typed value (mode: 'text') — no OCR, no parsing, just a small text
// field alongside the usual Pass/Fail/N/A toggle. Same shape as
// renderNumericControl's no-threshold branch: the typed value and the
// toggle are two separate facts (what the number is, vs. whether the
// placard itself is legible/present), captured side by side.
function renderTextControl(stationDef, subItemDef, state) {
  const wrap = el('div', { class: 'numeric-control' });

  if (isCertified()) {
    const valueText = state.value !== null && state.value !== undefined && state.value !== '' ? state.value : 'Not recorded';
    wrap.appendChild(el('span', { class: 'numeric-readonly-value', text: valueText }));
    wrap.appendChild(renderReadOnlyStatus(state.status));
    return wrap;
  }

  const inputRow = el('div', { class: 'numeric-input-row' });
  const input = el('input', {
    type: 'text',
    inputmode: 'numeric',
    class: 'numeric-input',
    placeholder: subItemDef.placeholder || 'e.g. 1234567',
    value: state.value === null || state.value === undefined ? '' : state.value,
    oninput: (e) => {
      const raw = e.target.value;
      setSubItemValue(stationDef.id, subItemDef.id, raw === '' ? null : raw);
      // No render() here — same reasoning as the numeric control: re-rendering
      // on every keystroke would steal focus from the input.
    },
    // render() itself now always defers to the next frame — see its comment.
    onblur: () => render(),
  });
  inputRow.appendChild(input);
  wrap.appendChild(inputRow);
  wrap.appendChild(renderToggleControl(stationDef, subItemDef, state));

  return wrap;
}

function renderPhase1Footer() {
  // Once certified, the old bottom bar here was nothing but a "Back to
  // Summary" button — that now lives in the header instead (see
  // renderPhaseHeader/resolveHeaderBackTarget), so there's no footer at all
  // in that state.
  if (isCertified()) return null;
  const footer = el('div', { class: 'sticky-footer' });
  const { ready, readyText } = phaseFooterCtaState('phase1');
  const btn = el('button', {
    class: 'btn btn-primary btn-block btn-large',
    text: ready ? readyText : 'Complete all items to proceed',
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

function renderPhase2Footer() {
  // Back now lives in the header (see renderPhaseHeader) — once certified,
  // that was this footer's only content, so there's nothing left here.
  if (isCertified()) return null;
  const footer = el('div', { class: 'sticky-footer' });
  const { ready, readyText } = phaseFooterCtaState('phase2');
  const btn = el('button', {
    class: 'btn btn-primary btn-block btn-large',
    text: ready ? readyText : 'Complete all items to proceed',
    onclick: () => {
      if (!isPhase2Complete()) return;
      seedDotNumberFromDoorStation();
      inspection.screen = 'phase3';
      saveInspection();
      render();
    },
  });
  btn.disabled = !ready;
  footer.appendChild(btn);
  return footer;
}

function renderPhase3Footer() {
  // Back now lives in the header (see renderPhaseHeader) — once certified,
  // that was this footer's only content, so there's nothing left here.
  if (isCertified()) return null;
  const footer = el('div', { class: 'sticky-footer' });
  const { ready, readyText } = phaseFooterCtaState('phase3');
  const btn = el('button', {
    class: 'btn btn-primary btn-block btn-large',
    text: ready ? readyText : 'Complete all items to proceed',
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
      // Certification and upload happen together — there's no separate
      // "upload later" step, so this fires immediately, right after the
      // record is certified and locked.
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
    text: `${inspection.driverName}${inspection.certifiedAt ? ` — certified ${formatCertifiedAt(inspection.certifiedAt)}` : ''}`,
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

  // THE GAP THIS CLOSES: sw.js's skipWaiting() + clients.claim() make a new
  // service worker take control of this page in the background, but that
  // alone does NOT refresh anything already loaded — this exact page
  // instance keeps running whatever JS/CSS it already fetched under
  // whichever service worker controlled it at load time. Without this
  // listener, anyone who already had an older version installed needs to
  // reload the app TWICE after any deploy to actually see it: once
  // (invisibly, in the background) for the new service worker to finish
  // installing and claim control, and a second time to actually load the
  // new bytes. This has been true of every version bump this app has ever
  // shipped, not just the most recent one — it just happened to surface
  // now. Reloading automatically the instant a new controller takes over
  // closes that gap for good: one visit is enough, from here on.
  // `alreadyReloaded` guards against a theoretical repeat controllerchange
  // firing more than once and reload-looping.
  let alreadyReloadedForNewServiceWorker = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (alreadyReloadedForNewServiceWorker) return;
    alreadyReloadedForNewServiceWorker = true;
    window.location.reload();
  });
}
