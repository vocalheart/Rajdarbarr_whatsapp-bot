const express = require("express");
const axios = require("axios");

const router = express.Router();

router.get("/callback", async (req, res) => {
  try {
    const code = req.query.code;

    console.log("========== INSTAGRAM CALLBACK ==========");
    console.log("AUTH CODE:", code);

    if (!code) {
      return res.status(400).send("Authorization code missing");
    }

    console.log("APP ID:", process.env.IG_APP_ID);
    console.log(
      "APP SECRET:",
      process.env.IG_APP_SECRET?.substring(0, 10) + "..."
    );
    console.log("REDIRECT URI:", process.env.IG_REDIRECT_URI);

    const response = await axios.post(
      "https://graph.facebook.com/v25.0/oauth/access_token",
      null,
      {
        params: {
          client_id: process.env.IG_APP_ID,
          client_secret: process.env.IG_APP_SECRET,
          redirect_uri: process.env.IG_REDIRECT_URI,
          code,
          grant_type: "authorization_code",
        },
      }
    );

    console.log("========== TOKEN RESPONSE ==========");
    console.dir(response.data, { depth: null });

    res.json(response.data);
  } catch (err) {
    console.log("========== TOKEN ERROR ==========");
    console.dir(err.response?.data || err.message, { depth: null });
    res.status(500).json(err.response?.data || { message: err.message });
  }
});

module.exports = router;