<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

echo json_encode([
    'app' => 'ZekNova: Prepare the Planet',
    'build' => '2026-07-17-auth55',
    'entry' => 'src/main.js?v=auth55',
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
