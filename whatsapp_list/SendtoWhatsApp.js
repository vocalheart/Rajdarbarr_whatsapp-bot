const axios = require("axios");
const { getWhatsAppList } = require("./WhatsAppList");
const { getFoodMenuList } = require("./getFoodMenuList");

const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

const api = axios.create({
  baseURL: `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}`,
  headers: {
    Authorization: `Bearer ${ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  },
});

// ===================== TEXT MESSAGE =====================
async function sendText(phoneNumber, text) {
  await api.post("/messages", {
    messaging_product: "whatsapp",
    to: phoneNumber,
    type: "text",
    text: {
      body: text,
    },
  });
}

// ===================== MAIN MENU =====================
async function sendMainMenu(phoneNumber) {
  const payload = await getWhatsAppList();
  payload.to = phoneNumber;
  await api.post("/messages", payload);
}

// ===================== FOOD MENU (Veg / Non-Veg categories) ============
async function sendFoodMenu(phoneNumber) {
  const payload = await getFoodMenuList();
  payload.to = phoneNumber;
  await api.post("/messages", payload);
}

// ===================== VEG / NON-VEG ITEM LISTS =====================
// NOTE: Replace the placeholder text below with your real item list
// (or build a proper interactive list like getFoodMenuList once you
// have the item names/prices ready).
async function sendVegMenu(phoneNumber) {
  await sendText(
    phoneNumber,
    "🥗 *Pure Veg Menu*\n\nFull menu abhi humari website par available hai."
  );
  await sendOrderWebsite(phoneNumber);
}

async function sendNonVegMenu(phoneNumber) {
  await sendText(
    phoneNumber,
    "🍗 *Non Veg Menu*\n\nFull menu abhi humari website par available hai."
  );
  await sendOrderWebsite(phoneNumber);
}

// ===================== WELCOME =====================
async function sendWelcome(phoneNumber) {
  await sendText(
    phoneNumber,
    "🙏 *Raj Darbar Restaurant Mein Aapka Swagat Hai!*\n\nPlease choose an option from the menu below."
  );

  await sendMainMenu(phoneNumber);
}

// ===================== CTA URL =====================
async function sendCTA(phoneNumber, message, buttonText, url) {
  await api.post("/messages", {
    messaging_product: "whatsapp",
    to: phoneNumber,
    type: "interactive",
    interactive: {
      type: "cta_url",
      body: {
        text: message,
      },
      action: {
        name: "cta_url",
        parameters: {
          display_text: buttonText,
          url,
        },
      },
    },
  });
}

// ===================== ORDER WEBSITE =====================
async function sendOrderWebsite(phoneNumber) {
  await sendCTA(
    phoneNumber,
    "🍽️ Click below to order online.",
    "Order Now",
    "https://www.rdarbar.com/onlineorder"
  );
}

// ===================== LOCATION =====================
async function sendLocation(phoneNumber) {
  await sendCTA(
    phoneNumber,
    "📍 Click below to open Raj Darbar Restaurant on Google Maps.",
    "Open Location",
    "https://maps.app.goo.gl/haqQ1QHJjMQYFzHFA"
  );
}

// ===================== HOME DELIVERY =====================
async function sendHomeDelivery(phoneNumber) {
  await sendCTA(
    phoneNumber,
    "🏠 Order food online from Raj Darbar Restaurant.",
    "Order Online",
    "https://www.rdarbar.com/onlineorder"
  );
}

// ===================== FEEDBACK =====================
async function sendFeedback(phoneNumber) {
  await sendCTA(
    phoneNumber,
    "⭐ We'd love to hear your feedback!",
    "Give Feedback",
    "https://www.reviewbadhao.com/form/1922158485"
  );
}

// ===================== BULK ORDER =====================
async function sendBulkOrder(phoneNumber) {
  await sendText(
    phoneNumber,
    `📦 *Bulk Order*

👤 Contact Person: Diksha

📱 800289071`
  );
}

// ===================== CATERING =====================
async function sendCatering(phoneNumber) {
  await sendText(
    phoneNumber,
    `🎉 *Catering Services*

Wedding
Birthday Party
Corporate Events
Kitty Party
House Party

👤 Contact Person: Diksha

📱 800289071`
  );
}

module.exports = {
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
};