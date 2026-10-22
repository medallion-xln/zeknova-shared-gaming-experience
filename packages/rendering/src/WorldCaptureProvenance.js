/** Presentation metadata only. Accept public identity plus version counters;
 * never carry server authentication/session IDs or private progression. */
export function worldCaptureProvenance({ worldId, worldRevision, playerEntityId = null, playerRevision = null, replicaCursor = null, workerGeneration = null }) {
  if(typeof worldId!=='string'||!worldId||!Number.isSafeInteger(worldRevision)||worldRevision<0)throw new TypeError('invalid world capture revision');
  for(const value of[playerRevision,replicaCursor,workerGeneration])if(value!==null&&(!Number.isSafeInteger(value)||value<0))throw new TypeError('invalid capture counter');
  if(playerEntityId!==null&&(typeof playerEntityId!=='string'||!playerEntityId))throw new TypeError('invalid public player entity');
  return Object.freeze({schema:'zge.world-capture.v1',worldId,worldRevision,playerEntityId,playerRevision,replicaCursor,workerGeneration,presentationOnly:true});
}
