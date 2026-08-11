const mongoose = require("mongoose");

const instagramTokenSchema = new mongoose.Schema(
  {
    instagramUserId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    username: {
      type: String,
    },

    accessToken: {
      type: String,
      required: true,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    tokenType: {
      type: String,
      default: "bearer",
    },

    lastRefreshedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "InstagramToken",
  instagramTokenSchema
);