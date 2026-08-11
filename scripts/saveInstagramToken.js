require("dotenv").config();

const mongoose = require("mongoose");
const axios = require("axios");

const InstagramToken = require("../models/InstagramToken");

async function saveToken() {
  try {
    await mongoose.connect(
      process.env.MONGODB_URL
    );

    console.log(
      "MongoDB connected"
    );

    const accessToken =
      process.env.IG_ACCESS_TOKEN;

    if (!accessToken) {
      throw new Error(
        "IG_ACCESS_TOKEN missing in .env"
      );
    }

    // Get Instagram account information
    const response = await axios.get(
      "https://graph.instagram.com/v25.0/me",
      {
        params: {
          fields: "id,username",
          access_token: accessToken,
        },
      }
    );

    const user = response.data;

    console.log(
      "Instagram:",
      user
    );

    // Dashboard generated token is long-lived.
    // Store approximately 60 days initially.
    const expiresAt = new Date(
      Date.now() +
        60 * 24 * 60 * 60 * 1000
    );

    await InstagramToken.findOneAndUpdate(
      {
        instagramUserId: user.id,
      },
      {
        instagramUserId: user.id,
        username: user.username,
        accessToken,
        expiresAt,
        tokenType: "bearer",
        lastRefreshedAt: new Date(),
      },
      {
        upsert: true,
        new: true,
      }
    );
    console.log("Instagram token saved successfully");
    process.exit(0);
  } catch (error) {
    console.error("SAVE TOKEN ERROR:");
    console.dir(error.response?.data ||error.message,{ depth: null });
    process.exit(1);
  }
}

saveToken();