<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

$user = zeknova_require_user();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'POST') {
    zeknova_error('Method not allowed.', 405);
}

$input = zeknova_json_input();
$teamCode = zeknova_team_key((string)($input['teamCode'] ?? ''));
if ($teamCode !== zeknova_team_key((string)$user['teamCode'])) {
    zeknova_error('You do not have access to this multiplayer room.', 403);
}

$clientId = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)($input['clientId'] ?? '')) ?? '';
if ($clientId === '' || strlen($clientId) > 80) {
    zeknova_error('Invalid multiplayer client id.', 422);
}

$path = zeknova_room_path($teamCode);
$handle = fopen($path, 'c+');
if ($handle === false || !flock($handle, LOCK_EX)) {
    if (is_resource($handle)) fclose($handle);
    zeknova_error('Unable to lock multiplayer room.', 503);
}

$raw = stream_get_contents($handle);
$room = $raw !== false && trim($raw) !== '' ? json_decode($raw, true) : null;
if (!is_array($room)) {
    $room = [
        'version' => 1,
        'revision' => 0,
        'players' => [],
        'world' => [
            'buildings' => [],
            'harvestedTreeIds' => [],
            'treeHarvestedAt' => [],
            'collectedPowerUpIds' => [],
            'minedRockIds' => [],
            'rockMinedAt' => [],
            'zeknovanAidCooldownUntil' => 0,
            'bossEncounter' => null,
            'bossDamageEventIds' => [],
            'bossDefeats' => [],
        ],
    ];
}

$now = time();
foreach (($room['players'] ?? []) as $id => $player) {
    if (!is_array($player) || ($now - (int)($player['seenAt'] ?? 0)) > 20) {
        unset($room['players'][$id]);
    }
}

if (!empty($input['leaving'])) {
    unset($room['players'][$clientId]);
} else {
    $player = is_array($input['player'] ?? null) ? $input['player'] : [];
    $class = in_array(($user['officerClass'] ?? ''), ['ensign', 'lieutenant', 'captain'], true)
        ? (string)$user['officerClass'] : 'ensign';
    $room['players'][$clientId] = [
        'clientId' => $clientId,
        'userId' => (string)($user['id'] ?? ''),
        'displayName' => substr((string)($user['displayName'] ?? 'Crew Member'), 0, 80),
        'officerClass' => $class,
        'x' => max(-120.0, min(120.0, (float)($player['x'] ?? 0))),
        'y' => max(-10.0, min(80.0, (float)($player['y'] ?? 0))),
        'z' => max(-120.0, min(120.0, (float)($player['z'] ?? 0))),
        'rotation' => (float)($player['rotation'] ?? 0),
        'health' => max(0.0, min(100.0, (float)($player['health'] ?? 100))),
        'moving' => !empty($player['moving']),
        'sprinting' => !empty($player['sprinting']),
        'action' => substr(preg_replace('/[^a-zA-Z0-9_-]/', '', (string)($player['action'] ?? 'idle')) ?? 'idle', 0, 24),
        'weapon' => substr(preg_replace('/[^a-zA-Z0-9_-]/', '', (string)($player['weapon'] ?? '')) ?? '', 0, 32),
        'seenAt' => $now,
    ];
}

// Team chat rides inside the same heartbeat and room file: clients send an
// outbox plus the last sequence number they have seen, and receive only newer
// messages back. The log is a ring buffer, so the file cannot grow unbounded.
$chat = is_array($room['chat'] ?? null) ? $room['chat'] : [];
$chat['seq'] = (int)($chat['seq'] ?? 0);
$chat['messages'] = is_array($chat['messages'] ?? null) ? $chat['messages'] : [];
$chatInput = is_array($input['chat'] ?? null) ? $input['chat'] : [];

