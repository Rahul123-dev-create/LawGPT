const express = require('express');
const argumentsController = require('../controllers/argumentsController');
const { protect } = require('../middleware/authMiddleware');
const { loadCase, requireCaseAccess } = require('../middleware/caseAccess');

const router = express.Router({ mergeParams: true });

router.use(protect, loadCase, requireCaseAccess);

router.post('/generate', argumentsController.generateCaseArguments);
router.get('/', argumentsController.getCaseArguments);

module.exports = router;
