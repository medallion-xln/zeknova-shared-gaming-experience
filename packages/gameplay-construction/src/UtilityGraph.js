/** Pure recursive service connectivity. Cycles cannot supply themselves. */
export function utilityStatus(records, definitionType, x, z, rules, excludeId = null, visited = new Set()) {
  const connections = (rules.requirements[definitionType] ?? []).map(utility => {
    let source = null, nearest = Infinity;
    for (const record of records) {
      if (record.type !== rules.source[utility] || record.id === excludeId || visited.has(record.id) || (record.health ?? 1000) <= 0) continue;
      const distance = Math.hypot(record.x-x, record.z-z);
      if (distance > rules.range[utility] || distance >= nearest) continue;
      const next = new Set(visited); next.add(record.id);
      if (!utilityStatus(records,record.type,record.x,record.z,rules,record.id,next).ok) continue;
      source = record; nearest = distance;
    }
    return { utility, sourceId: source?.id ?? null };
  });
  return { ok: connections.every(c=>c.sourceId !== null), connections, missing: connections.filter(c=>c.sourceId===null).map(c=>c.utility) };
}
