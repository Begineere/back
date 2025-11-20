import express from "express";
import cors from "cors";
import multer from "multer";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// --- CORS: pozwól tylko na frontend produkcyjny lub lokalny ---
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

// --- MULTER: pamięć RAM, limit 10 MB na plik ---
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// --- ENDPOINT ---
app.post("/send-email", upload.array("files"), async (req, res) => {
  const files = req.files || [];

  // Łączna wielkość plików max 24MB
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  if (totalSize > 24 * 1024 * 1024) {
    return res.status(400).json({
      error: "Łączna wielkość wszystkich plików nie może przekraczać 24 MB.",
    });
  }

  const { name, company, email, phone, message } = req.body;

  if (!name || !email || !message) {
    return res
      .status(400)
      .json({ error: "Imię, email i wiadomość są wymagane." });
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS, // musi być App Password
    },
  });

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_TO,
      subject: "Nowa wiadomość ze strony Plastserwis",
      html: `
      <div style="font-family: Arial, sans-serif; background: #f5f7ff; padding: 20px;">
        <div style="
          max-width: 600px;
          margin: auto;
          background: white;
          padding: 25px;
          border-radius: 10px;
          box-shadow: 0 4px 10px rgba(0,0,0,0.1);
          border-top: 6px solid #4f46e5;
        ">
          <h2 style="color:#4f46e5; margin-bottom: 20px;">📩 Nowa wiadomość kontaktowa</h2>
          <p><strong>Imię i nazwisko:</strong> ${name}</p>
          <p><strong>Firma:</strong> ${company || "—"}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Telefon:</strong> ${phone || "—"}</p>
          <hr style="margin:20px 0; border:none; border-top:1px solid #ddd;">
          <h3 style="color:#333;">Wiadomość:</h3>
          <p style="white-space:pre-line; color:#444;">
            ${message}
          </p>
          <hr style="margin:20px 0; border:none; border-top:1px solid #ddd;">
          <p style="font-size:12px; color:#777; text-align:center;">
            Plastserwis – lakiernia proszkowa<br>
            Wiadomość wygenerowana automatycznie z formularza.
          </p>
        </div>
      </div>
      `,
      attachments: files.map((file) => ({
        filename: file.originalname,
        content: file.buffer,
      })),
    });

    res.json({ message: "Email wysłany!" });
  } catch (err) {
    console.error("❌ Błąd wysyłki maila:", err);
    res.status(500).json({ error: "Błąd serwera podczas wysyłania maila." });
  }
});

// --- GLOBALNY HANDLER BŁĘDÓW MULTER ---
app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      error: "Jeden z plików przekracza maksymalny rozmiar 10 MB.",
    });
  }
  next(err);
});

// --- START SERWERA ---
app.listen(PORT, () => {
  console.log(`🚀 Backend działa na porcie ${PORT}`);
});
