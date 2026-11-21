const purchaseKey = "windowglide.checkout.completed.v1";
const transactionIDPattern = /^txn_[a-z0-9]{26}$/;
const claimTokenPattern = /^[A-Za-z0-9_-]{43}$/;
const expectedPriceID = /^pri_[a-z0-9]{26}$/;

export function checkoutAvailable(config) {
  const prefix = config.environment === "sandbox" ? "test_" : config.environment === "production" ? "live_" : null;
  return config.enabled === true && prefix !== null &&
    typeof config.clientToken === "string" && config.clientToken.startsWith(prefix) && config.clientToken.length > prefix.length &&
    expectedPriceID.test(config.priceID) && licenseEndpoint(config.licenseService) !== null &&
    (config.environment === "sandbox" || validDownloadURL(config.downloadURL) !== null);
}

export function validDownloadURL(value) {
  try {
    const url = new URL(value);
    return url.origin === "https://github.com" && !url.username && !url.password &&
      !url.search && !url.hash && /^\/duboislee\/windowglide\/releases\/download\/[^/]+\/[^/]+\.dmg$/.test(url.pathname)
      ? url.href : null;
  } catch { return null; }
}

function licenseEndpoint(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      url.pathname === "/" && !url.search && !url.hash ? `${url.origin}/license` : null;
  } catch { return null; }
}

export async function newClaim() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...bytes)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const digest = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
  return { token, digest };
}

export function canStorePurchase(storage) {
  const probeKey = `${purchaseKey}.probe`;
  try {
    storage.setItem(probeKey, "1");
    const matches = storage.getItem(probeKey) === "1";
    storage.removeItem(probeKey);
    return matches;
  } catch { return false; }
}

const validTransaction = (value) => typeof value === "string" && transactionIDPattern.test(value);
const validToken = (value) => typeof value === "string" && claimTokenPattern.test(value);

export function savePurchase(storage, environment, transactionID, claimToken) {
  if (!validTransaction(transactionID) || !validToken(claimToken)) return false;
  try {
    storage.setItem(purchaseKey, JSON.stringify({ environment, transactionID, claimToken }));
    return true;
  } catch { return false; }
}

export function readPurchase(storage, environment) {
  try {
    const value = JSON.parse(storage.getItem(purchaseKey));
    if (value?.environment !== environment || !validTransaction(value.transactionID) ||
        !validToken(value.claimToken)) return null;
    return { transactionID: value.transactionID, claimToken: value.claimToken };
  } catch { return null; }
}

export async function requestLicense(config, purchase, fetchFn = fetch) {
  const endpoint = licenseEndpoint(config.licenseService);
  if (!endpoint || !purchase || !validTransaction(purchase.transactionID) ||
      !validToken(purchase.claimToken)) return { state: "unavailable" };
  try {
    const response = await fetchFn(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" },
      cache: "no-store", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ transactionID: purchase.transactionID, claimToken: purchase.claimToken }),
    });
    if (response.status === 409) return { state: "pending" };
    if (response.status === 429 || response.status >= 500) return { state: "retry" };
    if (!response.ok) return { state: "unavailable" };
    const value = await response.json();
    if (typeof value?.license !== "string" || !/^WG2-[A-Za-z0-9_-]{1,768}\.[A-Za-z0-9_-]{86}$/.test(value.license)) return { state: "unavailable" };
    return { state: "ready", license: value.license };
  } catch { return { state: "retry" }; }
}
