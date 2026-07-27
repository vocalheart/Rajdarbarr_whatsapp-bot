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
  res.sendStatus(200); // WhatsApp ko turant 200 bhejo, warna retry karega

  try {
    const value = req.body?.entry?.[0]?.changes?.[0]?.value;
    // ── CASE 1: Real customer message ────────────────────────────
    if (value?.messages) {
      const msg  = value.messages[0];
      const from = msg.from;
      const type = msg.type;
      console.log("========================================");
      console.log(`📩 NEW MESSAGE from ${from} | type: ${type}`);
      if (type === "text") {
        console.log(`💬 Text: "${msg.text.body}"`);
      } else {
        console.log(`📦 Full payload:`, JSON.stringify(msg, null, 2));
      }
      console.log("========================================");

      // ── yahan se apna existing logic chalao ──
      const message = msg;
      const from_ = msg.from;
      const msgType = msg.type;

      if (msgType === "text") {
        const rawText = message.text?.body?.trim();
        const text = rawText?.toLowerCase();

        if (["hi", "hii", "hello", "helo", "hey", "namaste"].includes(text)) {
          await sendWelcome(from_);
        } else {
          await sendText(
            from_,
            '👋 *Rajdarbar Restaurant*\n\nMenu dekhne ke liye *"Hi"* type karein.'
          );
        }
        return;
      }

      if (msgType === "interactive") {
        const iType = message.interactive?.type;
        if (iType === "list_reply") {
          const selectedId = message.interactive.list_reply?.id;
          switch (selectedId) {
            case "menu": await sendFoodMenu(from_); break;
            case "veg": await sendVegMenu(from_); break;
            case "nonveg": await sendNonVegMenu(from_); break;
            case "location": await sendLocation(from_); break;
            case "delivery": await sendHomeDelivery(from_); break;
            case "feedback": await sendFeedback(from_); break;
            case "bulk_order": await sendBulkOrder(from_); break;
            case "catering": await sendCatering(from_); break;
            default: await sendMainMenu(from_);
          }
          return;
        }
        if (iType === "button_reply") {
          await sendMainMenu(from_);
          return;
        }
      }

      // location/image/audio/video etc
      await sendText(
        from_,
        '😊 Hum sirf text/menu selections process karte hain.\n\nMenu ke liye *"Hi"* type karein.'
      );
      return;
    }

    // ── CASE 2: Only a status update (sent/delivered/read) ───────
    if (value?.statuses) {
      const status = value.statuses[0];
      console.log(`ℹ️  STATUS update — to: ${status.recipient_id}, status: ${status.status}`);
      return;
    }

    // ── CASE 3: Kuch aur (unexpected payload) ────────────────────
    console.log("⚠️ Webhook hit but no messages/statuses found. Raw body:");
    console.log(JSON.stringify(req.body, null, 2));

  } catch (err) {
    console.error("❌ Webhook error:", err);
  }
});

module.exports = router;