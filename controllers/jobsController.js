const { ObjectId } = require("mongoose").Types;
const Job = require("../models/Jobs");
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { OpenAI } = require("openai");
const { v4: uuidv4 } = require('uuid');
const AWS = require('aws-sdk');
const sharp = require('sharp');
const { upload } = require('../services/StorageService')
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

exports.createJob = async (req, res) => {
  try {
    const { title, description, location, type, banner, deadline, userId } =
      req.body;

    // Validate job data
    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }
    if (!title) {
      return res.status(400).json({ error: "Job title is required" });
    }
    if (!description) {
      return res.status(400).json({ error: "Job description is required" });
    }
    if (!location) {
      return res.status(400).json({ error: "Job location is required" });
    }
    if (!type) {
      return res.status(400).json({ error: "Job type is required" });
    }
    if (!banner) {
      return res.status(400).json({ error: "Job banner is required" });
    }
    if (!deadline) {
      return res.status(400).json({ error: "Job deadline is required" });
    }

    // Create a new job
    const newJob = new Job({
      userId,
      title,
      description,
      location,
      jobType: type,
      banner,
      deadline,
    });

    // need to move banner to S3 bucket 
    // banner files stored in ../images
    const bannerPath = path.join(__dirname, '../images', banner);
    if (!fs.existsSync(bannerPath)) {
      return res.status(400).json({ error: "Banner file does not exist" });
    }
  
    // Create a read stream for the banner file
    if (!fs.existsSync(bannerPath)) {
        return res.status(400).json({ error: "Banner file does not exist" });
        }


 // Generate a unique name for the banner
    const bucketName = process.env.AWS_BUCKET;
    const s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_KEY,
        region: process.env.AWS_REGION,
    });

    
    const fileStream = fs.createReadStream(bannerPath);
    const uploadParams = {  
      Bucket: bucketName,
      Key: banner,
      Body: fileStream,
      ContentType: 'image/png',
    };
    await s3.upload(uploadParams).promise();
    
    // Optionally, delete the local banner file after uploading 
    fs.unlinkSync(bannerPath);

    await newJob.save();
    res.status(201).json({ message: "Job created successfully", job: newJob });
  } catch (error) {
    console.error("Error creating job:", error);
    res.status(500).json({ error: "Failed to create job" });
  }
};

exports.generateBanner = async (req, res) => {
  try {
    const { description } = req.body;

    if (!description) {
      return res.status(400).json({ error: "Description is required" });
    }

    // Generate image with OpenAI DALL·E
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: description,
      size: "1792x1024",
      quality: "standard",
      n: 1,
    });

    const imageUrl = response.data[0].url;

    // Download image as buffer
    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
    });

    const originalBuffer = Buffer.from(imageResponse.data, 'binary');

    // Compress image with sharp (JPEG format for better compression)
    const compressedBuffer = await sharp(originalBuffer)
      .jpeg({ quality: 70 }) // Change quality (50–80) as needed
      .toBuffer();

    // Ensure the images directory exists
    const imagesDir = path.join(__dirname, '../images');
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir);
    }

    // Generate filename and save
    const filename = `${uuidv4()}.jpg`; // Use .jpg after compression
    const imagePath = path.join(imagesDir, filename);

    fs.writeFileSync(imagePath, compressedBuffer);

    // Respond with result
    res.json({
      message: 'Image generated and compressed successfully',
      imagePath: filename,
      originalUrl: imageUrl
    });

  } catch (error) {
    console.error("Error generating banner:", error);
    res.status(500).json({ error: "Failed to generate banner" });
  }
};
