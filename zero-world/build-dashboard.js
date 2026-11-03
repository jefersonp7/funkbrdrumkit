// Monta zero-world/dashboard.html embutindo o mesmo código do motor usado em Node.
'use strict';
const fs = require('fs');
const path = require('path');
const d = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const resumo = JSON.parse(d('runs/R20261104/resumo.json'));
const hashes = { semente: resumo.semente, dias: resumo.dias, hashes: resumo.hashes };
const out = d('dashboard.template.html')
  .replace('/*ENGINE*/', () => d('engine.js'))
  .replace('/*POLICY*/', () => d('policy.js'))
  .replace('/*EXPERIMENT*/', () => d('experiment.js'))
  .replace('/*HASHES*/', () => JSON.stringify(hashes));
fs.writeFileSync(path.join(__dirname, 'dashboard.html'), out);
console.log('dashboard.html', out.length, 'bytes');
