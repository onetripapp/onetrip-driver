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

// A real truck walk often means patchy signal — with no timeout, a single
// stalled request (fetch has no default one) hangs this forever with the
// UI stuck on "Uploading…" and no error, no retry option, and — since
// photos upload before inspection-data.json — no checklist data ever
// reaching Drive even though every photo already did. 60s is generous for
// the ~1.6MB photos this app produces even on a weak connection, while
// still failing fast enough that "stuck" turns into a visible, retryable
// error instead of an indefinite hang.
const UPLOAD_TIMEOUT_MS = 60 * 1000;

async function uploadFileToBackend(filename, contentBase64, mimeType) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(UPLOAD_FUNCTION_URL, {
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
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Upload of ${filename} timed out — check your connection and try again.`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Upload of ${filename} failed (${res.status}): ${errBody.slice(0, 200)}`);
  }
  return res.json();
}

// Every successful file is recorded immediately (not just at the end) so
// that if a later file in the sequence stalls or fails, hitting Retry
// resumes from where it left off — re-sending everything from scratch
// would duplicate every photo that already made it to Drive.
async function uploadOnce(filename, contentBase64, mimeType) {
  if (inspection.uploadedFiles.includes(filename)) return;
  await uploadFileToBackend(filename, contentBase64, mimeType);
  inspection.uploadedFiles.push(filename);
  saveInspection();
}

async function uploadInspectionToDrive() {
  const allStations = getAllStationsWithZoneContext().map((x) => x.station);
  for (const station of allStations) {
    if (!stationNeedsPhoto(station) || !station.photoFilename) continue;
    if (inspection.uploadedFiles.includes(station.photoFilename)) continue;
    const dataUri = await getPhoto(station.id);
    if (!dataUri) continue; // shouldn't happen — certification already gates on this
    await uploadOnce(station.photoFilename, dataUriToBase64(dataUri), dataUriMimeType(dataUri));
  }

  // The export object itself is always rebuilt fresh (cheap, stateless) so
  // it reflects current data on a retry — only the network call is skipped
  // if it already succeeded, same as the photos above.
  const exportData = buildInspectionExport();
  const jsonBase64 = utf8ToBase64(JSON.stringify(exportData, null, 2));
  await uploadOnce('inspection-data.json', jsonBase64, 'application/json');
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
