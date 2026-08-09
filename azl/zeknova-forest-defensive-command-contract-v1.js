/*
 * ZekNova Forest Defensive Command Contract v1
 * W0-P.1: canonical live command lifecycle for the first Forest Defensive vertical slice.
 *
 * Universal module. Exact same bytes install in ZekNova and Sentinel Grid.
 * Requires W0-O.0 identity, W0-O.3 observation, and W0-AF Forest action contracts.
 * No DOM, Three.js, network, storage, wall clock, or Sentinel action authority.
 */
(function (root, factory) {
  var api = factory(root.ZekNovaIdentityContract, root.ZekNovaFactionObservationContract, root.ZekNovaForestDefensiveActionContract);
  root.ZekNovaForestDefensiveCommandContract = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Identity, Observation, Forest) {
  'use strict';

  if (!Identity || Identity.CONTRACT_ID !== 'zeknova-identity-contract-v1') throw new Error('Forest commands require zeknova-identity-contract-v1.');
  if (!Observation || Observation.CONTRACT_ID !== 'zeknova-faction-observation-contract-v1') throw new Error('Forest commands require zeknova-faction-observation-contract-v1.');
  if (!Forest || Forest.CONTRACT_ID !== 'zeknova-forest-defensive-action-contract-v1') throw new Error('Forest commands require zeknova-forest-defensive-action-contract-v1.');

  var SCHEMA_VERSION = 1;
  var CONTRACT_ID = 'zeknova-forest-defensive-command-contract-v1';
  var REGISTRY_ID = 'zeknova-forest-defensive-commands-v1-development';
  var COMMAND_SPACE_ID = 'zeknova-forest-defensive-command-space-v1';
  var REQUIRED_AUTHORITY = 'incumbent-scripted-ai';
  var MODE = 'live-incumbent-command-runtime';
  var COMMAND_PREFIX = 'zkcmd:v1:';
  var EVENT_PREFIX = 'zkcme:v1:';
  var LEDGER_ID = 'zeknova-forest-defensive-command-ledger-v1';
  var PROHIBITED_AUTHORITIES = Object.freeze(['sentinel-prime','sentinel-router','shadow-replay','test-projection']);
  var STATUSES = Object.freeze(['candidate','accepted','active','completed','failed','interrupted']);
  var TERMINAL_STATUSES = Object.freeze(['completed','failed','interrupted']);
  var SUPPORTED_ACTION_INDEXES = Object.freeze([1,3,12]);

  function invariant(value, message) { if (!value) throw new Error(message); }
  function integer(value, name, min) { invariant(Number.isInteger(value) && value >= (min == null ? 0 : min), name + ' must be an integer >= ' + (min == null ? 0 : min) + '.'); return value; }
  function string(value, name) { invariant(typeof value === 'string' && value.length > 0, name + ' must be a nonempty string.'); return value; }
  function nullableInteger(value, name) { if (value === null) return null; return integer(value, name, 0); }
  function nullableString(value, name) { if (value === null) return null; return string(value, name); }
  function exactKeys(raw, keys, label) { invariant(raw && typeof raw === 'object' && !Array.isArray(raw), label + ' must be an object.'); var actual=Object.keys(raw).sort(), expected=keys.slice().sort(); invariant(Identity.canonicalStringify(actual)===Identity.canonicalStringify(expected), label + ' has unexpected or missing fields.'); }
  function actionAt(index) { integer(index,'actionIndex',0); invariant(SUPPORTED_ACTION_INDEXES.indexOf(index)>=0,'Action is outside W0-P.1 vertical slice.'); return Forest.ACTIONS[index]; }
  function isCommandId(value) { return typeof value === 'string' && /^zkcmd:v1:[0-9a-f]{16}$/.test(value); }
  function isEventId(value) { return typeof value === 'string' && /^zkcme:v1:[0-9a-f]{16}$/.test(value); }
  function isTargetId(value) { return typeof value === 'string' && /^zkft:v1:[0-9a-f]{16}$/.test(value); }

  function freezeDefinition(index, slotMode, completionSignals) {
    var action = actionAt(index);
    return Object.freeze({
      actionIndex: action.index,
      actionKey: action.key,
      completionSignals: Object.freeze(completionSignals.slice()),
      cost: action.cost,
      executionQuanta: action.cost.executionQuanta,
      cooldownQuanta: action.cost.cooldownQuanta,
      commitmentQuanta: action.cost.commitmentQuanta,
      patrolSlotMode: slotMode,
      requiresTarget: action.requiresTarget,
      targetTopics: action.targetTopics
    });
  }

  var COMMAND_DEFINITIONS = Object.freeze([
    freezeDefinition(1, 'reserve-new-patrol-slot', ['route_patrol_circuit_completed']),
    freezeDefinition(3, 'reserve-new-patrol-slot', ['patrol_entered_intercept_range','hostile_contact_retired']),
    freezeDefinition(12, 'reuse-existing-patrol-assignment', ['patrol_entered_defensive_return_zone'])
  ]);
  function definitionAt(index) { var result=COMMAND_DEFINITIONS.find(function(x){return x.actionIndex===index;}); invariant(result,'Missing command definition.'); return result; }

  var REQUEST_KEYS = Object.freeze(['actionIndex','actionKey','authoritySource','candidateSetId','commandId','commandSequence','commandSpaceId','contractId','factionId','issuedAtQuantum','observationId','patrolId','planningStateId','registryId','schemaVersion','status','targetId','worldId']);
  var RECORD_KEYS = Object.freeze(['acceptedAtQuantum','actionIndex','actionKey','authoritySource','availablePatrolSlotsAfterAcceptance','availablePatrolSlotsBeforeAcceptance','candidateSetId','commandId','commandSequence','commandSpaceId','completionSignal','contractId','cooldownUntilQuantum','costAppliedAtQuantum','executionQuantaRemaining','factionId','failureReason','interruptedByCommandId','issuedAtQuantum','lastAdvancedAtQuantum','observationId','observedEffects','patrolId','patrolSlotMode','planningStateId','readinessAfterAcceptance','readinessBeforeAcceptance','registryId','schemaVersion','startedAtQuantum','status','targetId','terminalAtQuantum','worldId']);
  var EVENT_KEYS = Object.freeze(['commandId','commandSequence','eventId','eventSequence','ledgerId','quantum','schemaVersion','snapshotHash','status']);
  var LEDGER_KEYS = Object.freeze(['entries','lastEventSequence','ledgerId','schemaVersion']);

  function immutableRequestBody(raw) {
    return Identity.canonicalize({
      actionIndex: raw.actionIndex,
      actionKey: raw.actionKey,
      authoritySource: raw.authoritySource,
      candidateSetId: raw.candidateSetId,
      commandSequence: raw.commandSequence,
      commandSpaceId: COMMAND_SPACE_ID,
      contractId: CONTRACT_ID,
      factionId: raw.factionId,
      issuedAtQuantum: raw.issuedAtQuantum,
      observationId: raw.observationId,
      patrolId: raw.patrolId,
      planningStateId: raw.planningStateId,
      registryId: REGISTRY_ID,
      schemaVersion: SCHEMA_VERSION,
      targetId: raw.targetId,
      worldId: raw.worldId
    });
  }
  function commandIdFor(body) { return COMMAND_PREFIX + Identity.hash64x2(body); }

  function createCommandRequest(raw) {
    raw = raw || {};
    Identity.parseWorldId(raw.worldId);
    Identity.assertCanonicalIdentity(raw.factionId,'factionId');
    invariant(/^zkid:v1:faction:/.test(raw.factionId),'Invalid factionId.');
    invariant(Observation.isObservationId(raw.observationId),'Invalid observationId.');
    invariant(Forest.isStateId(raw.planningStateId),'Invalid planningStateId.');
    invariant(Forest.isCandidateSetId(raw.candidateSetId),'Invalid candidateSetId.');
    var action = actionAt(raw.actionIndex);
    invariant(raw.actionKey == null || raw.actionKey === action.key,'actionKey does not match actionIndex.');
    string(raw.authoritySource,'authoritySource');
    invariant(raw.authoritySource===REQUIRED_AUTHORITY,'Live command authority must be incumbent-scripted-ai.');
    integer(raw.commandSequence,'commandSequence',1);
    integer(raw.issuedAtQuantum,'issuedAtQuantum',0);
    string(raw.patrolId,'patrolId');
    invariant(isTargetId(raw.targetId),'W0-P.1 actions require a canonical W0-AF targetId.');
    var body=immutableRequestBody({
      actionIndex:action.index, actionKey:action.key, authoritySource:raw.authoritySource,
      candidateSetId:raw.candidateSetId, commandSequence:raw.commandSequence, factionId:raw.factionId,
      issuedAtQuantum:raw.issuedAtQuantum, observationId:raw.observationId, patrolId:raw.patrolId,
      planningStateId:raw.planningStateId, targetId:raw.targetId, worldId:raw.worldId
    });
    return Identity.canonicalize(Object.assign({},body,{commandId:commandIdFor(body),status:'candidate'}));
  }
  function validateCommandRequest(raw) {
    exactKeys(raw,REQUEST_KEYS,'command request');
    invariant(raw.schemaVersion===SCHEMA_VERSION&&raw.contractId===CONTRACT_ID&&raw.registryId===REGISTRY_ID&&raw.commandSpaceId===COMMAND_SPACE_ID,'Command request identity mismatch.');
    invariant(raw.status==='candidate','Command request status must be candidate.');
    var expected=createCommandRequest(raw);
    invariant(isCommandId(raw.commandId)&&Identity.canonicalStringify(raw)===Identity.canonicalStringify(expected),'Command request does not match canonical computation.');
    return expected;
  }

  function findCandidateTarget(candidateSet, actionIndex, targetId) {
    var entry=candidateSet.entries[actionIndex];
    invariant(entry&&entry.actionIndex===actionIndex,'Candidate entry missing.');
    invariant(entry.legal===true,'Action is not legal in the W0-AF candidate set.');
    var target=entry.targets.find(function(x){return x.targetId===targetId;});
    invariant(target,'Target is not canonical for this candidate set.');
    return target;
  }

  function createAcceptedCommand(raw) {
    raw=raw||{};
    var request=validateCommandRequest(raw.request);
    var observation=Observation.validateObservation(raw.observation);
    var state=Forest.validatePlanningState(raw.planningState,observation);
    var candidateSet=Forest.validateCandidateSet(raw.candidateSet,state,observation);
    invariant(request.worldId===observation.worldId&&request.factionId===observation.factionId&&request.observationId===observation.observationId,'Request does not address observation.');
    invariant(request.planningStateId===state.stateId&&request.candidateSetId===candidateSet.candidateSetId,'Request does not address planning state and candidate set.');
    findCandidateTarget(candidateSet,request.actionIndex,request.targetId);
    integer(raw.acceptedAtQuantum,'acceptedAtQuantum',request.issuedAtQuantum);
    var readinessBefore=integer(raw.readinessBeforeAcceptance,'readinessBeforeAcceptance',0);
    var slotsBefore=integer(raw.availablePatrolSlotsBeforeAcceptance,'availablePatrolSlotsBeforeAcceptance',0);
    var def=definitionAt(request.actionIndex), action=actionAt(request.actionIndex);
    invariant(readinessBefore>=action.cost.readiness,'Insufficient live readiness at acceptance.');
    if(def.patrolSlotMode==='reserve-new-patrol-slot') invariant(slotsBefore>=1,'No live patrol slot available at acceptance.');
    var readinessAfter=readinessBefore-action.cost.readiness;
    var slotsAfter=slotsBefore-(def.patrolSlotMode==='reserve-new-patrol-slot'?1:0);
    return Identity.canonicalize({
      acceptedAtQuantum:raw.acceptedAtQuantum,
      actionIndex:request.actionIndex,actionKey:request.actionKey,authoritySource:request.authoritySource,
      availablePatrolSlotsAfterAcceptance:slotsAfter,availablePatrolSlotsBeforeAcceptance:slotsBefore,
      candidateSetId:request.candidateSetId,commandId:request.commandId,commandSequence:request.commandSequence,
      commandSpaceId:COMMAND_SPACE_ID,completionSignal:null,contractId:CONTRACT_ID,cooldownUntilQuantum:null,
      costAppliedAtQuantum:raw.acceptedAtQuantum,executionQuantaRemaining:def.executionQuanta,
      factionId:request.factionId,failureReason:null,interruptedByCommandId:null,issuedAtQuantum:request.issuedAtQuantum,
      lastAdvancedAtQuantum:raw.acceptedAtQuantum,observationId:request.observationId,observedEffects:[],patrolId:request.patrolId,
      patrolSlotMode:def.patrolSlotMode,planningStateId:request.planningStateId,
      readinessAfterAcceptance:readinessAfter,readinessBeforeAcceptance:readinessBefore,
      registryId:REGISTRY_ID,schemaVersion:SCHEMA_VERSION,startedAtQuantum:null,status:'accepted',targetId:request.targetId,
      terminalAtQuantum:null,worldId:request.worldId
    });
  }

  function validateCommandRecord(raw) {
    exactKeys(raw,RECORD_KEYS,'command record');
    invariant(raw.schemaVersion===SCHEMA_VERSION&&raw.contractId===CONTRACT_ID&&raw.registryId===REGISTRY_ID&&raw.commandSpaceId===COMMAND_SPACE_ID,'Command record identity mismatch.');
    invariant(isCommandId(raw.commandId),'Invalid commandId.');
    invariant(STATUSES.indexOf(raw.status)>=0&&raw.status!=='candidate','Invalid command record status.');
    actionAt(raw.actionIndex); invariant(Forest.ACTIONS[raw.actionIndex].key===raw.actionKey,'Command action key mismatch.');
    invariant(raw.authoritySource===REQUIRED_AUTHORITY,'Command authority mismatch.');
    integer(raw.commandSequence,'commandSequence',1); integer(raw.issuedAtQuantum,'issuedAtQuantum',0); integer(raw.acceptedAtQuantum,'acceptedAtQuantum',raw.issuedAtQuantum);
    nullableInteger(raw.startedAtQuantum,'startedAtQuantum'); nullableInteger(raw.terminalAtQuantum,'terminalAtQuantum'); nullableInteger(raw.cooldownUntilQuantum,'cooldownUntilQuantum');
    nullableInteger(raw.costAppliedAtQuantum,'costAppliedAtQuantum'); integer(raw.executionQuantaRemaining,'executionQuantaRemaining',0); integer(raw.lastAdvancedAtQuantum,'lastAdvancedAtQuantum',raw.acceptedAtQuantum);
    integer(raw.readinessBeforeAcceptance,'readinessBeforeAcceptance',0); integer(raw.readinessAfterAcceptance,'readinessAfterAcceptance',0); integer(raw.availablePatrolSlotsBeforeAcceptance,'availablePatrolSlotsBeforeAcceptance',0); integer(raw.availablePatrolSlotsAfterAcceptance,'availablePatrolSlotsAfterAcceptance',0);
    string(raw.patrolId,'patrolId'); invariant(isTargetId(raw.targetId),'Invalid targetId.'); nullableString(raw.completionSignal,'completionSignal'); nullableString(raw.failureReason,'failureReason'); if(raw.interruptedByCommandId!==null) invariant(isCommandId(raw.interruptedByCommandId),'Invalid interruptedByCommandId.');
    invariant(Array.isArray(raw.observedEffects)&&raw.observedEffects.every(function(x){return typeof x==='string'&&x.length>0;}),'observedEffects must be strings.');
    var def=definitionAt(raw.actionIndex), action=actionAt(raw.actionIndex); invariant(raw.patrolSlotMode===def.patrolSlotMode,'patrolSlotMode mismatch.');
    var immutable=immutableRequestBody(raw); invariant(raw.commandId===commandIdFor(immutable),'Command ID does not match immutable request fields.');
    invariant(raw.costAppliedAtQuantum===raw.acceptedAtQuantum,'Command cost must be applied exactly at acceptance.');
    invariant(raw.readinessAfterAcceptance===raw.readinessBeforeAcceptance-action.cost.readiness,'Readiness deduction mismatch.');
    invariant(raw.availablePatrolSlotsAfterAcceptance===raw.availablePatrolSlotsBeforeAcceptance-(def.patrolSlotMode==='reserve-new-patrol-slot'?1:0),'Patrol slot deduction mismatch.');
    invariant(raw.executionQuantaRemaining<=def.executionQuanta,'Execution remainder exceeds declared duration.');
    if(raw.status==='accepted') invariant(raw.startedAtQuantum===null&&raw.terminalAtQuantum===null&&raw.executionQuantaRemaining===def.executionQuanta,'Accepted command lifecycle mismatch.');
    if(raw.status==='active') invariant(raw.startedAtQuantum!==null&&raw.terminalAtQuantum===null&&raw.executionQuantaRemaining>0,'Active command lifecycle mismatch.');
    if(TERMINAL_STATUSES.indexOf(raw.status)>=0) invariant(raw.startedAtQuantum!==null&&raw.terminalAtQuantum!==null&&raw.executionQuantaRemaining===0&&raw.cooldownUntilQuantum!==null,'Terminal command lifecycle mismatch.');
    if(raw.status==='completed') invariant(def.completionSignals.indexOf(raw.completionSignal)>=0&&raw.failureReason===null,'Completed command signal mismatch.');
    if(raw.status==='failed') invariant(raw.failureReason!==null&&raw.completionSignal===null,'Failed command reason mismatch.');
    if(raw.status==='interrupted') invariant(raw.failureReason==='interrupted_by_incumbent_command'&&raw.interruptedByCommandId!==null,'Interrupted command mismatch.');
    return Identity.canonicalize(raw);
  }

  function startCommand(raw, startedAtQuantum) {
    var record=validateCommandRecord(raw); invariant(record.status==='accepted','Only accepted commands may start.'); integer(startedAtQuantum,'startedAtQuantum',record.acceptedAtQuantum);
    return validateCommandRecord(Identity.canonicalize(Object.assign({},record,{startedAtQuantum:startedAtQuantum,lastAdvancedAtQuantum:startedAtQuantum,status:'active'})));
  }

  function advanceCommand(raw, options) {
    var record=validateCommandRecord(raw); invariant(record.status==='active','Only active commands may advance.'); options=options||{}; var interrupted=options.interruptedByCommandId==null?null:String(options.interruptedByCommandId); var quantum=integer(options.quantum,'quantum',interrupted?record.lastAdvancedAtQuantum:record.lastAdvancedAtQuantum+1); if(!interrupted) invariant(quantum>record.lastAdvancedAtQuantum,'Command quantum must advance.');
    var def=definitionAt(record.actionIndex); var completion=options.completionSignal==null?null:String(options.completionSignal); var failure=options.failureReason==null?null:String(options.failureReason);
    invariant(!(completion&&failure)&&!(completion&&interrupted)&&!(failure&&interrupted),'Command cannot complete, fail, and interrupt simultaneously.');
    var remaining=Math.max(0,record.executionQuantaRemaining-(quantum-record.lastAdvancedAtQuantum)); var status='active', terminal=null, cooldown=null, signal=null, reason=null, by=null;
    if(interrupted){ invariant(isCommandId(interrupted),'Invalid interrupting commandId.'); status='interrupted';terminal=quantum;cooldown=quantum+def.cooldownQuanta;remaining=0;reason='interrupted_by_incumbent_command';by=interrupted; }
    else if(failure){ status='failed';terminal=quantum;cooldown=quantum+def.cooldownQuanta;remaining=0;reason=failure; }
    else if(completion){ invariant(def.completionSignals.indexOf(completion)>=0,'Completion signal is not declared for this action.');status='completed';terminal=quantum;cooldown=quantum+def.cooldownQuanta;remaining=0;signal=completion; }
    else if(remaining===0){ status='failed';terminal=quantum;cooldown=quantum+def.cooldownQuanta;reason='completion_signal_missing'; }
    var effects=Array.isArray(options.observedEffects)?options.observedEffects.map(String):record.observedEffects;
    return validateCommandRecord(Identity.canonicalize(Object.assign({},record,{completionSignal:signal,cooldownUntilQuantum:cooldown,executionQuantaRemaining:remaining,failureReason:reason,interruptedByCommandId:by,lastAdvancedAtQuantum:quantum,observedEffects:effects,status:status,terminalAtQuantum:terminal})));
  }

  function snapshotHash(record){ return Identity.hash64x2(validateCommandRecord(record)); }
  function createCommandEvent(raw) {
    var command=validateCommandRecord(raw.command); integer(raw.eventSequence,'eventSequence',1); integer(raw.quantum,'quantum',0); invariant(raw.quantum===command.lastAdvancedAtQuantum,'Event quantum must match command snapshot.');
    var body=Identity.canonicalize({commandId:command.commandId,commandSequence:command.commandSequence,eventSequence:raw.eventSequence,ledgerId:LEDGER_ID,quantum:raw.quantum,schemaVersion:SCHEMA_VERSION,snapshotHash:snapshotHash(command),status:command.status});
    return Identity.canonicalize(Object.assign({},body,{eventId:EVENT_PREFIX+Identity.hash64x2(body)}));
  }
  function validateCommandEvent(raw){ exactKeys(raw,EVENT_KEYS,'command event'); invariant(raw.ledgerId===LEDGER_ID&&raw.schemaVersion===SCHEMA_VERSION&&isEventId(raw.eventId),'Invalid command event identity.'); integer(raw.eventSequence,'eventSequence',1); integer(raw.commandSequence,'commandSequence',1); integer(raw.quantum,'quantum',0); invariant(isCommandId(raw.commandId),'Invalid event commandId.'); invariant(STATUSES.indexOf(raw.status)>=0&&raw.status!=='candidate','Invalid event status.'); invariant(/^[0-9a-f]{16}$/.test(raw.snapshotHash),'Invalid snapshotHash.'); var body=Identity.canonicalize({commandId:raw.commandId,commandSequence:raw.commandSequence,eventSequence:raw.eventSequence,ledgerId:LEDGER_ID,quantum:raw.quantum,schemaVersion:SCHEMA_VERSION,snapshotHash:raw.snapshotHash,status:raw.status}); invariant(raw.eventId===EVENT_PREFIX+Identity.hash64x2(body),'Command event ID mismatch.'); return Identity.canonicalize(raw); }

  function CommandEventLedger(snapshot) { this.entries=[];this.lastEventSequence=0;if(snapshot)this.restore(snapshot); }
  CommandEventLedger.prototype.append=function(command){ var event=createCommandEvent({command:command,eventSequence:this.lastEventSequence+1,quantum:command.lastAdvancedAtQuantum});this.entries.push(event);this.lastEventSequence=event.eventSequence;return event; };
  CommandEventLedger.prototype.snapshot=function(){ return Identity.canonicalize({entries:this.entries.map(function(x){return Identity.stableClone(x);}),lastEventSequence:this.lastEventSequence,ledgerId:LEDGER_ID,schemaVersion:SCHEMA_VERSION}); };
  CommandEventLedger.prototype.restore=function(raw){ exactKeys(raw,LEDGER_KEYS,'command ledger'); invariant(raw.ledgerId===LEDGER_ID&&raw.schemaVersion===SCHEMA_VERSION,'Command ledger identity mismatch.'); invariant(Array.isArray(raw.entries),'Ledger entries must be an array.'); var expected=1;this.entries=raw.entries.map(function(x){var e=validateCommandEvent(x);invariant(e.eventSequence===expected++,'Command ledger sequence must be contiguous.');return e;});this.lastEventSequence=integer(raw.lastEventSequence,'lastEventSequence',0);invariant(this.lastEventSequence===this.entries.length,'Command ledger lastEventSequence mismatch.'); };
  CommandEventLedger.fromSnapshot=function(raw){return new CommandEventLedger(raw);};

  return Object.freeze({
    SCHEMA_VERSION:SCHEMA_VERSION,CONTRACT_ID:CONTRACT_ID,REGISTRY_ID:REGISTRY_ID,COMMAND_SPACE_ID:COMMAND_SPACE_ID,
    REQUIRED_AUTHORITY:REQUIRED_AUTHORITY,MODE:MODE,PROHIBITED_AUTHORITIES:PROHIBITED_AUTHORITIES,STATUSES:STATUSES,
    TERMINAL_STATUSES:TERMINAL_STATUSES,SUPPORTED_ACTION_INDEXES:SUPPORTED_ACTION_INDEXES,COMMAND_DEFINITIONS:COMMAND_DEFINITIONS,
    LEDGER_ID:LEDGER_ID,isCommandId:isCommandId,isEventId:isEventId,createCommandRequest:createCommandRequest,
    validateCommandRequest:validateCommandRequest,createAcceptedCommand:createAcceptedCommand,validateCommandRecord:validateCommandRecord,
    startCommand:startCommand,advanceCommand:advanceCommand,snapshotHash:snapshotHash,createCommandEvent:createCommandEvent,
    validateCommandEvent:validateCommandEvent,CommandEventLedger:CommandEventLedger
  });
});
