use std::cell::RefCell;
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

const ROCK_CELL_SIZE: f32 = 8.0;

#[derive(Default)]
struct TerrainCore {
    heights: Vec<f32>,
    grid_size: usize,
    world_size: f32,
    rocks: Vec<[f32; 3]>,
    rock_cells: HashMap<(i32, i32), Vec<usize>>,
}

thread_local! {
    static CORE: RefCell<TerrainCore> = RefCell::new(TerrainCore::default());
}

fn cell(value: f32) -> i32 {
    (value / ROCK_CELL_SIZE).floor() as i32
}

#[wasm_bindgen]
pub fn set_height_grid(values: &[f32], grid_size: usize, world_size: f32) -> bool {
    if grid_size < 2 || values.len() != grid_size * grid_size || world_size <= 0.0 {
        return false;
    }
    CORE.with(|core| {
        let mut core = core.borrow_mut();
        core.heights.clear();
        core.heights.extend_from_slice(values);
        core.grid_size = grid_size;
        core.world_size = world_size;
    });
    true
}

#[wasm_bindgen]
pub fn sample_height(x: f32, z: f32) -> f32 {
    CORE.with(|core| {
        let core = core.borrow();
        let size = core.grid_size;
        if size < 2 || core.heights.len() != size * size {
            return f32::NAN;
        }

        let half = core.world_size * 0.5;
        let step = core.world_size / (size - 1) as f32;
        let gx = ((x + half) / step).clamp(0.0, (size - 1) as f32);
        let gz = ((z + half) / step).clamp(0.0, (size - 1) as f32);
        let x0 = gx.floor() as usize;
        let z0 = gz.floor() as usize;
        let x1 = (x0 + 1).min(size - 1);
        let z1 = (z0 + 1).min(size - 1);
        let tx = gx - x0 as f32;
        let tz = gz - z0 as f32;

        let h00 = core.heights[z0 * size + x0];
        let h10 = core.heights[z0 * size + x1];
        let h01 = core.heights[z1 * size + x0];
        let h11 = core.heights[z1 * size + x1];
        let near = h00 + (h10 - h00) * tx;
        let far = h01 + (h11 - h01) * tx;
        near + (far - near) * tz
    })
}

#[wasm_bindgen]
pub fn set_rock_obstacles(values: &[f32]) -> usize {
    if values.len() % 3 != 0 {
        return 0;
    }
    CORE.with(|core| {
        let mut core = core.borrow_mut();
        core.rocks.clear();
        core.rock_cells.clear();
        for chunk in values.chunks_exact(3) {
            let index = core.rocks.len();
            core.rocks.push([chunk[0], chunk[1], chunk[2].max(0.0)]);
            core.rock_cells.entry((cell(chunk[0]), cell(chunk[1]))).or_default().push(index);
        }
        core.rocks.len()
    })
}

#[wasm_bindgen]
pub fn rock_obstacle_at(x: f32, z: f32, radius: f32) -> bool {
    CORE.with(|core| {
        let core = core.borrow();
        let extra = radius.max(0.0);
        let reach = ((extra + 3.0) / ROCK_CELL_SIZE).ceil() as i32;
        let cx = cell(x);
        let cz = cell(z);
        for dz in -reach..=reach {
            for dx in -reach..=reach {
                let Some(indices) = core.rock_cells.get(&(cx + dx, cz + dz)) else { continue };
                for index in indices {
                    let [rx, rz, rock_radius] = core.rocks[*index];
                    let limit = rock_radius + extra;
                    let ox = rx - x;
                    let oz = rz - z;
                    if ox * ox + oz * oz < limit * limit {
                        return true;
                    }
                }
            }
        }
        false
    })
}

#[wasm_bindgen]
pub fn core_version() -> String {
    "zeknova-rust-core-0.1.0".to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bilinear_height_sampling_matches_grid() {
        assert!(set_height_grid(&[0.0, 10.0, 20.0, 30.0], 2, 2.0));
        assert!((sample_height(0.0, 0.0) - 15.0).abs() < 0.0001);
        assert!((sample_height(-1.0, -1.0) - 0.0).abs() < 0.0001);
    }

    #[test]
    fn rock_grid_detects_and_replaces_obstacles() {
        assert_eq!(set_rock_obstacles(&[2.0, 3.0, 1.0, 20.0, 20.0, 2.0]), 2);
        assert!(rock_obstacle_at(2.5, 3.0, 0.5));
        assert!(!rock_obstacle_at(8.0, 8.0, 0.5));
        assert_eq!(set_rock_obstacles(&[]), 0);
        assert!(!rock_obstacle_at(2.0, 3.0, 0.5));
    }
}
