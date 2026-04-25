const mongoose = require('mongoose');

const FileSchema = new mongoose.Schema({
  url: { type: String, required: true },
  fileName: { type: String, required: true },
  fileType: { type: String, required: true }, // mime type (application/pdf, etc.)
  fileSize: { type: Number, required: true }, // in bytes
  fileExtension: { type: String, required: true }, // pdf, docx, apk, etc.
  publicId: { type: String, default: '' },
  resourceType: { type: String, default: 'auto' },
  uploadedAt: { type: Date, default: Date.now }
}, { _id: false });

const MessageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, default: '' },
  imageUrl: { type: String, default: null }, // kept for backward compatibility
  imageUrls: [{ type: String }], // new array for grouping
  file: { type: FileSchema, default: null }, // kept for backward compatibility
  files: [FileSchema], // new array for grouping
  isRead: { type: Boolean, default: false },
  isEdited: { type: Boolean, default: false },
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null }
}, { timestamps: true });

module.exports = mongoose.model('Message', MessageSchema);
