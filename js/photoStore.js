// OneTrip photo store — station photos live in IndexedDB, not localStorage.
// localStorage caps out around 5-10MB per origin, which a full inspection's
// worth of real camera photos (23+ station photos, not 1x1 test pixels)
// can realistically hit. IndexedDB's quota is typically hundreds of MB to
// GB, so photos live here; the lightweight inspection state (statuses,
// values, truck info) stays in localStorage via state.js.

const PHOTO_DB_NAME = 'onetrip-photos';
const PHOTO_DB_VERSION = 1;
const PHOTO_STORE_NAME = 'photos';

let photoDbPromise = null;

function openPhotoDB() {
  if (photoDbPromise) return photoDbPromise;
  photoDbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(PHOTO_DB_NAME, PHOTO_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PHOTO_STORE_NAME)) {
        db.createObjectStore(PHOTO_STORE_NAME, { keyPath: 'stationId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  // A rejected promise is still truthy, so without this the guard above
  // would permanently latch onto one failed open attempt (a transient
  // permission hiccup, say) and every photo action for the rest of the
  // page session would immediately re-fail with the same stale error.
  // Clearing the cache on failure lets the next call retry from scratch.
  photoDbPromise.catch(() => {
    photoDbPromise = null;
  });
  return photoDbPromise;
}

async function savePhoto(stationId, dataUri) {
  const db = await openPhotoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE_NAME, 'readwrite');
    tx.objectStore(PHOTO_STORE_NAME).put({ stationId, dataUri, savedAt: new Date().toISOString() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getPhoto(stationId) {
  const db = await openPhotoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE_NAME, 'readonly');
    const req = tx.objectStore(PHOTO_STORE_NAME).get(stationId);
    req.onsuccess = () => resolve(req.result ? req.result.dataUri : null);
    req.onerror = () => reject(req.error);
  });
}

async function clearAllPhotos() {
  const db = await openPhotoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE_NAME, 'readwrite');
    tx.objectStore(PHOTO_STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
