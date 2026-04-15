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
  canDeleteMessages: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
