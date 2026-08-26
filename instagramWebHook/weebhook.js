const router = require("express").Router();
const axios = require("axios");

const ProcessedEvent = require("../models/ProcessedEvent");
const { getInstagramToken } = require("../services/instagramTokenService");
const IG_VERIFY_TOKEN = process.env.IG_VERIFY_TOKEN;
// TODO: apna Instagram business username yaha daal do (Visit profile button ke liye)
const IG_USERNAME = process.env.IG_USERNAME || "rajdarbar_2022";
const {
  checkIfUserFollowsUs,
} = require("../services/instagramFollowService");

// ---------------------------------------------------------
// -----------------------HELPERS---------------------------
// ---------------------------------------------------------

async function sendInstagramMessage(recipientId, messageText) {
  try {
    const accessToken = await getInstagramToken();
    console.log("[IG SEND] Sending message to:", recipientId);

    const response = await axios.post(
      "https://graph.instagram.com/v25.0/me/messages",
      {
        recipient: { id: recipientId },
        message: { text: messageText },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("[SEND OK]", response.data);
    return response.data;
  } catch (error) {
    console.log("[SEND ERROR]");
    console.dir(error.response?.data || error.message, { depth: null });
    throw error;
  }
}

// Button template wala message (max 3 buttons Instagram me allowed hain) — normal DM ke liye (recipient id se)
// buttons: [{ type: "postback", title: "...", payload: "..." }, { type: "web_url", title: "...", url: "..." }]
async function sendButtonMessage(recipientId, text, buttons) {
  try {
    const accessToken = await getInstagramToken();
    console.log("[IG SEND BUTTONS] Sending to:", recipientId, "payload:", buttons.map((b) => b.payload || b.url));

    const response = await axios.post(
      "https://graph.instagram.com/v25.0/me/messages",
      {
        recipient: { id: recipientId },
        message: {
          attachment: {
            type: "template",
            payload: {
              template_type: "button",
              text,
              buttons,
            },
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("[SEND BUTTONS OK]", response.data);
    return response.data;
  } catch (error) {
    console.log("[SEND BUTTONS ERROR]");
    console.dir(error.response?.data || error.message, { depth: null });
    throw error;
  }
}

// Duplicate-webhook-delivery check. Returns true if event already processed.
async function isDuplicateEvent(eventId, type) {
  if (!eventId) return false;
  try {
    await ProcessedEvent.create({ eventId, type });
    return false;
  } catch (err) {
    if (err.code === 11000) {
      return true;
    }
    console.log("[DEDUP ERROR]", err.message);
    return false;
  }
}

async function replyToInstagramComment(commentId, messageText) {
  try {
    const accessToken = await getInstagramToken();
    const response = await axios.post(
      `https://graph.instagram.com/v25.0/${commentId}/replies`,
      { message: messageText },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("[COMMENT REPLY OK]", response.data);
    return response.data;
  } catch (error) {
    console.error("[COMMENT REPLY ERROR]");
    console.dir(error.response?.data || error.message, { depth: null });
    return null;
  }
}

// Private reply to a comment — comment_id ko recipient bana ke DM jaata hai (Meta ka recommended
// comment→DM mechanism). Follower ke liye seedha Inbox, non-follower ke liye Requests me jaata hai.
// Sirf ek private reply per comment, 7 din ke andar allowed hai.
async function sendPrivateCommentReply(commentId, messageText) {
  try {
    const accessToken = await getInstagramToken();
    const response = await axios.post(
      "https://graph.instagram.com/v25.0/me/messages",
      {
        recipient: { comment_id: commentId },
        message: { text: messageText },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("[PRIVATE COMMENT REPLY OK]", response.data);
    return response.data;
  } catch (error) {
    console.error("[PRIVATE COMMENT REPLY ERROR]");
    console.dir(error.response?.data || error.message, { depth: null });
    return null;
  }
}

// Same as sendPrivateCommentReply, but with buttons — comment se seedha button-DM flow shuru karne ke liye
async function sendPrivateCommentButtonMessage(commentId, text, buttons) {
  try {
    const accessToken = await getInstagramToken();
    const response = await axios.post(
      "https://graph.instagram.com/v25.0/me/messages",
      {
        recipient: { comment_id: commentId },
        message: {
          attachment: {
            type: "template",
            payload: {
              template_type: "button",
              text,
              buttons,
            },
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("[PRIVATE COMMENT BUTTON REPLY OK]", response.data);
    return response.data;
  } catch (error) {
    console.error("[PRIVATE COMMENT BUTTON REPLY ERROR]");
    console.dir(error.response?.data || error.message, { depth: null });
    return null;
  }
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
// EXTRACT EVENTS — comments + messages + postbacks (button taps) + WhatsApp-style
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
          eventId: comment?.id,
          senderId: comment?.from?.id,
          message: comment?.text,
        });
        continue;
      }

      const changeMsg = change?.value?.messages?.[0];
      if (changeMsg) {
        results.push({
          kind: "message",
          eventId: changeMsg.id,
          senderId: changeMsg.from,
          message: changeMsg.text?.body,
        });
      }
    }

    // --- Instagram/Messenger "messaging" style: DMs + button taps ---
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

      // Button tap (postback) — jab user "Send me the access" ya "I'm following" tap kare
      if (messaging.postback) {
        results.push({
          kind: "postback",
          eventId: messaging.postback?.mid || `${messaging.sender?.id}-${messaging.timestamp}`,
          senderId: messaging.sender?.id,
          payload: messaging.postback?.payload,
        });
        continue;
      }

      results.push({
        kind: "message",
        eventId: messaging.message?.mid,
        senderId: messaging.sender?.id,
        message: messaging.message?.text,
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

      const { kind, eventId, senderId, message, payload } = data;

      // Postback (button tap) — no message text expected, sirf senderId + payload chahiye
      if (kind === "postback") {
        if (!senderId || !payload) {
          console.log("[SKIPPED] Missing senderId or payload:", data);
          continue;
        }
        const dupe = await isDuplicateEvent(eventId, "postback");
        if (dupe) {
          console.log(`[SKIPPED] Duplicate postback event, id: ${eventId}`);
          continue;
        }
        console.log(`[INPUT] Kind: postback | Sender: ${senderId} | Payload: ${payload}`);
        await handlePostbackEvent(senderId, payload);
        continue;
      }

      if (!senderId || !message) {
        console.log("[SKIPPED] Missing senderId or message text:", data);
        continue;
      }

      const dupe = await isDuplicateEvent(eventId, kind === "comment" ? "comment" : "message");
      if (dupe) {
        console.log(`[SKIPPED] Duplicate ${kind} event, id: ${eventId}`);
        continue;
      }

      const msg = message.toLowerCase().trim();
      console.log(`[INPUT] Kind: ${kind} | Sender: ${senderId} | Message: ${msg}`);

      if (kind === "comment") {
        await handleCommentEvent({ senderId, commentId: eventId, commentText: msg });
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
// MESSAGE TEXT CONSTANTS
// ---------------------------------------------------------

const CONTACT_REQUEST_MESSAGE =
  "Please share your contact details so i can send you our package detail in your WhatsApp";

const WELCOME_MESSAGE = "Hey there! Glad you're here 😊\n\nTap below and I'll send you the access in just a moment ✨";

const ALMOST_THERE_MESSAGE = "Almost there ! Please visit my profile and tap follow to continue 😁";

// Postback payload constants — inhe button templates me use karte hain
const PAYLOAD_SEND_ACCESS = "SEND_ACCESS";
const PAYLOAD_IM_FOLLOWING = "IM_FOLLOWING";

// ---------------------------------------------------------
// COMMENT HANDLER — "price"/"order" keyword par trigger
// Follower → private DM (seedha contact-details message)
// Non-follower → public reply (follow karne ko bole) + private button-DM (welcome + "Send me the access")
//                taaki wo bhi DM flow me enter ho jaaye aur follow karne ke baad access le sake
// ---------------------------------------------------------

async function handleCommentEvent({ senderId, commentId, commentText }) {
  console.log("[COMMENT]", { senderId, commentId, commentText });

  const triggerKeywords = ["price", "order"];
  const shouldTrigger = triggerKeywords.some((keyword) => commentText.includes(keyword));
  if (!shouldTrigger) {
    console.log("[COMMENT] No trigger keyword matched");
    return;
  }

  const follows = await checkIfUserFollowsUs(senderId);
  console.log("[FOLLOW] User follows:", follows);

  if (follows) {
    console.log("[COMMENT] FOLLOWER → PRIVATE DM (contact details)");
    await sendPrivateCommentReply(commentId, CONTACT_REQUEST_MESSAGE);
    return;
  }

  console.log("[COMMENT] NOT FOLLOWER → PUBLIC REPLY + PRIVATE BUTTON-DM");

  // Public comment reply
  await replyToInstagramComment(commentId, "Follow karke dm kare");

  // Private DM bhi jaayega, welcome + "Send me the access" button ke saath
  await sendPrivateCommentButtonMessage(commentId, WELCOME_MESSAGE, [
    { type: "postback", title: "Send me the access", payload: PAYLOAD_SEND_ACCESS },
  ]);
}

// ---------------------------------------------------------
// DM / MESSAGE HANDLER — har naye text DM par welcome + "Send me the access" button
// ---------------------------------------------------------

async function handleUserMessage(senderId, msg) {
  console.log("[DM] Sending welcome + access button to:", senderId);
  await sendButtonMessage(senderId, WELCOME_MESSAGE, [
    { type: "postback", title: "Send me the access", payload: PAYLOAD_SEND_ACCESS },
  ]);
}

// ---------------------------------------------------------
// POSTBACK HANDLER — button taps ("Send me the access" / "I'm following")
// Follower (already ya recheck pe confirm) → seedha DM me contact-details message
// Non-follower → "Almost there..." + "I'm following" / "Visit profile" buttons repeat
// ---------------------------------------------------------

async function handlePostbackEvent(senderId, payload) {
  console.log("[POSTBACK]", { senderId, payload });

  if (payload === PAYLOAD_SEND_ACCESS || payload === PAYLOAD_IM_FOLLOWING) {
    const follows = await checkIfUserFollowsUs(senderId);
    console.log("[FOLLOW] User follows:", follows);

    if (follows) {
      console.log("[POSTBACK] FOLLOWER → CONTACT MESSAGE (DM)");
      await sendInstagramMessage(senderId, CONTACT_REQUEST_MESSAGE);
      return;
    }

    console.log("[POSTBACK] NOT FOLLOWER → ALMOST THERE (repeat)");
    await sendButtonMessage(senderId, ALMOST_THERE_MESSAGE, [
      { type: "postback", title: "I'm following", payload: PAYLOAD_IM_FOLLOWING },
      { type: "web_url", title: "Visit profile", url: `https://instagram.com/${IG_USERNAME}` },
    ]);
    return;
  }

  console.log("[POSTBACK] Unknown payload, ignoring:", payload);
}

module.exports = router;