const express = require('express');
const chatController = require('../controllers/chatController');
const { protect } = require('../middleware/authMiddleware');
const { loadCase, requireCaseAccess } = require('../middleware/caseAccess');

const router = express.Router({ mergeParams: true });

router.use(protect, loadCase, requireCaseAccess);

router.post('/', chatController.sendCaseMessage);
router.get('/', chatController.getCaseChatHistory);
router.delete('/', chatController.clearCaseChatHistory);

module.exports = router;
