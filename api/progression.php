<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

$user = zeknova_require_user();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if (!in_array($method, ['GET', 'POST'], true)) {
    zeknova_error('Method not allowed.', 405);
}

$teamCode = zeknova_team_key((string)($user['teamCode'] ?? ''));
$userId = (string)($user['id'] ?? '');
$path = zeknova_profile_path($teamCode, $userId);
$handle = fopen($path, 'c+');
if ($handle === false || !flock($handle, LOCK_EX)) {
    if (is_resource($handle)) fclose($handle);
    zeknova_error('Unable to lock officer progression.', 503);
}

$raw = stream_get_contents($handle);
$profile = $raw !== false && trim($raw) !== '' ? json_decode($raw, true) : null;
if (!is_array($profile)) {
    $profile = [
        'version' => 1,
        'rank' => 'ensign',
        'biome' => (string)($user['biome'] ?? 'highlands'),
        'personalObjectives' => [],
        'teamCompleted' => 0,
        'deployed' => false,
    ];
}

if ($method === 'POST') {
    $input = zeknova_json_input();
    $set = array_fill_keys(array_map('strval', is_array($profile['personalObjectives'] ?? null) ? $profile['personalObjectives'] : []), true);
    foreach (($input['personalObjectives'] ?? []) as $objective) {
        $clean = preg_replace('/[^a-zA-Z0-9_.:-]/', '', (string)$objective) ?? '';
        if ($clean !== '' && strlen($clean) <= 100) $set[$clean] = true;
    }
    $profile['personalObjectives'] = array_slice(array_keys($set), 0, 100);
    $profile['teamCompleted'] = max((int)($profile['teamCompleted'] ?? 0), min(12, (int)($input['teamCompleted'] ?? 0)));
    if (!empty($input['deployed'])) $profile['deployed'] = true;
    $biome = strtolower((string)($input['biome'] ?? $profile['biome'] ?? 'highlands'));
    if (in_array($biome, ['forest', 'desert', 'highlands', 'arctic', 'wetlands'], true)) $profile['biome'] = $biome;
}

$personalCount = count($profile['personalObjectives'] ?? []);
$teamCompleted = (int)($profile['teamCompleted'] ?? 0);
$rank = $teamCompleted >= 8 && $personalCount >= 8
    ? 'captain'
    : ($teamCompleted >= 4 && $personalCount >= 4 ? 'lieutenant' : 'ensign');
$profile['rank'] = $rank;
$profile['updatedAt'] = gmdate('c');

$encoded = json_encode($profile, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
rewind($handle);
ftruncate($handle, 0);
if ($encoded === false || fwrite($handle, $encoded) === false) {
    flock($handle, LOCK_UN);
    fclose($handle);
    zeknova_error('Unable to persist officer progression.', 500);
}
fflush($handle);
flock($handle, LOCK_UN);
fclose($handle);

$_SESSION['zeknova_user']['officerClass'] = $rank;
$_SESSION['zeknova_user']['biome'] = $profile['biome'];

zeknova_response([
    'ok' => true,
    'rank' => $rank,
    'biome' => $profile['biome'],
    'personalObjectives' => array_values($profile['personalObjectives']),
    'personalCount' => $personalCount,
    'teamCompleted' => $teamCompleted,
    'deployed' => !empty($profile['deployed']),
    'next' => $rank === 'captain' ? null : [
        'rank' => $rank === 'lieutenant' ? 'captain' : 'lieutenant',
        'missions' => $rank === 'lieutenant' ? 8 : 4,
        'personal' => $rank === 'lieutenant' ? 8 : 4,
    ],
]);
