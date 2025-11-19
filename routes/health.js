const express = require('express');
const router = express.Router();
const HealthController = require('../controllers/HealthController');

router.get('/', HealthController.checkHealth);

 

module.exports = router;