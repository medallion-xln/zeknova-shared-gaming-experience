# ZekNova: Prepare the Planet — WebGPU Vertical Slice V7

A first-playable browser game for the AI × Crypto Expo 2026 hackathon experience. It uses Three.js `WebGPURenderer`, TypeScript, Vite, PHP session/save adapters, and a deterministic procedural lush-highland biome.

Authentication and team enrollment run in a lightweight standalone bootstrap.
The Three.js runtime, source gameplay modules, models, terrain, WASM core, and
multiplayer simulation are loaded only after an enrolled player presses
**Launch ZekNova**.

## Hackathon source layout

The browser now starts from `src/main.js`. Gameplay rules that have completed the progressive migration are edited in the following modules:

```text
src/
├── game/
│   ├── Game.js
│   ├── Player.js
│   ├── Enemies.js
│   └── Missions.js
├── world/
│   ├── Terrain.js
│   ├── Collision.js
│   └── Biomes.js
├── multiplayer/
│   └── MultiplayerClient.js
├── ui/
│   └── MessageCenter.js
└── main.js
```

Biomes, mission definitions, player progression, enemy profiles, and collision radii in these modules are consumed by the live game. The generated Three.js renderer and main simulation loop remain in `assets/index-02987539.js` as a compatibility layer while their classes are migrated incrementally. See `CONTRIBUTING.md` before opening a pull request.

## V7 gameplay

