import express from "express";
import cors from "cors";
import multer from "multer";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// 🟦 LOG STARTOWY
console.log("🔧 FRONTEND_URL:", process.env.FRONTEND_URL);
console.log("🔧 EMAIL_USER:", process.env.EMAIL_USER);
console.log("🔧 EMAIL_TO:", process.env.EMAIL_TO);

// --- CORS (Render.com wymaga dokładnego origin) ---
app.use(
  cors({
    origin: (origin, callback) => {
      // 🔧 Dla Postmana i backend testów
      if (!origin) return callback(null, true);

      if (origin === process.env.FRONTEND_URL) {
        return callback(null, true);
      }

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

// --- PING TEST ---
app.get("/", (_, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// --- ENDPOINT /send-email ---
app.post("/send-email", upload.array("files"), async (req, res) => {
  console.log("📨 Odebrano POST /send-email");
  console.log("➡ Body:", req.body);
  console.log("➡ Files:", req.files?.length || 0);

  const files = req.files || [];

  // Limit łączny 24 MB
  const totalSize = files.reduce((s, f) => s + f.size, 0);
  if (totalSize > 24 * 1024 * 1024) {
    return res.status(400).json({
      error: "Łączny rozmiar plików nie może przekraczać 24 MB.",
    });
  }

  const { name, company, email, phone, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({
      error: "Imię, email i wiadomość są wymagane.",
    });
  }

  // --- KONFIGURACJA GMAIL (TA DZIAŁA NA RENDER.COM) ---
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER, // Gmail
      pass: process.env.EMAIL_PASS, // App Password
    },
  });

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
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
      attachments: files.map((file) => ({
        filename: file.originalname,
        content: file.buffer,
      })),
    });

    console.log("✅ Mail wysłany!");
    res.json({ message: "Email wysłany!" });
  } catch (err) {
    console.error("❌ Błąd wysyłki maila:", err);
    res.status(500).json({
      error: "Błąd serwera podczas wysyłania maila.",
      details: err.code,
    });
  }
});

// --- BŁĘDY MULTERA ---
app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      error: "Jeden z plików przekracza limit 10 MB.",
    });
  }
  next(err);
});

// --- START BACKENDU ---
app.listen(PORT, () => {
  console.log(`🚀 Backend działa na porcie ${PORT}`);
});
