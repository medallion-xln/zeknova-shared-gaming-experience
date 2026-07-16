<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    zeknova_response(['user' => zeknova_current_user()]);
}

if ($method === 'DELETE') {
    unset($_SESSION['zeknova_user']);
    session_regenerate_id(true);
    zeknova_response(['ok' => true]);
}

if ($method !== 'POST') {
    zeknova_error('Method not allowed.', 405);
}

if (ZEKNOVA_AUTH_MODE === 'medallion') {
    $user = zeknova_current_user_from_medallion();
    if ($user === null) {
        zeknova_error('Sign in through Medallion XLN before entering ZekNova.', 401);
    }
    zeknova_response(['user' => $user]);
}

$input = zeknova_json_input();
$email = filter_var((string)($input['email'] ?? ''), FILTER_VALIDATE_EMAIL);
$displayName = trim((string)($input['displayName'] ?? ''));
$teamName = trim((string)($input['teamName'] ?? ''));
$biome = strtolower((string)($input['biome'] ?? 'highlands'));
$allowedBiomes = ['forest', 'desert', 'highlands', 'arctic', 'wetlands'];

if ($email === false || $displayName === '' || $teamName === '') {
    zeknova_error('Callsign, valid email, and team name are required.', 422);
}
if (!in_array($biome, $allowedBiomes, true)) {
    zeknova_error('Invalid deployment biome.', 422);
}

$requestedCode = trim((string)($input['teamCode'] ?? ''));
$teamCode = $requestedCode !== ''
    ? zeknova_team_key($requestedCode)
    : zeknova_team_key(substr(preg_replace('/[^A-Z0-9]/i', '', strtoupper($teamName)) ?: 'TEAM', 0, 4) . '-' . random_int(1000, 9999));

$existing = zeknova_current_user();
$sameOfficer = is_array($existing)
    && strtolower((string)($existing['email'] ?? '')) === strtolower((string)$email)
    && zeknova_team_key((string)($existing['teamCode'] ?? '')) === $teamCode;
$class = $sameOfficer && in_array(($existing['officerClass'] ?? ''), ['ensign', 'lieutenant', 'captain'], true)
    ? (string)$existing['officerClass']
    : 'ensign';

$user = [
    'id' => 'demo-' . substr(hash('sha256', strtolower((string)$email)), 0, 16),
    'displayName' => substr($displayName, 0, 80),
    'email' => strtolower((string)$email),
    'teamName' => substr($teamName, 0, 80),
    'teamCode' => $teamCode,
    'officerClass' => $class,
    'biome' => $biome,
    'rankXp' => 0,
];

session_regenerate_id(true);
$_SESSION['zeknova_user'] = $user;
zeknova_response(['user' => $user], 201);
