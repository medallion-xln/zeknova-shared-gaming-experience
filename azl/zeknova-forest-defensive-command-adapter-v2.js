/* Read-only Sentinel-facing W0-P.2 adapter. No issue/execute/dispatch/commit/apply surface. */
(function(root){
  'use strict';
  var adapter=Object.freeze({
    id:'zeknova-forest-defensive-command-adapter-v2',
    version:2,
    mode:'live-incumbent-command-runtime',
    authority:'incumbent-scripted-ai',
    actionCount:13,
    captureRuntimeSnapshot:function(){var runtime=root.ZekNovaForestDefensiveCommandIntegrationV2;if(!runtime||typeof runtime.captureRuntimeSnapshot!=='function')throw new Error('W0-P.2 runtime is unavailable.');return runtime.captureRuntimeSnapshot();},
    getCommand:function(commandId){var runtime=root.ZekNovaForestDefensiveCommandIntegrationV2;if(!runtime||typeof runtime.getCommand!=='function')throw new Error('W0-P.2 runtime is unavailable.');return runtime.getCommand(commandId);}
  });
  root.ZEK_FOREST_DEFENSIVE_COMMAND_ADAPTER_V2=adapter;
  if(typeof module==='object'&&module.exports)module.exports=adapter;
})(typeof globalThis!=='undefined'?globalThis:this);
