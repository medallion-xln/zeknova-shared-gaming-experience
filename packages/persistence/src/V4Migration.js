import { immutableData, createWorldState, canonicalJSON, validateWorldState } from '../../core/src/index.js';
import { validateSnapshot, readExtension } from './schema.js';
export const V4_MIGRATION_SCHEMA='zge.v4-world-migration.v1';
/** Lossless, reversible observation/migration boundary. Does not infer missing
 * legacy command/reward receipts or grant permission to execute that world. */
export function migrateV4Save(input) {
  if(input?.schema===V4_MIGRATION_SCHEMA){validateV4Migration(input);return immutableData(input);}
  const original=immutableData(input);validateSnapshot(original);if(original.version!==4)throw new TypeError('This adapter supports observed v4 only');
  if(!original.user.id)throw new TypeError('V4 player identity required');
  const extension=readExtension(original), player={x:0,y:0,z:0,...original.player};
  const xp=extension?.player.xp??player.xp??0;if(!Number.isFinite(xp)||xp<0)throw new TypeError('invalid XP');
  const buildings=original.buildings.map(b=>({...b,rotation:b.rotation??0,level:b.level??1}));
  const playerId='player:'+original.user.id;
  const state=createWorldState({id:'legacy:'+original.user.teamCode,revision:original.persistence?.sharedRevision??original.persistence?.revision??0,authority:{domain:'legacy-save',owner:'LEGACY',epoch:0},inventory:original.resources??{},buildings,
    entities:[...buildings.map(b=>({id:b.id,components:{transform:{x:b.x,y:b.y,z:b.z,rotation:b.rotation},building:{type:b.type}}})),{id:playerId,components:{transform:{x:player.x,y:player.y,z:player.z,rotation:player.rotation??0},identity:original.user,progress:{xp,rank:extension?.player.officerClass??original.user.officerClass??'ensign',rankXp:extension?.player.rankXp??null,missionStats:original.missionStats??{},bossClaims:original.missionStats?.bossDefeats??{},engineEvents:[]}}}]});
  const migration=immutableData({schema:V4_MIGRATION_SCHEMA,original,sourceCanonical:canonicalJSON(original),state,notes:{commandHistory:'not-present-in-v4',rewardReceipts:'preserved-boss-records-not-inferred',unknownExtension:!!original.zge&&!extension,authority:'read-only-until-game-specific-migration-certified'}});
  return migration;
}
export function validateV4Migration(value){if(value.schema!==V4_MIGRATION_SCHEMA||value.original?.version!==4||value.sourceCanonical!==canonicalJSON(value.original))throw new TypeError('invalid V4 migration provenance');validateWorldState(value.state);if(canonicalJSON(migrateV4Save(value.original))!==canonicalJSON(value))throw new TypeError('V4 migration projection differs from original');return value;}
export function rollbackV4Migration(value){validateV4Migration(value);return immutableData(value.original);}
export function persistV4Migration(input,write){const migration=migrateV4Save(input);write(migration);return migration;}
