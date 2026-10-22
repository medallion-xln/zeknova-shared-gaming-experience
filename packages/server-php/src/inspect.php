<?php
declare(strict_types=1);
require __DIR__.'/bootstrap.php';if(PHP_SAPI!=='cli'||!staging_enabled())exit(1);
$db=db();$out=[];foreach(['worlds','commands','events','checkpoints','rewards'] as $table)$out[$table]=query($db,'SELECT * FROM '.$table)->fetchAll(PDO::FETCH_ASSOC);
echo json_encode($out,JSON_THROW_ON_ERROR);
