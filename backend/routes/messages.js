const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const Message = require('../models/Message');
const User = require('../models/User');

const router = express.Router();

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer storage for Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    const isHD = req.query.quality === 'hd';
    return {
      folder: 'secure_chat_images',
      allowed_formats: ['jpg', 'png', 'jpeg', 'gif', 'webp'],
      transformation: isHD
        ? [{ quality: 'auto:best' }]
        : [{ width: 1920, height: 1920, crop: 'limit', quality: 'auto:good' }]
    };
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB limit (compression happens client-side)
});

// Upload image route
const uploadMiddleware = upload.single('image');

router.post('/upload', (req, res) => {
  console.log("Upload request received...");
  uploadMiddleware(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      console.error('Multer event error during upload:', err);
      return res.status(400).json({ message: 'Upload format/size error: ' + err.message });
    } else if (err) {
      console.error('General error during Cloudinary upload:', JSON.stringify(err));
      const errMsg = err.message || JSON.stringify(err) || 'Unknown error';
      return res.status(500).json({ message: 'Upload engine error: ' + errMsg });
    }
    
    if (!req.file) {
      console.log("No file was appended to request.");
      return res.status(400).json({ message: 'No file uploaded' });
    }
    
    console.log("Upload to Cloudinary successful. File URL:", req.file.path);
    res.json({ imageUrl: req.file.path });
  });
});

const ObjectId = mongoose.Types.ObjectId;

// Get history
router.get('/history/:userId/:friendId', async (req, res) => {
  try {
    const { userId, friendId } = req.params;
    
    // Fetch user to determine if they previously cleared this chat
    const user = await User.findById(userId);
    const clearedAt = user?.clearedChats?.get(friendId) || new Date(0);

    const messages = await Message.find({
      $or: [
        { sender: userId, receiver: friendId },
        { sender: friendId, receiver: userId }
      ],
      createdAt: { $gt: clearedAt } // Filter out old messages asymmetrically
    }).sort('createdAt').populate('sender', 'username').populate('receiver', 'username').populate({
      path: 'replyTo',
      select: 'text sender createdAt',
      populate: { path: 'sender', select: 'username' }
    });
    
    // Mark as read automatically when history is fetched
    await Message.updateMany(
      { sender: friendId, receiver: userId, isRead: false, createdAt: { $gt: clearedAt } },
      { $set: { isRead: true } }
    );
    
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get unread counts
router.get('/unread/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    const clearedChatMap = user?.clearedChats;

    const unreadMessages = await Message.aggregate([
      { $match: { receiver: new ObjectId(userId), isRead: false } },
      { $group: { _id: '$sender', count: { $sum: 1 }, msgs: { $push: "$$ROOT" } } }
    ]);
    
    const unreadCounts = {};
    unreadMessages.forEach(group => {
      const friendIdStr = group._id.toString();
      const clearedAt = clearedChatMap?.get(friendIdStr) || new Date(0);
      
      // Calculate how many unread messages are actually *after* the cleared timestamp
      const trueUnreadCount = group.msgs.filter(m => new Date(m.createdAt) > clearedAt).length;
      if (trueUnreadCount > 0) {
        unreadCounts[friendIdStr] = trueUnreadCount;
      }
    });
    
    res.json(unreadCounts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete history
router.delete('/history/:userId/:friendId', async (req, res) => {
  try {
    const { userId, friendId } = req.params;
    
    const user = await User.findById(userId);
    if (user) {
      if (!user.clearedChats) {
        user.clearedChats = new Map();
      }
      user.clearedChats.set(friendId, new Date());
      await user.save();
    }

    res.json({ message: 'Chat history cleared for user' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
