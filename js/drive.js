// OneTrip — Google Drive upload.
//
// Pure client-side OAuth via Google Identity Services (no backend): the
// access token lives only in memory (never persisted to localStorage) and
// is short-lived (~1hr) with no silent refresh, so a driver re-authenticates
// roughly once per session. That's an accepted tradeoff for keeping this a
// static PWA with no server. Scope is drive.file — the app can only see/
// touch files and folders it creates itself, not the driver's whole Drive.
//
// Folder convention (fixed, matches the schema's photoFilename fields):
//   Trucks/[TruckNumber]/[YYYY-MM]/[YYYY-MM-DD]_[DriverName]/
//     01a-driver-engine-bay.jpg ... 12-cab-equipment-docs.jpg
//     inspection-data.json

const DRIVE_CLIENT_ID = '106361031303-a6k1h3mm7ua2iq1mhqg8j5l7bkqsjbgi.apps.googleusercontent.com';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

let tokenClient = null;
let accessToken = null;
let tokenExpiresAt = 0;

function initTokenClient() {
  if (tokenClient) return;
  if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
    throw new Error('Google Sign-In script has not loaded yet. Check your connection and try again.');
  }
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: DRIVE_CLIENT_ID,
    scope: DRIVE_SCOPE,
    callback: () => {}, // overwritten per-request in requestAccessToken()
  });
}

const AUTH_TIMEOUT_MS = 45 * 1000;

// Must be called from as close to a real user gesture (the Certify button
// click) as possible — browsers can block the consent popup otherwise.
//
// A blocked popup is a real field scenario, not just a test-environment
// quirk: mobile browsers and in-app/PWA webviews block popups aggressively.
// When that happens, GIS doesn't reliably invoke the callback with an error
// at all — confirmed directly while testing this, where a blocked popup
// left the returned promise pending forever with no rejection. Without a
// timeout, that hangs the upload in "Uploading…" indefinitely with no way
// to recover short of reloading the page. The race below guarantees this
// always settles one way or another.
function requestAccessToken() {
  initTokenClient();
  const authPromise = new Promise((resolve, reject) => {
    tokenClient.callback = (resp) => {
      if (resp.error) {
        reject(new Error(`Google sign-in failed: ${resp.error}`));
        return;
      }
      accessToken = resp.access_token;
      tokenExpiresAt = Date.now() + resp.expires_in * 1000;
      resolve(accessToken);
    };
    tokenClient.requestAccessToken({ prompt: accessToken ? '' : 'consent' });
  });

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error('Google sign-in didn’t complete in time (the popup may have been blocked). Check that popups are allowed for this site and try again.'));
    }, AUTH_TIMEOUT_MS);
  });

  return Promise.race([authPromise, timeoutPromise]);
}

async function getAccessToken() {
  const oneMinute = 60 * 1000;
  if (accessToken && Date.now() < tokenExpiresAt - oneMinute) return accessToken;
  return requestAccessToken();
}

async function driveFetch(url, options = {}) {
  const token = await getAccessToken();
  const res = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Drive API error ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

function escapeDriveQueryValue(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function findOrCreateFolder(name, parentId) {
  const parentClause = parentId ? `'${parentId}' in parents` : `'root' in parents`;
  const q = encodeURIComponent(
    `name = '${escapeDriveQueryValue(name)}' and mimeType = 'application/vnd.google-apps.folder' and ${parentClause} and trashed = false`
  );
  const listRes = await driveFetch(`${DRIVE_API}/files?q=${q}&fields=files(id,name)&spaces=drive`);
  if (listRes.files && listRes.files.length > 0) return listRes.files[0].id;

  const createRes = await driveFetch(`${DRIVE_API}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
    }),
  });
  return createRes.id;
}

async function ensureFolderPath(pathSegments) {
  let parentId = null;
  for (const segment of pathSegments) {
    parentId = await findOrCreateFolder(segment, parentId);
  }
  return parentId;
}

function dataUriToBlob(dataUri) {
  const commaIdx = dataUri.indexOf(',');
  const header = dataUri.slice(0, commaIdx);
  const base64 = dataUri.slice(commaIdx + 1);
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// Multipart upload built as Blob parts so binary photo data never has to
// round-trip through a JS string (which would risk corrupting the bytes).
async function uploadFile(filename, blob, parentId) {
  const token = await getAccessToken();
  const boundary = 'onetrip-' + Math.random().toString(36).slice(2);
  const metadata = { name: filename, parents: [parentId] };

  const metadataPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
  const contentHeader = `--${boundary}\r\nContent-Type: ${blob.type || 'application/octet-stream'}\r\n\r\n`;
  const closing = `\r\n--${boundary}--`;

  const body = new Blob([metadataPart, contentHeader, blob, closing]);

  const res = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Upload of ${filename} failed (${res.status}): ${errText.slice(0, 200)}`);
  }
  return res.json();
}

function driveYearMonth(dateStr) {
  return dateStr.slice(0, 7); // 'YYYY-MM-DD' -> 'YYYY-MM'
}

async function uploadInspectionToDrive() {
  const pathSegments = [
    'Trucks',
    inspection.truckNumber.trim(),
    driveYearMonth(inspection.date),
    `${inspection.date}_${inspection.driverName.trim()}`,
  ];
  const folderId = await ensureFolderPath(pathSegments);

  const allStations = getAllStationsWithZoneContext().map((x) => x.station);
  for (const station of allStations) {
    if (!stationNeedsPhoto(station) || !station.photoFilename) continue;
    const dataUri = await getPhoto(station.id);
    if (!dataUri) continue; // shouldn't happen — certification already gates on this
    const blob = dataUriToBlob(dataUri);
    await uploadFile(station.photoFilename, blob, folderId);
  }

  const exportData = buildInspectionExport();
  const jsonBlob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  await uploadFile('inspection-data.json', jsonBlob, folderId);
}

async function startUpload() {
  setUploadStatus('uploading');
  render();
  try {
    await uploadInspectionToDrive();
    setUploadStatus('uploaded', { uploadedAt: new Date().toISOString(), uploadError: null });
  } catch (err) {
    console.error('Drive upload failed', err);
    setUploadStatus('error', { uploadError: err.message || String(err) });
  }
  render();
}
