async function getFoodMenuList() {
  return {
    messaging_product: "whatsapp",
    type: "interactive",
    interactive: {
      type: "list",
      header: {
        type: "text",
        text: "🍽️ Raj Darbar Menu",
      },
      body: {
        text: "Please select a category 👇",
      },
      footer: {
        text: "Raj Darbar Restaurant",
      },
      action: {
        button: "View Categories",
        sections: [
          {
            title: "Food Categories",
            rows: [
              {
                id: "veg",
                title: "🥗 Pure Veg",
                description: "View Veg Menu",
              },
              {
                id: "nonveg",
                title: "🍗 Non Veg",
                description: "View Non Veg Menu",
              },
            ],
          },
        ],
      },
    },
  };
}

module.exports = { getFoodMenuList };