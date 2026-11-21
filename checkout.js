import { checkoutConfig as config } from "./checkout-config.js?v=4";
import { canStorePurchase, checkoutAvailable, newClaim, savePurchase, validDownloadURL } from "./purchase-session.js?v=4";

const download = document.getElementById("download");
const downloadURL = validDownloadURL(config.downloadURL);
if (download && downloadURL) {
  download.href = downloadURL;
  download.removeAttribute("aria-disabled");
}

const buy = document.getElementById("buy");
const status = document.getElementById("buy-status");
const message = (text) => { if (status) status.textContent = text; };

if (buy && checkoutAvailable(config)) {
  const script = document.createElement("script");
  script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
  script.onerror = () => message("Checkout could not load. Please try again later.");
  script.onload = () => {
    const paddle = globalThis.Paddle;
    if (!paddle) return message("Checkout could not load. Please try again later.");
    let claim = null;
    let opening = false;
    let leaving = false;
    try {
      if (config.environment === "sandbox") paddle.Environment.set("sandbox");
      paddle.Initialize({
        token: config.clientToken,
        eventCallback: (event) => {
          if (event.name === "checkout.completed" && claim && !leaving) {
            if (!savePurchase(sessionStorage, config.environment, event.data?.transaction_id, claim.token)) {
              message("If you were charged, save the receipt and contact support for your key.");
              return;
            }
            leaving = true;
            try { paddle.Checkout.close(); } finally { location.assign("thanks.html"); }
          } else if (event.name === "checkout.closed" && !leaving) {
            opening = false;
            claim = null;
            buy.disabled = false;
          }
        },
      });
    } catch { return message("Checkout could not load. Please try again later."); }

    buy.disabled = false;
    message(config.environment === "sandbox" ? "Test checkout only. No real charge." : "");
    buy.addEventListener("click", async () => {
      if (opening || claim || leaving) return;
      opening = true;
      buy.disabled = true;
      try {
        if (!canStorePurchase(sessionStorage)) throw new Error("no session storage");
        claim = await newClaim();
        paddle.Checkout.open({ items: [{ priceId: config.priceID, quantity: 1 }],
          customData: { windowglide_claim: claim.digest } });
      } catch {
        message("Checkout could not open. Allow session storage and try again, or contact support.");
        claim = null;
        buy.disabled = false;
      } finally { opening = false; }
    });
  };
  document.head.appendChild(script);
}
