<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

/**
 * ZekNova — full world reset.
 *
 * This repository had no reset endpoint at all, so "Restart Game" could only
 * ever clear the browser: the team save file and the shared multiplayer room
 * kept every building and every completed mission, and the next load synced
 * them straight back. Clearing the client alone cannot produce a new game
 * while the room world still holds the old buildings.
 *
 * Two files are rewritten under lock:
 *   the team save   — the player's own persisted world
 *   the room world  — the shared world other clients sync from
 *
 * The previous run is archived first, as team-{hash}-run-{gameId}.json, so a
 * restart does not silently delete a completed campaign from the leaderboard.
 */

$user = zeknova_require_user();
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    zeknova_error('Method not allowed.', 405);
}

$teamCode = zeknova_team_key((string)($user['teamCode'] ?? ''));
$savePath = zeknova_personal_save_path($teamCode, (string)($user['id'] ?? ''));
$sharedSavePath = zeknova_save_path($teamCode);
$roomPath = zeknova_room_path($teamCode);

$newGameId = bin2hex(random_bytes(8));
$nowIso    = gmdate('c');

// ── Archive the finished run before wiping it ────────────────────────────
if (is_file($savePath)) {
    $existingJson = file_get_contents($savePath);
    $existing = $existingJson !== false ? json_decode($existingJson, true) : null;
    if (is_array($existing)) {
        $hash = hash('sha256', $teamCode);
        $archivePath = ZEKNOVA_DATA_DIR . '/team-' . $hash . '-run-' . $newGameId . '.json';
        $existing['archivedAt'] = $nowIso;
        $existing['archivedGameId'] = $existing['gameId'] ?? $existing['runId'] ?? null;
        $archived = json_encode($existing, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($archived !== false) {
            @file_put_contents($archivePath, $archived, LOCK_EX);
            @chmod($archivePath, 0640);
        }
    }
}

// ── Fresh save ───────────────────────────────────────────────────────────
$lockPath = $savePath . '.lock';
$lock = fopen($lockPath, 'c+');
if ($lock === false || !flock($lock, LOCK_EX)) {
    if (is_resource($lock)) fclose($lock);
    zeknova_error('Unable to lock team world data.', 503);
}

/* The pristine world. Mission progress, boss defeats and buildings are all
   absent rather than zeroed-out-but-present, so nothing can be read back as
   "completed" through a stale key. */
$freshSave = [
    'version'           => 4,
    'gameId'            => $newGameId,
    'runId'             => $newGameId,
    'user'              => $user,
    'buildings'         => [],
    'civilizationScore' => 0,
    'phase'             => 1,
    'missionStats'      => [],
    'worldProgress'     => [
        'harvestedTreeIds'   => [],
        'treeHarvestedAt'    => (object)[],
        'collectedPowerUpIds'=> [],
        'minedRockIds'       => [],
        'rockMinedAt'        => (object)[],
    ],
    'simulation'     => null,
    'indicators'     => null,
    'updatedAt'      => $nowIso,
    'createdAt'      => $nowIso,
    'resetAt'        => $nowIso,
    'previousGameId' => null,
];

$encoded = json_encode($freshSave, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
if ($encoded === false) {
    flock($lock, LOCK_UN);
    fclose($lock);
    zeknova_error('Unable to encode fresh save.', 500);
}
// Write to a temp file and rename: a crash mid-write must not leave a
// half-written save that neither loads nor resets.
$tmp = $savePath . '.tmp-' . bin2hex(random_bytes(4));
if (file_put_contents($tmp, $encoded, LOCK_EX) === false || !rename($tmp, $savePath)) {
    @unlink($tmp);
    flock($lock, LOCK_UN);
    fclose($lock);
    zeknova_error('Unable to persist fresh world.', 500);
}
@chmod($savePath, 0640);
flock($lock, LOCK_UN);
fclose($lock);

// Reset the authoritative shared save projection as well; other officers keep
// their private campaign files, but a deliberate team-world reset removes the
// installations and interactions that are shared by design.
$sharedLock = fopen($sharedSavePath . '.lock', 'c+');
if ($sharedLock !== false && flock($sharedLock, LOCK_EX)) {
    $sharedFresh = json_encode(['version'=>1,'revision'=>1,'buildings'=>[],'worldProgress'=>[
        'harvestedTreeIds'=>[],'treeHarvestedAt'=>(object)[],
        'collectedPowerUpIds'=>[],'minedRockIds'=>[]
    ],'updatedAt'=>$nowIso], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($sharedFresh !== false) {
        $sharedTmp = $sharedSavePath . '.tmp-' . bin2hex(random_bytes(4));
        if (file_put_contents($sharedTmp, $sharedFresh, LOCK_EX) !== false) rename($sharedTmp, $sharedSavePath);
    }
    flock($sharedLock, LOCK_UN);
}
if (is_resource($sharedLock)) fclose($sharedLock);

// ── Clear the shared room world so old buildings cannot re-sync ──────────
$roomHandle = fopen($roomPath, 'c+');
if ($roomHandle !== false && flock($roomHandle, LOCK_EX)) {
    $raw  = stream_get_contents($roomHandle);
    $room = $raw !== false && trim($raw) !== '' ? json_decode($raw, true) : null;
    if (!is_array($room)) {
        $room = ['version' => 1, 'revision' => 0, 'players' => [], 'world' => []];
    }
    $room['world'] = [
        'buildings'                => [],
        'harvestedTreeIds'         => [],
        'treeHarvestedAt'          => (object)[],
        'collectedPowerUpIds'      => [],
        'minedRockIds'             => [],
        'rockMinedAt'              => (object)[],
        'zeknovanAidCooldownUntil' => 0,
        'bossEncounter'            => null,
        'bossDamageEventIds'       => [],
        'bossDefeats'              => [],
        'gameId'                   => $newGameId,
        'resetAt'                  => $nowIso,
    ];
    $room['revision'] = (int)($room['revision'] ?? 0) + 1;
    $roomEncoded = json_encode($room, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($roomEncoded !== false) {
        ftruncate($roomHandle, 0);
        rewind($roomHandle);
        fwrite($roomHandle, $roomEncoded);
        fflush($roomHandle);
    }
    flock($roomHandle, LOCK_UN);
}
if (is_resource($roomHandle)) fclose($roomHandle);

zeknova_response([
    'ok'      => true,
    'gameId'  => $newGameId,
    'resetAt' => $nowIso,
]);
