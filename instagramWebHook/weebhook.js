const router = require("express").Router();
const axios = require("axios");

const BotSession = require("../models/BotSession");
const ProcessedEvent = require("../models/ProcessedEvent");
const {getInstagramToken} = require("../services/instagramTokenService");
const IG_VERIFY_TOKEN = process.env.IG_VERIFY_TOKEN;

// ---------------------------------------------------------
// HELPERS
// ---------------------------------------------------------

// ⚠️ Abhi ke liye hardcoded menu. Baad me isse apni DB/API se replace kar dena
// (return shape same rakha hai: { data: [ {name, price}, ... ] }) taaki baaki code na tootey.
async function getMenu() {
  return {
    data: [
      { name: "Paneer Butter Masala", price: 220 },
      { name: "Dal Makhani", price: 180 },
      { name: "Veg Biryani", price: 200 },
      { name: "Butter Naan", price: 40 },
      { name: "Tandoori Roti", price: 20 }
    ]
  };
};

function formatMenu(menuData) {
  const items = menuData.data || [];
  let text = "🍽️ Rajdarbar Restaurant Menu\n\n";
  items.forEach((item, index) => {
    text += `${index + 1}. ${item.name} — ₹${item.price}\n`;
  });
  text += "\nReply with item number to order 😊";
  return text;
}
async function sendInstagramMessage(recipientId, messageText) {
  try {
    // Get valid token from MongoDB
    // Automatically refreshes if token is near expiry
    const accessToken = await getInstagramToken();

    console.log(
      "[IG SEND] Sending message to:",
      recipientId
    );

    const response = await axios.post(
      "https://graph.instagram.com/v25.0/me/messages",
      {
        recipient: {
          id: recipientId,
        },

        message: {
          text: messageText,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(
      "[SEND OK]",
      response.data
    );

    return response.data;

  } catch (error) {
    console.log(
      "[SEND ERROR]"
    );

    console.dir(
      error.response?.data ||
        error.message,
      {
        depth: null,
      }
    );

    throw error;
  }
}

// Duplicate-webhook-delivery check. Returns true if event already processed.
async function isDuplicateEvent(eventId, type) {
  if (!eventId) return false; // agar ID hi nahi mili to skip nahi karenge, process hone denge
  try {
    await ProcessedEvent.create({ eventId, type });
    return false; // create() succeed hua matlab pehli baar hai
  } catch (err) {
    if (err.code === 11000) {
      // duplicate key error -> ye event pehle bhi aa chuka hai
      return true;
    }
    console.log("[DEDUP ERROR]", err.message);
    return false; // DB issue ho to bhi block mat karo, process hone do
  }
}

// ---------------------------------------------------------
// SESSION HELPERS (MongoDB-backed, replaces old in-memory userOrders)
// ---------------------------------------------------------

async function getSession(senderId) {
  return BotSession.findOne({ senderId });
}

async function setSession(senderId, data) {
  return BotSession.findOneAndUpdate(
    { senderId },
    { ...data, senderId, lastInteractionAt: new Date() },
    { upsert: true, new: true }
  );
}

async function clearSession(senderId) {
  return BotSession.deleteOne({ senderId });
}

// ---------------------------------------------------------
// WEBHOOK VERIFY (GET) — unchanged
// ---------------------------------------------------------

router.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("[VERIFY] mode:", mode, "token match:", token === IG_VERIFY_TOKEN);

  if (mode === "subscribe" && token === IG_VERIFY_TOKEN) {
    console.log("[VERIFY] WEBHOOK VERIFIED");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// ---------------------------------------------------------
// EXTRACT EVENTS — ab comments + messages + WhatsApp-style dono handle karta hai
// ---------------------------------------------------------

function extractEvents(body) {
  const results = [];
  const entries = body?.entry || [];

  for (const entry of entries) {
    // --- Instagram "changes" style: comments AND messages fields ---
    const changes = entry.changes || [];
    for (const change of changes) {
      if (change.field === "comments") {
        const comment = change.value;
        results.push({
          kind: "comment",
          eventId: comment?.id, // comment id, dedup ke liye
          senderId: comment?.from?.id,
          message: comment?.text
        });
        continue;
      }

      // WhatsApp Cloud API style (agar same webhook WhatsApp ke liye bhi use ho raha hai)
      const changeMsg = change?.value?.messages?.[0];
      if (changeMsg) {
        results.push({
          kind: "message",
          eventId: changeMsg.id,
          senderId: changeMsg.from,
          message: changeMsg.text?.body
        });
      }
    }

    // --- Instagram/Messenger "messaging" style: DMs ---
    const messagingArr = entry.messaging || [];
    for (const messaging of messagingArr) {
      if (messaging.read) {
        results.push({ ignoreReason: "READ_EVENT" });
        continue;
      }
      if (messaging.message_edit) {
        results.push({ ignoreReason: "MESSAGE_EDIT", raw: messaging.message_edit });
        continue;
      }
      if (messaging.reaction) {
        results.push({ ignoreReason: "REACTION_EVENT" });
        continue;
      }
      if (messaging.message?.is_echo) {
        results.push({ ignoreReason: "ECHO_EVENT (sent by page itself)" });
        continue;
      }

      results.push({
        kind: "message",
        eventId: messaging.message?.mid,
        senderId: messaging.sender?.id,
        message: messaging.message?.text
      });
    }
  }
  return results;
}

// ---------------------------------------------------------
// RECEIVE EVENTS (POST)
// ---------------------------------------------------------

router.post("/webhook", async (req, res) => {
  try {
    console.log("========== WEBHOOK RECEIVED ==========");
    console.dir(req.body, { depth: null });

    const events = extractEvents(req.body);
    console.log(`[PARSE] Found ${events.length} event(s) in this payload`);

    if (events.length === 0) {
      console.log("[PARSE] No events found at all — check payload shape above");
      return res.sendStatus(200);
    }
    for (const [i, data] of events.entries()) {
      console.log(`--- Event ${i + 1}/${events.length} ---`);
      if (data.ignoreReason) {
        console.log(`[IGNORED] Reason: ${data.ignoreReason}`);
        continue;
      }
      const { kind, eventId, senderId, message } = data;
      if (!senderId || !message) {
        console.log("[SKIPPED] Missing senderId or message text:", data);
        continue;
      }
      // Duplicate delivery check
      const dupe = await isDuplicateEvent(eventId, kind === "comment" ? "comment" : "message");
      if (dupe) {
        console.log(`[SKIPPED] Duplicate ${kind} event, id: ${eventId}`);
        continue;
      }
      const msg = message.toLowerCase().trim();
      console.log(`[INPUT] Kind: ${kind} | Sender: ${senderId} | Message: ${msg}`);
      if (kind === "comment") {
        await handleCommentEvent(senderId, msg);
      } else {
        await handleUserMessage(senderId, msg);
      }
    }

    return res.sendStatus(200);
  } catch (error) {
    console.log("[WEBHOOK ERROR]");
    console.dir(error, { depth: null });
    return res.sendStatus(500);
  }
});

// ---------------------------------------------------------
// COMMENT HANDLER — comment aane par DM trigger
// ---------------------------------------------------------

async function handleCommentEvent(senderId, commentText) {
  console.log("[COMMENT] From:", senderId, "| Text:", commentText);

  // Optional: sirf specific keyword wale comments par hi DM bhejo
  // (agar har comment par bhejna hai to ye check hata do)
  const triggerKeywords = ["menu", "order", "price"];
  const shouldTrigger = triggerKeywords.some((kw) => commentText.includes(kw));

  if (!shouldTrigger) {
    console.log("[COMMENT] No trigger keyword matched, skipping DM");
    return;
  }

  await sendInstagramMessage(
    senderId,
    `🙏 Thanks for your comment!\n\nType:\nMENU → View Menu\nHELP → Customer Support`
  );
}

// ---------------------------------------------------------
// DM / MESSAGE HANDLER — same flow as before, ab MongoDB session ke saath
// ---------------------------------------------------------

const WELCOME_MESSAGE = `🙏 Welcome to Rajdarbar Restaurant\n\nType:\nMENU → View Menu\nHELP → Customer Support`;

async function handleUserMessage(senderId, msg) {
  // Menu
  if (msg === "menu") {
    console.log("[STATE] Menu requested");
    const menu = await getMenu();
    const menuText = formatMenu(menu);

    await setSession(senderId, { step: "SELECT_ITEM", menu: menu.data, item: null });

    await sendInstagramMessage(senderId, menuText);
    return;
  }
  const session = await getSession(senderId);
  // Select item
  if (session?.step === "SELECT_ITEM") {
    console.log("[STATE] Awaiting item selection");
    const selectedIndex = Number(msg) - 1;
    const menu = session.menu;

    if (selectedIndex >= 0 && selectedIndex < menu.length) {
      const item = menu[selectedIndex];

      await setSession(senderId, { step: "SELECT_QTY", item, menu: [] });

      await sendInstagramMessage(
        senderId,
        `You selected ${item.name} (₹${item.price})\n\nEnter quantity:`
      );
    } else {
      await sendInstagramMessage(senderId, "Invalid item number.");
    }
    return;
  }

  // Quantity
  if (session?.step === "SELECT_QTY") {
    console.log("[STATE] Awaiting quantity");
    const qty = Number(msg);

    if (!qty || qty <= 0) {
      await sendInstagramMessage(senderId, "Please enter valid quantity");
      return;
    }

    const item = session.item;
    const total = qty * item.price;
    await clearSession(senderId);

    await sendInstagramMessage(
      senderId,
      `✅ Order Confirmed\n\nItem: ${item.name}\nQty: ${qty}\nTotal: ₹${total}\n\nOur team will contact you soon.`
    );
    return;
  }

  // Fallback — "hi", "hello", ya koi bhi unrecognized text/command yahan aayega
  console.log("[STATE] No matching state, sending welcome message");
  await sendInstagramMessage(senderId, WELCOME_MESSAGE);
}

module.exports = router;