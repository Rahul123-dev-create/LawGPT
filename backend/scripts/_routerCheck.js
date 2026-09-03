const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/lawgpt');
  const routes = require('../src/routes');

  function inspectRouter(prefix, router) {
    console.log(`\n=== Router: ${prefix} ===`);
    for (const layer of router.stack) {
      if (layer.route) {
        const methods = Object.keys(layer.route.methods).map(m => m.toUpperCase()).join(',');
        console.log(`  ${methods.padEnd(8)} ${prefix}${layer.route.path}`);
      } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
        // nested router
        const subPrefix = prefix + (layer.regexp && layer.regexp.source ? ` [regexp=${layer.regexp.source.slice(0, 40)}...]` : '');
        console.log(`  NESTED at prefix: ${subPrefix}`);
        // Extract param capture
        inspectRouter(prefix + '<caseId>', layer.handle);
      }
    }
  }

  inspectRouter('/api', routes);

  // Also test - create an ephemeral express app, attach routes, send a fake request
  const app = express();
  app.use(express.json());
  app.use('/api', routes);
  app.use((req, res) => { console.log('GLOBAL FALLBACK HIT:', req.method, req.path); res.status(404).json({m:'fallback'}); });
  // Create a test request
  const caseId = '6a997cbe340dba39bdda6dac';
  const paths = [
    ['POST', '/api/cases/' + caseId + '/analysis'],
    ['POST', '/api/cases/' + caseId + '/analysis/generate'],
    ['POST', '/api/cases/' + caseId + '/analysis/regenerate'],
    ['GET', '/api/cases/' + caseId + '/analysis'],
  ];
  console.log('\n=== Simulated route match (no middleware) ===');
  for (const [method, p] of paths) {
    const match = routes.stack.find(layer => {
      if (!layer.route) return false;
      return layer.route.path === '/cases/:caseId/analysis' || layer.route.path === p.replace('/api','');
    });
    console.log(`  ${method.padEnd(6)} ${p}  -> direct match? NO (Express subrouters are nested)`);
  }
  await mongoose.disconnect();
})();
