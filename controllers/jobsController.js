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
const fsp = require("fs/promises");
const redisClient = require("../config/redisClient");



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
  // Extract key themes and industry from description
  const industryKeywords = {
    tech: ['software', 'developer', 'programming', 'coding', 'engineer', 'technical', 'IT', 'technology', 'digital', 'web', 'mobile', 'app'],
    design: ['design', 'UI', 'UX', 'graphic', 'visual', 'creative', 'artist', 'designer'],
    marketing: ['marketing', 'social media', 'content', 'brand', 'advertising', 'campaign'],
    finance: ['finance', 'accounting', 'financial', 'analyst', 'banking', 'investment'],
    healthcare: ['healthcare', 'medical', 'nurse', 'doctor', 'health', 'clinical'],
    education: ['teacher', 'education', 'instructor', 'academic', 'training'],
    sales: ['sales', 'business development', 'account manager', 'customer'],
    hr: ['human resources', 'HR', 'recruitment', 'talent', 'people']
  };

  let detectedIndustry = 'general';
  const lowerDesc = description.toLowerCase();
  
  for (const [industry, keywords] of Object.entries(industryKeywords)) {
    if (keywords.some(keyword => lowerDesc.includes(keyword.toLowerCase()))) {
      detectedIndustry = industry;
      break;
    }
  }

  // Industry-specific visual elements
  const industryVisuals = {
    tech: 'abstract geometric patterns, subtle circuit board elements, modern tech icons, clean code snippets background',
    design: 'creative geometric shapes, color palettes, design tools silhouettes, artistic elements',
    marketing: 'growth charts, social media icons, brand elements, communication symbols',
    finance: 'financial charts, data visualization, professional graphs, analytical elements',
    healthcare: 'medical cross symbols, health icons, caring hands, wellness elements',
    education: 'book symbols, graduation elements, learning icons, academic motifs',
    sales: 'growth arrows, handshake symbols, target icons, success indicators',
    hr: 'people silhouettes, team symbols, networking icons, collaboration elements',
    general: 'professional abstract patterns, corporate elements, business symbols'
  };

  return `Create a professional web banner (1792x1024) for a job posting with these STRICT requirements:

CONTENT RESTRICTIONS:
- NO text, letters, words, or readable content anywhere in the image
- NO company logos, brand names, or identifiable symbols
- NO people faces, photographs, or realistic human figures
- NO complex illustrations or detailed graphics

DESIGN REQUIREMENTS:
- Clean, minimalist background with subtle ${industryVisuals[detectedIndustry]}
- Use professional color palette: soft blues, grays, whites, or muted corporate colors
- Gradient background from light to slightly darker shade
- Abstract geometric shapes or patterns only
- Maximum 3-4 visual elements total
- 70% empty space for text overlay

INDUSTRY CONTEXT: ${detectedIndustry}
JOB FOCUS: ${description.substring(0, 200)}...
SKILLS TO REPRESENT: ${skills.slice(0, 5).join(", ")}

STYLE: Modern corporate design, suitable for LinkedIn or professional job boards
MOOD: Professional, trustworthy, innovative, clean
FORMAT: Web banner optimized for job posting platforms

The banner should feel appropriate for the job role while maintaining complete visual simplicity and professionalism.`;
}

exports.generateBanner = async (req, res) => {
  try {
    const { description, skills, title } = req.body;

    if (!description) {
      return res.status(400).json({ error: "Job description is required" });
    }

    // Validate description length for better AI processing
    if (description.length < 50) {
      return res.status(400).json({ error: "Job description must be at least 50 characters long for accurate banner generation" });
    }

    // Build enhanced prompt with job context
    const prompt = buildImagePrompt(description, skills || []);
    console.log("Generated prompt:", prompt);

    // Generate image with OpenAI DALL·E with enhanced parameters
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: prompt,
      size: "1792x1024",
      quality: "hd", // Use HD quality for more professional output
      style: "natural", // Use natural style for more professional look
      n: 1,
    });

    const imageUrl = response.data[0].url;

    // Download image as buffer
    const imageResponse = await axios.get(imageUrl, {
      responseType: "arraybuffer",
    });

    const originalBuffer = Buffer.from(imageResponse.data, "binary");

    // Compress image with sharp while maintaining professional quality
    const compressedBuffer = await sharp(originalBuffer)
      .jpeg({ 
        quality: 85, // Higher quality for professional banners
        progressive: true, // Progressive JPEG for better web loading
        mozjpeg: true // Use mozjpeg encoder for better compression
      })
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
    const comment  = req.body.comment;

    if (!jobId) {
      return res.status(400).json({ error: "Job ID is required" });
    }

    const cacheId = `job:${jobId.toString()}:rankings`;
    // check redis cache first
 
    const cachedData =  await redisClient.get(cacheId);

    if (cachedData) {
      return res.json(JSON.parse(cachedData));
    }

 

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
          description: { $first: "$description" },
          applications: {
            $push: {
              _id: "$applications._id",
              resume: "$applications.resume",
              appliedAt: "$applications.createdAt",
              profileImage: "$applications.user.profileImage",
              userId: "$applications.user._id",
              usereEmail: "$applications.user.email",
              usereFullName: "$applications.user.fullName",
              usereHeadline: "$applications.user.headline",
              usereAbout: "$applications.user.about",
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
      if (application.resume) {
        application.resume = getSignedUrl(application.resume);
      }
    
      if (application.profileImage){
        application.profileImage = getSignedUrl(application.profileImage);
      } 
      

    });

    const destDir = path.join(process.env.RESUME_DIR_PATH, Jobobj._id.toString());
    await fsp.mkdir(destDir, { recursive: true });

    Jobobj.applications.forEach(async (application) => {
      // Download resume from S3 signed URL
      const fileName  = path.basename(application.resume).split("?")[0];
      // check if file already exists
      if (fs.existsSync(path.join(destDir, fileName))) {
        return;
      }
      const resumeResponse = await axios.get(application.resume, { responseType: "arraybuffer" });
      const resumeBuffer = Buffer.from(resumeResponse.data, "binary");
      const resumePath = path.join(destDir, fileName);
      await fsp.writeFile(resumePath, resumeBuffer);


    });
    
    // calling pyton endpoint and get application rankings

    const descriptionForPython = Jobobj.description + (comment ?  ' { special comment - ' + comment  + ' } ': '');
    const rankingResponse = await axios.post(process.env.PYTHON_SERVICE_URL, 
      { 
        jobId: Jobobj._id.toString() ,
        job_description: descriptionForPython,
        
      });
    const rankingResult = rankingResponse.data.candidates; // Assuming response is { rankings: [ { userId, score }, ... ] }

    Jobobj.applications.forEach(async (application) => {
      const fileName  = path.basename(application.resume).split("?")[0];
      const resumeMatch = rankingResult.find((item) => item.filename  === fileName);
      if (resumeMatch) {
        application.score = resumeMatch.score;
        application.explanation = resumeMatch;
      }
    });
 
    // set redis score cache
    await redisClient.set(`job:${Jobobj._id.toString()}:rankings`, JSON.stringify(Jobobj));  

    res.json(Jobobj);
  } catch (error) {
    console.error("Error fetching job:", error);
    res.status(500).json({ error: "Failed to fetch job" });
  }
};
