const mongoose = require("mongoose");

// Meta (Facebook/Instagram) webhooks retry delivery agar tumhara server
// 200 OK time pe nahi bhejta ya thoda slow respond karta hai.
// Isse same comment/message dobara process ho sakta hai -> duplicate DM.
// Ye model har event ki unique ID store karta hai taaki dobara process na ho.
const ProcessedEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    type: { type: String, enum: ["comment", "message"], required: true },
    createdAt: { type: Date, default: Date.now }
  }
);

// 48 hours baad purana record apne aap delete (TTL index) - collection bloat na ho
ProcessedEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 48 });

module.exports = mongoose.model("ProcessedEvent", ProcessedEventSchema);