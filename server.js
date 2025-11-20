import express from "express";
import cors from "cors";
import multer from "multer";
import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// 🔧 LOG STARTOWY
console.log("🔧 FRONTEND_URL:", process.env.FRONTEND_URL);
console.log("🔧 EMAIL_USER:", process.env.EMAIL_USER);
console.log("🔧 EMAIL_TO:", process.env.EMAIL_TO);

// --- CORS (dokładny origin) ---
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // np. Postman

      if (origin === process.env.FRONTEND_URL) return callback(null, true);

      console.log("❌ Odrzucono CORS z origin:", origin);
      return callback(new Error("CORS blocked"), false);
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

// --- Multer: RAM, limit 10 MB na plik ---
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

// --- PING ---
app.get("/", (_, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// --- KONFIGURACJA GMAIL API ---
const oAuth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  "https://developers.google.com/oauthplayground"
);

oAuth2Client.setCredentials({
  refresh_token: process.env.GMAIL_REFRESH_TOKEN,
});

// Funkcja wysyłki maila
async function sendMail({ to, subject, html, attachments }) {
  const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

  const messageParts = [
    `From: "Plastserwis" <${process.env.EMAIL_USER}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="separator"',
    "",
    "--separator",
    'Content-Type: text/html; charset="UTF-8"',
    "",
    html,
  ];

  if (attachments && attachments.length) {
    attachments.forEach((file) => {
      messageParts.push(
        "--separator",
        `Content-Type: application/octet-stream; name="${file.originalname}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${file.originalname}"`,
        "",
        file.buffer.toString("base64")
      );
    });
  }

  messageParts.push("--separator--");

  const raw = Buffer.from(messageParts.join("\r\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });
}

// --- ENDPOINT /send-email ---
app.post("/send-email", upload.array("files"), async (req, res) => {
  console.log("📨 Odebrano POST /send-email");
  console.log("➡ Body:", req.body);
  console.log("➡ Files:", req.files?.length || 0);

  const files = req.files || [];
  const totalSize = files.reduce((s, f) => s + f.size, 0);
  if (totalSize > 24 * 1024 * 1024)
    return res.status(400).json({
      error: "Łączny rozmiar plików nie może przekraczać 24 MB.",
    });

  const { name, company, email, phone, message } = req.body;
  if (!name || !email || !message)
    return res.status(400).json({
      error: "Imię, email i wiadomość są wymagane.",
    });

  try {
    await sendMail({
      to: process.env.EMAIL_TO,
      subject: "Nowa wiadomość ze strony Plastserwis",
      html: `
        <h2>📩 Nowa wiadomość kontaktowa</h2>
        <p><strong>Imię i nazwisko:</strong> ${name}</p>
        <p><strong>Firma:</strong> ${company || "—"}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Telefon:</strong> ${phone || "—"}</p>
        <hr/>
        <p>${message}</p>
      `,
      attachments: files,
    });

    console.log("✅ Mail wysłany!");
    res.json({ message: "Email wysłany!" });
  } catch (err) {
    console.error("❌ Błąd wysyłki maila:", err);
    res.status(500).json({
      error: "Błąd serwera podczas wysyłania maila.",
      details: err.message,
    });
  }
});

// --- Błędy Multera ---
app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE")
    return res.status(400).json({
      error: "Jeden z plików przekracza limit 10 MB.",
    });
  next(err);
});

// --- START ---
app.listen(PORT, () => console.log(`🚀 Backend działa na porcie ${PORT}`));
