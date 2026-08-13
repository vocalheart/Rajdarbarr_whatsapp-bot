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
const Customer = require("./models/Customer");
const Message  = require("./models/Message");
const {checkIfUserFollowsUs} = require("../services/instagramFollowService");
// ════════════════════════════════════════════════════════════
//  Helper: Customer ko upsert karo (create ya update)
// ════════════════════════════════════════════════════════════
async function upsertCustomer(phone, { lastMessage, incrementUnread } = {}) {
  const update = {
    lastSeen: new Date(),
  };
  if (lastMessage !== undefined) update.lastMessage = lastMessage;

  const options = { new: true, upsert: true, setDefaultsOnInsert: true };

  const customer = await Customer.findOneAndUpdate(
    { phone },
    {
      $set: update,
      ...(incrementUnread ? { $inc: { unreadCount: 1 } } : {}),
    },
    options
  );
  return customer;
}

// ════════════════════════════════════════════════════════════
//  Helper: Incoming message ko DB me save karo----------------
// ════════════════════════════════════════════════════════════

async function saveIncomingMessage(customer, msg) {
  const type = msg.type;
  let text = null;
  if (type === "text") text = msg.text?.body || null;
  if (type === "interactive") {
    text =
      msg.interactive?.list_reply?.title ||
      msg.interactive?.button_reply?.title ||
      null;
  }

  await Message.create({
    customer: customer._id,
    whatsappMessageId: msg.id,
    direction: "incoming",
    type,
    text,
    status: "received",
    rawPayload: msg,
  });
}

// ════════════════════════════════════════════════════════════
//  Helper: Outgoing message ko DB me save karo
//  (agar aapka SendtoWhatsApp.js WhatsApp API ka response
//   return karta hai to usme se message id mil jayega)
// ════════════════════════════════════════════════════════════
async function saveOutgoingMessage(phone, text, waResponse) {
  try {
    const customer = await upsertCustomer(phone, { lastMessage: text });

    const whatsappMessageId =
      waResponse?.messages?.[0]?.id || waResponse?.data?.messages?.[0]?.id || null;

    await Message.create({
      customer: customer._id,
      whatsappMessageId,
      direction: "outgoing",
      type: "text",
      text,
      status: "sent",
      rawPayload: waResponse || null,
    });
  } catch (err) {
    console.error("⚠️ Outgoing message save failed:", err.message);
  }
}

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

      // ── DB me customer + message save karo (sab types ke liye) ──
      let customer;
      try {
        const preview =
          type === "text"
            ? msg.text?.body
            : type === "interactive"
            ? msg.interactive?.list_reply?.title || msg.interactive?.button_reply?.title
            : `[${type} message]`;

        customer = await upsertCustomer(from, {
          lastMessage: preview,
          incrementUnread: true,
        });
        await saveIncomingMessage(customer, msg);
      } catch (dbErr) {
        console.error("❌ DB save error (incoming):", dbErr.message);
      }

      // ── yahan se apna existing logic chalao ──
      const message  = msg;
      const from_    = msg.from;
      const msgType  = msg.type;

      // WhatsApp template/list messages ka actual body hume nahi milta,
      // isliye har intent ke liye ek readable label bana diya hai
      const OUTGOING_LABELS = {
        welcome: "👋 Welcome message bheja gaya",
        menu: "📋 Food menu bheja gaya",
        veg: "🥦 Veg menu bheja gaya",
        nonveg: "🍗 Non-veg menu bheja gaya",
        location: "📍 Location bheji gayi",
        delivery: "🛵 Home delivery info bheji gayi",
        feedback: "⭐ Feedback form bheja gaya",
        bulk_order: "📦 Bulk order info bheji gayi",
        catering: "🍽️ Catering info bheji gayi",
        main_menu: "📋 Main menu bheja gaya",
      };

      if (msgType === "text") {
        const rawText = message.text?.body?.trim();
        const text = rawText?.toLowerCase();

        if (["hi", "hii", "hello", "helo", "hey", "namaste"].includes(text)) {
          const resp = await sendWelcome(from_);
          await saveOutgoingMessage(from_, OUTGOING_LABELS.welcome, resp);
        } else {
          const replyText =
            '👋 *Rajdarbar Restaurant*\n\nMenu dekhne ke liye *"Hi"* type karein.';
          const resp = await sendText(from_, replyText);
          await saveOutgoingMessage(from_, replyText, resp);
        }
        return;
      }

      if (msgType === "interactive") {
        const iType = message.interactive?.type;
        if (iType === "list_reply") {
          const selectedId = message.interactive.list_reply?.id;
          let resp;
          switch (selectedId) {
            case "menu": resp = await sendFoodMenu(from_); break;
            case "veg": resp = await sendVegMenu(from_); break;
            case "nonveg": resp = await sendNonVegMenu(from_); break;
            case "location": resp = await sendLocation(from_); break;
            case "delivery": resp = await sendHomeDelivery(from_); break;
            case "feedback": resp = await sendFeedback(from_); break;
            case "bulk_order": resp = await sendBulkOrder(from_); break;
            case "catering": resp = await sendCatering(from_); break;
            default: resp = await sendMainMenu(from_);
          }
          await saveOutgoingMessage(
            from_,
            OUTGOING_LABELS[selectedId] || OUTGOING_LABELS.main_menu,
            resp
          );
          return;
        }
        if (iType === "button_reply") {
          const resp = await sendMainMenu(from_);
          await saveOutgoingMessage(from_, OUTGOING_LABELS.main_menu, resp);
          return;
        }
      }

      // location/image/audio/video etc
      const fallbackText =
        '😊 Hum sirf text/menu selections process karte hain.\n\nMenu ke liye *"Hi"* type karein.';
      const resp = await sendText(from_, fallbackText);
      await saveOutgoingMessage(from_, fallbackText, resp);
      return;
    }

    // ── CASE 2: Only a status update (sent/delivered/read) ───────
    if (value?.statuses) {
      const status = value.statuses[0];
      console.log(`ℹ️  STATUS update — to: ${status.recipient_id}, status: ${status.status}`);

      // ── DB me matching outgoing message ka status update karo ──
      try {
        if (status.id) {
          await Message.findOneAndUpdate(
            { whatsappMessageId: status.id },
            { $set: { status: status.status } }
          );
        }
      } catch (dbErr) {
        console.error("❌ DB save error (status):", dbErr.message);
      }
      return;
    }

    // ── CASE 3: Kuch aur (unexpected payload) ────────────────────
    console.log("⚠️ Webhook hit but no messages/statuses found. Raw body:");
    console.log(JSON.stringify(req.body, null, 2));

  } catch (err) {
    console.error("❌ Webhook error:", err);
  }
});

