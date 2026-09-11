// OneTrip — shared access gate.
//
// One shared passcode for the whole crew, not per-driver accounts — the
// point is to stop someone who stumbles on the public URL from opening the
// app and submitting fake inspections into the real Drive folder, not to
// distinguish who's who. This is a speed bump, not real security: there's
// no backend to check against, so anything running client-side in a public
// repo can eventually be read by anyone who looks. Comparing against a
// hash instead of a plaintext constant just means the code isn't sitting
// in the page source in cleartext for a casual glance — it doesn't make a
// short passcode uncrackable to someone who actually tries.
const ACCESS_KEY = 'onetrip-gate-unlocked-v1';

// SHA-256 of the shared passcode, hex-encoded. To rotate the code later,
// open this app in a browser, open the console, and run:
//   await generateGateHash('the new passcode')
// then paste the printed value in here.
const GATE_HASH = '41c991eb6a66242c0454191244278183ce58cf4a6bcd372f799e4b9cc01886af';

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function isGateUnlocked() {
  return localStorage.getItem(ACCESS_KEY) === 'true';
}

async function tryUnlockGate(candidate) {
  const hash = await sha256Hex((candidate || '').trim());
  if (hash === GATE_HASH) {
    localStorage.setItem(ACCESS_KEY, 'true');
    return true;
  }
  return false;
}

// ---------- Dev tooling — not called by the app ----------
//
// Console helper for producing GATE_HASH's value from a new passcode
// without hand-computing SHA-256 by hand. Run it yourself in the browser
// console when rotating the passcode; nothing in the app calls this.
async function generateGateHash(code) {
  const hash = await sha256Hex(code);
  console.log(hash);
  return hash;
}
