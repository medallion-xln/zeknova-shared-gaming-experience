<?php
declare(strict_types=1);

// Production is the safe default. `npm run dev` explicitly sets
// ZEKNOVA_ENV=local so contributors bypass the parent Medallion login while
// still exercising the PHP session, persistence, and multiplayer APIs.
$zeknovaEnvironment = strtolower(trim((string)(getenv('ZEKNOVA_ENV') ?: 'production')));
define('ZEKNOVA_ENVIRONMENT', $zeknovaEnvironment === 'local' ? 'local' : 'production');
define('ZEKNOVA_AUTH_MODE', ZEKNOVA_ENVIRONMENT === 'local' ? 'demo' : 'medallion');
const ZEKNOVA_DATA_DIR = __DIR__ . '/../data';

if (session_status() !== PHP_SESSION_ACTIVE) {
    if (ZEKNOVA_AUTH_MODE === 'medallion') {
        // Match the cookie parameters set by /api/auth/login on the parent
        // site so both apps keep refreshing the same week-long session.
        ini_set('session.gc_maxlifetime', '604800');
        session_set_cookie_params([
            'lifetime' => 604800,
            'path'     => '/',
            'secure'   => !empty($_SERVER['HTTPS']),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }
    session_start();
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-ZekNova-Environment: ' . ZEKNOVA_ENVIRONMENT);

if (!is_dir(ZEKNOVA_DATA_DIR)) {
    @mkdir(ZEKNOVA_DATA_DIR, 0750, true);
}

function zeknova_json_input(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        zeknova_error('Invalid JSON payload.', 400);
    }
    return $decoded;
}

function zeknova_response(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function zeknova_error(string $message, int $status = 400): never
{
    zeknova_response(['error' => $message], $status);
}

function zeknova_current_user(): ?array
{
    if (ZEKNOVA_AUTH_MODE === 'medallion') {
        return zeknova_current_user_from_medallion();
    }
    return isset($_SESSION['zeknova_user']) && is_array($_SESSION['zeknova_user'])
        ? $_SESSION['zeknova_user']
        : null;
}

/**
 * Describes the shared-account state without granting access to protected game
 * APIs. This lets the landing screen distinguish a missing Medallion login
 * from an authenticated account that has not enrolled in ZekNova yet.
 */
function zeknova_auth_context(): array
{
    if (ZEKNOVA_AUTH_MODE !== 'medallion') {
        $user = zeknova_current_user();
        return [
            'mode' => 'demo',
            'environment' => ZEKNOVA_ENVIRONMENT,
            'available' => true,
            'authenticated' => $user !== null,
            'signedOut' => false,
            'enrolled' => $user !== null,
            'identity' => $user === null ? null : [
                'displayName' => (string)($user['displayName'] ?? ''),
                'email' => (string)($user['email'] ?? ''),
            ],
            'enrollment' => $user,
            'loginUrl' => null,
        ];
    }

    $medallionId = (int)($_SESSION['user_id'] ?? 0);
    $authenticated = $medallionId > 0;
    $enrollment = $authenticated ? zeknova_medallion_enrollment($medallionId) : null;
    $loginUrl = trim((string)(getenv('ZEKNOVA_LOGIN_URL') ?: '/auth/login/'));
    $registerUrl = trim((string)(getenv('ZEKNOVA_REGISTER_URL') ?: '/auth/register'));

    return [
        'mode' => 'medallion',
        'environment' => ZEKNOVA_ENVIRONMENT,
        'available' => true,
        'authenticated' => $authenticated,
        'signedOut' => $authenticated && !empty($_SESSION['zeknova_signed_out']),
        'enrolled' => $enrollment !== null,
        'identity' => $authenticated ? [
            'displayName' => trim((string)($_SESSION['user_name'] ?? '')),
            'email' => strtolower(trim((string)($_SESSION['user_email'] ?? ''))),
        ] : null,
        'enrollment' => $enrollment === null ? null : [
            'displayName' => (string)($enrollment['displayName'] ?? ''),
            'teamName' => (string)($enrollment['teamName'] ?? ''),
            'teamCode' => (string)($enrollment['teamCode'] ?? ''),
            'biome' => (string)($enrollment['biome'] ?? 'highlands'),
        ],
        'loginUrl' => $loginUrl === '' ? '/auth/login/' : $loginUrl,
        'registerUrl' => $registerUrl === '' ? '/auth/register' : $registerUrl,
    ];
}

/**
 * Reads the authenticated account from the shared Medallion XLN session.
 *
 * The parent site's passwordless login (/api/auth/login) stores user_id,
 * user_email, and user_name in $_SESSION with the cookie on path '/', so the
 * same session is visible here under /zeknova/. Identity stays in the XLN
 * users table; only game enrollment (team, biome, rank) is stored in data/.
 */
function zeknova_current_user_from_medallion(): ?array
{
    $medallionId = (int)($_SESSION['user_id'] ?? 0);
    if ($medallionId < 1 || !empty($_SESSION['zeknova_signed_out'])) {
        return null;
    }

    $enrollment = zeknova_medallion_enrollment($medallionId);
    if ($enrollment === null) {
        // Signed in to Medallion XLN but not enlisted in ZekNova yet; the
        // frontend shows the enlistment form and POSTs to session.php.
        return null;
    }

    $user = [
        'id' => 'xln-' . $medallionId,
        'displayName' => (string)($enrollment['displayName'] ?? ($_SESSION['user_name'] ?? 'Crew Member')),
        'email' => strtolower((string)($_SESSION['user_email'] ?? '')),
        'teamName' => (string)($enrollment['teamName'] ?? ''),
        'teamCode' => (string)($enrollment['teamCode'] ?? ''),
        'officerClass' => 'ensign',
        'biome' => (string)($enrollment['biome'] ?? 'highlands'),
        'rankXp' => (int)($enrollment['rankXp'] ?? 0),
    ];

    // Rank and biome are owned by the officer progression file once it exists.
    $profilePath = zeknova_profile_path($user['teamCode'], $user['id']);
    if (is_file($profilePath)) {
        $profile = json_decode((string)@file_get_contents($profilePath), true);
        if (is_array($profile)) {
            if (in_array(($profile['rank'] ?? ''), ['ensign', 'lieutenant', 'captain'], true)) {
                $user['officerClass'] = (string)$profile['rank'];
            }
            if (is_string($profile['biome'] ?? null) && $profile['biome'] !== '') {
                $user['biome'] = $profile['biome'];
            }
        }
    }

    return $user;
}

function zeknova_medallion_enrollment_path(int $medallionId): string
{
    return ZEKNOVA_DATA_DIR . '/enroll-' . hash('sha256', 'xln:' . $medallionId) . '.json';
}

function zeknova_medallion_enrollment(int $medallionId): ?array
{
    $path = zeknova_medallion_enrollment_path($medallionId);
    if (!is_file($path)) {
        return null;
    }
    $decoded = json_decode((string)@file_get_contents($path), true);
    return is_array($decoded) && (string)($decoded['teamCode'] ?? '') !== '' ? $decoded : null;
}

function zeknova_medallion_enroll(int $medallionId, array $enrollment): void
{
    $encoded = json_encode($enrollment, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($encoded === false || @file_put_contents(zeknova_medallion_enrollment_path($medallionId), $encoded, LOCK_EX) === false) {
        zeknova_error('Unable to persist enlistment.', 500);
    }
}

/** @return array<int, array{teamCode:string, teamName:string, members:int}> */
function zeknova_team_catalog(): array
{
    $teams = [];
    foreach (glob(ZEKNOVA_DATA_DIR . '/enroll-*.json') ?: [] as $path) {
        $decoded = json_decode((string)@file_get_contents($path), true);
        if (!is_array($decoded)) continue;
        $code = strtoupper(trim((string)($decoded['teamCode'] ?? '')));
        $name = trim((string)($decoded['teamName'] ?? ''));
        if ($code === '' || $name === '') continue;
        if (!isset($teams[$code])) {
            $teams[$code] = ['teamCode' => $code, 'teamName' => $name, 'members' => 0];
        }
        $teams[$code]['members']++;
    }
    $rows = array_values($teams);
    usort($rows, static fn(array $a, array $b): int => strcasecmp($a['teamName'], $b['teamName']));
    return $rows;
}

function zeknova_find_team(string $teamCode): ?array
{
    $key = zeknova_team_key($teamCode);
    foreach (zeknova_team_catalog() as $team) {
        if ($team['teamCode'] === $key) return $team;
    }
    return null;
}

/**
 * Appends one message to a team's chat ring buffer under the same exclusive
 * room-file lock the multiplayer heartbeat uses. Lets server-side actors
 * (SCOUT-01) speak in team comms; clients pick the message up on their next
 * heartbeat like any other chat line.
 */
function zeknova_team_chat_post(string $teamCode, string $senderId, string $displayName, string $text): bool
{
    $clean = trim((string)preg_replace('/[\x00-\x1F\x7F]/u', ' ', $text));
    if ($clean === '') {
        return false;
    }
    $clean = function_exists('mb_substr') ? mb_substr($clean, 0, 300) : substr($clean, 0, 300);

    $handle = fopen(zeknova_room_path($teamCode), 'c+');
    if ($handle === false || !flock($handle, LOCK_EX)) {
        if (is_resource($handle)) fclose($handle);
        return false;
    }
    $raw = stream_get_contents($handle);
    $room = $raw !== false && trim($raw) !== '' ? json_decode($raw, true) : null;
    if (!is_array($room)) {
        $room = ['version' => 1, 'revision' => 0, 'players' => [], 'world' => ['buildings' => [], 'harvestedTreeIds' => [], 'collectedPowerUpIds' => [], 'minedRockIds' => []]];
    }
    $chat = is_array($room['chat'] ?? null) ? $room['chat'] : [];
    $chat['seq'] = (int)($chat['seq'] ?? 0) + 1;
    $chat['messages'] = is_array($chat['messages'] ?? null) ? $chat['messages'] : [];
    $chat['messages'][] = [
        'seq' => $chat['seq'],
        'userId' => $senderId,
        'displayName' => substr($displayName, 0, 80),
        'officerClass' => 'ensign',
        'text' => $clean,
        'at' => time(),
    ];
    $chat['messages'] = array_slice($chat['messages'], -200);
    $room['chat'] = $chat;

    $encoded = json_encode($room, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $ok = false;
    if ($encoded !== false) {
        rewind($handle);
        ftruncate($handle, 0);
        $ok = fwrite($handle, $encoded) !== false;
        fflush($handle);
    }
    flock($handle, LOCK_UN);
    fclose($handle);
    return $ok;
}

function zeknova_create_team_key(string $teamName): string
{
    $prefix = substr(preg_replace('/[^A-Z0-9]/', '', strtoupper($teamName)) ?: 'TEAM', 0, 8);
    do {
        $key = zeknova_team_key($prefix . '-' . strtoupper(bin2hex(random_bytes(3))));
    } while (zeknova_find_team($key) !== null);
    return $key;
}

function zeknova_require_user(): array
{
    $user = zeknova_current_user();
    if ($user === null) {
        zeknova_error('Authentication required.', 401);
    }
    return $user;
}

function zeknova_team_key(string $teamCode): string
{
    $clean = strtoupper(preg_replace('/[^A-Z0-9_-]/i', '', $teamCode) ?? '');
    if ($clean === '' || strlen($clean) > 40) {
        zeknova_error('Invalid team code.', 422);
    }
    return $clean;
}

function zeknova_save_path(string $teamCode): string
{
    return ZEKNOVA_DATA_DIR . '/team-' . hash('sha256', zeknova_team_key($teamCode)) . '.json';
}

function zeknova_room_path(string $teamCode): string
{
    return ZEKNOVA_DATA_DIR . '/room-' . hash('sha256', zeknova_team_key($teamCode)) . '.json';
}

function zeknova_profile_path(string $teamCode, string $userId): string
{
    return ZEKNOVA_DATA_DIR . '/profile-' . hash('sha256', zeknova_team_key($teamCode) . ':' . $userId) . '.json';
}
