const express = require("express");
const axios = require("axios");

const router = express.Router();

router.get("/callback", async (req, res) => {
    try {

        const code = req.query.code;

        console.log("AUTH CODE:");
        console.log(code);

        if (!code) {
            return res.status(400).send("Authorization code missing");
        }

        const tokenResponse = await axios.post(
            "https://graph.facebook.com/v25.0/oauth/access_token",
            null,
            {
                params: {
                    client_id: process.env.IG_APP_ID,
                    client_secret: process.env.IG_APP_SECRET,
                    redirect_uri: process.env.IG_REDIRECT_URI,
                    code
                }
            }
        );

        console.log(tokenResponse.data);

        res.json(tokenResponse.data);

    } catch (err) {

        console.log(err.response?.data || err.message);

        res.status(500).json(err.response?.data || err.message);

    }

});

module.exports = router;