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

// painel digital ao vivo
const tpl = d('dashboard.template.html');
const css = tpl.slice(tpl.indexOf('<style>'), tpl.indexOf('</style>') + 8);
const refD = JSON.parse(d('runs/D20261104/resumo.json'));
const aoVivo = JSON.parse(d('ao-vivo.json'));
const outD = d('dashboard-digital.template.html')
  .replace('/*CSS*/', () => css)
  .replace('/*ENGINE*/', () => d('engine.js'))
  .replace('/*POLICY*/', () => d('policy-digital.js'))
  .replace('/*EXPERIMENT*/', () => d('experiment.js'))
  .replace('/*REF*/', () => JSON.stringify({ semente: refD.semente, dias: refD.dias, hashes: refD.hashes }))
  .replace('/*AOVIVO*/', () => JSON.stringify(aoVivo));
fs.writeFileSync(path.join(__dirname, 'dashboard-digital.html'), outD);
console.log('dashboard-digital.html', outD.length, 'bytes', JSON.stringify(aoVivo));
