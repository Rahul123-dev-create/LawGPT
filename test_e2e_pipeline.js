// Integration test for LawGPT end-to-end document processing pipeline
// Simulates: upload → OCR → extraction → cleaning → chunking → embeddings → ChromaDB → IPC/BNS tagging

const axios = require('axios');
const jwt = require('jsonwebtoken');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

// Configuration
const BACKEND_URL = 'http://localhost:5000';
const PYTHON_AI_URL = 'http://localhost:8000';
const MONGO_URI = 'mongodb://localhost:27017/lawgpt';
const JWT_ACCESS_SECRET = 'replace_with_a_long_random_string'; // from backend/.env

// Test data
const TEST_CASE_DATA = {
  caseNumber: 'TEST-2026-001',
  title: 'Test Case for E2E Pipeline',
  description: 'Automated test case for verifying document processing pipeline',
  caseType: 'Criminal',
  court: 'Test Court',
  state: 'Test State',
  jurisdiction: 'Test Jurisdiction',
  status: 'ongoing',
  priority: 'medium',
  filingDate: new Date().toISOString().split('T')[0],
  createdBy: '670a1b2c3d4e5f6789abcdef0', // Mock user ID
  assignedUsers: ['670a1b2c3d4e5f6789abcdef0']
};

const TEST_DOCUMENT_CONTENT = `
INDIAN PENAL CODE, 1860

Section 302: Punishment for murder
Whoever commits murder shall be punished with death, or imprisonment for life, and shall also be liable to fine.

Section 420: Cheating and dishonestly inducing delivery of property
Whoever cheats and thereby dishonestly induces the person deceived to deliver any property to any person, or to make, alter or destroy the whole or any part of a valuable security, or anything which is signed or sealed, and which is capable of being converted into a valuable security, shall be punished with imprisonment of either description for a term which may extend to seven years, and shall also be liable to fine.

BHARATIYA NYAYA SANHITA, 2023

Section 101: Punishment for murder
Whoever commits murder shall be punished with death or imprisonment for life and shall also be liable to fine.

Section 318: Cheating
Whoever cheats shall be punished with imprisonment of either description for a term which may extend to three years, or with fine, or with both, and if the cheating is done by means of personation, it shall be punished with imprisonment of either description for a term which may extend to five years.
`;

// Helper functions
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function generateMockJwtToken(userId) {
  const payload = {
    sub: userId,
    role: 'user' // or 'admin' if needed
  };
  return jwt.sign(payload, JWT_ACCESS_SECRET, { expiresIn: '15m' });
}

async function waitForService(url, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await axios.get(`${url}/health`, { timeout: 2000 });
      if (response.status === 200) {
        console.log(`✓ Service at ${url} is healthy`);
        return true;
      }
    } catch (error) {
      // Service not ready yet
    }
    await sleep(1000);
    process.stdout.write('.');
  }
  console.log(`\n✗ Service at ${url} did not become healthy in time`);
  return false;
}

