const mongoose = require('mongoose');
(async() => {
  await mongoose.connect('mongodb://localhost:27017/lawgpt');
  const docsCol = mongoose.connection.db.collection('documents');
  const casesCol = mongoose.connection.db.collection('cases');
  const c = await casesCol.findOne({ title: /Sri Krishna/ });
  const caseObjId = new mongoose.Types.ObjectId(c._id.toString());
  // Reset isDeleted and ensure status=completed for docs in this case
  const upd = await docsCol.updateMany(
    { caseId: caseObjId },
    { $set: { isDeleted: false, status: 'completed', processedAt: new Date(), pageCount: 62 } }
  );
  console.log('Updated', upd.modifiedCount, 'documents: isDeleted=false, status=completed');
  const count = await docsCol.countDocuments({ caseId: caseObjId, status: 'completed', $or: [{ isDeleted: { $exists: false } }, { isDeleted: false }] });
  console.log('completed, not deleted:', count);
  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
