const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, default: '' },
  imageUrl: { type: String, default: null },
  isRead: { type: Boolean, default: false },
  isEdited: { type: Boolean, default: false },
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null }
}, { timestamps: true });

module.exports = mongoose.model('Message', MessageSchema);
