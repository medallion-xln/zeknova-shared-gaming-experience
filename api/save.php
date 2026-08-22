<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

$user = zeknova_require_user();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$team = zeknova_team_key((string)$user['teamCode']);
$personalPath = zeknova_personal_save_path($team, (string)$user['id']);
$sharedPath = zeknova_save_path($team);

function read_save(string $path): array {
    if (!is_file($path)) return [];
    $raw = file_get_contents($path); $value = $raw !== false ? json_decode($raw, true) : null;
    return is_array($value) ? $value : [];
}
function write_save(string $path, array $value): void {
    $json = json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($json === false) zeknova_error('Unable to encode save data.', 500);
    $tmp = $path . '.tmp-' . bin2hex(random_bytes(4));
    if (file_put_contents($tmp, $json, LOCK_EX) === false || !rename($tmp, $path)) {
        @unlink($tmp); zeknova_error('Unable to persist save data.', 500);
    }
    @chmod($path, 0640);
}
function compose_save(array $personal, array $shared): array {
    if (!$personal) return [];
    $personal['buildings'] = $shared['buildings'] ?? $personal['buildings'] ?? [];
    $personal['worldProgress'] = array_merge($personal['worldProgress'] ?? [], $shared['worldProgress'] ?? []);
    $personal['persistence']['sharedRevision'] = (int)($shared['revision'] ?? 0);
    return $personal;
}

if ($method === 'GET') {
    $requested = zeknova_team_key((string)($_GET['team'] ?? $team));
    if ($requested !== $team) zeknova_error('You do not have access to this team world.', 403);
    $personal = read_save($personalPath);
    zeknova_response(['save' => $personal ? compose_save($personal, read_save($sharedPath)) : null]);
}
if ($method !== 'POST') zeknova_error('Method not allowed.', 405);

$input = zeknova_json_input();
if (zeknova_team_key((string)($input['user']['teamCode'] ?? '')) !== $team) zeknova_error('Cannot write another team’s world.', 403);
if (!in_array($input['version'] ?? null, [1,2,3,4], true) || !is_array($input['buildings'] ?? null)) zeknova_error('Invalid save snapshot.', 422);
if (count($input['buildings']) > 3000) zeknova_error('Save exceeds the prototype building limit.', 413);

$lock = fopen($sharedPath . '.lock', 'c+');
if ($lock === false || !flock($lock, LOCK_EX)) zeknova_error('Unable to lock team world data.', 503);
$personal = read_save($personalPath); $shared = read_save($sharedPath);
$operationId = substr(trim((string)($input['persistence']['operationId'] ?? '')), 0, 128);
$currentRevision = (int)($personal['persistence']['revision'] ?? 0);
if ($operationId !== '' && $operationId === ($personal['persistence']['operationId'] ?? '')) {
    flock($lock, LOCK_UN); fclose($lock);
    zeknova_response(['ok'=>true, 'duplicate'=>true, 'revision'=>$currentRevision]);
}
$baseRevision = isset($input['persistence']['baseRevision']) ? (int)$input['persistence']['baseRevision'] : null;
if ($baseRevision !== null && $baseRevision < $currentRevision) {
    flock($lock, LOCK_UN); fclose($lock);
    zeknova_error('Save snapshot is stale at revision ' . $currentRevision . '.', 409);
}

$byId = [];
foreach (array_merge($shared['buildings'] ?? [], $input['buildings']) as $building) {
    if (!is_array($building) || !isset($building['id'])) continue;
    $id = (string)$building['id']; $old = $byId[$id] ?? null;
    if (!is_array($old) || (int)($building['healthUpdatedAt'] ?? 0) >= (int)($old['healthUpdatedAt'] ?? 0)) $byId[$id] = $building;
}
$progress = [];
foreach (['collectedPowerUpIds','minedRockIds'] as $key) {
    $progress[$key] = array_values(array_unique(array_merge($shared['worldProgress'][$key] ?? [], $input['worldProgress'][$key] ?? [])));
}
$nowMs = (int)floor(microtime(true)*1000); $treeTimes = [];
foreach ([$shared,$input] as $snapshot) {
    $times = $snapshot['worldProgress']['treeHarvestedAt'] ?? [];
    foreach (($snapshot['worldProgress']['harvestedTreeIds'] ?? []) as $id) {
        $id = preg_replace('/[^a-zA-Z0-9_.:-]/', '', (string)$id) ?? '';
        if ($id !== '') $treeTimes[$id] = max((int)($treeTimes[$id] ?? 0), (int)($times[$id] ?? $nowMs));
    }
}
foreach ($treeTimes as $id=>$at) if ($at <= 0 || $nowMs-$at >= 10800000) unset($treeTimes[$id]);
$progress['treeHarvestedAt']=$treeTimes; $progress['harvestedTreeIds']=array_keys($treeTimes);
$nextShared = ['version'=>1,'revision'=>(int)($shared['revision']??0)+1,'buildings'=>array_values($byId),'worldProgress'=>$progress,'updatedAt'=>gmdate('c')];
$input['user']=$user; $input['updatedAt']=gmdate('c');
$input['persistence']=['revision'=>$currentRevision+1,'baseRevision'=>$currentRevision+1,'operationId'=>$operationId ?: hash('sha256',(string)$user['id'].':'.json_encode($input))];
write_save($sharedPath,$nextShared); write_save($personalPath,$input);
flock($lock,LOCK_UN); fclose($lock);
zeknova_response(['ok'=>true,'duplicate'=>false,'updatedAt'=>$input['updatedAt'],'revision'=>$currentRevision+1]);
