<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

echo json_encode([
    'app' => 'ZekNova: Prepare the Planet',
    'build' => '2026-07-15-wasm41',
    'entry' => 'assets/index-02987539.js?v=wasm41',
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