// ════════════════════════════════════════════════════════════
//  Send a reply — POST /api/send/:phone   body: { text: "..." }
// ════════════════════════════════════════════════════════════
router.post("/send/:phone", async (req, res) => {
  try {
    const { phone } = req.params;
    const text = req.body?.text?.trim();

    if (!text) {
      return res.status(400).json({ success: false, error: "Message text zaroori hai" });
    }

    const waResponse = await sendText(phone, text);

    const customer = await upsertCustomer(phone, { lastMessage: text });

    const whatsappMessageId =
      waResponse?.messages?.[0]?.id || waResponse?.data?.messages?.[0]?.id || null;

    const message = await Message.create({
      customer: customer._id,
      whatsappMessageId,
      direction: "outgoing",
      type: "text",
      text,
      status: "sent",
      rawPayload: waResponse || null,
    });

    res.json({ success: true, message, customer });
  } catch (err) {
    console.error("❌ /send error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
//  Chat History APIs
// ════════════════════════════════════════════════════════════

// ── Sab customers ki list, latest chat pehle ──
router.get("/chats", async (req, res) => {
  try {
    const customers = await Customer.find()
      .sort({ lastSeen: -1 })
      .lean();
    res.json({ success: true, count: customers.length, customers });
  } catch (err) {
    console.error("❌ /chats error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Ek specific number ka poora chat history ──
router.get("/chats/:phone", async (req, res) => {
  try {
    const { phone } = req.params;

    const customer = await Customer.findOne({ phone });
    if (!customer) {
      return res.status(404).json({ success: false, error: "Customer not found" });
    }

    const messages = await Message.find({ customer: customer._id })
      .sort({ createdAt: 1 }) // purana pehle, jaise chat me hota hai
      .lean();

    // ── Iss number ka unread count reset kar do (chat khol li) ──
    await Customer.findByIdAndUpdate(customer._id, { $set: { unreadCount: 0 } });

    res.json({
      success: true,
      customer,
      count: messages.length,
      messages,
    });
  } catch (err) {
    console.error("❌ /chats/:phone error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;