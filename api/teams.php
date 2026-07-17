<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

if (ZEKNOVA_AUTH_MODE === 'medallion') {
    if ((int)($_SESSION['user_id'] ?? 0) < 1 || !empty($_SESSION['zeknova_signed_out'])) {
        zeknova_error('Sign in through Medallion XLN to view teams.', 401);
    }
} else {
    zeknova_require_user();
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    zeknova_error('Method not allowed.', 405);
}

$teams = array_map(static fn(array $team): array => [
    'id' => (string)$team['teamCode'],
    'name' => (string)$team['teamName'],
    'members' => (int)$team['members'],
], zeknova_team_catalog());

zeknova_response(['teams' => $teams]);
