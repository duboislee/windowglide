// Paddle checkout for the Buy button. Fill in the three values below; until then the button stays disabled.
const PADDLE = {
  licenseService: "",                // https://windowglide-license.<account>.workers.dev
  environment: "sandbox",            // "production" after launch
  clientToken: "",                   // Paddle > Developer tools > Authentication > client-side token
  priceID: "",                       // pri_... for WindowGlide
};

(function () {
  const buy = document.getElementById("buy");
  if (!buy || !PADDLE.clientToken || !PADDLE.priceID) return;
  const script = document.createElement("script");
  script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
  script.onload = () => {
    if (PADDLE.environment === "sandbox") Paddle.Environment.set("sandbox");
    Paddle.Initialize({
      token: PADDLE.clientToken,
      eventCallback: (event) => {
        if (event.name === "checkout.completed") {
          Paddle.Checkout.close();
          location.href = "thanks.html?txn=" + encodeURIComponent(event.data.transaction_id);
        }
      },
    });
    buy.removeAttribute("aria-disabled");
    buy.href = "#buy";
    buy.addEventListener("click", (event) => {
      event.preventDefault();
      Paddle.Checkout.open({ items: [{ priceId: PADDLE.priceID, quantity: 1 }] });
    });
  };
  document.head.appendChild(script);
})();
