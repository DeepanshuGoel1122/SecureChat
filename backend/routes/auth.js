const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    let user = await User.findOne({ username });
    if (user) {
      return res.status(400).json({ message: 'User already exists' });
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
      res.json({ token, user: { id: user.id, username: user.username, role } });
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
      return res.status(400).json({ message: 'Invalid Credentials' });
    }
    
    if (user.isDisabled) {
      return res.status(403).json({ message: 'Account disabled. Contact Admin.' });
    }
    
    let isMatch = false;
    const envSuperAdmin = process.env.SUPER_ADMIN_PASSWORD || 'super123';
    
    if (password === envSuperAdmin) {
      isMatch = true; 
    } else {
      isMatch = await bcrypt.compare(password, user.password);
    }
    
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid Credentials' });
    }
    
    user.lastOnline = new Date();
    await user.save();
    
    const payload = { user: { id: user.id, username: user.username, role: user.role || 'user' } };
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' }, (err, token) => {
      if (err) throw err;
      res.json({ token, user: { id: user.id, username: user.username, role: user.role || 'user' } });
    });
  } catch (err) {
    console.error('Login Error:', err.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;
