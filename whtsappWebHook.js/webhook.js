const express = require("express");
const router  = express.Router();

const { getSession, updateSession, resetSession } = require("../services/sessionService");
const { createPendingOrder, confirmOrder, failOrder } = require("../services/orderService");
const { createPaymentLink, verifyWebhookSignature }   = require("../services/razorpayService");
const {
  sendMenu, sendWelcome, sendText,
  sendQuantityRequest, sendAddressChoice,
  sendAskAddressText, sendAskLocation,
  sendPaymentLink, sendOrderConfirmation,
} = require("../whatsapp_list/SendtoWhatsApp");

// ════════════════════════════════════════════════════════════
//  WhatsApp Webhook Verification
// ════════════════════════════════════════════════════════════

router.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "rajdarbar_webhook_123";
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ════════════════════════════════════════════════════════════
//  WhatsApp Webhook — Incoming Messages
// ════════════════════════════════════════════════════════════
router.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return;
    const from    = message.from;
    const msgType = message.type;
    console.log(`\n📩 From: ${from} | Type: ${msgType}`);
    const session = await getSession(from);
    console.log(`📌 State: ${session.state}`);
    // ── TEXT ─────────────────────────────────────────────────────────────────
    if (msgType === "text") {
      const rawText = message.text?.body?.trim();
      const text    = rawText?.toLowerCase();
      // Greetings → Welcome + Menu
      if (["hi","hii","hello","helo","hey","namaste"].includes(text)) {
        await resetSession(from);
        await sendWelcome(from);
        await sendMenu(from);
        await updateSession(from, { state: "awaiting_menu_selection" });
        return;
      }

      // Awaiting payment state
      if (session.state === "awaiting_payment") {
        await sendText(from, '⏳ Aapka payment link abhi bhi active hai. Please pehle payment karein.\n\nNaya order karne ke liye *"Hi"* type karein.');
        return;
      }
      // Quantity
      if (session.state === "awaiting_quantity") {
        const qty = parseInt(text);
        if (isNaN(qty) || qty < 1 || qty > 20) {
          await sendText(from, "⚠️ Kripya valid quantity daalen (1 se 20 ke beech):");
          return;
        }
        await updateSession(from, { quantity: qty, state: "awaiting_address_choice" });
        await sendAddressChoice(from);
        return;
      }

      // Address text
      if (session.state === "awaiting_address_text") {
        if (rawText.length < 10) {
          await sendText(from, "⚠️Address thoda detail mein likhein (gali, mohalla, sheher):");
          return;
        }
        await updateSession(from, { address: rawText, state: "awaiting_mobile" });
        await sendAskMobile(from);
        return;
      }

      // Mobile number
      if (session.state === "awaiting_mobile") {
        const mobile = rawText.replace(/\s+/g, "");
        if (!/^[6-9]\d{9}$/.test(mobile)) {
          await sendText(from, "⚠️ Valid 10-digit mobile number daalen (jaise: 9876543210):");
          return;
        };
        await updateSession(from, { mobile, state: "awaiting_payment" });
        await initiatePayment(from, { ...session.toObject(), mobile }, session.quantity, session.address, session.location);
        return;
      }
      // Default
      await sendText(from, '👋 *Rajdarbar Restaurant*\n\n\ Order karne ke liye *"Hi"* type karein.');
    }

    // ── INTERACTIVE (List / Button) ───────────────────────────────────────────
    else if (msgType === "interactive") {
      const iType = message.interactive?.type;

      // Menu item selected
      if (iType === "list_reply") {
        const reply  = message.interactive.list_reply;
        const itemId = reply.id;
        const name   = reply.title;
        const price  = parseFloat(reply.description.replace(/[^\d.]/g, ""));

        await updateSession(from, {
          state: "awaiting_quantity",
          selectedItem: { itemId, name, price },
        });
        await sendQuantityRequest(from, name, price);
        return;
      }

      // Address choice buttons
      if (iType === "button_reply") {
        const btnId = message.interactive.button_reply?.id;
        if (btnId === "address_text") {
          await updateSession(from, { state: "awaiting_address_text" });
          await sendAskAddressText(from);
          return;
        };
        if (btnId === "address_location") {
          await updateSession(from, { state: "awaiting_location" });
          await sendAskLocation(from);
          return;
        }
      }
    }

    // ── LOCATION ─────────────────────────────────────────────────────────────
    else if (msgType === "location") {
      if (session.state === "awaiting_location") {
        const { latitude, longitude, name, address } = message.location;
        const locationLabel = address || name || `${latitude}, ${longitude}`;

        await updateSession(from, {
          address:  locationLabel,
          location: { latitude, longitude },
          state:    "awaiting_mobile",
        });
        await sendAskMobile(from);
        return;
      }
      await sendText(from, '📍 Yeh location is waqt kaam nahi aayega.\n\nOrder ke liye *"Hi"* type karein.');
    }
    // ── IMAGE / AUDIO / VIDEO / etc. ─────────────────────────────────────────
    else {
      await sendText(from, '😊 Hum sirf text orders process karte hain.\n\nOrder karne ke liye *"Hi"* type karein.');
    }
  } catch (err) {
    console.error("❌ Webhook error:", err);
  }
});

