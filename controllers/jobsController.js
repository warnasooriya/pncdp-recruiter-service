const { ObjectId } = require("mongoose").Types;
const Job = require("../models/Jobs");
const Application = require("../models/Application");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { OpenAI } = require("openai");
const crypto = require("crypto");
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

  const topSkills = skills.slice(0, 5).join(", ");
  const sanitizedDesc = description.substring(0, 300);
  return `Create a professional web banner (1792x1024) strictly following these rules:

HARD RULES (MUST OBEY):
- ABSOLUTELY NO text, letters, numbers, words, glyphs, typography, or readable content anywhere
- NO company logos, brand marks, or identifiable symbols of any kind
- NO people faces, human figures, silhouettes, or photographs
- NO screenshots, UI mockups, or literal code text

VISUAL STYLE:
- Ultra-minimal, abstract, geometric, vector-style composition
- Clean, modern corporate palette: soft blues, grays, whites, muted accents
- Gentle gradient background; subtle ${industryVisuals[detectedIndustry]}
- Use only simple shapes and icon-like motifs; maximum 3–4 visual elements
- Keep ~70% empty space; composition must feel calm and uncluttered

CONTENT ALIGNMENT:
- Theme must reflect the job context: ${detectedIndustry}
- Represent job focus and requirements purely via abstract iconography and shapes
- DO NOT place any textual content from the description or requirements on the image
- If brand or product names appear in the description, DO NOT depict their logos; use generic shapes

JOB CONTEXT (for thematic guidance only):
- Description: ${sanitizedDesc}...
- Skills: ${topSkills}

OUTPUT:
- Single banner image suitable for job posting platforms
- The final image must contain zero readable text and only abstract visuals aligned to the role.`;
}