if (empty($input['leaving'])) {
    $outbox = is_array($chatInput['send'] ?? null) ? array_slice($chatInput['send'], 0, 3) : [];
    foreach ($outbox as $text) {
        $clean = trim((string)preg_replace('/[\x00-\x1F\x7F]/u', ' ', (string)$text));
        if ($clean === '') continue;
        $clean = function_exists('mb_substr') ? mb_substr($clean, 0, 300) : substr($clean, 0, 300);
        $chat['seq']++;
        $chat['messages'][] = [
            'seq' => $chat['seq'],
            'userId' => (string)($user['id'] ?? ''),
            'displayName' => substr((string)($user['displayName'] ?? 'Crew Member'), 0, 80),
            'officerClass' => in_array(($user['officerClass'] ?? ''), ['ensign', 'lieutenant', 'captain'], true)
                ? (string)$user['officerClass'] : 'ensign',
            'text' => $clean,
            'at' => $now,
        ];
    }
    $chat['messages'] = array_slice($chat['messages'], -200);
}
$room['chat'] = $chat;

$sinceSeq = max(0, (int)($chatInput['since'] ?? 0));
$chatMessages = [];
foreach ($chat['messages'] as $message) {
    if ((int)($message['seq'] ?? 0) > $sinceSeq) {
        $chatMessages[] = $message;
    }
}
$chatMessages = array_slice($chatMessages, -50);

$changed = false;
$bossDamageEventAcks = [];
$world = is_array($input['world'] ?? null) ? $input['world'] : [];
$allowedTypes = ['power', 'water', 'habitat', 'research', 'culture', 'governance', 'defense', 'bridge', 'boat', 'zek_clinic', 'zek_watershed', 'zek_beacon', 'zek_grove', 'zek_habitat', 'zek_archive', 'zek_market', 'zek_watch', 'zek_transit'];
$storedBuildings = is_array($room['world']['buildings'] ?? null) ? $room['world']['buildings'] : [];
foreach (($world['buildings'] ?? []) as $building) {
    if (!is_array($building)) continue;
    $id = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)($building['id'] ?? '')) ?? '';
    $type = (string)($building['type'] ?? '');
    if ($id === '' || strlen($id) > 80 || !in_array($type, $allowedTypes, true)) continue;
    if (!isset($storedBuildings[$id])) {
        $storedBuildings[$id] = [
            'id' => $id,
            'type' => $type,
            'x' => max(-120.0, min(120.0, (float)($building['x'] ?? 0))),
            'y' => max(-10.0, min(80.0, (float)($building['y'] ?? 0))),
            'z' => max(-120.0, min(120.0, (float)($building['z'] ?? 0))),
            'rotation' => (float)($building['rotation'] ?? 0),
            'level' => max(1, min(10, (int)($building['level'] ?? 1))),
            'health' => max(0, min(1000, (int)($building['health'] ?? 1000))),
            'maxHealth' => 1000,
            'healthSchemaVersion' => 1,
            'healthUpdatedAt' => max(0, (int)($building['healthUpdatedAt'] ?? 0)),
            'placedBy' => (string)($user['id'] ?? ''),
        ];
        $changed = true;
    } else {
        $incomingHealthUpdatedAt = max(0, (int)($building['healthUpdatedAt'] ?? 0));
        $storedHealthUpdatedAt = max(0, (int)($storedBuildings[$id]['healthUpdatedAt'] ?? 0));
        if ($incomingHealthUpdatedAt > $storedHealthUpdatedAt) {
            $storedBuildings[$id]['health'] = max(0, min(1000, (int)($building['health'] ?? 1000)));
            $storedBuildings[$id]['maxHealth'] = 1000;
            $storedBuildings[$id]['healthSchemaVersion'] = 1;
            $storedBuildings[$id]['healthUpdatedAt'] = $incomingHealthUpdatedAt;
            $changed = true;
        }
    }
}
$room['world']['buildings'] = $storedBuildings;

