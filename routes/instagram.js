const express = require("express");
const router = express.Router();


router.use("/", require("../controllers/instagramAuth.js"));

module.exports = router;
