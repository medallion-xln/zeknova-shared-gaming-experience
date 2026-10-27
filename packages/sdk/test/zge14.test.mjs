import test from 'node:test';import assert from 'node:assert/strict';import {inspectGLB} from '@zge/sdk';import {validateModel} from '../src/model.js';import {texturedGLB,triangleGLB} from '../../../scripts/zge14-fixtures.mjs';
test('bounded embedded base-color texture opt-in parses to a portable static model',()=>{const bytes=texturedGLB();assert.throws(()=>inspectGLB(bytes));const m=inspectGLB(bytes,{hierarchy:true});assert.equal(m.parts.length,1);assert.equal(m.images.length,1);assert.equal(m.images[0].mimeType,'image/png');assert.equal(typeof m.images[0].data,'string');assert.ok(m.images[0].data.length>0);assert.equal(m.images[0].size,atob(m.images[0].data).length);assert.equal(m.parts[0].map,0);assert.equal(m.parts[0].normalMap,null);assert.equal(m.parts[0].alphaMode,'OPAQUE');assert.ok(Array.isArray(m.parts[0].texcoords));assert.equal(m.parts[0].texcoords.length,m.parts[0].positions.length/3*2);const out=validateModel(m);assert.equal(out.schema,'zge.static-model.v1');});
test('embedded image outside hierarchy opt-in is rejected',()=>{assert.throws(()=>inspectGLB(texturedGLB()),/hierarchy/);});
test('hostile/corrupt textured-GLB corpus fails closed',()=>{const bad=[
  // external reference image (uri) must be rejected
  texturedGLB({images:[{mimeType:'image/png',uri:'https://invalid.test/a.png'}]}),
  // unsupported WebP/compressed mime is rejected even when embedded
  texturedGLB({images:[{mimeType:'image/webp',bufferView:2}]}),
  // texture pointing past the images array (out-of-range source)
  texturedGLB({textures:[{source:5}]}),
  // baseColorTexture present but primitive lacks TEXCOORD_0
  triangleGLB({images:[{mimeType:'image/png',bufferView:1}],textures:[{source:0}],materials:[{pbrMetallicRoughness:{baseColorTexture:{index:0}}}]}),
  // alphaMode MASK with no alpha channel and no alphaCutoff
  triangleGLB({materials:[{doubleSided:true,alphaMode:'MASK',pbrMetallicRoughness:{baseColorFactor:[1,1,1,1]}}]}),
  ];
  for(const bytes of bad)assert.throws(()=>inspectGLB(bytes,{hierarchy:true}),e=>e.code==='MODEL_FORMAT');
});