// ZekNovan diplomatic infrastructure uses one shared team cooldown. Clients
// may extend it after a successful placement, but may never shorten it or set
// a window beyond the balanced ten-minute ceiling.
$aidNowMs = (int)floor(microtime(true) * 1000);
$storedAidCooldown = max(0, (int)($room['world']['zeknovanAidCooldownUntil'] ?? 0));
$incomingAidCooldown = max(0, (int)($world['zeknovanAidCooldownUntil'] ?? 0));
$incomingAidCooldown = min($incomingAidCooldown, $aidNowMs + (10 * 60 * 1000));
if ($incomingAidCooldown > $storedAidCooldown) {
    $storedAidCooldown = $incomingAidCooldown;
    $changed = true;
}
$room['world']['zeknovanAidCooldownUntil'] = $storedAidCooldown;

foreach (['collectedPowerUpIds'] as $key) {
    $stored = is_array($room['world'][$key] ?? null) ? $room['world'][$key] : [];
    if ($key === 'collectedPowerUpIds') {
        $before = count($stored);
        // Ammunition caches are personal supplies with their own one-hour
        // cooldown. Remove legacy team-shared cache IDs from old room files.
        $stored = array_values(array_filter($stored, static fn($id): bool => strpos((string)$id, 'ammo-drop-') !== 0));
        if (count($stored) !== $before) $changed = true;
    }
    $set = array_fill_keys(array_map('strval', $stored), true);
    foreach (($world[$key] ?? []) as $id) {
        $clean = preg_replace('/[^a-zA-Z0-9_.:-]/', '', (string)$id) ?? '';
        if ($key === 'collectedPowerUpIds' && strpos($clean, 'ammo-drop-') === 0) continue;
        if ($clean !== '' && strlen($clean) <= 120 && !isset($set[$clean])) {
            $set[$clean] = true;
            $changed = true;
        }
    }
    $room['world'][$key] = array_slice(array_keys($set), 0, 10000);
}

// Ore formations are shared world resources, but unlike permanent pickups
// they recover after a deterministic 60-90 minute window. Keeping the mined
// timestamp beside each ID lets every connected client observe the same
// formation and prevents an old room file from exhausting a biome forever.
$oreRespawnMinMs = 60 * 60 * 1000;
$oreRespawnMaxMs = 90 * 60 * 1000;
$oreNowMs = (int)floor(microtime(true) * 1000);
$oreRespawnDelay = static function (string $id) use ($oreRespawnMinMs, $oreRespawnMaxMs): int {
    $minuteRange = (int)floor(($oreRespawnMaxMs - $oreRespawnMinMs) / 60000);
    $hash = (int)hexdec(hash('fnv1a32', $id));
    return $oreRespawnMinMs + ($hash % ($minuteRange + 1)) * 60000;
};
$storedRockTimes = is_array($room['world']['rockMinedAt'] ?? null) ? $room['world']['rockMinedAt'] : [];
$incomingRockTimes = is_array($world['rockMinedAt'] ?? null) ? $world['rockMinedAt'] : [];
foreach (($room['world']['minedRockIds'] ?? []) as $id) {
    $key = preg_replace('/[^a-zA-Z0-9_.:-]/', '', (string)$id) ?? '';
    if ($key !== '' && !isset($storedRockTimes[$key])) $storedRockTimes[$key] = $oreNowMs;
}
foreach (($world['minedRockIds'] ?? []) as $id) {
    $key = preg_replace('/[^a-zA-Z0-9_.:-]/', '', (string)$id) ?? '';
    if ($key === '' || strlen($key) > 120) continue;
    $incomingAt = max(0, min($oreNowMs, (int)($incomingRockTimes[$key] ?? $oreNowMs)));
    if (!isset($storedRockTimes[$key]) || $incomingAt > (int)$storedRockTimes[$key]) {
        $storedRockTimes[$key] = $incomingAt;
        $changed = true;
    }
}
foreach ($storedRockTimes as $id => $minedAt) {
    if ((int)$minedAt <= 0 || ($oreNowMs - (int)$minedAt) >= $oreRespawnDelay((string)$id)) {
        unset($storedRockTimes[$id]);
        $changed = true;
    }
}
$room['world']['rockMinedAt'] = array_slice($storedRockTimes, 0, 10000, true);
$room['world']['minedRockIds'] = array_slice(array_keys($storedRockTimes), 0, 10000);

