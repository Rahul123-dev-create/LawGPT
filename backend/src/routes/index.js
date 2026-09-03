const express = require('express');
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const caseRoutes = require('./caseRoutes');
const hearingRoutes = require('./hearingRoutes');
const documentRoutes = require('./documentRoutes');
const analysisRoutes = require('./analysisRoutes');
const argumentsRoutes = require('./argumentsRoutes');
const chatRoutes = require('./chatRoutes');
const reportRoutes = require('./reportRoutes');
const researchRoutes = require('./researchRoutes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/research', researchRoutes);
// Mount the nested sub-resource routers before '/cases' — both are valid,
// non-overlapping paths, but keeping the more specific ones first avoids
// any ambiguity as more sub-resources get added under /cases later.
router.use('/cases/:caseId/analysis', analysisRoutes);
router.use('/cases/:caseId/arguments', argumentsRoutes);
router.use('/cases/:caseId/chat', chatRoutes);
router.use('/cases/:caseId/report', reportRoutes);
router.use('/cases/:caseId/documents', documentRoutes);
router.use('/cases/:caseId/hearings', hearingRoutes);
router.use('/cases', caseRoutes);

module.exports = router;