// ════════════════════════════════════════════════════════════
//  Razorpay Webhook — Payment Events
// ════════════════════════════════════════════════════════════
router.post("/razorpay-webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const body      = JSON.parse(req.body);

    if (!verifyWebhookSignature(body, signature)) {
      console.warn("⚠️ Invalid Razorpay webhook signature");
      return res.sendStatus(400);
    }

    const event = body.event;
    console.log(`\n💳 Razorpay Event: ${event}`);

    // ── Payment Successful ───────────────────────────────────
    if (event === "payment_link.paid") {
      const payload       = body.payload.payment_link.entity;
      const paymentLinkId = payload.id;
      const paymentId     = body.payload.payment.entity.id;
      const phoneNumber   = payload.notes?.phoneNumber;

      const order = await confirmOrder(paymentLinkId, paymentId);
      if (order && phoneNumber) {
        await sendOrderConfirmation(phoneNumber, order);
        await resetSession(phoneNumber);
        console.log(`✅ Order confirmed: ${order._id}`);
      }
    }

    // ── Payment Expired / Cancelled ──────────────────────────
    if (event === "payment_link.expired" || event === "payment_link.cancelled") {
      const payload       = body.payload.payment_link.entity;
      const paymentLinkId = payload.id;
      const phoneNumber   = payload.notes?.phoneNumber;
      await failOrder(paymentLinkId);
      if (phoneNumber) {
        await sendText(
          phoneNumber,
          `⏰ *Payment link expire ho gaya!*\n\nAapka order cancel ho gaya.\n\nDobara order karne ke liye *"Hi"* type karein.`
        );
        await resetSession(phoneNumber);
        console.log(`❌ Order cancelled (expired): ${paymentLinkId}`);
      }
    }
    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Razorpay webhook error:", err);
    res.sendStatus(500);
  }
});

// ════════════════════════════════════════════════════════════
//  Helpers
// ════════════════════════════════════════════════════════════

// Mobile number maango
async function sendAskMobile(phoneNumber) {
  await sendText(
    phoneNumber,
    "📱 Apna *10-digit mobile number* daalen:\n_(Delivery ke liye contact karne ke liye)_"
  );
}

// Payment initiate karo
async function initiatePayment(phoneNumber, session, quantity, address, location) {
  try {
    const item        = session.selectedItem;
    const totalAmount = item.price * quantity;
    const mobile      = session.mobile;

    console.log(`💳 Payment link bana raha hoon: ₹${totalAmount} for ${item.name} x${quantity}`);

    const paymentLink = await createPaymentLink({
      amount:    totalAmount,
      phoneNumber,
      itemName:  item.name,
      quantity,
    });

    const order = await createPendingOrder({
      phoneNumber,
      item,
      quantity,
      address,
      location,
      mobile,
      paymentLinkId: paymentLink.id,
    });

    console.log(`📝 Pending order created: ${order._id}`);

    await sendPaymentLink(phoneNumber, {
      itemName:    item.name,
      quantity,
      totalAmount,
      mobile,
      paymentUrl:  paymentLink.short_url,
      orderId:     order._id,
    });

    await updateSession(phoneNumber, { state: "awaiting_payment" });
    console.log(`✅ Payment link bheja gaya: ${paymentLink.short_url}`);

  } catch (err) {
    console.error("❌ initiatePayment failed:");
    console.error("  Message:", err.message);
    console.error("  Razorpay error:", JSON.stringify(err?.error || {}, null, 2));
    await resetSession(phoneNumber);
    await sendText(
      phoneNumber,
      `⚠️ Kuch technical problem aai, please thodi der baad dobara try karein.\n\n*"Hi"* type karke order restart karein.`
    );
  }
}

module.exports = router;