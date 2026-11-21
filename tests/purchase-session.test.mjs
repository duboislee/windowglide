import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { checkoutConfig } from "../checkout-config.js";
import { canStorePurchase, checkoutAvailable, newClaim, readPurchase, requestLicense, savePurchase, validDownloadURL } from "../purchase-session.js";

const transactionID = `txn_${"a".repeat(26)}`;
const license = `WG2-abc.${"z".repeat(86)}`;
const sandbox = { enabled: true, environment: "sandbox", clientToken: "test_example",
  priceID: `pri_${"b".repeat(26)}`, licenseService: "https://license.test", downloadURL: "" };
const downloadURL = "https://github.com/duboislee/windowglide/releases/download/v1.1.0/WindowGlide-1.1.0.dmg";

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key) };
}

test("incomplete or mismatched config cannot enable checkout", () => {
  assert.equal(checkoutAvailable(checkoutConfig), false);
  for (const incomplete of [ {enabled: false}, {licenseService: ""}, {licenseService: "http://license.test"},
    {licenseService: "https://license.test/a"}, {licenseService: "https://private:secret@license.test"},
    {clientToken: "live_example"}, {priceID: "pri_"}, {environment: "other"} ])
    assert.equal(checkoutAvailable({...sandbox, ...incomplete}), false);
  assert.equal(checkoutAvailable(sandbox), true);
  assert.equal(checkoutAvailable({...sandbox, environment: "production", clientToken: "live_example"}), false);
  assert.equal(checkoutAvailable({...sandbox, environment: "production", clientToken: "live_example", downloadURL}), true);
});

test("download URL points to an exact DMG asset in the intended repository", () => {
  assert.equal(validDownloadURL(downloadURL), downloadURL);
  for (const value of ["https://github.com/duboislee/windowglide/releases/latest",
    "https://github.com/other/windowglide/releases/download/v1.1.0/WindowGlide.dmg",
    "https://github.com.evil.test/duboislee/windowglide/releases/download/v1/WindowGlide.dmg", "javascript:alert(0)"])
    assert.equal(validDownloadURL(value), null);
});

test("claim is random and its digest is based on the exact token", async () => {
  const first = await newClaim();
  assert.equal(Buffer.from(first.token, "base64url").length, 32);
  assert.equal(first.digest, createHash("sha256").update(first.token).digest("hex"));
  assert.notEqual(first.token, (await newClaim()).token);
});

test("only the owning session may recover a purchase and environments are isolated", async () => {
  const tab = storage();
  const claim = await newClaim();
  assert.equal(canStorePurchase(tab), true);
  assert.equal(canStorePurchase({setItem() {throw Error();}}), false);
  assert.equal(savePurchase(tab, "sandbox", transactionID, claim.token), true);
  assert.deepEqual(readPurchase(tab, "sandbox"), {transactionID, claimToken: claim.token});
  assert.equal(readPurchase(tab, "production"), null);
  assert.equal(readPurchase(storage(), "sandbox"), null);
  assert.equal(savePurchase(tab, "sandbox", [transactionID], claim.token), false);
  assert.equal(savePurchase(tab, "sandbox", transactionID, "x"), false);
});

test("license is requested via POST with no purchase data in URL", async () => {
  const {token: claimToken} = await newClaim();
  const checkout = {transactionID, claimToken};
  const result = await requestLicense(sandbox, checkout, async (url, options) => {
    assert.equal(url, "https://license.test/license");
    assert.equal(options.method, "POST");
    assert.equal(options.referrerPolicy, "no-referrer");
    assert.equal(options.cache, "no-store");
    assert.deepEqual(JSON.parse(options.body), checkout);
    return Response.json({ license });
  });
  assert.deepEqual(result, {state: "ready", license});
});

test("pending and temporary errors can retry; wrong claim or malformed license cannot", async () => {
  const {token: claimToken} = await newClaim();
  const checkout = {transactionID, claimToken};
  for (const [code, state] of [[403, "unavailable"], [409, "pending"], [429, "retry"], [503, "retry"]]) {
    assert.deepEqual(await requestLicense(sandbox, checkout, async () => new Response(null, {status: code})), {state});
  }
  assert.deepEqual(await requestLicense(sandbox, checkout, async () => Response.json({license: [license]})), {state: "unavailable"});
  for (const prefix of ["WG1-", "WG2A-"]) {
    assert.deepEqual(await requestLicense(sandbox, checkout, async () => Response.json({license: license.replace("WG2-", prefix)})), {state: "unavailable"});
  }
  assert.deepEqual(await requestLicense(sandbox, null, () => assert.fail("must not request without a session")), {state: "unavailable"});
});
