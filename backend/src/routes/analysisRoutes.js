const express = require('express');
const analysisController = require('../controllers/analysisController');
const { protect } = require('../middleware/authMiddleware');
const { loadCase, requireCaseAccess } = require('../middleware/caseAccess');

const router = express.Router({ mergeParams: true }); // read :caseId from the parent mount

// Same access-control chain as Hearings/Documents: authenticated → case loaded
// → ownership/assignment/admin check. No flat /analysis route exists — an
// analysis only ever exists inside a case.
router.use(protect, loadCase, requireCaseAccess);

router.post('/', analysisController.runAnalysis);
router.post('/generate', analysisController.runAnalysis);
router.post('/regenerate', analysisController.runAnalysis);
router.get('/', analysisController.getAnalysis);

module.exports = router;
