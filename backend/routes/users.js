const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Message = require('../models/Message');
const {
  CACHE_TTL,
  cacheKey,
  getJson,
  invalidateUser,
  setJson,
} = require('../utils/cache');

const router = express.Router();
const ObjectId = mongoose.Types.ObjectId;
const getClearedAt = (clearedChats, partnerId) => {
  if (!clearedChats) return new Date(0);
  if (typeof clearedChats.get === 'function') return clearedChats.get(partnerId) || new Date(0);
  return clearedChats[partnerId] || new Date(0);
};

const clampLimit = (value, fallback = 20, max = 50) => Math.min(Math.max(parseInt(value, 10) || fallback, 1), max);
const clampOffset = (value) => Math.max(parseInt(value, 10) || 0, 0);
const toSafeUser = (u) => ({
  _id: u._id,
  username: u.username,
  firstName: u.firstName,
  lastName: u.lastName,
  profilePic: u.profilePic,
  bio: u.bio,
});

// Search users
router.get('/search', async (req, res) => {
  try {
    const { q, userId } = req.query;
    if (!q) return res.json([]);
    const limit = clampLimit(req.query.limit, 20, 25);
    const offset = clampOffset(req.query.offset);
    const searchKey = cacheKey('search', userId, q.trim().toLowerCase(), limit, offset);
    const cached = await getJson(searchKey);
    if (cached) return res.json(cached);
    
    const reqUser = await User.findById(userId).select('blockedUsers').lean();
    
    let users = await User.find({
      $or: [
        { username: { $regex: q, $options: 'i' } },
        { firstName: { $regex: q, $options: 'i' } },
        { lastName: { $regex: q, $options: 'i' } }
      ]
    }).select('_id username firstName lastName profilePic bio blockedUsers').limit(limit + offset + 1).lean();
    
    // Ignore self, users who blocked us, and users we blocked
    users = users.filter(u => 
      u._id.toString() !== userId && 
      !u.blockedUsers.some((id) => String(id) === String(userId)) && 
      !reqUser?.blockedUsers?.some((id) => String(id) === String(u._id))
    );
    
    const visibleUsers = users.slice(offset, offset + limit);
    const result = {
      users: visibleUsers.map(toSafeUser),
      hasMore: users.length > offset + limit,
      nextOffset: offset + visibleUsers.length,
    };
    await setJson(searchKey, result, CACHE_TTL.SEARCH);
    res.json(result);
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
    await Promise.all([invalidateUser(userId), invalidateUser(friendId)]);
    
    // Notify receiver in real-time
    const safeSender = await User.findById(userId).select('_id username firstName lastName profilePic bio').lean();
    req.io.to(friendId).emit('friend_request_received', { requester: safeSender });
    
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
    await Promise.all([invalidateUser(userId), invalidateUser(requesterId)]);
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
    await Promise.all([invalidateUser(userId), invalidateUser(requesterId)]);
    res.json({ message: 'Friend request rejected' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Cancel Sent Request
router.post('/cancel-request', async (req, res) => {
  try {
    const { userId, receiverId } = req.body;
    await User.findByIdAndUpdate(userId, { $pull: { sentRequests: receiverId } });
    await User.findByIdAndUpdate(receiverId, { $pull: { receivedRequests: userId } });
    await Promise.all([invalidateUser(userId), invalidateUser(receiverId)]);
    res.json({ message: 'Friend request cancelled' });
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
    await Promise.all([invalidateUser(userId), invalidateUser(friendId)]);
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
    await Promise.all([invalidateUser(userId), invalidateUser(blockId)]);
    
    res.json({ message: 'User blocked' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Unblock user
router.post('/unblock-user', async (req, res) => {
  try {
    const { userId, blockId } = req.body;
    await User.findByIdAndUpdate(userId, { 
      $pull: { blockedUsers: blockId },
      $addToSet: { friends: blockId }
    });
    await User.findByIdAndUpdate(blockId, {
      $addToSet: { friends: userId }
    });
    await Promise.all([invalidateUser(userId), invalidateUser(blockId)]);
    res.json({ message: 'User unblocked' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user profile explicitly
router.get('/user/:id', async (req, res) => {
  try {
    const key = cacheKey('user', req.params.id, 'profile');
    const cached = await getJson(key);
    if (cached) return res.json(cached);

    const user = await User.findById(req.params.id)
      .select('_id username firstName lastName profilePic bio canDeleteMessages deleteManuallyDisabled canMediaSharing mediaSharingManuallyDisabled canUploadFiles canRestrictedFileUpload canUnrestrictedFileUpload unrestrictedFileSharingManuallyDisabled maxFileSize allowedFileTypes')
      .lean();
    await setJson(key, user, CACHE_TTL.USER_PROFILE);
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/relationship/:userId/:friendId', async (req, res) => {
  try {
    const { userId, friendId } = req.params;
    const key = cacheKey('user', userId, 'relationship', friendId);
    const cached = await getJson(key);
    if (cached) return res.json(cached);

    const user = await User.findById(userId)
      .select('friends sentRequests receivedRequests blockedUsers')
      .lean();

    const result = {
      isFriend: user?.friends?.some((id) => String(id) === String(friendId)) || false,
      isSentReq: user?.sentRequests?.some((id) => String(id) === String(friendId)) || false,
      isRecvReq: user?.receivedRequests?.some((id) => String(id) === String(friendId)) || false,
      isBlocked: user?.blockedUsers?.some((id) => String(id) === String(friendId)) || false,
    };
    await setJson(key, result, CACHE_TTL.USER_LISTS);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/active-chats/:userId', async (req, res) => {
  try {
    const startedAt = Date.now();
    const userId = req.params.userId;
    const activeLimit = clampLimit(req.query.activeLimit, 20, 50);
    const activeOffset = clampOffset(req.query.activeOffset);
    const responseKey = cacheKey('user', userId, 'active-chats-response', activeLimit, activeOffset);
    const cachedResponse = await getJson(responseKey);
    if (cachedResponse) {
      console.log(`[users/active-chats] ${userId}: REDIS response cache hit (${Date.now() - startedAt}ms)`);
      res.set('X-Cache-Source', 'redis');
      return res.json({ ...cachedResponse, source: 'redis' });
    }

    const latestMessagesKey = cacheKey('user', userId, 'latestMessages', 'per-partner');
    let latestMessagePerPartner = await getJson(latestMessagesKey);

    if (!latestMessagePerPartner) {
      console.log(`[users/active-chats] ${userId}: latest messages Redis miss; running MongoDB aggregation`);
      const userObjectId = new ObjectId(userId);
      latestMessagePerPartner = await Message.aggregate([
        { $match: { $or: [{ sender: userObjectId }, { receiver: userObjectId }] } },
        {
          $project: {
            createdAt: 1,
            partner: {
              $cond: [{ $eq: ['$sender', userObjectId] }, '$receiver', '$sender']
            }
          }
        },
        { $group: { _id: '$partner', latestMessageAt: { $max: '$createdAt' } } },
        { $sort: { latestMessageAt: -1 } }
      ]);
      await setJson(latestMessagesKey, latestMessagePerPartner, CACHE_TTL.USER_LISTS);
    } else {
      console.log(`[users/active-chats] ${userId}: latest messages REDIS hit`);
    }

    const user = await User.findById(userId).select('clearedChats').lean();
    const visibleLatest = latestMessagePerPartner.filter((chatInfo) => {
      const partnerIdStr = String(chatInfo._id);
      const clearedAt = getClearedAt(user?.clearedChats, partnerIdStr);
      return new Date(chatInfo.latestMessageAt) > new Date(clearedAt);
    });

    const activePage = visibleLatest.slice(activeOffset, activeOffset + activeLimit);
    const partnerIds = activePage.map((m) => m._id);
    const partners = partnerIds.length
      ? await User.find({ _id: { $in: partnerIds } })
          .select('_id username firstName lastName profilePic bio')
          .lean()
      : [];
    const partnerMap = new Map(partners.map((p) => [String(p._id), p]));

    const activeChats = activePage
      .map((chatInfo) => {
        const partner = partnerMap.get(String(chatInfo._id));
        if (!partner) return null;
        return {
          _id: partner._id,
          username: partner.username,
          firstName: partner.firstName,
          lastName: partner.lastName,
          profilePic: partner.profilePic,
          bio: partner.bio,
          hasActiveChat: true,
          latestMessageAt: chatInfo.latestMessageAt
        };
      })
      .filter(Boolean);

    const result = {
      activeChats,
      source: 'db',
      pagination: {
        activeChats: {
          hasMore: visibleLatest.length > activeOffset + activeLimit,
          nextOffset: activeOffset + activeChats.length,
        },
      },
    };

    await setJson(responseKey, result, CACHE_TTL.USER_LISTS);
    console.log(`[users/active-chats] ${userId}: built ${activeChats.length} active chats in ${Date.now() - startedAt}ms`);
    res.set('X-Cache-Source', 'db');
    res.json(result);
  } catch (err) {
    console.error('Active chats error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get consolidated structural data - OPTIMIZED WITH BETTER CACHING
router.get('/friends/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const activeLimit = clampLimit(req.query.activeLimit, 20, 50);
    const activeOffset = clampOffset(req.query.activeOffset);
    const friendsLimit = clampLimit(req.query.friendsLimit, 20, 50);
    const friendsOffset = clampOffset(req.query.friendsOffset);
    const requestsLimit = clampLimit(req.query.requestsLimit, 20, 50);
    const blockedLimit = clampLimit(req.query.blockedLimit, 20, 50);
    const includeActiveChats = req.query.includeActive !== '0';
    const responseKey = cacheKey('user', userId, 'friends-response', includeActiveChats ? 1 : 0, activeLimit, activeOffset, friendsLimit, friendsOffset, requestsLimit, blockedLimit);
    const cachedResponse = await getJson(responseKey);
    if (cachedResponse) {
      console.log(`[users/friends] ${userId}: REDIS response cache hit`);
      res.set('X-Cache-Source', 'redis');
      return res.json({ ...cachedResponse, source: 'redis' });
    }

    console.log(`[users/friends] ${userId}: response cache miss; assembling lists`);

    // ✅ OPTIMIZATION: Separate cache for base lists (no pagination)
    const baseListsKey = cacheKey('user', userId, 'lists', 'base');
    const cachedBaseLists = await getJson(baseListsKey);

    let user, allFriendsRaw, sentRaw, receivedRaw, blockedRaw;

    if (cachedBaseLists) {
      console.log(`[users/friends] ${userId}: base lists REDIS hit`);
      allFriendsRaw = cachedBaseLists.allFriends;
      sentRaw = cachedBaseLists.sentRequests;
      receivedRaw = cachedBaseLists.receivedRequests;
      blockedRaw = cachedBaseLists.blockedUsers;
      user = cachedBaseLists.user;
    } else {
      console.log(`[users/friends] ${userId}: base lists Redis miss; querying MongoDB`);
      user = await User.findById(userId)
        .populate('friends', '_id username firstName lastName profilePic bio')
        .populate('sentRequests', '_id username firstName lastName profilePic bio')
        .populate('receivedRequests', '_id username firstName lastName profilePic bio')
        .populate('blockedUsers', '_id username firstName lastName profilePic bio')
        .lean();

      allFriendsRaw = user.friends.map(toSafeUser);
      sentRaw = user.sentRequests.map(toSafeUser);
      receivedRaw = user.receivedRequests.map(toSafeUser);
      blockedRaw = user.blockedUsers.map(toSafeUser);

      // Cache base lists for 5 minutes
      await setJson(baseListsKey, {
        user: { clearedChats: user.clearedChats },
        allFriends: allFriendsRaw,
        sentRequests: sentRaw,
        receivedRequests: receivedRaw,
        blockedUsers: blockedRaw,
      }, CACHE_TTL.USER_LISTS);
    }

    // ✅ OPTIMIZATION: Separate cache for aggregation result (expensive operation)
    const latestMessagesKey = cacheKey('user', userId, 'latestMessages', 'per-partner');
    let latestMessagePerPartner = includeActiveChats ? await getJson(latestMessagesKey) : [];

    if (includeActiveChats && !latestMessagePerPartner) {
      console.log(`[users/friends] ${userId}: latest messages Redis miss; running MongoDB aggregation`);
      const userObjectId = new ObjectId(userId);
      
      // Get ALL latest messages (no pagination here!)
      latestMessagePerPartner = await Message.aggregate([
        { $match: { $or: [{ sender: userObjectId }, { receiver: userObjectId }] } },
        {
          $project: {
            createdAt: 1,
            partner: {
              $cond: [{ $eq: ['$sender', userObjectId] }, '$receiver', '$sender']
            }
          }
        },
        { $group: { _id: '$partner', latestMessageAt: { $max: '$createdAt' } } },
        { $sort: { latestMessageAt: -1 } }
      ]);

      // Cache for 5 minutes
      await setJson(latestMessagesKey, latestMessagePerPartner, CACHE_TTL.USER_LISTS);
    } else if (includeActiveChats) {
      console.log(`[users/friends] ${userId}: latest messages REDIS hit`);
    }

    // Pagination happens IN-MEMORY from cached data (INSTANT!) ⚡
    const partnerIds = latestMessagePerPartner.map((m) => m._id);
    const partners = partnerIds.length
      ? await User.find({ _id: { $in: partnerIds } })
          .select('_id username firstName lastName profilePic bio')
          .lean()
      : [];

    const partnerMap = new Map(partners.map((p) => [String(p._id), p]));

    const activeChats = [];
    latestMessagePerPartner.forEach((chatInfo) => {
      const partnerIdStr = String(chatInfo._id);
      const partner = partnerMap.get(partnerIdStr);
      if (!partner) return;

      const clearedAt = getClearedAt(user.clearedChats, partnerIdStr);
      if (new Date(chatInfo.latestMessageAt) > new Date(clearedAt)) {
        activeChats.push({
          _id: partner._id,
          username: partner.username,
          firstName: partner.firstName,
          lastName: partner.lastName,
          profilePic: partner.profilePic,
          bio: partner.bio,
          hasActiveChat: true,
          latestMessageAt: chatInfo.latestMessageAt
        });
      }
    });

    // Pagination from full cached data (no DB query!)
    const allFriends = allFriendsRaw.slice(friendsOffset, friendsOffset + friendsLimit);
    const sentReq = sentRaw.slice(0, requestsLimit);
    const recvReq = receivedRaw.slice(0, requestsLimit);
    const blocked = blockedRaw.slice(0, blockedLimit);

    activeChats.sort((a, b) => new Date(b.latestMessageAt) - new Date(a.latestMessageAt));
    const activeChatsPage = activeChats.slice(activeOffset, activeOffset + activeLimit);

    const result = { 
      friends: allFriends, 
      activeChats: activeChatsPage, 
      sentRequests: sentReq, 
      receivedRequests: recvReq, 
      blockedUsers: blocked,
      source: 'db',
      pagination: {
        activeChats: {
          hasMore: activeChats.length > activeOffset + activeLimit,
          nextOffset: activeOffset + activeChatsPage.length,
        },
        friends: {
          hasMore: allFriendsRaw.length > friendsOffset + friendsLimit,
          nextOffset: friendsOffset + allFriends.length,
          totalLoaded: friendsOffset + allFriends.length,
          total: allFriendsRaw.length,
        },
        sentRequests: { hasMore: sentRaw.length > requestsLimit, total: sentRaw.length },
        receivedRequests: { hasMore: receivedRaw.length > requestsLimit, total: receivedRaw.length },
        blockedUsers: { hasMore: blockedRaw.length > blockedLimit, total: blockedRaw.length },
      },
    };
    await setJson(responseKey, result, CACHE_TTL.USER_LISTS);
    
    res.set('X-Cache-Source', 'db');
    res.json(result);
  } catch (err) {
    console.error('Friends list error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Toggle Auto-Logout
router.post('/toggle-autologout', async (req, res) => {
  try {
    const { userId, autoLogoutEnabled } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    user.autoLogoutEnabled = autoLogoutEnabled;
    await user.save();
    await invalidateUser(userId);
    res.json({ message: 'Preference updated', autoLogoutEnabled: user.autoLogoutEnabled });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});
// Save Push Subscription
router.post('/subscribe', async (req, res) => {
  try {
    const { userId, subscription } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    user.pushSubscription = subscription;
    await user.save();
    await invalidateUser(userId);
    res.status(201).json({ message: 'Push subscription saved' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Disable Push Subscription
router.post('/unsubscribe', async (req, res) => {
  try {
    const { userId } = req.body;
    await User.findByIdAndUpdate(userId, { pushSubscription: null });
    await invalidateUser(userId);
    res.json({ message: 'Unsubscribed successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update Profile
router.post('/profile-update', async (req, res) => {
  try {
    const { userId, firstName, lastName, profilePic, bio } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (profilePic !== undefined) user.profilePic = profilePic;
    if (bio !== undefined) user.bio = bio;
    
    user.isProfileSetup = true;
    
    await user.save();
    await invalidateUser(userId);
    res.json({ message: 'Profile updated successfully', user: { ...user.toObject(), password: '' } });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
