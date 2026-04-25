const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const DeletedUsername = require('../models/DeletedUsername');
const Message = require('../models/Message');
const { VERIFIED_FILE_EXTENSIONS } = require('../utils/fileValidator');

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
    if (isDisabled) {
      user.disabledAt = new Date();
    } else {
      user.disabledAt = null;
    }
    await user.save();
    
    if (isDisabled) {
      req.io.to(userId).emit('account_disabled');
    }
    
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
    user.inactiveAt = null;
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
    
    req.io.to(userId).emit('account_disabled');
    
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

// Get admin settings (for frontend to check delete permission etc.)
router.get('/settings', async (req, res) => {
  try {
    const admin = await User.findOne({ role: 'admin' });
    if (!admin) return res.status(404).json({ message: 'Admin not found' });
    res.json({
      allowMessageDelete: admin.allowMessageDelete || false,
      allowMediaSharing: admin.allowMediaSharing ?? admin.allowFileUpload ?? false,
      allowUnrestrictedFileUpload: admin.allowUnrestrictedFileUpload || false
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Toggle message delete permission (global)
router.post('/toggle-delete', async (req, res) => {
  try {
    const { allowMessageDelete } = req.body;
    const admin = await User.findOne({ role: 'admin' });
    if (!admin) return res.status(404).json({ message: 'Admin not found' });
    admin.allowMessageDelete = allowMessageDelete;
    await admin.save();
    if (allowMessageDelete) {
      await User.updateMany(
        { role: { $ne: 'admin' }, deleteManuallyDisabled: { $ne: true } },
        { canDeleteMessages: true }
      );
    }

    res.json({ message: 'Setting updated', allowMessageDelete });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Toggle per-user delete permission
router.post('/toggle-user-delete', async (req, res) => {
  try {
    const { userId, canDeleteMessages } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.canDeleteMessages = canDeleteMessages;
    user.deleteManuallyDisabled = !canDeleteMessages;
    await user.save();
    res.json({ message: 'User setting updated', canDeleteMessages });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/reset-delete-overrides', async (req, res) => {
  try {
    const { setAll } = req.body;
    // setAll=true -> enable all, setAll=false -> disable all, undefined -> legacy reset (enable all)
    const enable = setAll !== false;
    await User.updateMany(
      { role: { $ne: 'admin' } },
      { canDeleteMessages: enable, deleteManuallyDisabled: !enable }
    );
    res.json({ message: enable ? 'Delete enabled for all users' : 'Delete disabled for all users' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/toggle-media-sharing', async (req, res) => {
  try {
    const { allowMediaSharing } = req.body;
    const admin = await User.findOne({ role: 'admin' });
    if (!admin) return res.status(404).json({ message: 'Admin not found' });
    admin.allowMediaSharing = allowMediaSharing;
    admin.allowFileUpload = allowMediaSharing;
    admin.allowRestrictedFileUpload = allowMediaSharing;
    await admin.save();
    if (allowMediaSharing) {
      await User.updateMany(
        { role: { $ne: 'admin' }, mediaSharingManuallyDisabled: { $ne: true } },
        { canMediaSharing: true, canUploadFiles: true, canRestrictedFileUpload: true }
      );
    }
    res.json({
      message: 'Setting updated',
      allowMediaSharing: admin.allowMediaSharing,
      allowFileUpload: admin.allowFileUpload,
      allowRestrictedFileUpload: admin.allowRestrictedFileUpload
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/toggle-user-media-sharing', async (req, res) => {
  try {
    const { userId, canMediaSharing } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.canMediaSharing = canMediaSharing;
    user.mediaSharingManuallyDisabled = !canMediaSharing;
    user.canUploadFiles = canMediaSharing;
    user.canRestrictedFileUpload = canMediaSharing;
    await user.save();
    res.json({ message: 'User setting updated', canMediaSharing });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/reset-media-sharing-overrides', async (req, res) => {
  try {
    const { setAll } = req.body;
    const enable = setAll !== false;
    await User.updateMany(
      { role: { $ne: 'admin' } },
      {
        canMediaSharing: enable,
        mediaSharingManuallyDisabled: !enable,
        canUploadFiles: enable,
        canRestrictedFileUpload: enable
      }
    );
    res.json({ message: enable ? 'File sharing enabled for all users' : 'File sharing disabled for all users' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ===================== FILE UPLOAD SETTINGS =====================

// Get file upload settings
router.get('/file-settings', async (req, res) => {
  try {
    const admin = await User.findOne({ role: 'admin' });
    if (!admin) return res.status(404).json({ message: 'Admin not found' });
    res.json({
      allowFileUpload: admin.allowFileUpload || false,
      allowMediaSharing: admin.allowMediaSharing ?? admin.allowFileUpload ?? false,
      allowRestrictedFileUpload: admin.allowRestrictedFileUpload ?? admin.allowFileUpload ?? false,
      allowUnrestrictedFileUpload: admin.allowUnrestrictedFileUpload || false,
      maxFileSize: admin.maxFileSize || 25,
      allowedFileTypes: admin.allowedFileTypes || [],
      verifiedFileTypes: VERIFIED_FILE_EXTENSIONS
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Toggle file upload permission (global)
router.post('/toggle-file-upload', async (req, res) => {
  try {
    const { allowFileUpload, mode = 'restricted' } = req.body;
    const admin = await User.findOne({ role: 'admin' });
    if (!admin) return res.status(404).json({ message: 'Admin not found' });

    if (mode === 'unrestricted') {
      admin.allowUnrestrictedFileUpload = allowFileUpload;
      if (allowFileUpload) {
        await User.updateMany(
          { role: { $ne: 'admin' }, unrestrictedFileSharingManuallyDisabled: { $ne: true } },
          { canUnrestrictedFileUpload: true }
        );
      }
    } else {
      admin.allowRestrictedFileUpload = allowFileUpload;
      admin.allowFileUpload = allowFileUpload;
      admin.allowMediaSharing = allowFileUpload;
    }

    await admin.save();

    res.json({
      message: 'Setting updated',
      allowFileUpload: admin.allowFileUpload,
      allowRestrictedFileUpload: admin.allowRestrictedFileUpload,
      allowUnrestrictedFileUpload: admin.allowUnrestrictedFileUpload
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Set global max file size
router.post('/set-max-file-size', async (req, res) => {
  try {
    const { maxFileSize } = req.body;

    // Validate file size (25-300 MB)
    if (maxFileSize < 25 || maxFileSize > 300) {
      return res.status(400).json({ message: 'File size must be between 25MB and 300MB' });
    }

    const admin = await User.findOne({ role: 'admin' });
    if (!admin) return res.status(404).json({ message: 'Admin not found' });
    admin.maxFileSize = maxFileSize;
    await admin.save();

    // Sync all non-admin users
    await User.updateMany({ role: { $ne: 'admin' } }, { maxFileSize: maxFileSize });

    res.json({ message: 'Max file size updated', maxFileSize });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Set allowed file types
router.post('/set-allowed-file-types', async (req, res) => {
  try {
    const { allowedFileTypes } = req.body;

    if (!Array.isArray(allowedFileTypes)) {
      return res.status(400).json({ message: 'Allowed file types must be an array' });
    }

    const admin = await User.findOne({ role: 'admin' });
    if (!admin) return res.status(404).json({ message: 'Admin not found' });
    admin.allowedFileTypes = allowedFileTypes;
    await admin.save();

    // Sync all non-admin users
    await User.updateMany({ role: { $ne: 'admin' } }, { allowedFileTypes: allowedFileTypes });

    res.json({ message: 'Allowed file types updated', allowedFileTypes });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Toggle per-user file upload permission
router.post('/toggle-user-file-upload', async (req, res) => {
  try {
    const { userId, canUploadFiles, mode = 'restricted' } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (mode === 'unrestricted') {
      user.canUnrestrictedFileUpload = canUploadFiles;
      user.unrestrictedFileSharingManuallyDisabled = !canUploadFiles;
    } else {
      user.canRestrictedFileUpload = canUploadFiles;
      user.canUploadFiles = canUploadFiles;
      user.canMediaSharing = canUploadFiles;
      user.mediaSharingManuallyDisabled = !canUploadFiles;
    }
    await user.save();
    res.json({
      message: 'User setting updated',
      canUploadFiles: user.canUploadFiles,
      canRestrictedFileUpload: user.canRestrictedFileUpload,
      canUnrestrictedFileUpload: user.canUnrestrictedFileUpload
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/reset-unrestricted-file-overrides', async (req, res) => {
  try {
    const { setAll } = req.body;
    const enable = setAll !== false;
    await User.updateMany(
      { role: { $ne: 'admin' } },
      {
        canUnrestrictedFileUpload: enable,
        unrestrictedFileSharingManuallyDisabled: !enable
      }
    );
    res.json({ message: enable ? 'Unrestricted upload enabled for all users' : 'Unrestricted upload disabled for all users' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Set per-user max file size
router.post('/set-user-max-file-size', async (req, res) => {
  try {
    const { userId, maxFileSize } = req.body;

    if (maxFileSize < 25 || maxFileSize > 300) {
      return res.status(400).json({ message: 'File size must be between 25MB and 300MB' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.maxFileSize = maxFileSize;
    await user.save();
    res.json({ message: 'User max file size updated', maxFileSize });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
