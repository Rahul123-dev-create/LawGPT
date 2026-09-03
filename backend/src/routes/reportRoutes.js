const express = require('express');
const reportController = require('../controllers/reportController');
const { protect } = require('../middleware/authMiddleware');
const { loadCase, requireCaseAccess } = require('../middleware/caseAccess');

const router = express.Router({ mergeParams: true });

router.use(protect, loadCase, requireCaseAccess);

router.get('/pdf', reportController.downloadCaseReport);
router.get('/metadata', reportController.getReportMetadata);

module.exports = router;
