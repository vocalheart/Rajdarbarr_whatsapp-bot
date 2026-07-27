// models/Customer.js

const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema({
  phone: {
    type: String,
    unique: true,
  },

  name: String,

  lastMessage: String,

  lastSeen: Date,

  unreadCount: {
    type: Number,
    default: 0,
  },
}, { timestamps: true });

module.exports = mongoose.model("Customer", customerSchema);