const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const messageRoutes = require('./routes/messages');
const adminRoutes = require('./routes/admin');
const Message = require('./models/Message');

dotenv.config();

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
app.use(express.json());

// Attach io to req for access in routes
app.use((req, res, next) => {
  req.io = io;
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

  socket.on('user_online', (data) => {
    const { userId, deviceType } = typeof data === 'string' ? { userId: data, deviceType: 'desktop' } : data;
    socket.join(userId);
    onlineUsers.set(socket.id, { userId, deviceType });
    
    const uniqueUsers = Array.from(onlineUsers.values());
    io.emit('online_users', uniqueUsers);
  });

  socket.on('send_message', async (data) => {
    try {
      const User = require('./models/User');
      const senderObj = await User.findById(data.senderId);
      const receiverObj = await User.findById(data.receiverId);
      
      if (!senderObj || !receiverObj) return;

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

      if (!isFriend) {
         if (!hasPendingReq) {
           return io.to(data.senderId).emit('chat_error', 'You must send a friend request to chat.');
         }
         
         const count = await Message.countDocuments({ sender: data.senderId, receiver: data.receiverId });
         if (count >= 10) {
           return io.to(data.senderId).emit('chat_error', 'Limit of 10 messages reached. Wait for them to accept the request.');
         }
      }

      const newMessage = new Message({
        sender: data.senderId,
        receiver: data.receiverId,
        text: data.text,
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

      // Trigger Push Notification if user is offline
      const isOnline = Array.from(onlineUsers.values()).some(u => u.userId === data.receiverId);
      if (!isOnline && receiverObj.pushSubscription) {
        try {
          const payload = JSON.stringify({
            title: `New message from ${populatedMsg.sender.username}`,
            body: populatedMsg.text.length > 30 ? populatedMsg.text.substring(0, 30) + '...' : populatedMsg.text,
            url: `/chat/${data.senderId}`
          });
          await webPush.sendNotification(receiverObj.pushSubscription, payload);
          console.log(`Push notification sent to ${populatedMsg.receiver.username}`);
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
