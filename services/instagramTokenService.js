const axios = require("axios");
const InstagramToken = require("../models/InstagramToken");

const REFRESH_BEFORE_DAYS = 7;

async function getInstagramToken() {
  const tokenData = await InstagramToken.findOne().sort({
    createdAt: -1,
  });

  if (!tokenData) {
    console.log("[IG TOKEN] No token document found in DB");
    throw new Error(
      "Instagram access token not found in database"
    );
  }

  if (!tokenData.accessToken) {
    throw new Error(
      "Instagram access token is missing in database"
    );
  }

  if (!tokenData.expiresAt) {
    throw new Error(
      "Instagram token expiry date is missing"
    );
  }

  console.log(
    "[IG TOKEN] Found token | expiresAt:",
    tokenData.expiresAt
  );

  const now = Date.now();

  const refreshTime =
    tokenData.expiresAt.getTime() -
    REFRESH_BEFORE_DAYS *
      24 *
      60 *
      60 *
      1000;

  // Token is valid and has more than 7 days remaining
  if (now < refreshTime) {
    console.log(
      "[IG TOKEN] Token still valid"
    );

    return tokenData.accessToken;
  }

  // Token is near expiry
  console.log(
    "[IG TOKEN] Token is near expiry. Refreshing..."
  );

  return await refreshInstagramToken(
    tokenData
  );
}


async function refreshInstagramToken(tokenData) {
  try {
    console.log(
      "[IG TOKEN] Refreshing Instagram token..."
    );

    const response = await axios.get(
      "https://graph.instagram.com/refresh_access_token",
      {
        params: {
          grant_type: "ig_refresh_token",
          access_token: tokenData.accessToken,
        },
      }
    );

    const data = response.data;

    console.log(
      "[IG TOKEN] Refresh response received"
    );

    if (!data.access_token) {
      throw new Error(
        "Instagram refresh response does not contain access_token"
      );
    }

    if (!data.expires_in) {
      throw new Error(
        "Instagram refresh response does not contain expires_in"
      );
    }

    const expiresIn =
      Number(data.expires_in);

    const expiresAt = new Date(
      Date.now() + expiresIn * 1000
    );

    // Update MongoDB
    tokenData.accessToken =
      data.access_token;

    tokenData.tokenType =
      data.token_type || "bearer";

    tokenData.expiresAt =
      expiresAt;

    tokenData.lastRefreshedAt =
      new Date();

    await tokenData.save();

    console.log(
      "[IG TOKEN] Token refreshed successfully"
    );

    console.log(
      "[IG TOKEN] New expiry:",
      expiresAt.toISOString()
    );

    return data.access_token;

  } catch (error) {
    console.error(
      "[IG TOKEN] Refresh failed"
    );

    console.dir(
      error.response?.data ||
        error.message,
      {
        depth: null,
      }
    );

    throw error;
  }
}


module.exports = {
  getInstagramToken,
  refreshInstagramToken,
};