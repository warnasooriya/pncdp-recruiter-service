// import { createClient } from "redis";
const { createClient } = require("redis");


const redisClient = createClient({
  url:  "redis://" + process.env.CACHE_SERVER_URI +':'+ process.env.CACHE_SERVER_PORT  || "redis://127.0.0.1:6379"
});

redisClient.on("error", (err) => console.log("Redis Client Error", err));

redisClient.connect();

module.exports = redisClient;