// Ammo cache cooldowns follow the authenticated player, not the team. This
// prevents one crew member from consuming everybody's field supplies while
// still preserving the one-hour cooldown across that player's devices.
$ammoRespawnMs = 60 * 60 * 1000;
$ammoNowMs = (int)floor(microtime(true) * 1000);
$ammoUserKey = hash('sha256', (string)($user['id'] ?? ''));
$personalAmmoCaches = is_array($room['world']['personalAmmoCaches'] ?? null) ? $room['world']['personalAmmoCaches'] : [];
$personalAmmoTimes = is_array($personalAmmoCaches[$ammoUserKey] ?? null) ? $personalAmmoCaches[$ammoUserKey] : [];
foreach ($personalAmmoTimes as $id => $collectedAt) {
    if (strpos((string)$id, 'ammo-drop-') !== 0 || ($ammoNowMs - (int)$collectedAt) >= $ammoRespawnMs) {
        unset($personalAmmoTimes[$id]);
        $changed = true;
    }
}
$incomingAmmoTimes = is_array($world['personalAmmoCacheCollectedAt'] ?? null) ? $world['personalAmmoCacheCollectedAt'] : [];
foreach (array_slice($incomingAmmoTimes, 0, 50, true) as $id => $collectedAt) {
    $clean = preg_replace('/[^a-zA-Z0-9_.:-]/', '', (string)$id) ?? '';
    $time = max(0, min($ammoNowMs, (int)$collectedAt));
    if (strpos($clean, 'ammo-drop-') !== 0 || $time <= 0 || ($ammoNowMs - $time) >= $ammoRespawnMs) continue;
    if (!isset($personalAmmoTimes[$clean]) || $time > (int)$personalAmmoTimes[$clean]) {
        $personalAmmoTimes[$clean] = $time;
        $changed = true;
    }
}
$personalAmmoCaches[$ammoUserKey] = $personalAmmoTimes;
$room['world']['personalAmmoCaches'] = $personalAmmoCaches;

// Harvested trees are shared with timestamps so every client observes the
// same three-hour regrowth rather than permanently unioning felled tree IDs.
$regrowthMs = 3 * 60 * 60 * 1000;
$nowMs = (int)floor(microtime(true) * 1000);
$storedTreeTimes = is_array($room['world']['treeHarvestedAt'] ?? null) ? $room['world']['treeHarvestedAt'] : [];
$incomingTreeTimes = is_array($world['treeHarvestedAt'] ?? null) ? $world['treeHarvestedAt'] : [];
foreach (($room['world']['harvestedTreeIds'] ?? []) as $id) {
    $key = preg_replace('/[^a-zA-Z0-9_.:-]/', '', (string)$id) ?? '';
    if ($key !== '' && !isset($storedTreeTimes[$key])) $storedTreeTimes[$key] = $nowMs;
}
foreach (($world['harvestedTreeIds'] ?? []) as $id) {
    $key = preg_replace('/[^a-zA-Z0-9_.:-]/', '', (string)$id) ?? '';
    if ($key === '') continue;
    $incomingAt = max(0, (int)($incomingTreeTimes[$key] ?? $nowMs));
    if (!isset($storedTreeTimes[$key]) || $incomingAt > (int)$storedTreeTimes[$key]) {
        $storedTreeTimes[$key] = $incomingAt;
        $changed = true;
    }
}
foreach ($storedTreeTimes as $id => $harvestedAt) {
    if ((int)$harvestedAt <= 0 || ($nowMs - (int)$harvestedAt) >= $regrowthMs) {
        unset($storedTreeTimes[$id]);
        $changed = true;
    }
}
$room['world']['treeHarvestedAt'] = $storedTreeTimes;
$room['world']['harvestedTreeIds'] = array_slice(array_keys($storedTreeTimes), 0, 10000);

