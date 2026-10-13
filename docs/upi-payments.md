# UPI payments

The website opens Razorpay Standard Checkout over the booking page. Its display configuration includes one UPI block and disables default payment blocks, so cards, wallets, net banking, EMI and pay-later options are not offered by this checkout.

On mobile, the customer may switch to a UPI app to approve payment and return to the website. On desktop, the customer scans the checkout QR code using a UPI app. Available flows depend on Razorpay, the merchant account and browser/device. The website never asks for a UPI PIN. Manual UPI ID collection is not implemented.

## Account setup and acceptance

1. Activate UPI for the merchant account in Razorpay. For an account-wide UPI-only restriction, disable other payment methods in the Razorpay Dashboard as well; the website's display configuration controls this checkout's UI.
2. Configure matching `RAZORPAY_KEY_ID` and `NEXT_PUBLIC_RAZORPAY_KEY_ID`, plus `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` through local/deployment environment settings. Use test-mode credentials on staging. Do not put secrets in browser code or chat.
3. Complete the other required live-mode settings in `.env.example` and [deployment instructions](deployment.md), including Supabase and the authenticated maintenance endpoint. Subscribe Razorpay webhooks to the existing `/api/webhooks/razorpay` endpoint as documented there.
4. Verify UPI-only checkout on desktop and mobile, payment success/pending/failure, interrupted return, duplicate webhook delivery, and cancellation/refund. Confirm stored order, amount, currency and captured status before a booking becomes confirmed; a client callback alone is not confirmation.

Demo mode remains explicitly simulated and charges nothing. A UPI-only configuration test does not establish live transaction, QR, app-handoff or refund success. Account setup and staging payment verification remain outstanding until credentials are configured.

## Provider references

- [Razorpay checkout configuration](https://github.com/razorpay/markdown-docs/blob/master/payments/payment-gateway/web-integration/standard/configure-payment-methods/understand-configuration.md)
- [Razorpay UPI flows and Collect migration](https://github.com/razorpay/markdown-docs/blob/master/payments/payment-methods/upi.md)
