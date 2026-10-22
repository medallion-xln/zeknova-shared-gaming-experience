# Studio design foundation

Studio is at `/examples/studio/` (`npm run dev:studio`, local port 8800). The desktop composition gives the 3D world most of the central area, with a compact hierarchy and inspector, restrained toolbar and a small lower event/proposal area. Dark neutral surfaces, warm selection accents and precise system typography avoid decorative effects. No external font requests occur.

CSS custom properties define background/panel/surface/line/text/muted/accent colors and panel sizes. These are the future theme boundary; a light theme switch is not implemented. Spacing uses compact 4–18px intervals; controls use familiar browser form semantics. Explicit labels, visible keyboard focus, high contrast text, native selects/buttons, a polite nonintrusive status region and reduced-motion defaults support keyboard workflows. Automated coverage is functional rather than a WCAG conformance audit.

Scene and inspector widths are adjustable with pointer separators or arrow keys on focusable separators. Main scene/inspector regions scroll independently. At narrower desktop widths the panel defaults and header spacing shrink. This is a desktop editor; mobile authoring and arbitrary small-window layouts are not certified.

Functional workspaces are World, Simulate and Render. World exposes scene transactions; Simulate exposes separate-engine play/pause/step/reset and runtime component inspection; Render opens real renderer diagnostics. Play opens the runnable independent project. Logic has no misleading empty tab because a visual logic graph does not exist yet. Asset/prefab/system sections show actual procedural/project support and current simulation systems.

Selection is a highlighted hierarchy row and viewport bounding box with red X / blue Z handles. Rotation and scale use numeric controls. Ctrl/Cmd-Z and Ctrl/Cmd-Shift-Z trigger undo/redo outside form fields; Delete removes the selected entity. Simulation consumes movement keys only outside text controls. Browser-native numeric validation plus schema errors appear in the status region; invalid edits retain the prior scene.

The AI panel clearly separates preview from explicit approval and rejection. Wireframe previews have no authoring identity until committed. Timeline filters authoritative local scene/game events versus visualization selection events. These channel labels describe local runtime provenance, not server durability or global multiplayer authority.
