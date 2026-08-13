const axios = require("axios");
const { getInstagramToken } = require("./instagramTokenService");

async function checkIfUserFollowsUs(userId) {
  try {
    if (!userId) {
      console.log("[FOLLOW] User ID missing");
      return false;
    }

    const accessToken = await getInstagramToken();

    console.log(
      "[FOLLOW] Checking follower status:",
      userId
    );

    const response = await axios.get(
      `https://graph.instagram.com/v25.0/${userId}`,
      {
        params: {
          fields: "is_user_follow_business",
          access_token: accessToken,
        },
      }
    );

    const follows =
      response.data?.is_user_follow_business === true;

    console.log(
      "[FOLLOW] is_user_follow_business:",
      follows
    );

    return follows;

  } catch (error) {
    console.log("[FOLLOW] Check failed");

    console.dir(
      error.response?.data || error.message,
      {
        depth: null,
      }
    );

    // If Meta doesn't allow profile lookup,
    // safely treat user as not verified.
    return false;
  }
}

module.exports = {
  checkIfUserFollowsUs,
};