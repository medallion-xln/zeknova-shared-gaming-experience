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
            'collectedPowerUpIds' => [],
            'minedRockIds' => [],
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
$world = is_array($input['world'] ?? null) ? $input['world'] : [];
$allowedTypes = ['power', 'water', 'habitat', 'research', 'culture', 'governance', 'defense', 'bridge', 'boat'];
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
            'placedBy' => (string)($user['id'] ?? ''),
        ];
        $changed = true;
    }
}
$room['world']['buildings'] = $storedBuildings;

foreach (['harvestedTreeIds', 'collectedPowerUpIds', 'minedRockIds'] as $key) {
    $stored = is_array($room['world'][$key] ?? null) ? $room['world'][$key] : [];
    $set = array_fill_keys(array_map('strval', $stored), true);
    foreach (($world[$key] ?? []) as $id) {
        $clean = preg_replace('/[^a-zA-Z0-9_.:-]/', '', (string)$id) ?? '';
        if ($clean !== '' && strlen($clean) <= 120 && !isset($set[$clean])) {
            $set[$clean] = true;
            $changed = true;
        }
    }
    $room['world'][$key] = array_slice(array_keys($set), 0, 10000);
}

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

$players = array_values(array_filter($room['players'], static fn(array $player): bool => ($player['clientId'] ?? '') !== $clientId));
$responseWorld = $room['world'];
$responseWorld['buildings'] = array_values($storedBuildings);
zeknova_response([
    'ok' => true,
    'revision' => (int)$room['revision'],
    'serverTime' => gmdate('c'),
    'players' => $players,
    'world' => $responseWorld,
    'chat' => [
        'seq' => (int)$chat['seq'],
        'messages' => $chatMessages,
    ],
]);
