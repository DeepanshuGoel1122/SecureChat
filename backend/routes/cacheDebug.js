/**
 * Cache Stats & Monitoring Endpoint
 * Add this to your admin or debug routes
 * GET /debug/cache-stats
 */

const express = require('express');
const router = express.Router();

// Simple cache statistics tracker
let cacheStats = {
  requestCount: 0,
  cacheHits: 0,
  cacheMisses: 0,
  startTime: new Date(),
};

// Test cache - verify it's working
router.get('/cache-test', async (req, res) => {
  try {
    const { getRedisClient, setJson, getJson, cacheKey } = require('../utils/cache');
    const client = getRedisClient();
    
    if (!client.isOpen) {
      return res.status(503).json({ 
        error: '❌ Redis not connected',
        isConnected: false,
        help: 'Make sure Redis is running: redis-server'
      });
    }

    // Test 1: Set a test value
    const testKey = cacheKey('debug', 'test', Date.now());
    const testValue = { test: 'hello', timestamp: new Date().toISOString() };
    
    console.log(`\n🧪 CACHE TEST STARTED`);
    console.log(`📝 Setting test value at key: ${testKey}`);
    
    await setJson(testKey, testValue, 60);
    
    // Test 2: Get the test value
    console.log(`📖 Getting test value...`);
    const retrieved = await getJson(testKey);
    
    if (!retrieved) {
      return res.status(500).json({
        status: '❌ FAILED',
        error: 'Could not retrieve value after setting it',
        testKey,
        help: 'Check Redis connection and logs'
      });
    }

    console.log(`✅ CACHE TEST PASSED\n`);

    res.json({
      status: '✅ CACHE IS WORKING!',
      isConnected: true,
      testPassed: JSON.stringify(retrieved) === JSON.stringify(testValue),
      testDetails: {
        keySet: testKey,
        valueSet: testValue,
        valueRetrieved: retrieved,
        match: JSON.stringify(retrieved) === JSON.stringify(testValue)
      },
      nextSteps: [
        '1. Open your app and login',
        '2. Watch backend terminal for cache logs:',
        '   ❌ [CACHE MISS] - first time',
        '   ✅ [CACHE HIT] - subsequent times',
        '3. Enable CACHE_DEBUG: set CACHE_DEBUG=true',
        '4. Refresh page to see detailed logging'
      ]
    });
  } catch (err) {
    console.error('Cache test error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Diagnostics - check what's wrong with cache
router.get('/cache-diagnose', async (req, res) => {
  try {
    const { getRedisClient } = require('../utils/cache');
    const client = getRedisClient();
    
    const diagnostics = {
      redis: {
        connected: client.isOpen,
        ready: client.isReady,
        status: client.status
      },
      environment: {
        cacheDebugEnabled: process.env.CACHE_DEBUG === 'true',
        redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
        nodeEnv: process.env.NODE_ENV || 'development'
      },
      issues: [],
      solutions: []
    };

    // Check for issues
    if (!client.isOpen) {
      diagnostics.issues.push('❌ Redis client is not open');
      diagnostics.solutions.push('Make sure Redis is running: redis-server');
      diagnostics.solutions.push('Check REDIS_URL in .env file');
    }

    if (!client.isReady) {
      diagnostics.issues.push('❌ Redis client is not ready');
      diagnostics.solutions.push('Wait a moment and try again, Redis may still be connecting');
    }

    if (process.env.CACHE_DEBUG !== 'true') {
      diagnostics.issues.push('⚠️ CACHE_DEBUG is not enabled');
      diagnostics.solutions.push('Set environment variable: set CACHE_DEBUG=true');
      diagnostics.solutions.push('Then restart the server: npm start');
    }

    res.json({
      status: diagnostics.issues.length === 0 ? '✅ All Good!' : '⚠️ Issues Found',
      diagnostics,
      quickStart: {
        step1: 'Verify Redis is running: redis-cli ping',
        step2: 'Enable debug mode: set CACHE_DEBUG=true',
        step3: 'Restart backend: npm start',
        step4: 'Test cache: curl http://localhost:5000/debug/cache-test',
        step5: 'Open app and refresh - watch terminal for logs'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Middleware to track all cache operations
const cacheTracker = (originalGetJson, originalSetJson) => {
  return {
    async trackedGetJson(key) {
      cacheStats.requestCount++;
      const result = await originalGetJson(key);
      
      if (result) {
        cacheStats.cacheHits++;
      } else {
        cacheStats.cacheMisses++;
      }
      
      return result;
    },
    
    async trackedSetJson(key, value, ttl) {
      return await originalSetJson(key, value, ttl);
    }
  };
};

// Get cache statistics
router.get('/cache-stats', async (req, res) => {
  try {
    const { getRedisClient, cacheKey } = require('../utils/cache');
    const client = getRedisClient();
    
    if (!client.isOpen) {
      return res.status(503).json({ 
        error: 'Redis not connected',
        isConnected: false 
      });
    }

    // Get all cache keys
    const keys = await client.keys('securechat:*');
    
    // Categorize keys
    const categories = {
      userProfiles: keys.filter(k => k.includes(':profile')).length,
      searches: keys.filter(k => k.includes(':search:')).length,
      roomMessages: keys.filter(k => k.includes(':room:')).length,
      unreadCounts: keys.filter(k => k.includes(':unread:')).length,
      other: keys.length - 
        (keys.filter(k => k.includes(':profile')).length +
         keys.filter(k => k.includes(':search:')).length +
         keys.filter(k => k.includes(':room:')).length +
         keys.filter(k => k.includes(':unread:')).length)
    };

    // Get memory info
    const info = await client.info('memory');
    const memoryMatch = info.match(/used_memory_human:(.+?)\r\n/);
    const usedMemory = memoryMatch ? memoryMatch[1] : 'N/A';

    // Calculate stats
    const total = cacheStats.cacheHits + cacheStats.cacheMisses;
    const hitRate = total > 0 ? ((cacheStats.cacheHits / total) * 100).toFixed(2) : 0;
    const uptime = Math.floor((Date.now() - cacheStats.startTime.getTime()) / 1000);

    res.json({
      isConnected: true,
      uptime: `${uptime}s`,
      
      // Overall stats
      cachePerformance: {
        totalRequests: cacheStats.requestCount,
        hits: cacheStats.cacheHits,
        misses: cacheStats.cacheMisses,
        hitRate: `${hitRate}%`,
      },
      
      // Key breakdown
      keysByType: {
        ...categories,
        total: keys.length,
      },
      
      // Memory
      memory: {
        used: usedMemory,
        totalKeys: keys.length,
      },
      
      // Health
      health: {
        status: hitRate > 70 ? '✅ Excellent' : hitRate > 50 ? '⚠️ Good' : '❌ Needs Improvement',
        recommendation: hitRate > 70 ? 'Cache working great!' : 'Cache hit rate could be better - check TTL values'
      },
      
      // Sample keys
      sampleKeys: {
        profiles: keys.filter(k => k.includes(':profile')).slice(0, 3),
        searches: keys.filter(k => k.includes(':search:')).slice(0, 3),
        roomMessages: keys.filter(k => k.includes(':room:')).slice(0, 3),
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clear all cache
router.post('/cache-clear', async (req, res) => {
  try {
    const { getRedisClient } = require('../utils/cache');
    const client = getRedisClient();
    
    if (!client.isOpen) {
      return res.status(503).json({ error: 'Redis not connected' });
    }

    await client.flushDb();
    
    // Reset stats
    cacheStats = {
      requestCount: 0,
      cacheHits: 0,
      cacheMisses: 0,
      startTime: new Date(),
    };
    
    res.json({ message: 'Cache cleared successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get specific key value
router.get('/cache-key/:key', async (req, res) => {
  try {
    const { getRedisClient } = require('../utils/cache');
    const client = getRedisClient();
    
    if (!client.isOpen) {
      return res.status(503).json({ error: 'Redis not connected' });
    }

    const fullKey = `securechat:${req.params.key}`;
    const value = await client.get(fullKey);
    const ttl = await client.ttl(fullKey);

    res.json({
      key: fullKey,
      value: value ? JSON.parse(value) : null,
      ttlSeconds: ttl === -2 ? 'Key does not exist' : ttl === -1 ? 'No expiration' : ttl,
      exists: value !== null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reset statistics
router.post('/cache-stats-reset', (req, res) => {
  cacheStats = {
    requestCount: 0,
    cacheHits: 0,
    cacheMisses: 0,
    startTime: new Date(),
  };
  res.json({ message: 'Statistics reset' });
});

module.exports = router;
