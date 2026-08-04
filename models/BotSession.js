const mongoose = require("mongoose");

// Ye model in-memory `userOrders` object ki jagah leta hai.
// Server restart ho ya PM2 crash ho, session data safe rahega MongoDB me.
const BotSessionSchema = new mongoose.Schema(
  {
    senderId: { type: String, required: true, unique: true, index: true },
    step: {
      type: String,
      enum: ["SELECT_ITEM", "SELECT_QTY", null],
      default: null
    },
    menu: { type: Array, default: [] }, // step = SELECT_ITEM ke waqt menu snapshot
    item: { type: Object, default: null }, // step = SELECT_QTY ke waqt selected item
    lastInteractionAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

// 24 hours me inactive session apne aap clean ho jaayegi (TTL index)
BotSessionSchema.index({ lastInteractionAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });

module.exports = mongoose.model("BotSession", BotSessionSchema);