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

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

app.use(cors());
app.use(express.json());

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

  socket.on('user_online', (userId) => {
    socket.join(userId);
    onlineUsers.set(socket.id, userId);
    
    const uniqueUsers = Array.from(new Set(onlineUsers.values()));
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
     await Message.updateMany(
       { sender: friendId, receiver: userId, isRead: false },
       { $set: { isRead: true } }
     );
  });

  socket.on('disconnect', async () => {
    console.log('User disconnected:', socket.id);
    const userId = onlineUsers.get(socket.id);
    if (userId) {
      try {
        const User = require('./models/User');
        await User.findByIdAndUpdate(userId, { lastOnline: new Date() });
      } catch(e) {}
    }
    onlineUsers.delete(socket.id);
    const uniqueUsers = Array.from(new Set(onlineUsers.values()));
    io.emit('online_users', uniqueUsers);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