- Hybrid third-person exploration and overhead command mode
- Correctly displaced terrain mesh so players, locals, buildings, and grounded machines sit on the visible surface
- Guaranteed central west-to-east river that divides the biome and makes crossings strategically necessary
- Captain-only command-mech flight; Ensign and Lieutenant officers remain terrain-bound
- Exact resource deficit messages such as “12 more biomass and 8 more credits” when construction fails
- Ensign + support scout, Lieutenant + construction biped, Captain + command mech
- Career progression replaces class selection: every new officer begins as an Ensign, earns Lieutenant after four completed team missions plus four personal contribution goals, and earns Captain after eight missions plus eight goals
- Registration selects Forest, Desert, Highlands, Arctic, or Wetlands as the player's initial deployment AO instead of granting an immediate rank
- High-quality Ensign/support-scout and Lieutenant/companion-mech GLBs lazy-load only for their matching officer sessions; optimized browser assets and procedural offline/loading fallbacks keep startup responsive
- Companion locomotion stays class-specific: the Ensign scout hovers, while the rigged Lieutenant mech remains ground-anchored and switches between real walking and running clips
- Holding Shift selects dedicated running clips for every loaded rig that provides one; walk-cycle speed scaling is reserved for fallback models without a run clip
- The Captain and construction mech use optimized skinned GLBs with dedicated walking/running animation clips, replacing their procedural placeholder meshes
- Browser-optimized model delivery: the Ensign is 1.3 MB with its skinned walking animation, and the scout is 1.5 MB after geometry, texture, quantization, and Meshopt optimization
- Deterministic five-region world generated from the internal team identifier
- Mineral and biomass collection, companion-robot rock mining, and individually harvestable alien trees
- Collidable stones and highland formations that become passable after the companion robot mines them
- Size-based tree chopping: small trees fall in one chop, while medium and large trees take longer and award more timber
- Nine construction systems: power, water, habitat, research, culture, governance, defense, bridge, and Survey Skiff
- Local bridge crossings and automatic boat deployment over open water
- Phase III hydro-suit traversal remains a later technology upgrade
- Guaranteed ZekNovan patrol encounter after roughly 14 seconds, followed by recurring 26–44 second encounter windows with up to three active defenders
- More detailed Space Monkey armor, drone/biped/mech assemblies, ZekNovan defenders, buildings, trees, resources, villages, rocks, bridge, and boat models
- Concept-art-aligned class palettes and silhouettes: olive Ensign/recon drone, blue-and-gold Lieutenant/construction biped, and teal-purple Captain/command mech
- Lightweight layered armor, emissive equipment details, and faceted materials for procedural fallback classes without post-processing passes
- Enemy health indicators, visible defense projectiles, material-transfer beams, and impact effects
- Six distinct ZekNovan roles: high-fidelity Stalker ambushers, Saboteur infrastructure raiders, ranged Spitter Gunners, flying Skyray Screechers, the rigged Juggernaut bruiser, and subterranean Burrower threats
- Browser-optimized enemy delivery: four new rigged Meshy enemy families use 1024px WebP textures, quantized Meshopt geometry/animation, shared source caches, skinned clones, lazy loading, and procedural offline fallbacks
- Animated models are measured from their actual skinned pose at unit scale, unsafe cross-file bone-scale keys are removed, and the normalization wrapper is set once from those raw bounds to prevent oversized or exploded spawns
- The eight new walk/run enemy assets total about 3.4 MB after optimization, down from roughly 250 MB of supplied source GLBs
- The Burrower uses a lightweight procedural seismic/emergence model because no dedicated Burrower rig was included; its warning, eruption, infrastructure damage, and rare-mineral reward systems are active
- Role-specific combat includes camouflage ambushes, suppressive volleys, marked targets, burrowing repositioning, strafing runs, signal cries, drone disruption, temporary utility sabotage, seismic emergence warnings, and rare-mineral exposure
- The Juggernaut “Ram” telegraphs committed tackles, performs ground slams, braces against frontal fire, prioritizes vulnerable infrastructure, crashes into world obstacles, and exposes rear/leg joints during recovery
- Shared Water or Safe Zone peace converts active Juggernauts into territorial guardians that intercept hostile units and suppress nearby AO hazard losses
- Full pause state on `P` or `Escape` that freezes production, movement, mining recovery, hazards, enemies, and all projectiles
- Gameplay updates are contained beneath Hackathon Standings instead of blocking the center of the world view
- Rock mining produces 5 iron ore per completed formation; Ensign robots cool for 10 seconds, Lieutenants for 5 seconds, and Captains for 2 seconds
- Every construction recipe requires iron ore in addition to its other resources
- Direct utility networks: Water Works must be river-adjacent and directly connected to a Solar Grid; dependent buildings only operate when their required power, water, and data sources are within cable range
- Visible color-coded utility runs connect every consumer directly to its source, while disconnected structures stop contributing production, readiness, and mission progress
- Interconnected colony production, readiness indicators, four mission phases, and Civilization Readiness Score
- Twelve installation-driven missions across four outpost tiers: Basic Outpost, Perimeter Defense, Expanded Operations, and Frontier Stronghold
- Every mission has three field-and-construction sub-objectives with live counters; the mission renders complete only after its full checklist is finished
- Environmental hazards, protected local territories, diplomacy choices, and defensive encounters
- Recurring ZekNovan diplomatic incidents appear at randomized 7–10 minute intervals after First Contact; every incident offers three choices that raise or lower persistent tension, trust, hostility, patrol pressure, and related colony systems
- Persistent First Contact outcomes: Shared Water transfers watershed control and steadily restores ecology/biomass while making patrols rare; Negotiation creates a visible 18-meter safe work zone that enemies will not enter or attack; Force Access begins all-out war with continuous 4.5–7.5 second reinforcement waves
- AI colony-advisor UI with deterministic offline advice and a secure server-side provider hook
- Click the in-world robot companion to open the SCOUT-01 conversation console; multi-turn chat automatically receives current resources, readiness, mission tier, diplomacy status, and installed structures
- AlphaZero-lite proof of concept: SCOUT-01 can run a time-bounded, depth-4 Monte Carlo Tree Search of up to 72 simulations in a Web Worker over abstract colony telemetry, then recommend a ranked macro-action without controlling the player or spending resources
- Team save data, prototype leaderboard endpoint, autosave, and local fallback persistence
- Persistent team multiplayer rooms: concurrent players on the same team see each other's live positions, online roster count, construction, harvested trees, mined rocks, and collected power-ups
- Conflict-safe PHP file locking and stable-ID world merging prevent simultaneous saves from erasing another player's installations or completed world interactions
- WebGPU-first rendering with WebGL 2 fallback through Three.js

