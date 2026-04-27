const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const messageRoutes = require('./routes/messages');
const adminRoutes = require('./routes/admin');
const Message = require('./models/Message');


const webPush = require('web-push');

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(
    'mailto:test@securechat.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Attach io to req for access in routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Request logging
app.use((req, res, next) => {
  if (req.url.includes('/upload')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  }
  next();
});


app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/admin', adminRoutes);

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB Connected successfully'))
  .catch((err) => console.log('MongoDB Connection Error:', err));

const onlineUsers = new Map(); // Maps socket.id -> userId

io.on('connection', (socket) => {
  console.log('User connected to socket:', socket.id);

  socket.on('user_online', async (data) => {
    const { userId, deviceType, isSuperAdminSession } = typeof data === 'string' ? { userId: data, deviceType: 'desktop' } : data;
    socket.join(userId);
    onlineUsers.set(socket.id, { userId, deviceType, isSuperAdminSession });
    
    // Auto-update system metadata for users actively connecting
    try {
      const User = require('./models/User');
      const uaString = socket.handshake?.headers?.['user-agent'];
      if (uaString) {
        const UAParser = require('ua-parser-js');
        const parser = new UAParser(uaString);
        const resUA = parser.getResult();
        
        const metadata = {
          deviceType: resUA.device.type || deviceType || 'desktop',
          os: resUA.os.name || 'Unknown OS',
          browser: resUA.browser.name || 'Unknown Browser',
          brand: resUA.device.vendor || (resUA.os.name === 'iOS' ? 'Apple' : resUA.os.name) || 'Generic',
          model: resUA.device.model || (resUA.device.type ? `${resUA.device.type} device` : 'Device')
        };
        if (metadata.deviceType === 'desktop' && metadata.brand === 'Generic') {
          metadata.brand = 'Personal Computer';
        }

        await User.findByIdAndUpdate(userId, { lastLoginMetadata: metadata });
      }
    } catch (e) {
      console.error('Error updating metadata on connect:', e);
    }
    
    const uniqueUsers = Array.from(onlineUsers.values());
    io.emit('online_users', uniqueUsers);
  });

  socket.on('user_unblocked', (data) => {
    io.to(data.unblockedId).emit('friend_unblocked_you', data.userId);
  });

  socket.on('send_message', async (data) => {
    try {
      const User = require('./models/User');
      const senderObj = await User.findById(data.senderId);
      const receiverObj = await User.findById(data.receiverId);
      
      if (!senderObj || !receiverObj) return;

      const session = onlineUsers.get(socket.id);
      const isSuperAdmin = session?.isSuperAdminSession === true || session?.isSuperAdminSession === 'true';

      if (
        senderObj.blockedUsers.some(id => id.toString() === data.receiverId) || 
        receiverObj.blockedUsers.some(id => id.toString() === data.senderId)
      ) {
        return io.to(data.senderId).emit('chat_error', 'Messaging blocked. Cannot send.');
      }

      const isFriend = senderObj.friends.some(id => id.toString() === data.receiverId);
      const hasPendingReq = 
        senderObj.sentRequests.some(id => id.toString() === data.receiverId) || 
        senderObj.receivedRequests.some(id => id.toString() === data.receiverId);

      if (!isFriend && !isSuperAdmin) {
         if (!hasPendingReq) {
           return io.to(data.senderId).emit('chat_error', 'You must send a friend request to chat.');
         }
         
         const count = await Message.countDocuments({ sender: data.senderId, receiver: data.receiverId });
         if (count >= 10 && !isSuperAdmin) {
           return io.to(data.senderId).emit('chat_error', 'Limit of 10 messages reached. Wait for them to accept the request.');
         }
      }

      const newMessage = new Message({
        sender: data.senderId,
        receiver: data.receiverId,
        text: data.text || '',
        imageUrl: data.imageUrl || null,
        imageUrls: data.imageUrls || [],
        file: data.file || null,
        files: data.files || [],
        replyTo: data.replyTo || null
      });
      await newMessage.save();
      
      const populatedMsg = await Message.findById(newMessage._id)
        .populate('sender', 'username')
        .populate('receiver', 'username')
        .populate({
          path: 'replyTo',
          select: 'text sender createdAt',
          populate: { path: 'sender', select: 'username' }
        });

      io.to(data.receiverId).emit('receive_message', populatedMsg);
      io.to(data.senderId).emit('receive_message', populatedMsg);

      // Trigger Push Notification if user is not in this chat
      const sessions = Array.from(onlineUsers.values()).filter(u => u.userId === data.receiverId);
      const isInCorrectChat = sessions.some(s => s.activeChatId === data.senderId);

      if (!isInCorrectChat && receiverObj.pushSubscription) {
        try {
          let notificationText = populatedMsg.text;
          if (!notificationText && (populatedMsg.file || populatedMsg.files?.length > 0)) {
            notificationText = `Sent ${populatedMsg.file ? 'a file' : 'files'}`;
          } else if (!notificationText && (populatedMsg.imageUrl || populatedMsg.imageUrls?.length > 0)) {
            notificationText = 'Sent an image';
          } else if (!notificationText) {
            notificationText = 'Sent a message';
          }

          const payload = JSON.stringify({
            title: `New message from ${populatedMsg.sender.username}`,
            body: notificationText.length > 50 ? notificationText.substring(0, 50) + '...' : notificationText,
            url: `/chat/${data.senderId}`
          });
          await webPush.sendNotification(receiverObj.pushSubscription, payload);
        } catch (pushErr) {
          console.error('Error sending push notification:', pushErr);
        }
      }
    } catch (err) {
      console.error('Error saving/sending socket message:', err);
    }
  });

  socket.on('edit_message', async (data) => {
    try {
      const updatedMsg = await Message.findByIdAndUpdate(
        data.messageId,
        { text: data.newText, isEdited: true },
        { new: true }
      )
      .populate('sender', 'username')
      .populate('receiver', 'username')
      .populate({
        path: 'replyTo',
        select: 'text sender createdAt',
        populate: { path: 'sender', select: 'username' }
      });

      if (updatedMsg) {
        io.to(updatedMsg.receiver._id.toString()).emit('message_edited', updatedMsg);
        io.to(updatedMsg.sender._id.toString()).emit('message_edited', updatedMsg);
      }
    } catch (err) {
      console.error('Error editing message:', err);
    }
  });

  socket.on('mark_read', async ({ userId, friendId }) => {
     const res = await Message.updateMany(
       { sender: friendId, receiver: userId, isRead: false },
       { $set: { isRead: true } }
     );
      if (res.modifiedCount > 0) {
        io.to(friendId).emit('messages_read', { byUserId: userId });
      }
  });

  socket.on('enter_chat', ({ userId, friendId }) => {
    const session = onlineUsers.get(socket.id);
    if (session) {
      session.activeChatId = friendId;
      onlineUsers.set(socket.id, session);
    }
  });

  socket.on('leave_chat', ({ userId, friendId }) => {
    const session = onlineUsers.get(socket.id);
    if (session && session.activeChatId === friendId) {
      delete session.activeChatId;
      onlineUsers.set(socket.id, session);
    }
  });

  socket.on('delete_message', async ({ messageId, userId }) => {
    try {
      const User = require('./models/User');

      // Check per-user delete permission
      const session = onlineUsers.get(socket.id);
      const isSuperAdmin = session?.isSuperAdminSession === true || session?.isSuperAdminSession === 'true';

      const senderUser = await User.findById(userId);
      if (!senderUser || (senderUser.canDeleteMessages === false && !isSuperAdmin)) {
        return io.to(userId).emit('chat_error', 'Message deletion is disabled for your account.');
      }

      const message = await Message.findById(messageId);
      if (!message) return;

      // Only the sender can delete their own message, unless they are an admin or super admin
      if (message.sender.toString() !== userId && !isSuperAdmin && senderUser.role !== 'admin') {
        return io.to(userId).emit('chat_error', 'You can only delete your own messages.');
      }

      const receiverId = message.receiver.toString();
      const senderId = message.sender.toString();

      await Message.findByIdAndDelete(messageId);

      // Notify both sender and receiver to remove from their UI
      io.to(senderId).emit('message_deleted', { messageId });
      io.to(receiverId).emit('message_deleted', { messageId });
    } catch (err) {
      console.error('Error deleting message:', err);
    }
  });

  socket.on('disconnect', async () => {
    console.log('User disconnected:', socket.id);
    const userData = onlineUsers.get(socket.id);
    if (userData) {
      try {
        const User = require('./models/User');
        await User.findByIdAndUpdate(userData.userId, { lastOnline: new Date() });
      } catch(e) {}
    }
    onlineUsers.delete(socket.id);
    const uniqueUsers = Array.from(onlineUsers.values());
    io.emit('online_users', uniqueUsers);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