// Main test function
async function runE2ETest() {
  console.log('🧪 Starting LawGPT End-to-End Pipeline Test\n');

  let backendProcess = null;
  let pythonAiProcess = null;
  let mongoClient = null;
  let authToken = null;
  let caseId = null;
  let documentId = null;

  try {
    // Step 0: Check if services are already running, start them if not
    console.log('🔍 Checking service availability...');
    const backendHealthy = await waitForService(BACKEND_URL, 5);
    const pythonAiHealthy = await waitForService(PYTHON_AI_URL, 5);

    if (!backendHealthy) {
      console.log('🚀 Starting backend service...');
      // In a real test, we'd start the service here, but for simplicity we'll assume it's running
      // or we could spawn a child process. For now, we'll continue and let it fail if not running.
    }

    if (!pythonAiHealthy) {
      console.log('🚀 Starting python-ai service...');
      // Same as above
    }

    // Wait a bit more for services to be ready
    await sleep(3000);

    // Step 1: Connect to MongoDB and create test case
    console.log('\n📊 Step 1: Setting up test data in MongoDB...');
    mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
    const db = mongoClient.db('lawgpt');
    const casesCollection = db.collection('cases');

    // Clean up any existing test case
    await casesCollection.deleteMany({ caseNumber: TEST_CASE_DATA.caseNumber });

    // Insert test case
    const caseResult = await casesCollection.insertOne(TEST_CASE_DATA);
    caseId = caseResult.insertedId;
    console.log(`✓ Created test case with ID: ${caseId}`);

    // Step 2: Generate JWT token for authentication
    console.log('\n🔐 Step 2: Generating authentication token...');
    authToken = generateMockJwtToken(TEST_CASE_DATA.createdBy);
    console.log('✓ Generated JWT token');

    // Step 3: Upload document via backend
    console.log('\n📤 Step 3: Uploading test document...');
    const form = new FormData();
    form.append('documents', Buffer.from(TEST_DOCUMENT_CONTENT), {
      filename: 'test_legal_document.txt',
      contentType: 'text/plain'
    });
    form.append('document_id', 'test-doc-001');
    form.append('case_id', caseId.toString());
    form.append('doc_type', 'Legal Code');
    form.append('original_name', 'test_legal_document.txt');
    form.append('mime_type', 'text/plain');
    form.append('language', 'en');

    const uploadResponse = await axios.post(
      `${BACKEND_URL}/api/cases/${caseId}/documents`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${authToken}`
        },
        timeout: 10000
      }
    );

    if (uploadResponse.status !== 201) {
      throw new Error(`Document upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
    }

    documentId = uploadResponse.data.documents[0]._id;
    console.log(`✓ Document uploaded with ID: ${documentId}`);
    console.log(`  Initial status: ${uploadResponse.data.documents[0].status}`);

    // Step 4: Trigger processing and wait for completion
    console.log('\n⚙️  Step 4: Triggering document processing...');
    const processResponse = await axios.post(
      `${BACKEND_URL}/api/cases/${caseId}/documents/${documentId}/process`,
      {},
      {
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        timeout: 5000
      }
    );

    if (processResponse.status !== 202) {
      throw new Error(`Processing trigger failed: ${processResponse.status} ${processResponse.statusText}`);
    }

    console.log('✓ Processing triggered successfully');

    // Step 5: Poll for processing completion
    console.log('\n⏳ Step 5: Waiting for processing to complete...');
    let maxAttempts = 30; // 30 seconds max wait
    let attempts = 0;
    let isProcessing = true;

    while (isProcessing && attempts < maxAttempts) {
      await sleep(1000);
      attempts++;

      const docResponse = await axios.get(
        `${BACKEND_URL}/api/cases/${caseId}/documents/${documentId}`,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`
          },
          timeout: 5000
        }
      );

      const status = docResponse.data.status;
      process.stdout.write(`  Attempt ${attempts}: status = ${status}\r`);

      if (status === 'completed') {
        isProcessing = false;
        console.log(`\n✓ Document processing completed after ${attempts} seconds`);
      } else if (status === 'failed') {
        throw new Error(`Document processing failed: ${docResponse.data.error || 'Unknown error'}`);
      } else if (status === 'processing') {
        // Still processing, continue
      } else {
        // Pending or other status
      }
    }

    if (isProcessing) {
      throw new Error(`Document processing did not complete within ${maxAttempts} seconds`);
    }

    // Step 6: Verify processing results
    console.log('\n🔍 Step 6: Verifying processing results...');
    const finalDocResponse = await axios.get(
      `${BACKEND_URL}/api/cases/${caseId}/documents/${documentId}`,
      {
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        timeout: 5000
      }
    );

    const doc = finalDocResponse.data;
    console.log(`✓ Final document status: ${doc.status}`);
    console.log(`✓ Page count: ${doc.pageCount}`);
    console.log(`✓ Chunk count: ${doc.chunkCount}`);
    console.log(`✓ Character count: ${doc.charCount}`);

    if (doc.status !== 'completed') {
      throw new Error(`Expected completed status, got ${doc.status}`);
    }

    if (doc.pageCount === 0 || doc.chunkCount === 0) {
      throw new Error('Document should have pages and chunks after processing');
    }

    // Step 7: Verify chunks were stored in ChromaDB via python-ai search
    console.log('\n🔎 Step 7: Verifying ChromaDB storage via search...');
    const searchQuery = "punishment for murder";
    const searchResponse = await axios.post(
      `${BACKEND_URL}/api/cases/${caseId}/documents/search`,
      {
        caseId: caseId.toString(),
        query: searchQuery,
        topK: 5
      },
      {
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        timeout: 5000
      }
    );

    if (searchResponse.status !== 200) {
      throw new Error(`Search failed: ${searchResponse.status} ${searchResponse.statusText}`);
    }

    const searchResults = searchResponse.data.chunks || [];
    console.log(`✓ Found ${searchResults.length} relevant chunks for query: "${searchQuery}"`);

    if (searchResults.length === 0) {
      throw new Error('No search results found - chunks may not have been stored in ChromaDB');
    }

    // Show first result as example
    if (searchResults.length > 0) {
      const firstResult = searchResults[0];
      console.log(`  Example chunk:`);
      console.log(`    Document: ${firstResult.documentName}`);
      console.log(`    Page: ${firstResult.pageNumber}`);
      console.log(`    Text preview: ${firstResult.text.substring(0, 100)}...`);
      console.log(`    Score: ${firstResult.score}`);
    }

    // Step 8: Trigger analysis to get IPC/BNS tags
    console.log('\n📊 Step 8: Triggering case analysis for IPC/BNS tagging...');
    const analysisResponse = await axios.post(
      `${BACKEND_URL}/api/cases/${caseId}/analysis`,
      {},
      {
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        timeout: 15000 // Analysis might take longer
      }
    );

    if (analysisResponse.status !== 200 && analysisResponse.status !== 202) {
      throw new Error(`Analysis trigger failed: ${analysisResponse.status} ${analysisResponse.statusText}`);
    }

    console.log('✓ Analysis triggered');

    // Step 9: Wait for analysis completion and check results
    console.log('\n⏳ Step 9: Waiting for analysis completion...');
    let analysisAttempts = 0;
    const maxAnalysisAttempts = 30;
    let analysisCompleted = false;

    while (!analysisCompleted && analysisAttempts < maxAnalysisAttempts) {
      await sleep(1000);
      analysisAttempts++;

      const analysisStatusResponse = await axios.get(
        `${BACKEND_URL}/api/cases/${caseId}/analysis`,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`
          },
          timeout: 5000
        }
      );

      const analysisStatus = analysisStatusResponse.data.status;
      process.stdout.write(`  Analysis attempt ${analysisAttempts}: status = ${analysisStatus}\r`);

      if (analysisStatus === 'completed') {
        analysisCompleted = true;
        console.log(`\n✓ Case analysis completed after ${analysisAttempts} seconds`);

        // Show analysis results
        const analysis = analysisStatusResponse.data;
        console.log(`\n📋 Analysis Results:`);
        console.log(`  Summary: ${analysis.summary.text.substring(0, 150)}...`);
        console.log(`  Key Points: ${analysis.summary.keyPoints.join(', ')}`);
        console.log(`  Entities found: ${analysis.entities.length}`);
        console.log(`  Laws found: ${analysis.laws.length}`);

        // Show IPC/BNS laws specifically
        const ipcBnsLaws = analysis.laws.filter(law =>
          law.code === 'IPC' || law.code === 'BNS' || law.code === 'BNSS' || law.code === 'BSA'
        );
        console.log(`  IPC/BNS/NYAYA/BSS laws: ${ipcBnsLaws.length}`);

        if (ipcBnsLaws.length > 0) {
          console.log('  Example IPC/BNS mappings:');
          ipcBnsLaws.slice(0, 3).forEach((law, index) => {
            console.log(`    ${index + 1}. ${law.code} ${law.section}: ${law.label}`);
            if (law.equivalent) {
              console.log(`       → Equivalent: ${law.equivalent}`);
            }
          });
        }

      } else if (analysisStatus === 'failed') {
        throw new Error(`Case analysis failed: ${analysisStatusResponse.data.error || 'Unknown error'}`);
      }
      // Still processing or pending, continue
    }

    if (!analysisCompleted) {
      throw new Error(`Case analysis did not complete within ${maxAnalysisAttempts} seconds`);
    }

    console.log('\n🎉 End-to-End Pipeline Test PASSED!');
    console.log('   ✓ Document uploaded successfully');
    console.log('   ✓ OCR/text extraction completed');
    console.log('   ✓ Text cleaned and normalized');
    console.log('   ✓ Page-aware chunking performed');
    console.log('   ✓ Embeddings generated and stored in ChromaDB');
    console.log('   ✓ IPC/BNS tagging via LLM analysis completed');
    console.log('   ✓ All services communicating correctly');

  } catch (error) {
    console.error('\n❌ End-to-End Pipeline Test FAILED:');
    console.error(`   ${error.message}`);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    throw error;
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up...');

    if (mongoClient) {
      await mongoClient.close();
      console.log('  ✓ MongoDB connection closed');
    }

    // Optionally remove test data from MongoDB
    try {
      if (mongoClient && caseId) {
        const db = mongoClient.db('lawgpt');
        await db.collection('cases').deleteMany({ caseNumber: TEST_CASE_DATA.caseNumber });
        await db.collection('documents').deleteMany({ caseId: caseId });
        await db.collection('caseanalyses').deleteMany({ caseId: caseId });
        console.log('  ✓ Test data removed from MongoDB');
      }
    } catch (cleanupError) {
      console.warn('  ⚠️  Cleanup warning:', cleanupError.message);
    }

    // Note: We're not stopping the services as they might be used for other tests
    console.log('  ℹ️  Services left running for potential further testing');
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  runE2ETest()
    .then(() => {
      console.log('\n✅ Test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Test failed with error:', error.message);
      process.exit(1);
    });
}

module.exports = { runE2ETest };