(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  root.ZekNovaStrategicActionCatalogV2=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var ACTION_KEYS=Object.freeze([
    'hold_settlement_perimeter','patrol_known_route','reconnoiter_forest_lane',
    'intercept_hostile_contact','screen_combat_alert','reinforce_threatened_structure',
    'repair_known_structure','fortify_known_route','secure_known_resource',
    'stabilize_known_infrastructure','share_direct_intelligence',
    'open_defensive_channel','withdraw_exposed_patrol'
  ]);
  var REQUIRES_TARGET=Object.freeze({
    patrol_known_route:true,reconnoiter_forest_lane:true,intercept_hostile_contact:true,
    screen_combat_alert:true,reinforce_threatened_structure:true,repair_known_structure:true,
    fortify_known_route:true,secure_known_resource:true,stabilize_known_infrastructure:true,
    share_direct_intelligence:true,withdraw_exposed_patrol:true
  });
  var AUTHORITY=Object.freeze({tier:'R0',canDispatch:false,canMutateLiveWorld:false});
  function assert(condition,message){if(!condition)throw new Error(message);}
  function assertComplete(entries){
    assert(Array.isArray(entries),'candidate entries must be an array');
    var keys=entries.map(function(e){return e&&e.actionKey;});
    assert(keys.length===13,'candidate surface must contain exactly 13 actions');
    assert(new Set(keys).size===13,'candidate action keys must be unique');
    ACTION_KEYS.forEach(function(key){assert(keys.indexOf(key)!==-1,'missing candidate action: '+key);});
    return true;
  }
  return Object.freeze({
    CONTRACT_ID:'zeknova-strategic-action-catalog-v2',SCHEMA_VERSION:2,
    ACTION_KEYS:ACTION_KEYS,ACTION_COUNT:13,REQUIRES_TARGET:REQUIRES_TARGET,
    AUTHORITY:AUTHORITY,assertComplete:assertComplete
  });
});
