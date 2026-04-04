const mongoose = require('mongoose');

const DeletedUsernameSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true
  }
}, { timestamps: true });

module.exports = mongoose.model('DeletedUsername', DeletedUsernameSchema);