## Controls

- `WASD` or arrow keys — move
- `Shift` — sprint
- `E` — context action: collect a deposit, chop the nearest tree, direct the companion to mine a rock, or pick up a power-up
- `Space` — fire a defensive pulse
- `Tab` — switch between exploration and command mode
- `R` — reset to safe terrain
- `F` — Captain-only Heavy Command Mech flight toggle
- `P` or `Escape` — pause or resume the simulation
- Click terrain — auto-walk

To cross water before the advanced hydro upgrade, earn Colony Credits through tree harvesting or power-ups, mine minerals, and construct either:

- **Canopy Bridge:** creates a local walkable crossing over the illuminated bridge deck and costs 8 iron ore.
- **Survey Skiff:** unlocks automatic boat deployment whenever the officer enters open water and costs 12 iron ore.

## Direct utility connections

- **Solar Grid:** primary power source; consumers must be placed within 30 meters.
- **Water Works:** must be placed beside the river, within 30 meters of a Solar Grid. Water consumers must be within 26 meters of the Water Works.
- **AI Research Lab:** requires direct power and water, then acts as a data source with a 24-meter connection range.
- **Habitat, Creator Commons, and AI Research Lab:** require direct power and water connections.
- **Civic Hall:** requires direct power, water, and Research Lab data connections.
- **Defense Beacon and Survey Skiff:** require a direct Solar Grid connection.
- **Canopy Bridge:** is passive infrastructure and does not require an active utility connection.

The Utility Network panel beneath Hackathon Standings reports online and disconnected structures. Yellow cables carry power, blue pipes carry water, and violet lines carry research data. Existing saves remain compatible; connections are recalculated from building positions when the mission loads.

## Local development

```bash
npm run dev
```

This starts PHP's development server at `http://127.0.0.1:8790` with
`ZEKNOVA_ENV=local`. Contributors go directly to local officer/team setup—no
Medallion account or query-string flag is required. Local sessions exercise
the same PHP save, progression, team, and multiplayer endpoints as production.

To test the production authentication gate locally instead, run:

```bash
npm run dev:production
```

Production remains the default whenever `ZEKNOVA_ENV=local` is absent. The old
`?demo=1` browser-only mode remains available as an offline fallback.

For end-to-end multiplayer testing, use two authenticated Medallion accounts on a staging or production server. Create a team with the first account and join it from the second. Local `?demo=1` mode remains intended for single-browser gameplay testing.

## Multiplayer architecture

- `api/multiplayer.php` maintains one persistent room per internal team identifier.
- Clients send lightweight presence and world snapshots approximately once per second.
- Inactive players expire from the room roster after 20 seconds.
- Buildings and completed environmental interactions merge by stable IDs under an exclusive file lock.
- Remote players use inexpensive procedural markers, avoiding another high-fidelity model load for every teammate.
- `api/save.php` also merges shared-world arrays under a lock, so autosaves cannot remove another player's work.

This first multiplayer version is designed for small cooperative teams on ordinary PHP hosting. It does not require WebSockets or a dedicated game-server process. Combat enemies and rapidly changing physics remain local to each client; shared construction and persistent world progress are synchronized.

Production validation:

```bash
php -l api/multiplayer.php
php -l api/save.php
```

## Deploy to `medallionxln.com/zeknova/`

1. Back up `/domains/medallionxln.com/public_html/zeknova/`.
2. Upload the **contents** of the deployment package into that directory.
3. Choose **overwrite existing files**, but preserve the existing `data/` directory and saved JSON files.
4. Make `data/` writable by PHP but inaccessible from the web. Typical permissions are `0750` for the directory and `0640` for generated files, adjusted for the hosting account.
5. Confirm the URL is served over HTTPS.
6. Open `/zeknova/?v=7` and hard-refresh.
7. Confirm the Readiness Matrix says `WEBGPU ACTIVE · V7` or `WEBGL 2 FALLBACK · V7`.

