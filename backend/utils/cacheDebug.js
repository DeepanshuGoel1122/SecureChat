/**
 * Cache Debug & Monitoring Utility
 * Tracks cache hits/misses and provides performance insights
 */

let stats = {
  hits: 0,
  misses: 0,
  totalTime: 0,
  avgTime: 0,
};

const originalGetJson = require('./cache').getJson;
const originalSetJson = require('./cache').setJson;

// Track cache access timing and hit/miss rate
async function trackCacheGet(key, cacheFunc) {
  const startTime = Date.now();
  const result = await cacheFunc(key);
  const duration = Date.now() - startTime;

  if (result) {
    stats.hits++;
    console.log(`[CACHE HIT] ${key} (${duration}ms)`);
  } else {
    stats.misses++;
    console.log(`[CACHE MISS] ${key}`);
  }

  updateAverageTime(duration);
  return result;
}

function updateAverageTime(duration) {
  stats.totalTime += duration;
  stats.avgTime = Math.round(stats.totalTime / (stats.hits + stats.misses));
}

// Get cache statistics
function getCacheStats() {
  const total = stats.hits + stats.misses;
  const hitRate = total > 0 ? ((stats.hits / total) * 100).toFixed(2) : 0;

  return {
    hits: stats.hits,
    misses: stats.misses,
    hitRate: `${hitRate}%`,
    averageResponseTime: `${stats.avgTime}ms`,
    totalRequests: total,
  };
}

// Reset statistics
function resetCacheStats() {
  stats = {
    hits: 0,
    misses: 0,
    totalTime: 0,
    avgTime: 0,
  };
}

// Log statistics periodically
function startCacheMonitoring(intervalSeconds = 30) {
  setInterval(() => {
    console.log('\n📊 CACHE STATISTICS:');
    console.log(JSON.stringify(getCacheStats(), null, 2));
    console.log('---\n');
  }, intervalSeconds * 1000);
}

module.exports = {
  trackCacheGet,
  getCacheStats,
  resetCacheStats,
  startCacheMonitoring,
};
