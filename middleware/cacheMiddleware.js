const { clearTenantCache } = require("../services/cacheService");

const applyCacheClearingMiddleware = (schema, cacheKeys) => {
    // Ensure cacheKeys is always an array (for multiple cache clearing)
    if (!Array.isArray(cacheKeys)) {
        cacheKeys = [cacheKeys];
    }

    // 🔹 Middleware to delete cache when a document is inserted
    schema.post("save", async function (doc) {
        console.log(`🗑️ Clearing cache for Tenant: ${doc.Tenant} `);
        for (const key of cacheKeys) {
            await clearTenantCache(doc.Tenant.toString(), key);
        }
    });

    // 🔹 Middleware to capture Tenant before update (for updateOne)
    schema.pre("updateOne", function (next) {
        this._tenant = this.getUpdate().$set?.Tenant || this.getUpdate().Tenant;
        next();
    });

    // 🔹 Middleware to clear cache after an update
    schema.post("findOneAndUpdate", async function (doc) {
        if (doc) {
            console.log(`🗑️ Clearing cache for Tenant: ${doc.Tenant} (Document Updated)`);
            for (const key of cacheKeys) {
                await clearTenantCache(doc.Tenant.toString(), key);
            }
        }
    });

    schema.post("updateOne", async function () {
        if (this._tenant) {
            console.log(`🗑️ Clearing cache for Tenant: ${this._tenant} (Document Updated)`);
            for (const key of cacheKeys) {
                await clearTenantCache(this._tenant.toString(), key);
            }
        }
    });

    // 🔹 Middleware to delete cache when a document is deleted
    schema.post("findOneAndDelete", async function (doc) {
        if (doc) {
            console.log(`🗑️ Clearing cache for Tenant: ${doc.Tenant} (Document Deleted)`);
            for (const key of cacheKeys) {
                await clearTenantCache(doc.Tenant.toString(), key);
            }
        }
    });
};

module.exports = { applyCacheClearingMiddleware };