The included `index.php` serves the built `index.html` with no-cache headers.

## Medallion XLN authentication (connected)

`ZEKNOVA_AUTH_MODE = 'medallion'` in `api/bootstrap.php` shares the parent
site's login session. The passwordless OTP login at `/api/auth/login` stores
`user_id`, `user_email`, and `user_name` in `$_SESSION` with the cookie on
path `/`, so ZekNova (served from `/zeknova/`) reads the same session — no
second password database exists.

How it works:

- Identity (id, email, display name) always comes from the shared XLN session.
- The production landing screen is a hard gate: no Medallion session means no
  crew form and no browser-created fallback officer.
- Game enrollment (callsign and team membership) is collected by the in-game
  form and stored per account in `data/enroll-<hash>.json`.
- Players create a named team or join an existing team from the enrollment
  dropdown. Internal team identifiers are generated automatically and are not
  exposed as signup fields.
- Every team shares one persistent five-region world; biome is no longer a
  player deployment choice.
- Officer rank is read from the progression profile in `data/`.
- Signing out inside ZekNova sets a `zeknova_signed_out` flag only; the
  Medallion XLN login is untouched. Enlisting again clears the flag and
  rejoins the same team.
- An unauthenticated `POST /api/session.php` returns
  `401 Sign in through Medallion XLN before entering ZekNova.`
- Set `ZEKNOVA_LOGIN_URL` or `ZEKNOVA_REGISTER_URL` if the parent sign-in and
  account-creation pages are not at `/auth/login/` and `/auth/register`.

For local development without the parent site, open the static `index.html`
file directly, or serve the project on localhost and append `?demo=1`. The UI
labels this as local-only mode. A normal localhost URL (without `?demo=1`)
still exercises the production gate, which makes the authentication behavior
testable before deployment.

## Connect OpenAI or DeepSeek to SCOUT-01

The browser never receives an API key. Configure one provider in the PHP server environment.

OpenAI:

```text
ZEKNOVA_AI_PROVIDER=openai
OPENAI_API_KEY=your-server-side-key
OPENAI_MODEL=gpt-5.6
```

DeepSeek:

```text
ZEKNOVA_AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=your-server-side-key
DEEPSEEK_MODEL=deepseek-v4-flash
```

For another OpenAI-compatible provider, use:

```text
ZEKNOVA_AI_PROVIDER=custom
ZEKNOVA_AI_API_URL=https://provider.example/v1/chat/completions
ZEKNOVA_AI_API_KEY=your-server-side-key
ZEKNOVA_AI_MODEL=provider-model-id
```

Restart PHP or the hosting runtime after changing environment variables. Without a configured provider, SCOUT-01 remains available through its deterministic local reasoning fallback.

## Persistence and multiplayer status

This is a playable vertical slice. It persists a shared team snapshot through PHP and provides a leaderboard endpoint, but it is not yet real-time multiplayer. Before the public hackathon, move file-backed saves into the existing database and add server-authoritative versioning, event logs, conflict resolution, team permissions, rate limiting, and live synchronization.

V7 save snapshots use schema version 4. The PHP endpoint accepts versions 1–4. Old saves remain compatible; version 4 persists mined rocks, mission activity counters, and the permanent First Contact outcome in addition to harvested trees and collected power-ups.

## Important files

- `src/main.ts` — application bootstrap, encounters, harvesting, input, and game loop
- `src/game/Terrain.ts` — procedural biome, harvestable trees, collectible power-ups, villages, resources, and environmental art
- `src/game/Player.ts` — movement, classes, detailed player/machine models, axe, boat traversal, and defense
- `src/game/Buildings.ts` — construction rules, detailed models, bridge crossing, and Survey Skiff unlock
- `src/game/Simulation.ts` — resources, timber, hazards, phases, scoring, and diplomacy
- `src/ui.ts` / `src/styles.css` — landing flow, HUD, construction dock, advisor, and controls
- `api/bootstrap.php` — authentication integration point
- `api/save.php` — prototype team persistence
- `api/leaderboard.php` — saved-team ranking endpoint
- `api/ai-advisor.php` — server-side model-provider hook

