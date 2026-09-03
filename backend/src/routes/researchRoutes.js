const express = require('express');
const researchController = require('../controllers/researchController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.post('/judgments/search', researchController.searchJudgments);

module.exports = router;