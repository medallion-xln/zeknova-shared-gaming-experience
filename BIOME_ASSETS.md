# ZekNova Biome Asset Inventory

## Terrain and water

- Seeded hierarchical terrain heightfield
- River channel and animated water plane
- Mineable mineral boulders and small stones
- Area-of-operation perimeter beacons

## Vegetation and ground cover

- 672 harvestable alien-tree anchors divided evenly between enlarged faceted-spherical and angular triangular canopies, rendered through five instanced silhouette batches with eight sub-variants and continuous height, width, depth, lean, and rotation variation
- Three instanced alien flower species
- Glow hoppers, tri-wing motes, and shell crawlers
- Biomass deposits
- Timber deposits
- Alien coral ground cover
- Blue alien spiky plants
- Alien palm trees

## Geological and landmark props

- Iron deposits
- Mineral deposits
- Arctic water-ice deposits
- Data crystals

## Local civilization and tactical objects

- Two ZekNovan settlements
- Protected-territory boundary markers
- Forest, Desert, Highlands, Arctic, and Wetlands AO markers
- Stamina, shield, and XP power-ups
- Resource-node markers

## Constructible colony assets

- Solar Grid
- Water Works
- Habitat
- AI Research Lab
- Creator Commons
- Civic Hall
- Defense Beacon
- Canopy Bridge
- Survey Skiff
- Direct power, water, and data utility links

## Active characters and machines

- Ensign engineer, running engineer, and flying support scout
- Lieutenant astronaut, running astronaut, walking mech, and running mech
- Captain engineer walk/run models and mech walk/run models
- Sentinel, rigged ZekNovan Juggernaut “Ram”, Skyray, and Spitter enemy classes
- Marine and enemy projectiles and impact effects

## Optimized Meshy environment models

| Asset | Original | Browser LOD | Approx. triangles | Loading policy |
|---|---:|---:|---:|---|
| Blue alien spiky plant | 54 MB | 579 KB | 20,680 | Initial light batch |
| Alien palm tree | 70 MB | 740 KB | 28,806 | Initial light batch |
| Alien coral ground | 115 MB | 6.0 MB | 417,810 | Desktop, idle, near-distance only |
| ZekNovan Juggernaut walk | 32.8 MB | 468 KB | 10,426 | Lazy-load on Juggernaut contact |
| ZekNovan Juggernaut run | 32.8 MB | 467 KB | 10,426 | Lazy-load with walk model |

All optimized models use Meshopt-compressed geometry and WebP textures. The two detailed alien-tree species share geometry and materials through a fixed 24-model proximity pool: 12 palm and 12 spiky models are reassigned to the nearest visible logical trees. Flowers use four instanced draw calls, while nearby fauna alone are animated. Every mesh uses frustum and distance culling; the heavy coral ground landmark is skipped on smaller or lower-memory devices.

Every harvestable tree has a built-in low-poly alien silhouette, but those components are consolidated into five `InstancedMesh` batches instead of thousands of individual scene objects. This keeps all 672 trees visible through `file://`. Over HTTP, only the nearest 24 eligible trees upgrade to detailed GLBs at once; their corresponding fallback instances are hidden until the detailed models move elsewhere.

## Areas of operation

| AO | Resources | Environmental hazard | Tactical objective | Strategic value |
|---|---|---|---|---|
| Forest | Timber, biomass | Neurospore canopy | Recover forest resources and establish a protected logistics lane | Renewable construction stock and ecosystem recovery |
| Desert | Iron, minerals | Twin-sun heat exposure | Survey the ore seam and establish solar reach | Highest solar yield and accessible metal reserves |
| Highlands | Iron, data | Rockfall and electrical storms | Hold the ridgeline and deploy early-warning coverage | Defensive terrain and long-range surveillance |
| Arctic | Water, data | Cryogenic wind chill | Recover climate archives and stabilize remote power | Freshwater ice, climate intelligence, and resilient research |
| Wetlands | Water, biomass | Contaminated mire | Control the watershed without collapsing local ecology | Watershed control, biomass, and diplomatic leverage |
