async function getWhatsAppList() {
  return {
    messaging_product: "whatsapp",
    type: "interactive",
    interactive: {
      type: "list",
      header: {
        type: "text",
        text: "🙏 Raj Darbar Restaurant",
      },
      body: {
        text:
          "🍽️ Raj Darbar Restaurant Mein Aapka Swagat Hai!\n\nPlease choose an option 👇",
      },
      footer: {
        text: "Serving with Love ❤️",
      },
      action: {
        button: "Select Option",
        sections: [
          {
            title: "Restaurant Services",
            rows: [
              {
                id: "menu",
                title: "🍽️ Menu",
                description: "Pure Veg & Non Veg",
              },
              {
                id: "location",
                title: "📍 Location",
                description: "Open Google Maps",
              },
              {
                id: "delivery",
                title: "🏠 Home Delivery",
                description: "Order Online",
              },
              {
                id: "feedback",
                title: "⭐ Feedback",
                description: "Share your experience",
              },
              {
                id: "bulk_order",
                title: "📦 Bulk Order",
                description: "Contact Diksha",
              },
              {
                id: "catering",
                title: "🎉 Catering Services",
                description: "For Parties & Events",
              },
            ],
          },
        ],
      },
    },
  };
}

module.exports = { getWhatsAppList };