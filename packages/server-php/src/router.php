<?php
declare(strict_types=1);
require __DIR__.'/bootstrap.php';
$path=rawurldecode(parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH) ?: '/');
if(!staging_enabled())response(['ok'=>false,'reason'=>'staging-disabled'],404);
if($path==='/staging/events') { require __DIR__.'/events.php';return; }
if($path==='/staging/session') { require __DIR__.'/session.php';return; }
if($path==='/staging/world') { require getenv('ZGE_RUNTIME_SOCKET')?__DIR__.'/supervised-world.php':__DIR__.'/world.php';return; }
if($path==='/staging/health'&&getenv('ZGE_RUNTIME_SOCKET')) { require __DIR__.'/runtime-health.php';return; }
// Explicit static allow-list: never expose database, .env, production APIs or setup scripts.
if(str_contains($path,'..')||!preg_match('#^/(examples/construction-world/|packages/(core|gameplay-construction|gameplay-missions|persistence|rendering|neural-rendering)/src/|assets/vendor/)[a-zA-Z0-9_./-]*$#',$path))response(['ok'=>false,'reason'=>'not-found'],404);
$root=dirname(__DIR__,3);$file=realpath($root.$path);if(is_dir($root.$path))$file=realpath($root.$path.'/index.html');
if(!$file||!str_starts_with($file,$root.'/')||!is_file($file)||!in_array(pathinfo($file,PATHINFO_EXTENSION),['js','mjs','html','css'],true))response(['ok'=>false,'reason'=>'not-found'],404);
header('Content-Type: '.match(pathinfo($file,PATHINFO_EXTENSION)){'js','mjs'=>'text/javascript','css'=>'text/css',default=>'text/html'});readfile($file);return;