// Relationship changes are event-sourced so simultaneous players cannot
// overwrite one another's reconciliation work or hostility penalties.
$incomingRelations = is_array($world['relations'] ?? null) ? $world['relations'] : [];
$incomingRelationEvents = is_array($world['relationEvents'] ?? null) ? array_slice($world['relationEvents'], 0, 20) : [];
$storedRelations = is_array($room['world']['relations'] ?? null) ? $room['world']['relations'] : null;
$storedRelationIds = is_array($room['world']['relationEventIds'] ?? null) ? $room['world']['relationEventIds'] : [];
$relationIdSet = array_fill_keys(array_map('strval', $storedRelationIds), true);
$ackedRelationIds = [];

if ($storedRelations === null) {
    $storedRelations = [
        'tension' => max(0.0, min(100.0, (float)($incomingRelations['tension'] ?? 50))),
        'trust' => max(0.0, min(100.0, (float)($incomingRelations['trust'] ?? 50))),
        'updatedAt' => $nowMs,
        'updatedBy' => (string)($user['id'] ?? ''),
    ];
    // The first client's values already contain its local pending deltas.
    foreach ($incomingRelationEvents as $event) {
        $id = preg_replace('/[^a-zA-Z0-9_.:-]/', '', (string)($event['id'] ?? '')) ?? '';
        if ($id === '' || strlen($id) > 120) continue;
        $relationIdSet[$id] = true;
        $ackedRelationIds[] = $id;
    }
    $changed = true;
} else {
    foreach ($incomingRelationEvents as $event) {
        if (!is_array($event)) continue;
        $id = preg_replace('/[^a-zA-Z0-9_.:-]/', '', (string)($event['id'] ?? '')) ?? '';
        if ($id === '' || strlen($id) > 120) continue;
        $ackedRelationIds[] = $id;
        if (isset($relationIdSet[$id])) continue;
        $tensionDelta = max(-25.0, min(25.0, (float)($event['tensionDelta'] ?? 0)));
        $trustDelta = max(-25.0, min(25.0, (float)($event['trustDelta'] ?? 0)));
        $storedRelations['tension'] = max(0.0, min(100.0, (float)($storedRelations['tension'] ?? 50) + $tensionDelta));
        $storedRelations['trust'] = max(0.0, min(100.0, (float)($storedRelations['trust'] ?? 50) + $trustDelta));
        $storedRelations['updatedAt'] = $nowMs;
        $storedRelations['updatedBy'] = (string)($user['id'] ?? '');
        $relationIdSet[$id] = true;
        $changed = true;
    }
}
$room['world']['relations'] = $storedRelations;
$room['world']['relationEventIds'] = array_slice(array_keys($relationIdSet), -500);

