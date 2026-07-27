// models/Message.js

const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({

  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Customer"
  },

  whatsappMessageId: String,

  direction: {
    type: String,
    enum: ["incoming", "outgoing"]
  },

  type: String,

  text: String,

  status: {
    type: String,
    default: "received"
  },

  rawPayload: Object

}, {
  timestamps: true
});

module.exports = mongoose.model("Message", messageSchema);