## Next production layers

- Connect real Medallion XLN user and team tables
- Move saves and leaderboard data into SQL
- Add real-time team presence and synchronized construction events
- Add officer permissions and promotion workflows
- Add high-quality GLB replacements for Lieutenant and Captain while keeping procedural low-poly fallback models
- Add utility connections, roads, worker task queues, research tree, biome expansion, reforestation, and judge-facing scoring dashboard
- Add automated browser tests on supported browsers and representative devices

## Lightweight runtime scaling

- Terrain elevation is generated once into a 161 × 161 `Float32Array` and sampled with bilinear interpolation for movement, collision, construction, water, and enemy grounding.
- A uniform 10-meter spatial hash indexes mineable rocks, harvestable trees, resource deposits, and power-ups for local interaction and collision queries.
- Building utility sources use an 18-meter spatial hash plus a cached adjacency graph and cached operational state.
- The installation campaign uses a cached mission dependency graph rather than rebuilding the mission sequence on every HUD update.
- Ensign ballistic spheres, Captain missiles and barrages, hostile projectiles, and impact effects reuse bounded object pools to reduce garbage-collection spikes during combat.
- All 672 logical trees render through five instanced silhouette batches, while a 24-model proximity pool moves the detailed Meshy trees among the nearest visible harvestable trees. Proximity selection refreshes only after meaningful movement or a short interval instead of sorting the forest every frame.
- The terrain cache uses roughly 101 KB per active game; the spatial indexes, graph caches, instance matrices, and bounded pools keep their memory cost predictable as content density rises.

## Five areas of operation

The biome is divided into Forest, Desert, Highlands, Arctic, and Wetlands operations. Each AO has a distinct terrain palette, perimeter beacons, resource table, environmental hazard, two tactical objectives, and a permanent strategic completion reward. Completing an AO grants 5 Colony Credits plus its regional bonus.

Three static Meshy environment models use Meshopt geometry compression and WebP textures. The world contains 672 fully harvestable trees divided evenly between angular triangular canopies and substantially larger faceted-spherical alien canopies. Eight sub-variants add continuous height, width, depth, lean, color, and rotation variation. Five instanced low-poly batches keep the complete forest visible even in direct `file://` mode. Over HTTP, a fixed pool of 24 detailed GLBs—12 per alien-tree species—moves among the nearest visible trees, so scene-object and GPU-resource counts stay bounded regardless of forest density. Three instanced alien flower species and three lightweight animated fauna types add ground-level life. Frustum culling, distance culling, idle loading, and hardware-aware fallback keep the environment scalable. The deployed model set is about 7.3 MB. The heavier coral landmark loads only on capable desktop-class devices. See `BIOME_ASSETS.md` for the complete inventory.


## V7 activity-credit economy

- New colonies begin with 0 Colony Credits.
- Every fully harvested alien tree grants exactly +1 Colony Credit once.
- Every stamina, shield, or XP power-up grants exactly +1 Colony Credit once.
- Every defeated enemy grants +1 Colony Credit.
- Harvested tree IDs, mined rock IDs, collected power-up IDs, and mission counters persist in save version 4.

## Class combat and special attacks

- Ensigns launch fast kinetic ballistic spheres; confirmed impacts add special charge.
- Lieutenants fire instant precision lasers with the longest lock range.
- Captains launch homing missiles with splash damage against grouped enemies.
- Hits and eliminations fill a persistent 100-point special gauge displayed below the standings. Press `Q` or the SPECIAL action button when full.
- Kinetic Singularity, Prismatic Laser Sweep, and Command Missile Storm deliver class-specific 15–23 meter AOE attacks with distance-based damage falloff.
- Canopy Bridge cost: 20 minerals + 8 iron ore + 5 Colony Credits.
- Survey Skiff cost: 30 minerals + 12 iron ore + 8 Colony Credits.
- Passive credit generation was removed so credits reflect player activity.
- Construction denial messages report the exact mineral and credit shortfall.
