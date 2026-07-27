const router = require("express").Router();
const axios = require("axios");

const IG_VERIFY_TOKEN = process.env.IG_VERIFY_TOKEN;
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;


console.log("IG_ACCESS_TOKEN length:", process.env.IG_ACCESS_TOKEN?.length);
console.log("IG_VERIFY_TOKEN length:", process.env.IG_VERIFY_TOKEN?.length);
console.log(
  "TOKEN START:",
  process.env.IG_ACCESS_TOKEN?.slice(0, 15)
);
console.log(
  "TOKEN END:",
  process.env.IG_ACCESS_TOKEN?.slice(-15)
);
const userOrders = {};

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
    const response = await axios.post(
      "https://graph.facebook.com/v25.0/me/messages",
      {
        recipient: { id: recipientId },
        message: { text: messageText }
      },
      {
        params: { access_token: IG_ACCESS_TOKEN },
        headers: { "Content-Type": "application/json" }
      }
    );
    console.log("[SEND OK]", response.data);
  } catch (error) {
    console.log("[SEND ERROR]");
    console.dir(error.response?.data || error.message, { depth: null });
  }
}

// WEBHOOK VERIFY
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

/**
 * Pull EVERY messaging event out of the payload, not just index 0.
 * Returns an array of normalized {senderId, message, ignoreReason} objects.
 */
function extractMessages(body) {
  const results = [];
  const entries = body?.entry || [];

  for (const entry of entries) {
    // Instagram / Messenger style
    const messagingArr = entry.messaging || [];
    for (const messaging of messagingArr) {
      if (messaging.read) {
        results.push({ ignoreReason: "READ_EVENT" });
        continue;
      }
      if (messaging.message_edit) {
        results.push({
          ignoreReason: "MESSAGE_EDIT",
          raw: messaging.message_edit
        });
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
        senderId: messaging.sender?.id,
        message: messaging.message?.text
      });
    }

    // WhatsApp style changes payload
    const changeMsg = entry?.changes?.[0]?.value?.messages?.[0];
    if (changeMsg) {
      results.push({
        senderId: changeMsg.from,
        message: changeMsg.text?.body
      });
    }
  }

  return results;
}

// RECEIVE EVENTS
router.post("/webhook", async (req, res) => {
  try {
    console.log("========== WEBHOOK RECEIVED ==========");
    console.dir(req.body, { depth: null });

    const events = extractMessages(req.body);
    console.log(`[PARSE] Found ${events.length} messaging event(s) in this payload`);

    if (events.length === 0) {
      console.log("[PARSE] No messaging events found at all — check payload shape above");
      return res.sendStatus(200);
    }

    for (const [i, data] of events.entries()) {
      console.log(`--- Event ${i + 1}/${events.length} ---`);

      if (data.ignoreReason) {
        console.log(`[IGNORED] Reason: ${data.ignoreReason}`);
        if (data.ignoreReason === "MESSAGE_EDIT") {
          console.log(
            "[NOTE] Instagram reported this as an EDIT of a previous message, not a new send. " +
            "If the user is typing a fresh message and it keeps showing up as message_edit, " +
            "ask them to send a brand-new message instead of re-sending/editing the same text, " +
            "or test from a different IG account/conversation."
          );
        }
        continue;
      }

      const { senderId, message } = data;

      if (!senderId || !message) {
        console.log("[SKIPPED] Missing senderId or message text:", data);
        continue;
      }

      const msg = message.toLowerCase().trim();
      console.log("[INPUT] Sender:", senderId, "| Message:", msg);

      await handleUserMessage(senderId, msg);
    }

    return res.sendStatus(200);
  } catch (error) {
    console.log("[WEBHOOK ERROR]");
    console.dir(error, { depth: null });
    return res.sendStatus(500);
  }
});

async function handleUserMessage(senderId, msg) {
  // Greeting
  if (["hi", "hello", "hey"].includes(msg)) {
    console.log("[STATE] Greeting matched");
    await sendInstagramMessage(
      senderId,
      `🙏 Welcome to Rajdarbar Restaurant

Type:
MENU → View Menu
HELP → Customer Support`
    );
    return;
  }

  // Menu
  if (msg === "menu") {
    console.log("[STATE] Menu requested");
    const menu = await getMenu();
    const menuText = formatMenu(menu);

    userOrders[senderId] = {
      step: "SELECT_ITEM",
      menu: menu.data
    };

    await sendInstagramMessage(senderId, menuText);
    return;
  }

  // Select item
  if (userOrders[senderId]?.step === "SELECT_ITEM") {
    console.log("[STATE] Awaiting item selection");
    const selectedIndex = Number(msg) - 1;
    const menu = userOrders[senderId].menu;

    if (selectedIndex >= 0 && selectedIndex < menu.length) {
      const item = menu[selectedIndex];

      userOrders[senderId] = { step: "SELECT_QTY", item };

      await sendInstagramMessage(
        senderId,
        `You selected ${item.name} (₹${item.price})

Enter quantity:`
      );
    } else {
      await sendInstagramMessage(senderId, "Invalid item number.");
    }
    return;
  }

  // Quantity
  if (userOrders[senderId]?.step === "SELECT_QTY") {
    console.log("[STATE] Awaiting quantity");
    const qty = Number(msg);

    if (!qty || qty <= 0) {
      await sendInstagramMessage(senderId, "Please enter valid quantity");
      return;
    }

    const item = userOrders[senderId].item;
    const total = qty * item.price;
    delete userOrders[senderId];

    await sendInstagramMessage(
      senderId,
      `✅ Order Confirmed

Item: ${item.name}
Qty: ${qty}
Total: ₹${total}

Our team will contact you soon.`
    );
    return;
  }

  // Fallback
  console.log("[STATE] No matching state, sending fallback");
  await sendInstagramMessage(senderId, "Unknown command. Type MENU");
}

module.exports = router;