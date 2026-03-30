const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const router = express.Router();

// Get all users topology data
router.get('/users', async (req, res) => {
  try {
    const users = await User.find()
      .select('-password')
      .populate('friends', '_id username');
    res.json(users);
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

module.exports = router;
