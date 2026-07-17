<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    zeknova_response([
        'user' => zeknova_current_user(),
        'auth' => zeknova_auth_context(),
        'environment' => ZEKNOVA_ENVIRONMENT,
    ]);
}

if ($method === 'DELETE') {
    if (ZEKNOVA_AUTH_MODE === 'medallion') {
        // Exit ZekNova without touching the shared Medallion XLN login.
        $_SESSION['zeknova_signed_out'] = true;
        zeknova_response(['ok' => true]);
    }
    unset($_SESSION['zeknova_user']);
    session_regenerate_id(true);
    zeknova_response(['ok' => true]);
}

if ($method !== 'POST') {
    zeknova_error('Method not allowed.', 405);
}

if (ZEKNOVA_AUTH_MODE === 'medallion') {
    $medallionId = (int)($_SESSION['user_id'] ?? 0);
    if ($medallionId < 1) {
        zeknova_error('Sign in through Medallion XLN before entering ZekNova.', 401);
    }
    unset($_SESSION['zeknova_signed_out']);

    $input = zeknova_json_input();
    $existing = zeknova_medallion_enrollment($medallionId);

    $displayName = trim((string)($input['displayName'] ?? ''));
    if ($displayName === '') {
        $displayName = (string)($existing['displayName'] ?? trim((string)($_SESSION['user_name'] ?? '')));
    }
    if ($displayName === '') {
        $displayName = 'Crew Member';
    }

    $requestedTeam = trim((string)($input['teamCode'] ?? ''));
    $submittedName = trim((string)($input['teamName'] ?? ''));
    if ($requestedTeam !== '') {
        $team = zeknova_find_team($requestedTeam);
        if ($team === null) zeknova_error('That team is no longer available.', 422);
        $teamCode = (string)$team['teamCode'];
        $teamName = (string)$team['teamName'];
    } elseif ($submittedName !== '') {
        foreach (zeknova_team_catalog() as $team) {
            if (strcasecmp($team['teamName'], $submittedName) === 0) {
                zeknova_error('That team already exists. Choose it from Join an existing team.', 409);
            }
        }
        $teamName = $submittedName;
        $teamCode = zeknova_create_team_key($teamName);
    } elseif ($existing !== null) {
        $teamName = (string)$existing['teamName'];
        $teamCode = (string)$existing['teamCode'];
    } else {
        zeknova_error('Create a team or join an existing team.', 422);
    }

    zeknova_medallion_enroll($medallionId, [
        'displayName' => substr($displayName, 0, 80),
        'teamName' => substr($teamName, 0, 80),
        'teamCode' => $teamCode,
        'biome' => 'highlands',
        'rankXp' => (int)($existing['rankXp'] ?? 0),
        'updatedAt' => gmdate('c'),
    ]);

    zeknova_response(['user' => zeknova_current_user_from_medallion()], 201);
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
