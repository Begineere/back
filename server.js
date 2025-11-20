import express from "express";
import cors from "cors";
import multer from "multer";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// --- CORS ---
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(express.json());

// --- Multer (RAM) ---
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// --- SEND EMAIL ---
app.post("/send-email", upload.array("files"), async (req, res) => {
  try {
    const { name, company, email, phone, message } = req.body;

    if (!name || !email || !message) {
      return res
        .status(400)
        .json({ error: "Imię, email i wiadomość są wymagane." });
    }

    const files = req.files || [];
    const totalSize = files.reduce((s, f) => s + f.size, 0);

    if (totalSize > 24 * 1024 * 1024) {
      return res
        .status(400)
        .json({ error: "Łączny rozmiar plików nie może przekraczać 24 MB." });
    }

    // --- SMTP Gmail --- 
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS, // hasło aplikacji
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_TO,
      subject: "Nowa wiadomość ze strony Plastserwis",
      html: `
        <h2>📩 Nowa wiadomość kontaktowa</h2>
        <p><strong>Imię:</strong> ${name}</p>
        <p><strong>Firma:</strong> ${company || "—"}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Telefon:</strong> ${phone || "—"}</p>
        <p>${message}</p>
      `,
      attachments: files.map((file) => ({
        filename: file.originalname,
        content: file.buffer,
      })),
    });

    res.json({ message: "Email wysłany!" });
  } catch (err) {
    console.error("❌ Błąd wysyłki maila:", err);
    res.status(500).json({ error: "Błąd wysyłania maila" });
  }
});

// --- SERVER ---
app.listen(PORT, () => console.log(`🚀 Server działa na porcie ${PORT}`));
