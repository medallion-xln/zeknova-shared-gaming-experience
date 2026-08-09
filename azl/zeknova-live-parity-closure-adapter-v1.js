/* ZekNova W0-P.3 parity closure adapter — read-only; no command issue or execution. */
(function (root) {
  'use strict';
  var C = root.ZekNovaLiveParityClosureContract;
  if (!C) throw new Error('Live parity closure contract must load before adapter.');
  var adapter = Object.freeze({
    id:'zeknova-live-parity-closure-adapter-v1',
    contractId:C.CONTRACT_ID,
    paritySpaceId:C.PARITY_SPACE_ID,
    mode:C.MODE,
    authority:C.AUTHORITY,
    actionCount:C.BINDINGS.length,
    bindings:C.BINDINGS,
    captureRuntimeSurface:function(){
      var integration=root.ZekNovaLiveParityClosureIntegration;
      if(!integration)throw new Error('Live parity closure integration is unavailable.');
      return integration.captureRuntimeSurface();
    },
    captureForFaction:function(factionId,options){
      var integration=root.ZekNovaLiveParityClosureIntegration;
      if(!integration)throw new Error('Live parity closure integration is unavailable.');
      return integration.captureForFaction(factionId,options||{});
    },
    captureLocalClosure:function(options){
      var integration=root.ZekNovaLiveParityClosureIntegration;
      if(!integration)throw new Error('Live parity closure integration is unavailable.');
      return integration.captureLocalClosure(options||{});
    }
  });
  root.ZEK_LIVE_PARITY_CLOSURE_ADAPTER=adapter;
  if(typeof module==='object'&&module.exports)module.exports=adapter;
})(typeof globalThis!=='undefined'?globalThis:this);
