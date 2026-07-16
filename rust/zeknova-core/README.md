# ZekNova Rust/WASM core

This single-threaded WebAssembly module accelerates hot, deterministic world queries while Three.js remains responsible for rendering.

Build from the project root:

```sh
wasm-pack build rust/zeknova-core --target web --release --out-dir ../../assets/wasm --out-name zeknova_core
```

The checked-in `assets/wasm` output is deployable on ordinary Apache hosting. The game automatically falls back to its JavaScript implementations if WebAssembly cannot load.
