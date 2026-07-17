# Contributing to ZekNova

## Workflow

1. Fork the repository and create a focused feature branch.
2. Put new gameplay code in `src/`; do not add new systems to the generated compatibility bundle in `assets/index-02987539.js`.
3. Keep models browser-sized and place them under `assets/models/`.
4. Run `node scripts/check-source.mjs` and the PHP syntax checks before opening a pull request.
5. Describe the gameplay change, testing performed, and any new assets in the pull request.

## Source ownership

- `src/game/`: player, enemy, mission, and game lifecycle rules.
- `src/world/`: terrain, collision, and biome systems.
- `src/multiplayer/`: browser-to-server synchronization clients.
- `src/ui/`: HUD, message center, menus, and accessible interaction components.
- `api/`: production PHP; changes require maintainer review.
- `.github/workflows/`, `.htaccess`, `index.php`: deployment-sensitive; changes require maintainer review.

## Validation

```bash
node scripts/check-source.mjs
php -l api/bootstrap.php
php -l api/session.php
php -l api/save.php
php -l api/multiplayer.php
php -l api/progression.php
```

Never commit API keys, deployment credentials, live save JSON, downloaded source meshes, or private user data.

