import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();


const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../Frontend')));

const usersFilePath = path.join(__dirname, 'users.json');
const otps = new Map(); // Temporary storage for OTPs

// Initialize Data File
if (!fs.existsSync(usersFilePath)) {
    fs.writeFileSync(usersFilePath, JSON.stringify([]));
}

const readUsers = () => JSON.parse(fs.readFileSync(usersFilePath, 'utf-8'));
const writeUsers = (users) => fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));

// --- NODEMAILER CONFIGURATION ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSes // Your App Password
    }
});

// --- HELPER: PASSWORD VALIDATION ---
const validatePassword = (password) => {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasDigit = /[0-9]/.test(password);
    const errors = [];
    if (password.length < minLength) errors.push(`at least ${minLength} characters`);
    if (!hasUpperCase) errors.push("one uppercase letter");
    if (!hasDigit) errors.push("one digit");
    return { isValid: errors.length === 0, errors };
};

// --- ROUTES ---

// 1. REGISTRATION
app.post("/register", (req, res) => {
    const { username, email, password, confirmPassword } = req.body;
    if (password !== confirmPassword) return res.status(400).json({ success: false, message: "Passwords do not match" });

    const users = readUsers();
    if (users.find(u => u.email === email)) return res.status(400).json({ success: false, message: "Email already exists" });

    const newUser = { id: Date.now(), username, email, password, createdAt: new Date().toISOString() };
    users.push(newUser);
    writeUsers(users);
    res.json({ success: true, redirectUrl: "/index.html" });
});

// 2. LOGIN
app.post("/login", (req, res) => {
    const { username, password } = req.body;
    const users = readUsers();
    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
        res.json({ success: true, redirectUrl: `/home.html?user=${encodeURIComponent(username)}` });
    } else {
        res.status(401).json({ success: false, message: "Invalid credentials" });
    }
});

// 3. FORGOT PASSWORD: REQUEST OTP
app.post("/forgot-password/request", async (req, res) => {
    const { email } = req.body;
    const users = readUsers();
    const user = users.find(u => u.email === email);

    if (!user) return res.status(404).json({ success: false, message: "Email not found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otps.set(email, { otp, expires: Date.now() + 300000 });

    const mailOptions = {
        from: '"Security Team" <svnagaraju0316@gmail.com>',
        to: email,
        subject: "Your Verification Code",
        html: `<div style="background-color: #f6f9fc; padding: 40px 10px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
            <tr>
                <td style="padding: 40px 40px 20px 40px; text-align: center;">
                    <div style="background-color: #4f46e5; width: 48px; height: 48px; line-height: 48px; border-radius: 12px; display: inline-block; color: #ffffff; font-size: 24px; font-weight: bold; margin-bottom: 20px;">
                        P
                    </div>
                    <h2 style="margin: 0; color: #1a1f36; font-size: 24px; font-weight: 600;">Reset your password</h2>
                </td>
            </tr>

            <tr>
                <td style="padding: 0 40px 30px 40px; text-align: center;">
                    <p style="margin: 0; color: #4f566b; font-size: 16px; line-height: 24px;">
                        Hello, we received a request to reset your password. Use the verification code below to proceed.
                    </p>
                </td>
            </tr>

            <tr>
                <td style="padding: 0 40px 30px 40px; text-align: center;">
                    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; display: inline-block;">
                        <span style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 700; letter-spacing: 10px; color: #4f46e5;">${otp}</span>
                    </div>
                </td>
            </tr>

            <tr>
                <td style="padding: 0 40px 40px 40px; text-align: center;">
                    <p style="margin: 0; color: #9aa1ac; font-size: 14px;">
                        This code is valid for <b>5 minutes</b>. <br>
                        If you didn't request this, you can safely ignore this email.
                    </p>
                </td>
            </tr>

            <tr>
                <td style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                    <p style="margin: 0; color: #9aa1ac; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">
                        &copy; 2026 DevPortal Security Team
                    </p>
                </td>
            </tr>
        </table>
    </div>`
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`✅ OTP sent to ${email}`);
        res.json({ success: true, message: "OTP sent to your Gmail" });
    } catch (error) {
        console.error("❌ Gmail Error:", error);
        res.status(500).json({ success: false, message: "Could not send email." });
    }
});

// 4. FORGOT PASSWORD: VERIFY OTP
app.post("/forgot-password/verify", (req, res) => {
    const { email, otp } = req.body;
    const stored = otps.get(email);
    if (stored && stored.otp === otp && Date.now() < stored.expires) {
        res.json({ success: true });
    } else {
        res.status(400).json({ success: false, message: "Invalid or expired code" });
    }
});

// 5. FORGOT PASSWORD: RESET
app.post("/forgot-password/reset", (req, res) => {
    const { email, otp, newPassword } = req.body;
    const stored = otps.get(email);
    if (!stored || stored.otp !== otp) return res.status(403).json({ success: false, message: "Session expired" });

    const validation = validatePassword(newPassword);
    if (!validation.isValid) return res.status(400).json({ success: false, message: validation.errors.join(", ") });

    let users = readUsers();
    const idx = users.findIndex(u => u.email === email);
    if (idx !== -1) {
        users[idx].password = newPassword;
        writeUsers(users);
        otps.delete(email);
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false, message: "User not found" });
    }
});

app.listen(8080, () => console.log("Server running at http://localhost:8080"));