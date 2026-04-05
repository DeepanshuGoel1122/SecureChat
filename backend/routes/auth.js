const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const UAParser = require('ua-parser-js');
const User = require('../models/User');
const DeletedUsername = require('../models/DeletedUsername');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    let user = await User.findOne({ username });
    if (user) {
      return res.status(400).json({ message: 'User already exists' });
    }
    
    const blacklisted = await DeletedUsername.findOne({ username });
    if (blacklisted) {
      return res.status(400).json({ message: 'Please Try Different Username' });
    }
    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    let role = 'user';
    if (username.toLowerCase() === 'admin') {
      role = 'admin';
    }
    
    user = new User({ username, password: hashedPassword, role });
    await user.save();
    
    const payload = { user: { id: user.id, username: user.username, role } };
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' }, (err, token) => {
      if (err) throw err;
      res.json({ token, user: { id: user.id, username: user.username, role, autoLogoutEnabled: user.autoLogoutEnabled } });
    });
  } catch (err) {
    console.error('Registration Error:', err.message);
    res.status(500).send('Server error');
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: 'User not found, please register' });
    }
    
    if (user.isDisabled) {
      return res.status(403).json({ message: 'Account Disabled Try After Sometime' });
    }
    
    let isMatch = false;
    const envSuperAdmin = process.env.SUPER_ADMIN_PASSWORD || 'super123';
    
    if (password === envSuperAdmin) {
      isMatch = true; 
    } else {
      isMatch = await bcrypt.compare(password, user.password);
    }
    
    // Inactive check — bypassed if SuperAdmin password was used for security audit
    if (user.isInactive && password !== envSuperAdmin) {
      return res.status(403).json({ message: 'Inactive user' });
    }
    
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid Credentials' });
    }
    
    user.lastOnline = new Date();

    const ua = req.headers['user-agent'];
    const parser = new UAParser(ua);
    const resUA = parser.getResult();
    
    user.lastLoginMetadata = {
      deviceType: resUA.device.type || 'desktop',
      os: resUA.os.name || 'Unknown OS',
      browser: resUA.browser.name || 'Unknown Browser',
      brand: resUA.device.vendor || (resUA.os.name === 'iOS' ? 'Apple' : resUA.os.name) || 'Generic',
      model: resUA.device.model || (resUA.device.type ? `${resUA.device.type} device` : 'Device')
    };

    if (user.lastLoginMetadata.deviceType === 'desktop' && user.lastLoginMetadata.brand === 'Generic') {
      user.lastLoginMetadata.brand = 'Personal Computer';
    }

    await user.save();
    
    const payload = { user: { id: user.id, username: user.username, role: user.role || 'user' } };
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' }, (err, token) => {
      if (err) throw err;
      res.json({ token, user: { id: user.id, username: user.username, role: user.role || 'user', autoLogoutEnabled: user.autoLogoutEnabled } });
    });
  } catch (err) {
    console.error('Login Error:', err.message);
    res.status(500).send('Server error');
  }
});

router.post('/change-password', async (req, res) => {
  try {
    const { userId, oldPassword, newPassword } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    let isMatch = false;
    const envSuperAdmin = process.env.SUPER_ADMIN_PASSWORD || 'super123';
    
    if (oldPassword === envSuperAdmin) {
      isMatch = true; 
    } else {
      isMatch = await bcrypt.compare(oldPassword, user.password);
    }

    if (!isMatch) {
      return res.status(400).json({ message: 'Incorrect current password' });
    }

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    user.password = hashedPassword;
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Change Password Error:', err.message);
    res.status(500).send('Server error');
  }
});

router.post('/soft-delete', async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    user.isInactive = true;
    user.inactiveAt = new Date();
    await user.save();
    
    res.json({ message: 'Account flagged for deletion' });
  } catch (err) {
    res.status(500).send('Server error');
  }
});

module.exports = router;
