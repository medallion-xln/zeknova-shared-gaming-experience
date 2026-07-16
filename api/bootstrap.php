<?php
declare(strict_types=1);

session_start();

// Change to 'medallion' after connecting zeknova_current_user_from_medallion().
const ZEKNOVA_AUTH_MODE = 'demo';
const ZEKNOVA_DATA_DIR = __DIR__ . '/../data';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

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
 * Integration hook for the existing Medallion XLN session.
 *
 * Replace this body with the site's existing session/bootstrap include and map
 * the authenticated account into the shape below. Do not create a second
 * password database for ZekNova.
 */
function zeknova_current_user_from_medallion(): ?array
{
    // Example only:
    // require_once dirname(__DIR__, 2) . '/auth/bootstrap.php';
    // if (!isset($_SESSION['user_id'])) return null;
    // return [
    //   'id' => (string) $_SESSION['user_id'],
    //   'displayName' => (string) ($_SESSION['display_name'] ?? 'Crew Member'),
    //   'email' => (string) ($_SESSION['email'] ?? ''),
    //   'teamName' => (string) ($_SESSION['zeknova_team_name'] ?? ''),
    //   'teamCode' => (string) ($_SESSION['zeknova_team_code'] ?? ''),
    //   'officerClass' => (string) ($_SESSION['zeknova_class'] ?? 'ensign'),
    //   'rankXp' => (int) ($_SESSION['zeknova_rank_xp'] ?? 0),
    // ];
    return null;
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
