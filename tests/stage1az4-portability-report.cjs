#!/usr/bin/env node
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const R=path.resolve(__dirname,'..');
const files=['azl/zeknova-prime-value-objective-calibration-contract-v1.js','docs/governance/prime-value-objective-calibration-registry.json','docs/STAGE1AZ4_PRIME_VALUE_OBJECTIVE_CALIBRATION.md','tests/stage1az4-prime-value-objective-calibration-contract.test.cjs'];
const h=crypto.createHash('sha256');for(const f of files){h.update(f+'\0');h.update(fs.readFileSync(path.join(R,f)));h.update('\0')}console.log('STAGE1AZ4_ZEKNOVA_DIGEST '+h.digest('hex'));
