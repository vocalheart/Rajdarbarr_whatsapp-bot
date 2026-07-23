const axios = require("axios");
const { getWhatsAppList } = require("./WhatsAppList");

const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const ACCESS_TOKEN    = process.env.ACCESS_TOKEN;

console.log("PHONE_NUMBER_ID:", process.env.PHONE_NUMBER_ID);
console.log("TOKEN EXISTS:", !!process.env.ACCESS_TOKEN);
console.log("TOKEN START:", process.env.ACCESS_TOKEN?.substring(0, 20));

const api = axios.create({
  baseURL: `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}`,
  headers: {
    Authorization: `Bearer ${ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  },
});

// ─── Plain Text ───────────────────────────────────────────────────────────────
async function sendText(phoneNumber, text) {
  await api.post("/messages", {
    messaging_product: "whatsapp",
    to: phoneNumber,
    type: "text",
    text: { body: text },
  });
}

// ─── Menu List ────────────────────────────────────────────────────────────────
async function sendMenu(phoneNumber) {
  const payload = await getWhatsAppList();
  payload.to = phoneNumber;
  await api.post("/messages", payload);
}

// ─── Welcome ──────────────────────────────────────────────────────────────────
async function sendWelcome(phoneNumber) {
  await sendText(
    phoneNumber,
    "🙏 *Rajdarbar Restaurant mein aapka swagat hai!*\n\nHamara menu dekhne ke liye neeche *View Menu* button dabayein."
  );
}

// ─── Quantity maango ──────────────────────────────────────────────────────────
async function sendQuantityRequest(phoneNumber, itemName, price) {
  await sendText(
    phoneNumber,
    `✅ *${itemName}* select kiya! (₹${price} each)\n\nKitni quantity chahiye? Sirf number type karein (jaise: 1, 2, 3...)`
  );
}

// ─── Address choice buttons ───────────────────────────────────────────────────
async function sendAddressChoice(phoneNumber) {
  await api.post("/messages", {
    messaging_product: "whatsapp",
    to: phoneNumber,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: "📍 *Delivery address kaise dena chahoge?*" },
      action: {
        buttons: [
          { type: "reply", reply: { id: "address_text",     title: "✍️ Type karke"   } },
          { type: "reply", reply: { id: "address_location", title: "📌 Location Pin" } },
        ],
      },
    },
  });
}

// ─── Address text maango ──────────────────────────────────────────────────────
async function sendAskAddressText(phoneNumber) {
  await sendText(phoneNumber, "✍️ Apna *poora delivery address* type karein:\n\n_(Gali, Mohalla, Landmark, Sheher)_");
}

// ─── Location pin maango ──────────────────────────────────────────────────────
async function sendAskLocation(phoneNumber) {
  await sendText(phoneNumber, "📌 WhatsApp mein *paperclip (📎) icon* dabayein → *Location* → *Send Your Current Location* share karein.");
}

// ─── Payment Link bhejo ───────────────────────────────────────────────────────
async function sendPaymentLink(phoneNumber, { itemName, quantity, totalAmount, mobile, paymentUrl, orderId }) {
  await sendText(
    phoneNumber,
    `🧾 *Order Summary*\n\n` +
    `🍽️ Item: *${itemName}*\n` +
    `🔢 Quantity: *${quantity}*\n` +
    `📱 Mobile: *${mobile}*\n` +
    `💰 Total: *₹${totalAmount}*\n\n` +
    `💳 Payment karne ke liye neeche diye link pe click karein:\n` +
    `👉 ${paymentUrl}\n\n` +
    `⚠️ Yeh link *20 minutes* mein expire ho jayega.\n` +
    `_Order ID: ${orderId}_`
  );
}

// ─── Order Confirmed + Feedback Button (payment ke baad) ─────────────────────
async function sendOrderConfirmation(phoneNumber, order) {
  const item = order.items[0];

  // Step 1: Confirmation message
  await sendText(
    phoneNumber,
    `🎉 *Congratulations! Your Order is Successful!*\n\n` +
    `📦 Item: *${item.name}*\n` +
    `🔢 Quantity: *${item.quantity}*\n` +
    `💰 Total Paid: *₹${order.totalAmount}*\n` +
    `📍 Address: ${order.address}\n` +
    (order.mobile ? `📱 Mobile: ${order.mobile}\n` : "") +
    `\n⏱️ Aapka order *30-45 minutes* mein deliver ho jayega.\n` +
    `🆔 Order ID: \`${order._id}\`\n\n` +
    `_Rajdarbar Restaurant – Swad jo dil ko chhu jaye 🍽️_`
  );

  // Step 2: Feedback button (CTA button message)
  await api.post("/messages", {
    messaging_product: "whatsapp",
    to: phoneNumber,
    type: "interactive",
    interactive: {
      type: "cta_url",
      body: {
        text: "⭐ Aapka experience kaisa raha? Humein apna feedback zaroor dein!",
      },
      action: {
        name: "cta_url",
        parameters: {
          display_text: "📝 Feedback Dein",
          url: "https://www.reviewbadhao.com/form/1922158485",
        },
      },
    },
  });
}

module.exports = {
  sendText,
  sendMenu,
  sendWelcome,
  sendQuantityRequest,
  sendAddressChoice,
  sendAskAddressText,
  sendAskLocation,
  sendPaymentLink,
  sendOrderConfirmation,
};