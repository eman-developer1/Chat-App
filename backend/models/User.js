const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
  },
  password: {
    type: String,
    required: true,
  },
  bio: {
    type: String,
    default: "",
    maxlength: 150,
  },
  avatar: {
    type: String,
    default: "",
  },
  blockedUsers: [
    {
      type: String,
    },
  ],
  isVerified: {
    type: Boolean,
    default: false,
  },
  verificationCodeHash: {
    type: String,
    default: null,
  },
  verificationCodeExpires: {
    type: Date,
    default: null,
  },
  verificationAttempts: {
    type: Number,
    default: 0,
  },
  lastOtpSentAt: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("User", userSchema);
