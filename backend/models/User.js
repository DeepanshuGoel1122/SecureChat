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
  isDisabled: { type: Boolean, default: false },
  clearedChats: {
    type: Map,
    of: Date,
    default: {}
  }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
