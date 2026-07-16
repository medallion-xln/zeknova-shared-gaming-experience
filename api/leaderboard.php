<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
zeknova_require_user();

$rows = [];
foreach (glob(ZEKNOVA_DATA_DIR . '/team-*.json') ?: [] as $path) {
    $json = file_get_contents($path);
    $save = $json !== false ? json_decode($json, true) : null;
    if (!is_array($save)) continue;
    $rows[] = [
        'teamName' => (string)($save['user']['teamName'] ?? 'Unknown Team'),
        'teamCode' => (string)($save['user']['teamCode'] ?? ''),
        'score' => (float)($save['civilizationScore'] ?? 0),
        'phase' => (int)($save['phase'] ?? 1),
        'updatedAt' => (string)($save['updatedAt'] ?? ''),
    ];
}

usort($rows, static fn(array $a, array $b): int => $b['score'] <=> $a['score']);
zeknova_response(['leaderboard' => array_slice($rows, 0, 100)]);
