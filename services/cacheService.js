const redisClient = require("../cache/cache");

const clearTenantCache = async (tenantId,key) => {
  try {
    let pattern = `${key}:${tenantId}:*`;
    
    const keys = await redisClient.keys(pattern);

    for await (const key of keys) {
      await redisClient.del(key);
    }
    const keystest = await redisClient.keys(pattern);
    
    if (keystest.length === 0) {
        console.log(`🗑️ Cleared cache ${key} for Tenant: ${tenantId}`);
    } else {
      console.log(`⚠️ No cache found  ${key}  for Tenant: ${tenantId}`);
    }
  } catch (error) {
    console.error(`❌ Error clearing cache ${key}  for Tenant ${tenantId}:`, error.message);
  }
};

setCache = async (key, value) => {
  try {
    await redisClient.set(key.toString(), JSON.stringify(value));
    console.log(`✅ Cache set for key: ${key}`);
  } catch (error) {
    console.error(`❌ Error setting cache for key: ${key}`, error.message);
  }
};

getCache = async (key) => {
  try {
    const value = await redisClient.get(key.toString());
    console.log(`✅ Cache retrieved for key: ${key}`);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    console.error(`❌ Error getting cache for key: ${key}`, error.message);
    return null;
  }
};

module.exports = { clearTenantCache , setCache, getCache };
