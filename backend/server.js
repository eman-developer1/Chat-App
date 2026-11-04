require("dotenv").config();
const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { Server } = require("socket.io");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const User = require("./models/User");
const Message = require("./models/Message");
const { sendVerificationOtpEmail } = require("./services/emailService");

const app = express();
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

const allowedOrigins = [
  FRONTEND_URL,
  "http://localhost:3000",
  "http://127.0.0.1:3000",
].filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key-change-in-production";
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/whatsapp-chat";

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
  maxHttpBufferSize: 5e6,
});

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("MongoDB error:", err));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

function getPrivateRoom(user1, user2) {
  return [user1, user2].sort().join("--");
}

// ==================== AUTH & USER ROUTES ====================

const handleRegister = async (req, res) => {
  try {
    const { email, username, password } = req.body;
    if (!email || !username || !password) {
      return res.status(400).json({ error: "Email, username, and password are required" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Please enter a valid email address" });
    }

    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 3) {
      return res.status(400).json({ error: "Username must be at least 3 characters" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await User.findOne({ email: normalizedEmail });

    // Generate cryptographically secure random 6-digit OTP
    const rawOtp = crypto.randomInt(100000, 1000000).toString();
    const hashedOtp = await bcrypt.hash(rawOtp, 10);
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    if (existingUser) {
      if (existingUser.isVerified) {
        return res.status(400).json({ error: "An account with this email already exists" });
      }

      // Existing unverified account: Rate-limit resend to 60s
      if (existingUser.lastOtpSentAt && Date.now() - existingUser.lastOtpSentAt.getTime() < 60 * 1000) {
        const waitSec = Math.ceil((60 * 1000 - (Date.now() - existingUser.lastOtpSentAt.getTime())) / 1000);
        return res.status(429).json({
          error: `A verification code was recently sent. Please wait ${waitSec}s before requesting again.`,
          isVerified: false,
          email: existingUser.email,
        });
      }

      // Check if updating to a username taken by another account
      if (existingUser.username.toLowerCase() !== trimmedUsername.toLowerCase()) {
        const usernameConflict = await User.findOne({
          username: { $regex: new RegExp(`^${trimmedUsername}$`, "i") },
          _id: { $ne: existingUser._id },
        });
        if (usernameConflict) {
          return res.status(400).json({ error: "Username already taken" });
        }
        existingUser.username = trimmedUsername;
      }

      // Attempt sending email via Resend before committing updates
      await sendVerificationOtpEmail({
        email: existingUser.email,
        username: existingUser.username,
        otp: rawOtp,
      });

      existingUser.password = await bcrypt.hash(password, 10);
      existingUser.verificationCodeHash = hashedOtp;
      existingUser.verificationCodeExpires = otpExpires;
      existingUser.verificationAttempts = 0;
      existingUser.lastOtpSentAt = new Date();
      await existingUser.save();

      return res.status(200).json({
        message: "Verification code sent to your email",
        email: existingUser.email,
        isVerified: false,
      });
    }

    // New registration: check username uniqueness
    const usernameTaken = await User.findOne({
      username: { $regex: new RegExp(`^${trimmedUsername}$`, "i") },
    });
    if (usernameTaken) {
      return res.status(400).json({ error: "Username already taken" });
    }

    // Attempt sending email via Resend first (do not claim success unless confirmed)
    await sendVerificationOtpEmail({
      email: normalizedEmail,
      username: trimmedUsername,
      otp: rawOtp,
    });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await User.create({
      email: normalizedEmail,
      username: trimmedUsername,
      password: hashedPassword,
      isVerified: false,
      verificationCodeHash: hashedOtp,
      verificationCodeExpires: otpExpires,
      verificationAttempts: 0,
      lastOtpSentAt: new Date(),
    });

    return res.status(201).json({
      message: "Registration successful. Please verify your email with the OTP sent.",
      email: newUser.email,
      isVerified: false,
    });
  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({
      error: err.message || "Failed to process registration. Please try again.",
    });
  }
};

const handleVerifyEmail = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ error: "Email and 6-digit OTP code are required" });
    }

    const cleanOtp = String(otp).trim();
    if (!/^\d{6}$/.test(cleanOtp)) {
      return res.status(400).json({ error: "Verification code must be exactly 6 digits" });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(400).json({ error: "Invalid verification request" });
    }

    if (user.isVerified) {
      return res.status(400).json({
        error: "This email is already verified. You can log in directly.",
        isVerified: true,
      });
    }

    if (!user.verificationCodeHash || !user.verificationCodeExpires) {
      return res.status(400).json({
        error: "No active verification code found. Please request a new code.",
        needsNewCode: true,
      });
    }

    // Limit attempts (max 5)
    if (user.verificationAttempts >= 5) {
      return res.status(429).json({
        error: "Too many failed attempts. For security, please request a new verification code.",
        maxAttemptsReached: true,
      });
    }

    // Check expiration
    if (new Date() > new Date(user.verificationCodeExpires)) {
      return res.status(400).json({
        error: "Verification code has expired. Please request a new one.",
        expired: true,
      });
    }

    // Securely compare OTP with hash
    const isMatch = await bcrypt.compare(cleanOtp, user.verificationCodeHash);
    if (!isMatch) {
      user.verificationAttempts += 1;
      await user.save();
      const remaining = Math.max(0, 5 - user.verificationAttempts);
      return res.status(400).json({
        error: `Invalid verification code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
        remainingAttempts: remaining,
      });
    }

    // Successful verification
    user.isVerified = true;
    user.verificationCodeHash = null;
    user.verificationCodeExpires = null;
    user.verificationAttempts = 0;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Email verified successfully! You can now log in.",
      isVerified: true,
      email: user.email,
    });
  } catch (err) {
    console.error("Verify email error:", err);
    return res.status(500).json({ error: "Server error during email verification" });
  }
};

const handleResendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    // Handle non-existent email safely
    if (!user) {
      return res.status(200).json({
        message: "If an unverified account with this email exists, a verification code has been sent.",
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        error: "This email is already verified. Please log in.",
        isVerified: true,
      });
    }

    // 60-second rate limiting
    if (user.lastOtpSentAt && Date.now() - user.lastOtpSentAt.getTime() < 60 * 1000) {
      const waitSeconds = Math.ceil(
        (60 * 1000 - (Date.now() - user.lastOtpSentAt.getTime())) / 1000
      );
      return res.status(429).json({
        error: `Please wait ${waitSeconds}s before requesting a new code.`,
        waitSeconds,
      });
    }

    const rawOtp = crypto.randomInt(100000, 1000000).toString();
    const hashedOtp = await bcrypt.hash(rawOtp, 10);

    // Send email via Resend
    await sendVerificationOtpEmail({
      email: user.email,
      username: user.username,
      otp: rawOtp,
    });

    user.verificationCodeHash = hashedOtp;
    user.verificationCodeExpires = new Date(Date.now() + 10 * 60 * 1000);
    user.verificationAttempts = 0;
    user.lastOtpSentAt = new Date();
    await user.save();

    return res.status(200).json({
      success: true,
      message: "A new verification code has been sent to your email.",
    });
  } catch (err) {
    console.error("Resend OTP error:", err);
    return res.status(500).json({
      error: err.message || "Failed to resend verification code. Please try again.",
    });
  }
};

const handleLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    // Block unverified users from logging in
    if (!user.isVerified) {
      return res.status(403).json({
        error: "Please verify your email address before logging in.",
        isVerified: false,
        email: user.email,
      });
    }

    const token = jwt.sign(
      { id: user._id, username: user.username, email: user.email, isVerified: user.isVerified },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        bio: user.bio,
        avatar: user.avatar,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// Route mappings: Supports both /api/auth/* and /api/* paths
app.post("/api/auth/register", handleRegister);
app.post("/api/register", handleRegister);

app.post("/api/auth/verify-email", handleVerifyEmail);
app.post("/api/verify-email", handleVerifyEmail);

app.post("/api/auth/resend-otp", handleResendOtp);
app.post("/api/resend-otp", handleResendOtp);

app.post("/api/auth/login", handleLogin);
app.post("/api/login", handleLogin);

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: "No token" });
  try {
    const decoded = jwt.verify(header.replace("Bearer ", ""), JWT_SECRET);
    const user = await User.findById(decoded.id).select("isVerified");
    if (!user) return res.status(401).json({ error: "User not found" });
    if (!user.isVerified) return res.status(403).json({ error: "Email verification required" });
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

app.put("/api/profile", authMiddleware, async (req, res) => {
  try {
    const { bio, avatar } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (bio !== undefined) user.bio = String(bio).slice(0, 150);
    if (avatar !== undefined) user.avatar = avatar;

    await user.save();
    res.json({
      username: user.username,
      email: user.email,
      bio: user.bio,
      avatar: user.avatar,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to update profile" });
  }
});

app.post("/api/upload", authMiddleware, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  const url = `http://localhost:3001/uploads/${req.file.filename}`;
  res.json({ url, fileName: req.file.originalname });
});

app.get("/api/search", authMiddleware, async (req, res) => {
  try {
    const q = req.query.q || "";
    if (q.length < 1) return res.json([]);

    const me = await User.findById(req.user.id);
    const blocked = me?.blockedUsers || [];

    const users = await User.find({
      username: { $regex: q, $options: "i", $ne: req.user.username },
    })
      .select("username email bio avatar")
      .limit(15);

    const filtered = users.filter((u) => !blocked.includes(u.username));
    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: "Search failed" });
  }
});

