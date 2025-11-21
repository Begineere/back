import express from "express";
import multer from "multer";
import cors from "cors";
import sgMail from "@sendgrid/mail";
import dotenv from "dotenv";
import fetch from "node-fetch"; // ważne dla Turnstile

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// --- CORS ---
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
  })
);

app.use(express.json());

// --- SENDGRID ---
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// --- MULTER ---
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // max 10MB na plik
});

// --- TURNSTILE VERIFICATION ---
const verifyTurnstile = async (token) => {
  try {
    const secret = process.env.TURNSTILE_SECRET;

    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body: new URLSearchParams({
          secret,
          response: token,
        }),
      }
    );

    return await response.json();
  } catch (err) {
    console.error("Turnstile verification error:", err);
    return { success: false };
  }
};

// --- ENDPOINT /send-email ---
app.post("/send-email", upload.array("files"), async (req, res) => {
  try {
    const files = req.files || [];
    const { name, company, email, phone, message, cfToken } = req.body;

    // 1. Weryfikacja Turnstile
    const turnstile = await verifyTurnstile(cfToken);
    if (!turnstile.success) {
      return res.status(400).json({ error: "Błąd Turnstile: odrzucono." });
    }

    // 2. Walidacja pól
    if (!name || !email || !message) {
      return res.status(400).json({ error: "Brakuje wymaganych pól." });
    }

    // 3. Limit łączny 24MB
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > 24 * 1024 * 1024) {
      return res.status(400).json({
        error: "Łączny rozmiar plików nie może przekraczać 24MB.",
      });
    }

    // 4. Treść HTML
    const htmlContent = `
      <div style="font-family: Arial; padding: 20px; background: #f5f7ff;">
        <h2>📩 Nowa wiadomość ze strony Plastserwis</h2>
        <p><strong>Imię i nazwisko:</strong> ${name}</p>
        <p><strong>Firma:</strong> ${company || "nie podano"}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Telefon:</strong> ${phone || "nie podano"}</p>
        <p><strong>Wiadomość:</strong></p>
        <p>${message.replace(/\n/g, "<br>")}</p>
      </div>
    `;

    // 5. Załączniki
    const attachments = files.map((file) => ({
      filename: file.originalname,
      type: file.mimetype,
      content: file.buffer.toString("base64"),
      disposition: "attachment",
    }));

    // 6. Wysyłanie
    await sgMail.send({
      to: process.env.EMAIL_TO, // np. plast1@onet.pl
      from: "no-reply@plastserwis.com", // adres sendgrid verified
      replyTo: email,
      subject: "Nowa wiadomość z formularza Plastserwis",
      html: htmlContent,
      attachments,
    });

    res.json({ message: "Email wysłany!" });
  } catch (error) {
    console.error("SendGrid error:", error.response?.body || error);
    res.status(500).json({ error: "Błąd podczas wysyłania emaila." });
  }
});

// --- MULTER ERROR HANDLER ---
app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      error: "Pojedynczy plik nie może przekraczać 10MB.",
    });
  }
  next(err);
});

// --- START SERVER ---
app.listen(PORT, () => {
  console.log(`Backend działa na porcie ${PORT}`);
});