// Mission bosses use one shared encounter and event-sourced damage. Clients
// reproduce projectile patterns locally from the seed, so no projectile data
// crosses the network and simultaneous hits cannot heal or overwrite damage.
$allowedBossMissions = ['grid', 'water', 'habitat', 'tower-one', 'tower-ring', 'supply-route', 'research', 'culture', 'governance', 'population', 'advanced-research', 'stronghold'];
$incomingBoss = is_array($world['bossEncounter'] ?? null) ? $world['bossEncounter'] : null;
$storedBoss = is_array($room['world']['bossEncounter'] ?? null) ? $room['world']['bossEncounter'] : null;
if ($incomingBoss !== null) {
    $missionId = preg_replace('/[^a-z0-9-]/', '', (string)($incomingBoss['missionId'] ?? '')) ?? '';
    $encounterId = preg_replace('/[^a-zA-Z0-9_.:-]/', '', (string)($incomingBoss['encounterId'] ?? '')) ?? '';
    $bossId = preg_replace('/[^a-zA-Z0-9_.:-]/', '', (string)($incomingBoss['bossId'] ?? '')) ?? '';
    if (in_array($missionId, $allowedBossMissions, true) && $encounterId !== '' && $bossId !== '') {
        if ($storedBoss === null || (($storedBoss['status'] ?? '') === 'defeated' && ($storedBoss['missionId'] ?? '') !== $missionId)) {
            $maxHealth = max(1.0, min(100000.0, (float)($incomingBoss['maxHealth'] ?? 1)));
            $storedBoss = [
                'encounterId' => $encounterId,
                'missionId' => $missionId,
                'bossId' => $bossId,
                'seed' => max(0, (int)($incomingBoss['seed'] ?? 1)),
                'status' => 'active',
                'health' => max(0.0, min($maxHealth, (float)($incomingBoss['health'] ?? $maxHealth))),
                'maxHealth' => $maxHealth,
                'startedAt' => max(0, (int)($incomingBoss['startedAt'] ?? $nowMs)),
                'x' => max(-90.0, min(90.0, (float)($incomingBoss['x'] ?? 0))),
                'z' => max(-90.0, min(90.0, (float)($incomingBoss['z'] ?? 0))),
                'phase' => 'phase_1',
                'activePatternId' => 'awakening',
                'projectileCount' => 0,
            ];
            $changed = true;
        } elseif (($storedBoss['encounterId'] ?? '') === $encounterId && ($storedBoss['status'] ?? '') !== 'defeated') {
            $storedBoss['phase'] = substr((string)($incomingBoss['phase'] ?? $storedBoss['phase'] ?? 'phase_1'), 0, 24);
            $storedBoss['activePatternId'] = substr((string)($incomingBoss['activePatternId'] ?? $storedBoss['activePatternId'] ?? ''), 0, 60);
            $storedBoss['projectileCount'] = max(0, min(250, (int)($incomingBoss['projectileCount'] ?? 0)));
        }
    }
}

$storedBossDamageIds = is_array($room['world']['bossDamageEventIds'] ?? null) ? $room['world']['bossDamageEventIds'] : [];
$bossDamageIdSet = array_fill_keys(array_map('strval', $storedBossDamageIds), true);
$incomingBossDamage = is_array($world['bossDamageEvents'] ?? null) ? array_slice($world['bossDamageEvents'], 0, 30) : [];
foreach ($incomingBossDamage as $event) {
    if (!is_array($event) || $storedBoss === null) continue;
    $id = preg_replace('/[^a-zA-Z0-9_.:-]/', '', (string)($event['id'] ?? '')) ?? '';
    $encounterId = preg_replace('/[^a-zA-Z0-9_.:-]/', '', (string)($event['encounterId'] ?? '')) ?? '';
    if ($id === '' || strlen($id) > 140 || $encounterId !== (string)($storedBoss['encounterId'] ?? '')) continue;
    $bossDamageEventAcks[] = $id;
    if (isset($bossDamageIdSet[$id]) || ($storedBoss['status'] ?? '') === 'defeated') continue;
    $damage = max(0.0, min(250.0, (float)($event['amount'] ?? 0)));
    $storedBoss['health'] = max(0.0, (float)($storedBoss['health'] ?? 0) - $damage);
    if ($storedBoss['health'] <= 0) $storedBoss['status'] = 'awaiting_reward';
    $bossDamageIdSet[$id] = true;
    $changed = true;
}
$room['world']['bossDamageEventIds'] = array_slice(array_keys($bossDamageIdSet), -2000);