app.get("/api/user/:username", authMiddleware, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username }).select(
      "username bio avatar"
    );
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch {
    res.status(500).json({ error: "Error" });
  }
});

app.post("/api/block", authMiddleware, async (req, res) => {
  try {
    const { username, block } = req.body;
    const me = await User.findById(req.user.id);
    if (!me) return res.status(404).json({ error: "User not found" });

    if (block) {
      if (!me.blockedUsers.includes(username)) {
        me.blockedUsers.push(username);
      }
    } else {
      me.blockedUsers = me.blockedUsers.filter((u) => u !== username);
    }
    await me.save();
    res.json({ blockedUsers: me.blockedUsers });
  } catch {
    res.status(500).json({ error: "Failed" });
  }
});

// ==================== SOCKET.IO ====================

const onlineUsers = new Map();

io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Authentication required"));
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).select("isVerified");
    if (!user) return next(new Error("User not found"));
    if (!user.isVerified) return next(new Error("Email verification required"));
    socket.user = decoded;
    next();
  } catch {
    next(new Error("Invalid token"));
  }
});

io.on("connection", (socket) => {
  const { username, id: userId } = socket.user;
  console.log(`${username} connected`);

  onlineUsers.set(socket.id, { username, userId });
  io.emit(
    "online-users",
    Array.from(onlineUsers.values()).map((u) => u.username)
  );

  socket.on("get-history", async ({ withUser }) => {
    try {
      const room = getPrivateRoom(username, withUser);
      const messages = await Message.find({
        room,
        deletedForEveryone: false,
        deletedFor: { $ne: username },
      })
        .sort({ createdAt: 1 })
        .limit(200)
        .lean();

      await Message.updateMany(
        { room, to: username, status: "sent" },
        { status: "delivered" }
      );

      for (let [sid, data] of onlineUsers) {
        if (data.username === withUser) {
          io.to(sid).emit("messages-delivered", { withUser: username });
          break;
        }
      }

      socket.emit("history", { withUser, messages });
    } catch (err) {
      socket.emit("error", "Failed to load messages");
    }
  });

  socket.on("send-message", async (data) => {
    const { to, content, type = "text", mediaUrl = "", fileName = "" } = data;
    if (!to) return;

    const recipient = await User.findOne({ username: to });
    const sender = await User.findOne({ username });
    if (
      recipient?.blockedUsers?.includes(username) ||
      sender?.blockedUsers?.includes(to)
    ) {
      socket.emit("error", "Cannot message this user");
      return;
    }

    const room = getPrivateRoom(username, to);

    try {
      const newMessage = await Message.create({
        from: username,
        to,
        room,
        content: content || "",
        type,
        mediaUrl,
        fileName,
        status: "sent",
      });

      const messageData = {
        _id: newMessage._id,
        from: newMessage.from,
        to: newMessage.to,
        room: newMessage.room,
        content: newMessage.content,
        type: newMessage.type,
        mediaUrl: newMessage.mediaUrl,
        fileName: newMessage.fileName,
        status: newMessage.status,
        createdAt: newMessage.createdAt,
      };

      socket.join(room);

      let delivered = false;
      for (let [sid, data] of onlineUsers) {
        if (data.username === to) {
          const other = io.sockets.sockets.get(sid);
          if (other) {
            other.join(room);
            delivered = true;
          }
          break;
        }
      }

      if (delivered) {
        newMessage.status = "delivered";
        await newMessage.save();
        messageData.status = "delivered";
      }

      io.to(room).emit("receive-message", messageData);
    } catch (err) {
      console.error(err);
      socket.emit("error", "Failed to send message");
    }
  });

  socket.on("mark-seen", async ({ withUser }) => {
    const room = getPrivateRoom(username, withUser);
    await Message.updateMany(
      { room, to: username, status: { $ne: "seen" } },
      { status: "seen" }
    );

    for (let [sid, data] of onlineUsers) {
      if (data.username === withUser) {
        io.to(sid).emit("messages-seen", { withUser: username });
        break;
      }
    }
  });

  socket.on("delete-message", async ({ messageId, forEveryone }) => {
    try {
      const msg = await Message.findById(messageId);
      if (!msg) return;
      if (msg.from !== username && forEveryone) return;

      if (forEveryone) {
        msg.deletedForEveryone = true;
        msg.content = "";
        msg.mediaUrl = "";
        await msg.save();
        io.to(msg.room).emit("message-deleted", {
          messageId,
          forEveryone: true,
        });
      } else {
        if (!msg.deletedFor.includes(username)) {
          msg.deletedFor.push(username);
          await msg.save();
        }
        socket.emit("message-deleted", { messageId, forEveryone: false });
      }
    } catch (err) {
      console.error(err);
    }
  });

  socket.on("typing", ({ to, isTyping }) => {
    if (!to) return;
    const room = getPrivateRoom(username, to);
    socket.to(room).emit("user-typing", {
      username,
      isTyping,
      withUser: to,
    });
  });

  socket.on("join-private", (otherUser) => {
    const room = getPrivateRoom(username, otherUser);
    socket.join(room);
  });

  // WebRTC Signaling
  socket.on("call-user", ({ to, offer, isVideo }) => {
    for (let [sid, data] of onlineUsers) {
      if (data.username === to) {
        io.to(sid).emit("incoming-call", {
          from: username,
          offer,
          isVideo,
        });
        break;
      }
    }
  });

  socket.on("answer-call", ({ to, answer }) => {
    for (let [sid, data] of onlineUsers) {
      if (data.username === to) {
        io.to(sid).emit("call-answered", { from: username, answer });
        break;
      }
    }
  });

  socket.on("ice-candidate", ({ to, candidate }) => {
    for (let [sid, data] of onlineUsers) {
      if (data.username === to) {
        io.to(sid).emit("ice-candidate", { from: username, candidate });
        break;
      }
    }
  });

  socket.on("end-call", ({ to }) => {
    for (let [sid, data] of onlineUsers) {
      if (data.username === to) {
        io.to(sid).emit("call-ended", { from: username });
        break;
      }
    }
  });

  socket.on("reject-call", ({ to }) => {
    for (let [sid, data] of onlineUsers) {
      if (data.username === to) {
        io.to(sid).emit("call-rejected", { from: username });
        break;
      }
    }
  });

  socket.on("disconnect", () => {
    onlineUsers.delete(socket.id);
    io.emit(
      "online-users",
      Array.from(onlineUsers.values()).map((u) => u.username)
    );
    console.log(`${username} disconnected`);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
