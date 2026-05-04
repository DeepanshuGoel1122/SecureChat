const { createClient } = require('redis');

const DEFAULT_REDIS_URL = 'redis://127.0.0.1:6379';

let client = null;
let isReady = false;

const CACHE_TTL = {
  USER_PROFILE: 5 * 60,
  USER_LISTS: 5 * 60,
  SEARCH: 60,
  UNREAD: 30,
  ROOM_MESSAGES: 10 * 60,
};

const ROOM_MESSAGE_LIMIT = 50; // Increased from 20 for better caching

function buildRedisOptions() {
  const url = process.env.REDIS_URL || DEFAULT_REDIS_URL;
  let useTls = process.env.REDIS_TLS === 'true';

  try {
    const parsedUrl = new URL(url);
    useTls = useTls || parsedUrl.protocol === 'rediss:' || parsedUrl.hostname.endsWith('.upstash.io');
  } catch {
    // Let the Redis client report malformed URLs during connect.
  }

  return {
    url,
    socket: {
      tls: useTls,
      reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
    },
  };
}

function getRedisClient() {
  if (!client) {
    client = createClient(buildRedisOptions());

    client.on('error', (err) => {
      isReady = false;
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[redis] cache unavailable:', err.message);
      }
    });

    client.on('ready', () => {
      isReady = true;
      console.log('[redis] cache connected');
    });

    client.on('end', () => {
      isReady = false;
    });
  }

  return client;
}

async function connectRedis() {
  const redis = getRedisClient();
  if (!redis.isOpen) {
    await redis.connect();
  }
  console.log(`[redis] Debug mode: ${process.env.CACHE_DEBUG === 'true' ? '✅ ENABLED' : '⚠️ DISABLED (set CACHE_DEBUG=true to enable)'}`);
  return redis;
}

function cacheKey(...parts) {
  return ['securechat', ...parts.map((part) => String(part))].join(':');
}

function roomKey(userA, userB) {
  return [String(userA), String(userB)].sort().join(':');
}

async function getJson(key) {
  if (!isReady) return null;
  try {
    const raw = await client.get(key);
    if (raw) {
      if (process.env.CACHE_DEBUG === 'true') {
        console.log(`✅ [CACHE HIT] ${key}`);
      }
      return JSON.parse(raw);
    }
    if (process.env.CACHE_DEBUG === 'true') {
      console.log(`❌ [CACHE MISS] ${key}`);
    }
    return null;
  } catch (err) {
    console.warn('[redis] get failed:', err.message);
    return null;
  }
}

async function setJson(key, value, ttlSeconds) {
  if (!isReady) return;
  try {
    await client.set(key, JSON.stringify(value), { EX: ttlSeconds });
    if (process.env.CACHE_DEBUG === 'true') {
      console.log(`💾 [CACHE SET] ${key} (TTL: ${ttlSeconds}s)`);
    }
  } catch (err) {
    console.warn('[redis] set failed:', err.message);
  }
}

async function delKeys(keys) {
  if (!isReady || !keys?.length) return;
  try {
    await client.del(keys);
  } catch (err) {
    console.warn('[redis] del failed:', err.message);
  }
}

async function delPattern(pattern) {
  if (!isReady) return;
  try {
    const keys = [];
    for await (const key of client.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      keys.push(key);
      if (keys.length >= 100) {
        await client.del(keys.splice(0, keys.length));
      }
    }
    if (keys.length) await client.del(keys);
  } catch (err) {
    console.warn('[redis] pattern delete failed:', err.message);
  }
}

async function pushRoomMessage(senderId, receiverId, message, limit = 20) {
  if (!isReady || !message) return;
  const key = cacheKey('room', roomKey(senderId, receiverId), 'latest');
  try {
    await client
      .multi()
      .lPush(key, JSON.stringify(message))
      .lTrim(key, 0, Math.max(limit - 1, 0))
      .expire(key, CACHE_TTL.ROOM_MESSAGES)
      .exec();
    if (process.env.CACHE_DEBUG === 'true') {
      console.log(`📨 [ROOM MSG CACHED] ${senderId} <-> ${receiverId}`);
    }
  } catch (err) {
    console.warn('[redis] room push failed:', err.message);
  }
}

async function getRoomMessages(senderId, receiverId, limit, clearedAt) {
  if (!isReady) return null;
  const key = cacheKey('room', roomKey(senderId, receiverId), 'latest');
  try {
    const rows = await client.lRange(key, 0, Math.max(limit - 1, 0));
    if (!rows.length) {
      if (process.env.CACHE_DEBUG === 'true') {
        console.log(`❌ [ROOM MSGS MISS] ${senderId} <-> ${receiverId}`);
      }
      return null;
    }

    const clearTime = new Date(clearedAt || 0).getTime();
    const messages = rows
      .map((row) => JSON.parse(row))
      .filter((msg) => new Date(msg.createdAt).getTime() > clearTime)
      .reverse();

    if (process.env.CACHE_DEBUG === 'true') {
      console.log(`✅ [ROOM MSGS HIT] ${senderId} <-> ${receiverId} (${messages.length} msgs)`);
    }
    return messages.length ? messages : null;
  } catch (err) {
    console.warn('[redis] room read failed:', err.message);
    return null;
  }
}

async function invalidateRoom(senderId, receiverId) {
  await delKeys([cacheKey('room', roomKey(senderId, receiverId), 'latest')]);
}

async function invalidateUser(userId) {
  await delPattern(cacheKey('user', userId, '*'));
  await delPattern(cacheKey('search', '*'));
  await delKeys([cacheKey('unread', userId)]);
}

async function invalidateUserChatSummaries(userId) {
  await delPattern(cacheKey('user', userId, 'friends-response', '*'));
  await delPattern(cacheKey('user', userId, 'active-chats-response', '*'));
  await delKeys([cacheKey('unread', userId)]);
}

async function upsertLatestMessagePartner(userId, partnerId, latestMessageAt) {
  if (!isReady || !userId || !partnerId || !latestMessageAt) return;

  const key = cacheKey('user', userId, 'latestMessages', 'per-partner');
  try {
    const raw = await client.get(key);
    if (!raw) return;

    const latestMessages = JSON.parse(raw);
    const partnerIdStr = String(partnerId);
    const existing = latestMessages.find((entry) => String(entry._id) === partnerIdStr);

    if (existing) {
      existing.latestMessageAt = latestMessageAt;
    } else {
      latestMessages.push({ _id: partnerIdStr, latestMessageAt });
    }

    latestMessages.sort((a, b) => new Date(b.latestMessageAt) - new Date(a.latestMessageAt));
    await setJson(key, latestMessages, CACHE_TTL.USER_LISTS);
  } catch (err) {
    console.warn('[redis] latest message update failed:', err.message);
  }
}

module.exports = {
  CACHE_TTL,
  ROOM_MESSAGE_LIMIT,
  cacheKey,
  connectRedis,
  getRedisClient,
  delKeys,
  delPattern,
  getJson,
  getRoomMessages,
  invalidateRoom,
  invalidateUser,
  invalidateUserChatSummaries,
  pushRoomMessage,
  roomKey,
  setJson,
  upsertLatestMessagePartner,
};
