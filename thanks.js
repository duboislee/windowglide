import { checkoutConfig as config } from "./checkout-config.js?v=4";
import { readPurchase, requestLicense } from "./purchase-session.js?v=4";

const status = document.getElementById("status");
const help = document.getElementById("purchase-help");
const order = document.getElementById("receipt-order");
const field = document.getElementById("key");
const copy = document.getElementById("copy");
const retry = document.getElementById("retry");
const instructions = document.getElementById("activation-instructions");
let purchase = null;
try { purchase = readPurchase(sessionStorage, config.environment); } catch { /* Storage can be disabled. */ }

function showHelp(text, canRetry = false) {
  status.textContent = text;
  if (purchase) {
    order.textContent = purchase.transactionID;
    order.hidden = false;
  }
  help.hidden = false;
  retry.hidden = !canRetry;
}

async function deliver() {
  if (!purchase) return showHelp("No purchase session was found in this tab.");
  help.hidden = retry.hidden = true;
  status.textContent = "Getting your purchase code…";
  for (let attempt = 0; attempt < 6; attempt++) {
    const result = await requestLicense(config, purchase);
    if (result.state === "ready") {
      field.value = result.license;
      field.hidden = copy.hidden = instructions.hidden = false;
      status.textContent = "Your purchase code:";
      return;
    }
    if (result.state === "unavailable") return showHelp("We couldn’t match this tab to a purchase.");
    if (attempt < 5) await new Promise(resolve => setTimeout(resolve, 2500));
  }
  showHelp("Your license isn’t available yet. Try again or contact support if you have a receipt.", true);
}

retry.addEventListener("click", deliver);
copy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(field.value);
    copy.textContent = "Copied";
  } catch {
    field.focus();
    field.select();
    copy.textContent = "Press ⌘C to copy";
  }
});
if (purchase) deliver();
else showHelp("No purchase session was found in this tab.");
