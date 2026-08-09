#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const ROOT=path.resolve(__dirname,'..');
const test=path.join(__dirname,'stage1az6-prime-search-efficiency-contract.test.cjs');
const output=cp.execFileSync(process.execPath,[test],{encoding:'utf8'});
const digest=crypto.createHash('sha256').update(output).digest('hex');
console.log(JSON.stringify({platform:process.platform,node:process.version,outputDigest:digest,lastLine:output.trim().split(/\n/).pop()},null,2));
