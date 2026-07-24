const express = require("express");
const router  = express.Router();

const {
  sendText,
  sendWelcome,
  sendMainMenu,
  sendFoodMenu,
  sendVegMenu,
  sendNonVegMenu,
  sendOrderWebsite,
  sendLocation,
  sendHomeDelivery,
  sendFeedback,
  sendBulkOrder,
  sendCatering,
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
  console.log("========== NEW WEBHOOK ==========");
  console.log(JSON.stringify(req.body, null, 2));
  res.sendStatus(200);

  try {
    const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return;

    const from    = message.from;
    const msgType = message.type;
    console.log(`\n📩 From: ${from} | Type: ${msgType}`);

    // ── TEXT ─────────────────────────────────────────────────────────────
    if (msgType === "text") {
      const rawText = message.text?.body?.trim();
      const text    = rawText?.toLowerCase();

      // Greetings → Welcome + Main Menu
      if (["hi", "hii", "hello", "helo", "hey", "namaste"].includes(text)) {
        await sendWelcome(from);
        return;
      }

      // Anything else → nudge back to main menu
      await sendText(
        from,
        '👋 *Rajdarbar Restaurant*\n\nMenu dekhne ke liye *"Hi"* type karein.'
      );
      return;
    }

    // ── INTERACTIVE (List / Button) ────────────────────────────────────────
    if (msgType === "interactive") {
      const iType = message.interactive?.type;

      if (iType === "list_reply") {
        const selectedId = message.interactive.list_reply?.id;

        switch (selectedId) {
          case "menu":
            await sendFoodMenu(from);
            break;
          case "veg":
            await sendVegMenu(from);
            break;
          case "nonveg":
            await sendNonVegMenu(from);
            break;
          case "location":
            await sendLocation(from);
            break;
          case "delivery":
            await sendHomeDelivery(from);
            break;
          case "feedback":
            await sendFeedback(from);
            break;
          case "bulk_order":
            await sendBulkOrder(from);
            break;
          case "catering":
            await sendCatering(from);
            break;
          default:
            await sendMainMenu(from);
        }
        return;
      }

      if (iType === "button_reply") {
        // Reserved for future button-based flows (e.g. CTA replies).
        await sendMainMenu(from);
        return;
      }
    }

    // ── LOCATION / IMAGE / AUDIO / VIDEO / etc. ─────────────────────────────
    else {
      await sendText(
        from,
        '😊 Hum sirf text/menu selections process karte hain.\n\nMenu ke liye *"Hi"* type karein.'
      );
    }
  } catch (err) {
    console.error("❌ Webhook error:", err);
  }
});

module.exports = router;