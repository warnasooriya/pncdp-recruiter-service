const { ObjectId } = require("mongoose").Types;
const Job = require("../models/Jobs");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { OpenAI } = require("openai");
const { v4: uuidv4 } = require("uuid");
const AWS = require("aws-sdk");
const sharp = require("sharp");
const { upload } = require("../services/StorageService");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const mongoose = require("mongoose");
const { getSignedUrl } = require("../services/StorageService");

exports.createJob = async (req, res) => {
  try {
    const {
      title,
      description,
      location,
      type,
      banner,
      deadline,
      userId,
      requirements,
    } = req.body;

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

    if (requirements.length === 0) {
      return res.status(400).json({ error: "Job requirements are required" });
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
      requirements,
    });

    // need to move banner to S3 bucket
    // banner files stored in ../images
    const bannerPath = path.join(__dirname, "../images", banner);
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
      ContentType: "image/png",
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

function buildImagePrompt(description, skills = []) {
  return `Design a modern, clean, and tech-oriented web banner for a job post.
Job Description: ${description}.
The banner should include subtle, professional visual icons or illustrations that meaningfully represent the following skills: ${skills.join(", ")}.
Use a minimalist layout with soft gradients or neutral tech colors ensuring visual balance. Include a simple callout section for the job title and an inviting message ”.
The design should be visually attractive but not crowded — clean typography, matching icons, and job-related elements (like coding screens, UX wireframes, cloud tech, etc.) where appropriate. Avoid large or complex visuals.
Format: 1792x1024 (suitable for web banners). Style must match modern SaaS or career portal design trends. `;
}

exports.generateBanner = async (req, res) => {
  try {
    const { description , skills } = req.body;

    if (!description) {
      return res.status(400).json({ error: "Description is required" });
    }

     // optional array from frontend
    const prompt = buildImagePrompt(description, skills);
    console.log(prompt);

    // Generate image with OpenAI DALL·E
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: prompt,
      size: "1792x1024",
      quality: "standard",
      n: 1,
    });

    const imageUrl = response.data[0].url;

    // Download image as buffer
    const imageResponse = await axios.get(imageUrl, {
      responseType: "arraybuffer",
    });

    const originalBuffer = Buffer.from(imageResponse.data, "binary");

    // Compress image with sharp (JPEG format for better compression)
    const compressedBuffer = await sharp(originalBuffer)
      .jpeg({ quality: 70 }) // Change quality (50–80) as needed
      .toBuffer();

    // Ensure the images directory exists
    const imagesDir = path.join(__dirname, "../images");
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir);
    }

    // Generate filename and save
    const filename = `${uuidv4()}.jpg`; // Use .jpg after compression
    const imagePath = path.join(imagesDir, filename);

    fs.writeFileSync(imagePath, compressedBuffer);

    // Respond with result
    res.json({
      message: "Image generated and compressed successfully",
      imagePath: filename,
      originalUrl: imageUrl,
    });
  } catch (error) {
    console.error("Error generating banner:", error);
    res.status(500).json({ error: "Failed to generate banner" });
  }
};

exports.getJobsByUserId = async (req, res) => {
  try {
    const userId = req.params.id;
    // const jobs = await Job.find({ userId }).sort({ createdAt: -1 });

    const jobs = await Job.aggregate([
      { $match: { userId: userId } },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: "applications", // collection name
          localField: "_id",
          foreignField: "jobId",
          as: "applications",
        },
      },
      {
        $addFields: {
          applicationCount: { $size: "$applications" },
        },
      },
      {
        $project: {
          applications: 0, // Optional: remove full application data, keep only count
        },
      },
    ]);
    res.json(jobs);
  } catch (error) {
    console.error("Error fetching jobs:", error);
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
};

exports.getJobsById = async (req, res) => {
  try {
    const jobId = new ObjectId(req.params.id);

    const query = [
      {
        $match: {
          _id: jobId,
        },
      },
      {
        $lookup: {
          from: "applications",
          localField: "_id",
          foreignField: "jobId",
          as: "applications",
        },
      },
      { $unwind: { path: "$applications", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "profiles",
          localField: "applications.userId",
          foreignField: "userId",
          as: "applications.user",
        },
      },
      {
        $unwind: {
          path: "$applications.user",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $group: {
          _id: "$_id",
          title: { $first: "$title" },
          location: { $first: "$location" },
          jobType: { $first: "$jobType" },
          createdAt: { $first: "$createdAt" },
          banner: { $first: "$banner" },
          requirements: { $first: "$requirements" },
          applications: {
            $push: {
              _id: "$applications._id",
              resume: "$applications.resume",
              appliedAt: "$applications.createdAt",
              userId: "$applications.user._id",
              usereEail: "$applications.user.email",
              usereFullName: "$applications.user.fullName",
              usereHeadline: "$applications.user.headline",
              usereAbout: "$applications.user.about",
              profileImage: "$applications.user.profileImage",
            },
          },
        },
      },
    ];

    const job = await Job.aggregate(query);

    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    const Jobobj = job[0];

    Jobobj.banner = getSignedUrl(Jobobj.banner);

    Jobobj.applications.forEach((application) => {
      application.resume = getSignedUrl(application.resume);
      application.profileImage = getSignedUrl(application.profileImage);

    });


    res.json(Jobobj);
  } catch (error) {
    console.error("Error fetching job:", error);
    res.status(500).json({ error: "Failed to fetch job" });
  }
};
