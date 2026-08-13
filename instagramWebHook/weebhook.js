const router = require("express").Router();
const axios = require("axios");

const ProcessedEvent = require("../models/ProcessedEvent");
const {getInstagramToken} = require("../services/instagramTokenService");
const IG_VERIFY_TOKEN = process.env.IG_VERIFY_TOKEN;
const {
  checkIfUserFollowsUs,
} = require("../services/instagramFollowService");
// ---------------------------------------------------------
// -----------------------HELPERS---------------------------
// ---------------------------------------------------------

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

async function replyToInstagramComment(
  commentId,
  messageText
) {
  try {
    const accessToken = await getInstagramToken();

    const response = await axios.post(
      `https://graph.instagram.com/v25.0/${commentId}/replies`,
      {
        message: messageText,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("[COMMENT REPLY OK]",
      response.data
    );
    return response.data;
  } catch (error) {
    console.error("[COMMENT REPLY ERROR]");
    console.dir(error.response?.data ||error.message,{depth: null});
    return null;
  }
}

// Private reply to a comment — uses comment_id as recipient (Meta's recommended
// mechanism for comment→DM). Lands in the commenter's Inbox if they follow you,
// or in Requests if they don't. Limited to one private reply per comment within 7 days.
async function sendPrivateCommentReply(
  commentId,
  messageText
) {
  try {
    const accessToken =
      await getInstagramToken();

    const response = await axios.post(
      "https://graph.instagram.com/v25.0/me/messages",
      {
        recipient: {
          comment_id: commentId,
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
      "[PRIVATE COMMENT REPLY OK]",
      response.data
    );

    return response.data;

  } catch (error) {
    console.error(
      "[PRIVATE COMMENT REPLY ERROR]"
    );

    console.dir(
      error.response?.data ||
        error.message,
      {
        depth: null,
      }
    );

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
        await handleCommentEvent({
          senderId,
          commentId: eventId,
          commentText: msg,
        });
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
// COMMENT HANDLER — comment aane par: follower ho to private (comment-id) DM,
// warna public comment reply "Follow karke dm kare"
// ---------------------------------------------------------

async function handleCommentEvent({
  senderId,
  commentId,
  commentText,
}) {
  console.log(
    "[COMMENT]",
    {
      senderId,
      commentId,
      commentText,
    }
  );

  // Only these keywords trigger automation
  const triggerKeywords = ["price", "order"];

  const shouldTrigger = triggerKeywords.some((keyword) =>
    commentText.includes(keyword)
  );

  if (!shouldTrigger) {
    console.log("[COMMENT] No trigger keyword matched");
    return;
  }

  // Check whether commenter follows Rajdarbar
  const follows = await checkIfUserFollowsUs(senderId);

  console.log("[FOLLOW] User follows:", follows);

  // =====================================
  // FOLLOWER → PRIVATE REPLY (comment_id based)
  // =====================================

  if (follows) {
    console.log("[COMMENT] FOLLOWER → PRIVATE DM");

    await sendPrivateCommentReply(
      commentId,
      "Please share your contact details so i can send you our package detail in your WhatsApp"
    );

    return;
  }

  // =====================================
  // NOT VERIFIED FOLLOWER → PUBLIC AUTO REPLY
  // =====================================

  console.log("[COMMENT] NOT FOLLOWER → PUBLIC REPLY");

  await replyToInstagramComment(
    commentId,
    "Follow karke dm kare"
  );
}

// ---------------------------------------------------------
// DM / MESSAGE HANDLER — menu/order flow completely removed.
// Ab har DM ("hi", "hello", ya kuch bhi) par sirf ye ek hi reply jaata hai.
// ---------------------------------------------------------

const CONTACT_REQUEST_MESSAGE =
  "Please share your contact details so i can send you our package detail in your WhatsApp";

async function handleUserMessage(senderId, msg) {
  console.log("[DM] Sending WhatsApp-contact request message to:", senderId);
  await sendInstagramMessage(senderId, CONTACT_REQUEST_MESSAGE);
}

module.exports = router;