import express from "express";
import multer from "multer";
import cors from "cors";
import sgMail from "@sendgrid/mail";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// --- CORS (ustaw na domenę frontendu) ---
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
  })
);

app.use(express.json());

// --- SENDGRID ---
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// --- MULTER (memoryStorage + limity) ---
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // max 10MB per file
});

// --- ENDPOINT /send-email ---
app.post("/send-email", upload.array("files"), async (req, res) => {
  try {
    const files = req.files || [];

    // łączny limit 24MB
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > 24 * 1024 * 1024) {
      return res.status(400).json({
        error: "Łączny rozmiar plików nie może przekraczać 24MB.",
      });
    }

    const { name, company, email, phone, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ error: "Brakuje wymaganych pól." });
    }

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

    const attachments = files.map((file) => ({
      filename: file.originalname,
      type: file.mimetype,
      content: file.buffer.toString("base64"),
      disposition: "attachment",
    }));

    await sgMail.send({
      to: process.env.EMAIL_TO, // np. plast1@onet.pl
      from: "no-reply@plastserwis.com", // adres z Twojej domeny!
      replyTo: email, // klient nadal może odpisać
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

// --- MULTER errors ---
app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      error: "Pojedynczy plik nie może przekraczać 10MB.",
    });
  }
  next(err);
});

app.listen(PORT, () => {
  console.log(`Backend działa na porcie ${PORT}`);
});
