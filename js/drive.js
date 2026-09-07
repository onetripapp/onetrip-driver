// OneTrip — Google Drive upload, via a backend Cloud Function.
//
// The app never talks to Google Drive or Google OAuth directly, and the
// driver never sees a Google sign-in prompt. Every upload is a plain POST
// to a Cloud Function that holds a Drive credential controlled by OneTrip,
// so every submission lands in the same OneTrip-controlled Drive
// regardless of which device or which person is running the app.
//
// This replaces an earlier version that used per-driver OAuth (Google
// Identity Services) — that let whichever Google account the driver
// happened to be signed into become the upload destination, which was
// never the intent once real testing started.

const UPLOAD_FUNCTION_URL = 'https://uploadinspectionfile-106361031303.us-central1.run.app';

// Not a real secret — anything shipped in a public static site's JS is
// readable by anyone who looks at it. This is a soft speed bump against
// casual abuse of the endpoint, rotatable independently of the far more
// sensitive Drive credentials that live only on the backend. Real
// per-caller authorization arrives later with the fleet-Workspace-
// authenticated driver model.
const APP_SHARED_SECRET = 'd3da2f7ffbd25aec0f057a9e0b1e1df7d015d864bc4ffac4ebd4b5f677ee2cce';

function dataUriToBase64(dataUri) {
  return dataUri.slice(dataUri.indexOf(',') + 1);
}

function dataUriMimeType(dataUri) {
  const match = dataUri.slice(0, dataUri.indexOf(',')).match(/data:(.*?);base64/);
  return match ? match[1] : 'application/octet-stream';
}

// Correctly base64-encodes a UTF-8 string (btoa alone mangles anything
// outside Latin-1, which matters for driver names with accented characters).
function utf8ToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

async function uploadFileToBackend(filename, contentBase64, mimeType) {
  const res = await fetch(UPLOAD_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-App-Secret': APP_SHARED_SECRET,
    },
    body: JSON.stringify({
      truckNumber: inspection.truckNumber.trim(),
      driverName: inspection.driverName.trim(),
      date: inspection.date,
      filename,
      contentBase64,
      mimeType,
    }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Upload of ${filename} failed (${res.status}): ${errBody.slice(0, 200)}`);
  }
  return res.json();
}

async function uploadInspectionToDrive() {
  const allStations = getAllStationsWithZoneContext().map((x) => x.station);
  for (const station of allStations) {
    if (!stationNeedsPhoto(station) || !station.photoFilename) continue;
    const dataUri = await getPhoto(station.id);
    if (!dataUri) continue; // shouldn't happen — certification already gates on this
    await uploadFileToBackend(station.photoFilename, dataUriToBase64(dataUri), dataUriMimeType(dataUri));
  }

  const exportData = buildInspectionExport();
  const jsonBase64 = utf8ToBase64(JSON.stringify(exportData, null, 2));
  await uploadFileToBackend('inspection-data.json', jsonBase64, 'application/json');
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
