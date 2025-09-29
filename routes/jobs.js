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


module.exports = router;