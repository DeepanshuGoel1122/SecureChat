const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  firstName: { type: String, default: '' },
  lastName: { type: String, default: '' },
  profilePic: { type: String, default: '' },
  bio: { type: String, default: '' },
  isProfileSetup: { type: Boolean, default: false },
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  sentRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  receivedRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  lastOnline: { type: Date, default: Date.now },
  autoLogoutEnabled: { type: Boolean, default: true },
  pushSubscription: { type: Object, default: null },
  lastLoginMetadata: {
    deviceType: String,
    os: String,
    browser: String,
    brand: String,
    model: String
  },
  disabledAt: { type: Date },
  inactiveAt: { type: Date },
  isDisabled: { type: Boolean, default: false },
  isInactive: { type: Boolean, default: false },
  clearedChats: {
    type: Map,
    of: Date,
    default: {}
  },
  allowMessageDelete: { type: Boolean, default: false },
  canDeleteMessages: { type: Boolean, default: true },
  deleteManuallyDisabled: { type: Boolean, default: false },
  allowMediaSharing: { type: Boolean, default: false },
  canMediaSharing: { type: Boolean, default: true },
  mediaSharingManuallyDisabled: { type: Boolean, default: false },
  // File upload restrictions (security-focused)
  allowFileUpload: { type: Boolean, default: false }, // Global: admin allows file uploads
  canUploadFiles: { type: Boolean, default: true }, // Per-user: override for specific users
  allowRestrictedFileUpload: { type: Boolean, default: false }, // Global: verified file types only
  allowUnrestrictedFileUpload: { type: Boolean, default: false }, // Global: broader file support
  canRestrictedFileUpload: { type: Boolean, default: true }, // Per-user verified mode
  canUnrestrictedFileUpload: { type: Boolean, default: true }, // Per-user unrestricted mode
  unrestrictedFileSharingManuallyDisabled: { type: Boolean, default: false },
  maxFileSize: { type: Number, default: 25 }, // in MB, default 25MB
  allowedFileTypes: {
    type: [String],
    default: [] // empty array means no file types allowed by default
  }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
