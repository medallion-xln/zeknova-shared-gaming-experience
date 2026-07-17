<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

$user = zeknova_require_user();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $requestedTeam = (string)($_GET['team'] ?? $user['teamCode'] ?? '');
    $teamCode = zeknova_team_key($requestedTeam);
    if ($teamCode !== zeknova_team_key((string)$user['teamCode'])) {
        zeknova_error('You do not have access to this team world.', 403);
    }
    $path = zeknova_save_path($teamCode);
    if (!is_file($path)) {
        zeknova_response(['save' => null]);
    }
    $json = file_get_contents($path);
    $save = $json !== false ? json_decode($json, true) : null;
    zeknova_response(['save' => is_array($save) ? $save : null]);
}

if ($method !== 'POST') {
    zeknova_error('Method not allowed.', 405);
}

$input = zeknova_json_input();
$teamCode = zeknova_team_key((string)($input['user']['teamCode'] ?? ''));
if ($teamCode !== zeknova_team_key((string)$user['teamCode'])) {
    zeknova_error('Cannot write another team’s world.', 403);
}
if (!in_array(($input['version'] ?? null), [1, 2, 3, 4], true) || !isset($input['buildings']) || !is_array($input['buildings'])) {
    zeknova_error('Invalid save snapshot.', 422);
}
if (count($input['buildings']) > 3000) {
    zeknova_error('Save exceeds the prototype building limit.', 413);
}

$input['updatedAt'] = gmdate('c');
$path = zeknova_save_path($teamCode);
$lockPath = $path . '.lock';
$lock = fopen($lockPath, 'c+');
if ($lock === false || !flock($lock, LOCK_EX)) {
    if (is_resource($lock)) fclose($lock);
    zeknova_error('Unable to lock team world data.', 503);
}

// Concurrent players contribute to one team world. Preserve every unique
// installation and every completed world interaction instead of allowing the
// latest full snapshot to erase another player's work.
if (is_file($path)) {
    $existingJson = file_get_contents($path);
    $existing = $existingJson !== false ? json_decode($existingJson, true) : null;
    if (is_array($existing)) {
        $buildings = [];
        foreach (array_merge($existing['buildings'] ?? [], $input['buildings']) as $building) {
            if (is_array($building) && isset($building['id'])) {
                $buildings[(string)$building['id']] = $building;
            }
        }
        $input['buildings'] = array_values($buildings);
        foreach (['harvestedTreeIds', 'collectedPowerUpIds', 'minedRockIds'] as $key) {
            $old = is_array($existing['worldProgress'][$key] ?? null) ? $existing['worldProgress'][$key] : [];
            $new = is_array($input['worldProgress'][$key] ?? null) ? $input['worldProgress'][$key] : [];
            $input['worldProgress'][$key] = array_values(array_unique(array_merge($old, $new)));
        }
    }
}

$encoded = json_encode($input, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
if ($encoded === false) {
    flock($lock, LOCK_UN);
    fclose($lock);
    zeknova_error('Unable to encode save data.', 500);
}

$temp = $path . '.tmp-' . bin2hex(random_bytes(4));
if (file_put_contents($temp, $encoded, LOCK_EX) === false || !rename($temp, $path)) {
    @unlink($temp);
    flock($lock, LOCK_UN);
    fclose($lock);
    zeknova_error('Unable to persist team world data.', 500);
}
flock($lock, LOCK_UN);
fclose($lock);

zeknova_response(['ok' => true, 'updatedAt' => $input['updatedAt']]);
