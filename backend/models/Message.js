const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  from: {
    type: String,
    required: true,
  },
  to: {
    type: String,
    required: true,
  },
  room: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    default: "",
  },
  type: {
    type: String,
    enum: ["text", "image", "file"],
    default: "text",
  },
  mediaUrl: {
    type: String,
    default: "",
  },
  fileName: {
    type: String,
    default: "",
  },
  status: {
    type: String,
    enum: ["sent", "delivered", "seen"],
    default: "sent",
  },
  deletedFor: [
    {
      type: String,
    },
  ],
  deletedForEveryone: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Message", messageSchema);
