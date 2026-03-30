const express = require('express');
const User = require('../models/User');
const Message = require('../models/Message');

const router = express.Router();

// Search users
router.get('/search', async (req, res) => {
  try {
    const { q, userId } = req.query;
    if (!q) return res.json([]);
    
    let users = await User.find({ username: { $regex: q, $options: 'i' } })
                            .select('_id username blockedUsers');
    
    // Ignore self and users who blocked us
    users = users.filter(u => u._id.toString() !== userId && !u.blockedUsers.includes(userId));
    
    const safeUsers = users.map(u => ({ _id: u._id, username: u.username }));
    res.json(safeUsers);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Send Friend Request
router.post('/add-friend', async (req, res) => {
  try {
    const { userId, friendId } = req.body;
    if (userId === friendId) return res.status(400).json({ message: "Invalid" });
    
    const sender = await User.findById(userId);
    const receiver = await User.findById(friendId);
    
    if (receiver.blockedUsers.includes(userId) || sender.blockedUsers.includes(friendId)) {
      return res.status(403).json({ message: 'Cannot interact with this user' });
    }
    if (sender.friends.includes(friendId) || sender.sentRequests.includes(friendId)) {
      return res.status(400).json({ message: 'Already connected or requested' });
    }

    sender.sentRequests.push(friendId);
    receiver.receivedRequests.push(userId);
    
    await sender.save();
    await receiver.save();
    res.json({ message: 'Friend request sent' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Accept Request
router.post('/accept-request', async (req, res) => {
  try {
    const { userId, requesterId } = req.body;
    const user = await User.findById(userId);
    const requester = await User.findById(requesterId);
    
    user.receivedRequests.pull(requesterId);
    requester.sentRequests.pull(userId);
    
    user.friends.push(requesterId);
    requester.friends.push(userId);
    
    await user.save();
    await requester.save();
    res.json({ message: 'Friend request accepted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Reject Request
router.post('/reject-request', async (req, res) => {
  try {
    const { userId, requesterId } = req.body;
    await User.findByIdAndUpdate(userId, { $pull: { receivedRequests: requesterId } });
    await User.findByIdAndUpdate(requesterId, { $pull: { sentRequests: userId } });
    res.json({ message: 'Friend request rejected' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Remove friend
router.post('/remove-friend', async (req, res) => {
  try {
    const { userId, friendId } = req.body;
    await User.findByIdAndUpdate(userId, { $pull: { friends: friendId } });
    await User.findByIdAndUpdate(friendId, { $pull: { friends: userId } });
    res.json({ message: 'Friend removed' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Block user
router.post('/block-user', async (req, res) => {
  try {
    const { userId, blockId } = req.body;
    const user = await User.findById(userId);
    if (!user.blockedUsers.includes(blockId)) {
      user.blockedUsers.push(blockId);
    }
    user.friends.pull(blockId);
    user.sentRequests.pull(blockId);
    user.receivedRequests.pull(blockId);
    await user.save();
    
    const blocked = await User.findById(blockId);
    blocked.friends.pull(userId);
    blocked.sentRequests.pull(userId);
    blocked.receivedRequests.pull(userId);
    await blocked.save();
    
    res.json({ message: 'User blocked' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Unblock user
router.post('/unblock-user', async (req, res) => {
  try {
    const { userId, blockId } = req.body;
    await User.findByIdAndUpdate(userId, { $pull: { blockedUsers: blockId } });
    res.json({ message: 'User unblocked' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user profile explicitly
router.get('/user/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('_id username');
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get consolidated structural data 
router.get('/friends/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const user = await User.findById(userId)
      .populate('friends', '_id username')
      .populate('sentRequests', '_id username')
      .populate('receivedRequests', '_id username')
      .populate('blockedUsers', '_id username');
    
    const messages = await Message.find({
      $or: [{ sender: userId }, { receiver: userId }]
    }).populate('sender', '_id username').populate('receiver', '_id username');
    
    const partnerMap = new Map();
    messages.forEach(msg => {
      const isSender = msg.sender._id.toString() === userId;
      const partner = isSender ? msg.receiver : msg.sender;
      if (!partner) return;
      const pId = partner._id.toString();
      
      // Filter out mapped activities if they are blocked
      if (user.blockedUsers.some(b => b._id.toString() === pId)) return;

      if (!partnerMap.has(pId)) {
        partnerMap.set(pId, { _id: partner._id, username: partner.username, latestMsg: msg });
      } else {
        if (new Date(msg.createdAt) > new Date(partnerMap.get(pId).latestMsg.createdAt)) {
          partnerMap.get(pId).latestMsg = msg;
        }
      }
    });

    const activeChats = [];
    partnerMap.forEach(partner => {
      const clearedAt = user.clearedChats?.get(partner._id.toString()) || new Date(0);
      if (new Date(partner.latestMsg.createdAt) > clearedAt) {
        activeChats.push({
          _id: partner._id,
          username: partner.username,
          hasActiveChat: true,
          latestMessageAt: partner.latestMsg.createdAt
        });
      }
    });

    const allFriends = user.friends.map(f => ({ _id: f._id, username: f.username }));
    const sentReq = user.sentRequests.map(f => ({ _id: f._id, username: f.username }));
    const recvReq = user.receivedRequests.map(f => ({ _id: f._id, username: f.username }));
    const blocked = user.blockedUsers.map(f => ({ _id: f._id, username: f.username }));

    activeChats.sort((a, b) => new Date(b.latestMessageAt) - new Date(a.latestMessageAt));

    res.json({ 
      friends: allFriends, 
      activeChats, 
      sentRequests: sentReq, 
      receivedRequests: recvReq, 
      blockedUsers: blocked 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
