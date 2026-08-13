require("dotenv").config();

const mongoose = require("mongoose");

const connectDB = require("../database/database");
const InstagramToken = require("../models/InstagramToken");

const {refreshInstagramToken,} = require("../services/instagramTokenService");
async function test() {
  try {
    await connectDB();
    const tokenData = await InstagramToken.findOne().sort({createdAt: -1});
    if (!tokenData) {throw new Error("Instagram token not found")};
    console.log("Instagram:", tokenData.username);
    console.log("Old expiry:",tokenData.expiresAt);
    await refreshInstagramToken(tokenData);
    console.log("Refresh test successful");
    process.exit(0);
  } catch (error) {console.error("Refresh test failed:",error.message);
    process.exit(1);
  }
}
test();