const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const DeletedUsername = require('../models/DeletedUsername');
const Message = require('../models/Message');

const router = express.Router();

// Get all users topology data
router.get('/users', async (req, res) => {
  try {
    const users = await User.find()
      .select('-password')
      .populate('friends', '_id username');
    const deletedUsernames = await DeletedUsername.find().sort({ createdAt: -1 });
    res.json({ users, deletedUsernames });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Force reset user's password mapping 
router.post('/reset-password', async (req, res) => {
  try {
    const { userId, newPassword, superAdminPassword } = req.body;
    
    // Strict env authentication match
    const envSuperAdmin = process.env.SUPER_ADMIN_PASSWORD || 'super123';
    if (superAdminPassword !== envSuperAdmin) {
      return res.status(401).json({ message: 'Invalid SuperAdmin Password. Access Denied.' });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    user.password = hashedPassword;
    await user.save();
    
    res.json({ message: 'User password successfully reset.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Switch disable
router.post('/toggle-disable', async (req, res) => {
  try {
    const { userId, isDisabled } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    user.isDisabled = isDisabled;
    await user.save();
    
    res.json({ message: 'Success' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Reactivate Inactive User
router.post('/reactivate-user', async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.isInactive = false;
    await user.save();
    res.json({ message: 'User reactivated successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Permanently Delete Inactive User
router.post('/permanent-delete', async (req, res) => {
  try {
    const { userId, superAdminPassword } = req.body;
    const envSuperAdmin = process.env.SUPER_ADMIN_PASSWORD || 'super123';
    if (superAdminPassword !== envSuperAdmin) {
      return res.status(401).json({ message: 'Invalid SuperAdmin password. Access denied.' });
    }
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    // Save username to blacklisted
    await DeletedUsername.create({ username: user.username });
    
    // Delete all related messages
    await Message.deleteMany({ $or: [{ sender: userId }, { receiver: userId }] });
    
    // Pull from all other users
    await User.updateMany(
      {}, 
      { $pull: { 
          friends: userId, 
          sentRequests: userId, 
          receivedRequests: userId, 
          blockedUsers: userId 
        } 
      }
    );
    
    // Finally delete the user entirely
    await User.findByIdAndDelete(userId);
    
    res.json({ message: 'User permanently wiped' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Remove name from blacklist
router.post('/remove-blacklist', async (req, res) => {
  try {
    const { usernameId } = req.body;
    await DeletedUsername.findByIdAndDelete(usernameId);
    res.json({ message: 'Username removed from blacklist' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
