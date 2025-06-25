const express = require('express');
const router = express.Router();
const jobsController = require('../controllers/jobsController');

// Middleware to handle file uploads
const { upload } = require('../services/StorageService');

 
router.post('/', upload.fields([
  { name: 'banner', maxCount: 1 },
]), jobsController.createJob);

module.exports = router;