function parseHumanFeedback(comment) {
  if (!comment || typeof comment !== 'string') return {};
  const txt = comment.toLowerCase();
  const vocab = [
    'java','spring boot','react','angular','node.js','node','express','typescript','python','dotnet','c#','asp.net','azure','aws','docker','kubernetes','terraform','graphql','kafka','spark','airflow','postgresql','mysql','sql server'
  ];
  const preferMarkers = ['prefer','prioritize','focus on','emphasize','highlight'];
  const avoidMarkers = ['avoid','penalize','deprioritize','not','exclude'];
  const boost = new Set();
  const penalize = new Set();
  for (const skill of vocab) {
    const s = skill.toLowerCase();
    if (txt.includes(s)) {
      const nearPrefer = preferMarkers.some(m => txt.includes(m));
      const nearAvoid = avoidMarkers.some(m => txt.includes(m));
      if (nearPrefer && !nearAvoid) boost.add(skill);
      if (nearAvoid && !nearPrefer) penalize.add(skill);
      if (!nearPrefer && !nearAvoid) boost.add(skill);
    }
  }
  const expMatch = txt.match(/(\d+)\s*\+?\s*(years?|yrs?)/);
  const min_experience = expMatch ? Number(expMatch[1]) : undefined;
  let exclude_education_below;
  if (txt.includes('exclude diploma')) exclude_education_below = 2;
  if (txt.includes("prefer bachelor's") || txt.includes('prefer bachelors')) exclude_education_below = 2;
  if (txt.includes("prefer master's") || txt.includes('prefer masters')) exclude_education_below = 3;
  return {
    boost_skills: Array.from(boost),
    penalize_skills: Array.from(penalize),
    min_experience,
    exclude_education_below
  };
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
      prompt,
      size: "1792x1024",
      quality: "hd",
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

exports.getCvsByJobId = async (req, res) => {
  try {
    const jobId = req.params.id;
    const cvs=[];
    const applications= await Application.find({ 'jobId':jobId });
     applications.forEach((application) => {
       cvs.push(getSignedUrl(application.resume));
    });

    res.json({"files":cvs});
  } catch (error) {
    console.error("Error fetching applications:", error);
    res.status(500).json({ error: "Failed to fetch applications" });
  }
};


 



exports.getJobsById = async (req, res) => {
  try {
    const jobId = new ObjectId(req.params.id);
    const comment  = req.body.comment;
    let human_feedback = req.body.human_feedback;
    if (!human_feedback && comment) {
      human_feedback = parseHumanFeedback(comment);
    }

    if (!jobId) {
      return res.status(400).json({ error: "Job ID is required" });
    }

    const feedbackKeyBase = comment ? String(comment) : (human_feedback ? JSON.stringify(human_feedback) : "");
    const feedbackHash = feedbackKeyBase ? crypto.createHash('sha256').update(feedbackKeyBase).digest('hex') : '';
    const cacheId = feedbackHash ? `job:${jobId.toString()}:rankings:${feedbackHash}` : `job:${jobId.toString()}:rankings`;
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

    const jobPrompt = buildJobPrompt(Jobobj, comment);
    console.log("Job Prompt for Python Service:", jobPrompt);
    const rankingResponse = await axios.post(process.env.PYTHON_SERVICE_URL, 
      { 
        jobId: Jobobj._id.toString() ,
        job_description: jobPrompt,
        human_feedback
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
    await redisClient.set(cacheId, JSON.stringify(Jobobj));  

    res.json(Jobobj);
  } catch (error) {
    console.error("Error fetching job:", error);
    res.status(500).json({ error: "Failed to fetch job" });
  }
};

// Helper to build a structured prompt for the Python/AI ranking service
function buildJobPrompt(job, comment) {
  const {
    title,
    location,
    jobType,
    description,
    requirements,
    deadline,
  } = job;

  const requirementsLine = Array.isArray(requirements) && requirements.length
    ? requirements.join("\n- ")
    : "Not explicitly specified";

  const recruiterNotes = comment
    ? `\n### RECRUITER SPECIAL NOTES\n${comment}\n`
    : "";

  const deadlineText = deadline
    ? new Date(deadline).toISOString().split("T")[0]
    : "Not specified";

  return `
You are an AI assistant that ranks candidate resumes for a job posting.

Your task:
- Read the job details and job description.
- Compare them with candidate resumes.
- Return a JSON object with a "candidates" array.
- Each candidate item must have: "filename", "score" (0–100), and "explanation" (short reason).

### JOB META
- Job Title: ${title || "Not specified"}
- Location: ${location || "Not specified"}
- Employment Type: ${jobType || "Not specified"}
- Application Deadline: ${deadlineText}
- Core Requirements:
- ${requirementsLine}

### JOB DESCRIPTION (as provided by recruiter / job post)
"""
${description || "No detailed description provided."}
"""

${recruiterNotes}

### SCORING GUIDELINES
- 80–100: Very strong match (skills, experience, domain fit).
- 60–79: Good match (most key requirements met).
- 40–59: Partial match (some relevant skills/experience).
- 0–39: Weak match.

Use the job description plus the requirements to judge:
- Technical skill match (frameworks, languages, tools).
- Years of experience and seniority fit.
- Domain/industry relevance.
- Match to responsibilities implied by the description.
 
`.trim();
}

async function runRankingJob(jobId, comment, human_feedback, rankingJobId) {
  const statusKey = `ranking:${rankingJobId}:status`;
  const resultKey = `ranking:${rankingJobId}:result`;
  await redisClient.set(statusKey, JSON.stringify({ state: "initializing", progress: 0 }));

  const feedbackKeyBase = comment ? String(comment) : (human_feedback ? JSON.stringify(human_feedback) : "");
  const feedbackHash = feedbackKeyBase ? crypto.createHash('sha256').update(feedbackKeyBase).digest('hex') : '';
  try {
    await redisClient.set(statusKey, JSON.stringify({ state: "aggregating", progress: 10 }));
    const query = [
      { $match: { _id: jobId } },
      { $lookup: { from: "applications", localField: "_id", foreignField: "jobId", as: "applications" } },
      { $unwind: { path: "$applications", preserveNullAndEmptyArrays: true } },
      { $lookup: { from: "profiles", localField: "applications.userId", foreignField: "userId", as: "applications.user" } },
      { $unwind: { path: "$applications.user", preserveNullAndEmptyArrays: true } },
      { $group: { _id: "$_id", title: { $first: "$title" }, location: { $first: "$location" }, jobType: { $first: "$jobType" }, createdAt: { $first: "$createdAt" }, banner: { $first: "$banner" }, requirements: { $first: "$requirements" }, description: { $first: "$description" }, applications: { $push: { _id: "$applications._id", resume: "$applications.resume", appliedAt: "$applications.createdAt", profileImage: "$applications.user.profileImage", userId: "$applications.user._id", usereEmail: "$applications.user.email", usereFullName: "$applications.user.fullName", usereHeadline: "$applications.user.headline", usereAbout: "$applications.user.about" } } } }
    ];
    const job = await Job.aggregate(query);
    if (!job) {
      await redisClient.set(statusKey, JSON.stringify({ state: "error", message: "Job not found" }));
      return;
    }

    console.log("Job data recieved for ranking job:", jobId.toString());

    const Jobobj = job[0];
    Jobobj.banner = getSignedUrl(Jobobj.banner);
    Jobobj.applications.forEach((application) => {
      if (application.resume) application.resume = getSignedUrl(application.resume);
      if (application.profileImage) application.profileImage = getSignedUrl(application.profileImage);
    });

    console.log("Signing images generated for ranking job:", jobId.toString());

    await redisClient.set(statusKey, JSON.stringify({ state: "ranking", progress: 40 }));

    console.log("Job prompt generated for ranking job:", jobId.toString());
    const jobPrompt = buildJobPrompt(Jobobj, comment);
    const rankingResponse = await axios.post(process.env.PYTHON_SERVICE_URL,
      { jobId: Jobobj._id.toString(), job_description: jobPrompt, human_feedback }
    );
    await redisClient.set(statusKey, JSON.stringify({ state: "mapping", progress: 70 }));
    const rankingResult = rankingResponse.data.candidates || [];
    Jobobj.applications.forEach((application) => {
      const fileName = path.basename(application.resume).split("?")[0];
      const resumeMatch = rankingResult.find((item) => item.filename === fileName);
      if (resumeMatch) {
        application.score = resumeMatch.score;
        application.explanation = resumeMatch;
      }
    });
    Jobobj.applications = (Jobobj.applications || []).sort((a, b) => (b?.score ?? 0) - (a?.score ?? 0));
    const cacheId = feedbackHash ? `job:${Jobobj._id.toString()}:rankings:${feedbackHash}` : `job:${Jobobj._id.toString()}:rankings`;
    await redisClient.set(cacheId, JSON.stringify(Jobobj));
    await redisClient.set(resultKey, JSON.stringify(Jobobj));
    await redisClient.set(statusKey, JSON.stringify({ state: "done", progress: 100 }));
  } catch (error) {
    console.error("Error in ranking job:", error);
    await redisClient.set(statusKey, JSON.stringify({ state: "error", message: String(error?.message || error) }));
  }
}

exports.startRankingJob = async (req, res) => {
  try {
    const jobId = new ObjectId(req.params.id);
    const comment = req.body.comment;
    let human_feedback = req.body.human_feedback;
    if (!human_feedback && comment) human_feedback = parseHumanFeedback(comment);
    const feedbackKeyBase = comment ? String(comment) : (human_feedback ? JSON.stringify(human_feedback) : "");
    const feedbackHash = feedbackKeyBase ? crypto.createHash('sha256').update(feedbackKeyBase).digest('hex') : '';
    const rankingJobId = `${jobId.toString()}:${feedbackHash}:${uuidv4()}`;
    setImmediate(() => runRankingJob(jobId, comment, human_feedback, rankingJobId));

    
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

    return res.status(202).json({ rankingJobId , "job":Jobobj });
  } catch (e) {
    return res.status(500).json({ error: "Failed to start ranking job" });
  }
};

exports.getRankingStatus = async (req, res) => {
  try {
    const rankingJobId = req.params.id;
    const statusKey = `ranking:${rankingJobId}:status`;

    console.log("Fetching status for key:", statusKey);
    const status = await redisClient.get(statusKey);
    console.log("Status found:", status);
    if (!status) return res.status(404).json({ error: "Not found" });
    return res.json(JSON.parse(status));
  } catch (e) {
    console.error("Error fetching status:", e);
    return res.status(500).json({ error: "Failed to get status"  });
  }
};

exports.getRankingResult = async (req, res) => {
  try {
    const rankingJobId = req.params.id;
    const resultKey = `ranking:${rankingJobId}:result`;
    const result = await redisClient.get(resultKey);
    if (!result) return res.status(202).json({ state: "pending" });
    return res.json(JSON.parse(result));
  } catch (e) {
    return res.status(500).json({ error: "Failed to get result" });
  }
};

