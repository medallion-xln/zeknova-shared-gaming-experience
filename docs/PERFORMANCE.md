# Runtime performance

The live game uses a layered performance budget designed for ordinary browser hardware:

- HUD sections update only when their visible values change.
- Trees, buildings, and environmental obstacles are queried through spatial hashes.
- Utility links update only around added, repaired, or destroyed infrastructure.
- Enemy decisions run at 15 Hz and are interpolated at the display frame rate.
- Environmental models move between distance buckets instead of traversing every mesh every frame.
- Graphics quality automatically moves between `low`, `balanced`, and `high` after sustained FPS samples.

For repeatable QA, force a tier with `?quality=low`, `?quality=balanced`, or `?quality=high`. Without that parameter, low-power devices begin on low and other devices begin on balanced. The renderer label in the HUD displays the active tier.

Static environmental GLBs should use Meshopt geometry compression and WebP textures no larger than 1024 px. Before deployment, avoid keeping older hashed `index-*`, `environment-runtime-*`, or `model-runtime-*` files unless an HTML or JavaScript entry point still references them.
