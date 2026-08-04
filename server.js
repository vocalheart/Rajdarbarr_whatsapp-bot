require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./database/database.js");
const webhookRoutes = require("./whtsappWebHook.js/webhook");
const weebhook = require("./instagramWebHook/weebhook.js");
const router = require("./routes/instagram.js");
const app = express();
const instagramAuth = require("./routes/instagram");

connectDB();

app.use(cors({
  origin: ["http://localhost:3000", "http://localhost:3001", "https://api.ednixa.com", "https://crm-frontend-delta-sandy.vercel.app"],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
}));


app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/", instagramAuth);

app.use((req, res, next) => {
  console.log(`${req.method} ${req.originalUrl}`);
  next();
});

app.get("/", (req, res) => {
  res.send("🍽️ Rajdarbar WhatsApp Bot Running");
});

app.use("/api", webhookRoutes);

// ⭐ INSTAGRAM WEBHOOK ADD
app.use("/api/instagram", weebhook);



app.get('/privacy-policy', (req, res) => {
  res.send(`
    <h1>Privacy Policy</h1>
    <p>A1Meals Ordering Bot collects user messages for order processing only.</p>
    <p>We do not sell or share personal data with third parties.</p>
    <p>Users may request data deletion by contacting support.</p>
  `);
});

app.get('/privacy-policy', (req, res) => {
  res.send(`
    <h1>Privacy Policy</h1>
    <p>A1Meals Ordering Bot collects user messages for order processing only.</p>
    <p>We do not sell or share personal data with third parties.</p>
    <p>Users may request data deletion by contacting support.</p>
  `);
});

app.get('/data-deletion', (req, res) => {
  res.send(`
    <h1>Data Deletion Instructions</h1>
    <p>A1Meals Ordering Bot allows users to request deletion of their personal data.</p>
    <h3>How to Request Deletion</h3>
    <p>Send an email to: ritu09016@gmail.com with the subject "Data Deletion Request".</p>
    <h3>Required Information</h3>
    <p>Please include your Instagram username or phone number associated with your account.</p>
    <h3>Processing Time</h3>
    <p>All valid deletion requests will be processed within 7 business days.</p>
    <h3>Contact</h3>
    <p>Email: ritu09016@gmail.com</p>
  `);
});

app.get("/callback", (req, res) => {
  const { code } = req.query;

  console.log("Authorization Code:", code);

  res.send("Instagram login successful");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});