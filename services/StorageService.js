const multer = require('multer');
const multerS3 = require('multer-s3');
const AWS = require('aws-sdk');
const path = require('path');
const { ObjectId } = require('mongodb');
require("dotenv").config();

// AWS S3 Configuration
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
    region: process.env.AWS_REGION
});

/**
 * Ensure that the specified S3 bucket exists. If not, create it.
 * @param {string} bucketName - The name of the S3 bucket.
 */
const ensureBucketExists = async (bucketName) => {
    try {
        await s3.headBucket({ Bucket: bucketName }).promise();
        console.log(`Bucket "${bucketName}" already exists.`);
    } catch (err) {
        if (err.statusCode === 404) {
            console.log(`Creating new bucket: ${bucketName}`);
            await s3.createBucket({ Bucket: bucketName }).promise();
            console.log(`Bucket "${bucketName}" created successfully.`);
        } else {
            console.error("Error checking/creating bucket:", err);
            throw err;
        }
    }
};

/**
 * Multer file upload configuration with AWS S3 storage.
 */
const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.AWS_BUCKET, // 👈 must be a string, not an async function
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      const fileExt = path.extname(file.originalname);
      const fileName = `${new ObjectId()}${fileExt}`;
      console.log(`Uploading file to S3 as: ${fileName}`);
      cb(null, fileName);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});
/**
 * Generate a pre-signed URL for accessing a file in an S3 bucket.
 * @param {string} bucketName - The S3 bucket name.
 * @param {string} key - The file key (path) in S3.
 * @returns {string} - The signed URL for temporary access.
 */
const getSignedUrl = (key) => {
    try {
        const bucketName = process.env.AWS_BUCKET;
        return s3.getSignedUrl("getObject", {
            Bucket: bucketName,
            Key: key            
        });
        // can i set no expiration?      


    } catch (error) {
        console.log("Error generating signed URL:", error);
        throw error;
    }
};

const getObject  = ( key) => {
    try {
        bucketName =  process.env.AWS_BUCKET;
        return s3.getObject({ Bucket: bucketName, Key: key }).promise();
    } catch (error) {
        console.log("Error generating signed URL:", error);
        throw error;
    }
};

module.exports = {
    ensureBucketExists,
    upload ,
    getSignedUrl,
    getObject
};
