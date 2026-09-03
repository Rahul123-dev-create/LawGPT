const express = require('express');
const caseController = require('../controllers/caseController');
const researchController = require('../controllers/researchController');
const { protect } = require('../middleware/authMiddleware');
const { loadCase, requireCaseAccess } = require('../middleware/caseAccess');
const { validate } = require('../validators/authValidators');
const {
  createCaseValidator,
  updateCaseValidator,
  changeStatusValidator,
  partyValidator,
  noteValidator,
} = require('../validators/caseValidators');

const router = express.Router();

router.use(protect);

router.post('/', createCaseValidator, validate, caseController.createCase);
router.get('/', caseController.listCases);

router.get('/:id', loadCase, requireCaseAccess, caseController.getCase);
router.get('/:id/precedents', loadCase, requireCaseAccess, researchController.getCasePrecedents);
router.put('/:id', loadCase, requireCaseAccess, updateCaseValidator, validate, caseController.updateCase);
router.delete('/:id', loadCase, requireCaseAccess, caseController.deleteCase);
router.patch('/:id/undelete', loadCase, requireCaseAccess, caseController.undeleteCase);

router.patch('/:id/status', loadCase, requireCaseAccess, changeStatusValidator, validate, caseController.changeStatus);
router.patch('/:id/archive', loadCase, requireCaseAccess, caseController.archiveCase);
router.patch('/:id/restore', loadCase, requireCaseAccess, caseController.restoreCase);
router.patch('/:id/pin', loadCase, requireCaseAccess, caseController.togglePin);

router.post('/:id/parties', loadCase, requireCaseAccess, partyValidator, validate, caseController.addParty);
router.put('/:id/parties/:partyId', loadCase, requireCaseAccess, partyValidator, validate, caseController.updateParty);
router.delete('/:id/parties/:partyId', loadCase, requireCaseAccess, caseController.deleteParty);

router.post('/:id/notes', loadCase, requireCaseAccess, noteValidator, validate, caseController.addNote);
router.put('/:id/notes/:noteId', loadCase, requireCaseAccess, noteValidator, validate, caseController.updateNote);
router.delete('/:id/notes/:noteId', loadCase, requireCaseAccess, caseController.deleteNote);

router.get('/:id/timeline', loadCase, requireCaseAccess, caseController.getTimeline);

module.exports = router;
