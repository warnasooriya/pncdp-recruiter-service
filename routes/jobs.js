const express = require('express');
const router = express.Router();
const jobsController = require('../controllers/jobsController');

// Middleware to handle file uploads
const { upload } = require('../services/StorageService');

 
router.post('/', upload.fields([
  { name: 'banner', maxCount: 1 },
]), jobsController.createJob);


router.post('/generate-banner', jobsController.generateBanner);

router.get('/byowner/:id', jobsController.getJobsByUserId);

router.post('/getjobById/:id', jobsController.getJobsById);
router.post('/ranking/start/:id', jobsController.startRankingJob);
router.get('/ranking/status/:id', jobsController.getRankingStatus);
router.get('/ranking/result/:id', jobsController.getRankingResult);

router.get('/getCvsByJobId/:id', jobsController.getCvsByJobId);


module.exports = router;
