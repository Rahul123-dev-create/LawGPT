const mongoose = require('mongoose');
(async() => {
  await mongoose.connect('mongodb://localhost:27017/lawgpt');
  const casesCol = mongoose.connection.db.collection('cases');
  const docsCol = mongoose.connection.db.collection('documents');
  const pagesCol = mongoose.connection.db.collection('documentpages');
  const c = await casesCol.findOne({ title: /Sri Krishna/ });
  console.log('CASE:', c._id, c.title.slice(0, 60));
  const caseObjId = new mongoose.Types.ObjectId(c._id.toString());
  const docs = await docsCol.find({ caseId: caseObjId }).toArray();
  console.log('DOCS COUNT:', docs.length);
  for (const d of docs) {
    console.log('  doc:', d._id.toString(), 'status=', d.status, 'orig=', d.originalName, 'docType=', d.docType, 'isDeleted=', d.isDeleted);
    const pages = await pagesCol.countDocuments({ documentId: new mongoose.Types.ObjectId(d._id.toString()) });
    console.log('     pages count:', pages);
  }
  const completedCount = await docsCol.countDocuments({ caseId: caseObjId, status: 'completed', $or: [{ isDeleted: { $exists: false } }, { isDeleted: false }, { isDeleted: { $ne: true } }] });
  console.log('analysisController query (status=completed, isDeleted!=true):', completedCount);
  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
