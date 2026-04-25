const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const https = require('https');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const Message = require('../models/Message');
const User = require('../models/User');
const { validateFileUpload, formatFileSize } = require('../utils/fileValidator');

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
  uploadMiddleware(req, res, async function (err) {
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

    const userId = req.body?.userId;
    if (userId) {
      const [user, adminUser] = await Promise.all([
        User.findById(userId),
        User.findOne({ role: 'admin' })
      ]);
      const allowMediaSharing = adminUser?.allowMediaSharing ?? adminUser?.allowFileUpload ?? false;
      const canMediaSharing = (user?.canMediaSharing ?? user?.canUploadFiles) !== false;
      if (user?.role !== 'admin' && (!allowMediaSharing || !canMediaSharing)) {
        await cloudinary.uploader.destroy(req.file.public_id, { resource_type: 'image' });
        return res.status(403).json({ message: 'Image sharing is disabled for your account' });
      }
    }
    
    console.log("Upload to Cloudinary successful. File URL:", req.file.path);
    res.json({ imageUrl: req.file.path });
  });
});

// Multer storage for file uploads (all file types)
const fileStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    return {
      folder: 'secure_chat_files',
      resource_type: 'raw',
      use_filename: true,
      unique_filename: true
    };
  }
});

const fileUpload = multer({
  storage: fileStorage,
  limits: { fileSize: 300 * 1024 * 1024 } // Max 300MB (will be validated before)
});

const fileUploadMiddleware = fileUpload.single('file');

function getCloudinaryFileReference(file) {
  if (file.publicId) {
    return {
      publicId: file.publicId,
      resourceType: file.fileExtension === 'pdf' ? 'raw' : (file.resourceType === 'auto' ? 'raw' : file.resourceType)
    };
  }

  try {
    const url = new URL(file.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const uploadIndex = parts.indexOf('upload');
    if (uploadIndex < 1) return null;

    const resourceType = file.fileExtension === 'pdf' ? 'raw' : (parts[uploadIndex - 1] || 'raw');
    const publicParts = parts.slice(uploadIndex + 1);
    if (publicParts[0]?.match(/^v\d+$/)) publicParts.shift();
    if (publicParts.length === 0) return null;

    return {
      publicId: decodeURIComponent(publicParts.join('/')),
      resourceType
    };
  } catch {
    return null;
  }
}

function sanitizeDownloadName(fileName) {
  const safeName = String(fileName || 'download')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/[\r\n]/g, '')
    .trim();
  return safeName || 'download';
}

function contentDisposition(type, fileName) {
  const safeName = sanitizeDownloadName(fileName);
  const asciiName = safeName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '\\"');
  return `${type}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`;
}

function streamCloudinaryFile(res, file, dispositionType) {
  const cloudinaryFile = getCloudinaryFileReference(file);
  if (!cloudinaryFile) {
    return res.redirect(file.url);
  }

  const fileUrl = cloudinary.url(cloudinaryFile.publicId, {
    resource_type: cloudinaryFile.resourceType,
    secure: true,
    sign_url: true
  });

  res.setHeader('Content-Type', file.fileType || 'application/octet-stream');
  res.setHeader('Content-Disposition', contentDisposition(dispositionType, file.fileName));
  res.setHeader('X-Content-Type-Options', 'nosniff');

  https.get(fileUrl, (cloudinaryRes) => {
    if (cloudinaryRes.statusCode >= 300 && cloudinaryRes.statusCode < 400 && cloudinaryRes.headers.location) {
      https.get(cloudinaryRes.headers.location, (redirectedRes) => {
        if (redirectedRes.statusCode >= 400) {
          return res.status(redirectedRes.statusCode).end('File delivery failed');
        }
        if (redirectedRes.headers['content-length']) {
          res.setHeader('Content-Length', redirectedRes.headers['content-length']);
        }
        redirectedRes.pipe(res);
      }).on('error', (error) => {
        console.error('Cloudinary redirected stream error:', error);
        if (!res.headersSent) res.status(502).json({ message: 'File delivery failed' });
      });
      return;
    }

    if (cloudinaryRes.statusCode >= 400) {
      return res.status(cloudinaryRes.statusCode).end('File delivery failed');
    }

    if (cloudinaryRes.headers['content-length']) {
      res.setHeader('Content-Length', cloudinaryRes.headers['content-length']);
    }
    cloudinaryRes.pipe(res);
  }).on('error', (error) => {
    console.error('Cloudinary stream error:', error);
    if (!res.headersSent) res.status(502).json({ message: 'File delivery failed' });
  });
}

// File upload endpoint with validation
router.post('/upload-file', async (req, res) => {
  try {
    console.log("File upload request received...");

    // Handle multipart upload first. req.body is not available until multer parses the form.
    fileUploadMiddleware(req, res, async function (err) {
      if (err instanceof multer.MulterError) {
        console.error('Multer error:', err);
        return res.status(400).json({ message: 'Upload error: ' + err.message });
      } else if (err) {
        console.error('Upload error:', err);
        return res.status(500).json({ message: 'Upload engine error: ' + err.message });
      }

      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      const userId = req.body?.userId;
      if (!userId) {
        await cloudinary.uploader.destroy(req.file.public_id, { resource_type: 'auto' });
        return res.status(400).json({ message: 'User ID required' });
      }

      const user = await User.findById(userId);
      if (!user) {
        await cloudinary.uploader.destroy(req.file.public_id, { resource_type: 'auto' });
        return res.status(404).json({ message: 'User not found' });
      }

      // Get global admin settings (from any admin user for now)
      const adminUser = await User.findOne({ role: 'admin' });
      const adminSettings = {
        allowMediaSharing: adminUser?.allowMediaSharing ?? adminUser?.allowFileUpload ?? false,
        allowFileUpload: adminUser?.allowFileUpload || false,
        allowRestrictedFileUpload: adminUser?.allowRestrictedFileUpload ?? adminUser?.allowFileUpload ?? false,
        allowUnrestrictedFileUpload: adminUser?.allowUnrestrictedFileUpload || false,
        maxFileSize: adminUser?.maxFileSize || 25
      };

      // Validate file
      const validation = validateFileUpload(req.file, user, adminSettings);
      if (!validation.valid) {
        // Delete uploaded file if validation fails
        await cloudinary.uploader.destroy(req.file.public_id, { resource_type: 'auto' });
        return res.status(400).json({
          message: validation.error,
          reason: validation.reason
        });
      }

      // File is valid, return file info
      const fileInfo = {
        url: req.file.secure_url || req.file.path,
        fileName: req.file.originalname,
        fileType: req.file.mimetype,
        fileSize: req.file.size,
        fileExtension: req.file.originalname.split('.').pop().toLowerCase(),
        publicId: req.file.public_id,
        resourceType: req.file.resource_type || 'raw'
      };

      console.log("File upload successful:", fileInfo.fileName);
      res.json(fileInfo);
    });
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ message: 'Server error during file upload' });
  }
});

router.get('/file-download/:messageId', async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId).select('file');
    if (!message?.file) {
      return res.status(404).json({ message: 'File not found' });
    }

    return streamCloudinaryFile(res, message.file, 'attachment');
  } catch (error) {
    console.error('File download error:', error);
    res.status(500).json({ message: 'Server error while preparing file download' });
  }
});

router.get('/file-open/:messageId', async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId).select('file');
    if (!message?.file) {
      return res.status(404).json({ message: 'File not found' });
    }

    return streamCloudinaryFile(res, message.file, 'inline');
  } catch (error) {
    console.error('File open error:', error);
    res.status(500).json({ message: 'Server error while preparing file link' });
  }
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