$storedBossDefeats = is_array($room['world']['bossDefeats'] ?? null) ? $room['world']['bossDefeats'] : [];
$incomingBossDefeats = is_array($world['bossDefeats'] ?? null) ? $world['bossDefeats'] : [];
foreach ($incomingBossDefeats as $missionId => $defeat) {
    $missionId = preg_replace('/[^a-z0-9-]/', '', (string)$missionId) ?? '';
    if (!in_array($missionId, $allowedBossMissions, true) || isset($storedBossDefeats[$missionId]) || !is_array($defeat)) continue;
    $rewardId = preg_replace('/[^a-zA-Z0-9_.:-]/', '', (string)($defeat['rewardId'] ?? '')) ?? '';
    if ($rewardId === '') continue;
    $multiplier = max(1.0, min(2.0, (float)($defeat['multiplier'] ?? 1)));
    $grade = in_array((string)($defeat['grade'] ?? ''), ['C', 'B', 'A', 'S', 'S+'], true) ? (string)$defeat['grade'] : 'C';
    $storedBossDefeats[$missionId] = [
        'missionId' => $missionId,
        'bossId' => substr(preg_replace('/[^a-zA-Z0-9_.:-]/', '', (string)($defeat['bossId'] ?? 'boss')) ?? 'boss', 0, 100),
        'bossName' => substr((string)($defeat['bossName'] ?? 'Mission guardian'), 0, 100),
        'rewardId' => $rewardId,
        'grade' => $grade,
        'multiplier' => $multiplier,
        'rewards' => [
            'credits' => (int)round(100 * $multiplier),
            'timber' => (int)round(25 * $multiplier),
            'iron' => (int)round(15 * $multiplier),
            'tensionReduction' => 50,
        ],
        'defeatedAt' => max(0, (int)($defeat['defeatedAt'] ?? $nowMs)),
        'telemetry' => is_array($defeat['telemetry'] ?? null) ? $defeat['telemetry'] : [],
    ];
    if ($storedBoss !== null && ($storedBoss['missionId'] ?? '') === $missionId) {
        $storedBoss['health'] = 0;
        $storedBoss['status'] = 'defeated';
        $storedBoss['defeat'] = $storedBossDefeats[$missionId];
    }
    $changed = true;
}
$room['world']['bossEncounter'] = $storedBoss;
$room['world']['bossDefeats'] = $storedBossDefeats;

if ($changed) {
    $room['revision'] = (int)($room['revision'] ?? 0) + 1;
}
$room['updatedAt'] = gmdate('c');

$encoded = json_encode($room, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
if ($encoded === false) {
    flock($handle, LOCK_UN);
    fclose($handle);
    zeknova_error('Unable to encode multiplayer state.', 500);
}
rewind($handle);
ftruncate($handle, 0);
if (fwrite($handle, $encoded) === false) {
    flock($handle, LOCK_UN);
    fclose($handle);
    zeknova_error('Unable to persist multiplayer state.', 500);
}
fflush($handle);
flock($handle, LOCK_UN);
fclose($handle);

$playersByUser = [];
foreach ($room['players'] as $player) {
    if (!is_array($player) || ($player['clientId'] ?? '') === $clientId) continue;
    $playerUserId = (string)($player['userId'] ?? '');
    if ($playerUserId !== '' && $playerUserId === (string)($user['id'] ?? '')) continue;
    $identityKey = $playerUserId !== '' ? $playerUserId : (string)($player['clientId'] ?? '');
    if ($identityKey === '') continue;
    if (!isset($playersByUser[$identityKey]) || (int)($player['seenAt'] ?? 0) > (int)($playersByUser[$identityKey]['seenAt'] ?? 0)) {
        $playersByUser[$identityKey] = $player;
    }
}
$players = array_values($playersByUser);
$responseWorld = $room['world'];
$responseWorld['buildings'] = array_values($storedBuildings);
$responseWorld['personalAmmoCacheCollectedAt'] = $personalAmmoTimes;
unset($responseWorld['personalAmmoCaches']);
unset($responseWorld['relationEventIds']);
unset($responseWorld['bossDamageEventIds']);
zeknova_response([
    'ok' => true,
    'revision' => (int)$room['revision'],
    'serverTime' => gmdate('c'),
    'players' => $players,
    'world' => $responseWorld,
    'relationEventAcks' => array_values(array_unique($ackedRelationIds)),
    'bossDamageEventAcks' => array_values(array_unique($bossDamageEventAcks)),
    'chat' => [
        'seq' => (int)$chat['seq'],
        'messages' => $chatMessages,
    ],
]);
