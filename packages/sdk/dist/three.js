// packages/sdk/src/schema.js
var SDKError = class extends Error {
  constructor(code, message, path = null) {
    super(message);
    this.name = "SDKError";
    this.code = code;
    this.path = path;
  }
};
var field = (type, label, extra = {}) => ({ type, label, ...extra });
var builtinDefinitions = {
  transform: { schema: "zge.component.v1", label: "Transform", fields: { position: field("vector", "Position"), rotation: field("vector", "Rotation (radians)"), scale: field("vector", "Scale", { min: 1e-5 }) } },
  mesh: { schema: "zge.component.v1", label: "Primitive", fields: { primitive: field("enum", "Shape", { values: ["box", "sphere", "cylinder"] }), color: field("string", "Color", { maxLength: 7 }) } },
  collider: { schema: "zge.component.v1", label: "Box collider", fields: { halfSize: field("vector", "Half size", { min: 1e-5 }) } },
  state: { schema: "zge.component.v1", label: "Project state", fields: {} },
  asset: { schema: "zge.component.v1", label: "Asset reference", fields: { id: field("asset", "Asset") } },
  editor: { schema: "zge.component.v1", label: "Hierarchy", fields: { parent: field("entity", "Parent", { nullable: true }), hidden: field("boolean", "Hidden"), locked: field("boolean", "Locked"), group: field("string", "Group", { maxLength: 100 }) } }
};

// packages/sdk/src/model.js
var check = (ok, message) => {
  if (!ok) throw new SDKError("MODEL_FORMAT", message);
};
function validateModel(data) {
  check(data?.schema === "zge.static-model.v1" && data.sourceFormat === "glb2" && Number.isSafeInteger(data.sourceBytes) && data.sourceBytes >= 28 && data.sourceBytes <= 524288 && Array.isArray(data.dependencies) && data.dependencies.length === 0 && (!data.sourceSha256 || /^[a-f0-9]{64}$/.test(data.sourceSha256)) && Array.isArray(data.parts) && data.parts.length > 0 && data.parts.length <= 64, "Invalid static model");
  let vertices = 0;
  for (const p of data.parts) {
    check(Array.isArray(p.positions) && p.positions.length > 0 && p.positions.length % 3 === 0 && p.positions.every((n) => Number.isFinite(n) && Math.abs(n) <= 1e5), "Invalid positions");
    vertices += p.positions.length / 3;
    check(vertices <= 3e4, "30,000 vertex limit");
    check(p.normals === null || Array.isArray(p.normals) && p.normals.length === p.positions.length && p.normals.every(Number.isFinite), "Invalid normals");
    check(p.indices === null ? p.positions.length % 9 === 0 : Array.isArray(p.indices) && p.indices.length <= 9e4 && p.indices.length % 3 === 0 && p.indices.every((n) => Number.isSafeInteger(n) && n >= 0 && n < p.positions.length / 3), "Invalid indices");
    check(Array.isArray(p.color) && p.color.length === 3 && p.color.every((n) => Number.isFinite(n) && n >= 0 && n <= 1) && typeof p.doubleSided === "boolean", "Invalid color");
  }
  check(data.vertices === vertices && data.triangles === data.parts.reduce((n, p) => n + (p.indices?.length ?? p.positions.length / 3) / 3, 0), "Geometry summary mismatch");
  return data;
}

// packages/sdk/src/three.js
async function createViewport({ three: THREE, controls = {}, canvas, renderer = "auto", onSelect = () => {
}, onPreview = () => {
}, onCommit = () => {
}, onError = () => {
} }) {
  if (!THREE?.WebGPURenderer) throw Error("shared Three WebGPURenderer namespace required");
  let gpu, backend, fallback = null;
  try {
    if (renderer === "webgl" || !navigator.gpu) throw Error(renderer === "webgl" ? "explicit WebGL" : "WebGPU unavailable");
    gpu = new THREE.WebGPURenderer({ canvas, antialias: true });
    await gpu.init();
    backend = gpu.backend.isWebGPUBackend ? "webgpu" : "webgl";
  } catch (error) {
    gpu?.dispose();
    fallback = String(error.message);
    gpu = new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL: true });
    await gpu.init();
    backend = "webgl";
  }
  gpu.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  gpu.setClearColor(1514274);
  const scene = new THREE.Scene(), perspective = new THREE.PerspectiveCamera(42, 1, 0.1, 500), orthographic = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 500);
  let camera = perspective;
  camera.position.set(13, 16, 19);
  camera.lookAt(0, 0, 0);
  const grid = new THREE.GridHelper(40, 40, 5399160, 3160648);
  grid.position.y = 0.01;
  scene.add(grid);
  const geo = { box: new THREE.BoxGeometry(), sphere: new THREE.SphereGeometry(0.5, 16, 12), cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 16) }, meshes = /* @__PURE__ */ new Map(), models = /* @__PURE__ */ new Map(), ghosts = new THREE.Group();
  scene.add(ghosts);
  const highlight = new THREE.BoxHelper(void 0, 15910509), hover = new THREE.BoxHelper(void 0, 10467023);
  scene.add(highlight, hover);
  highlight.visible = hover.visible = false;
  const gizmo = controls.TransformControls ? new controls.TransformControls(camera, canvas) : null, helper = gizmo?.getHelper();
  if (helper) scene.add(helper);
  const orbit = controls.OrbitControls ? new controls.OrbitControls(camera, canvas) : null;
  if (orbit) {
    orbit.enableDamping = false;
    orbit.target.set(0, 0, 0);
    orbit.minDistance = 2;
    orbit.maxDistance = 120;
    orbit.update();
  }
  let selected = null, entities = [], disposed = false, drag = null, canceled = false, pointerStart = null;
  const ray = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const settings = { mode: "translate", space: "world", translationSnap: null, rotationSnap: null, scaleSnap: null };
  function previewDiff(diff) {
    for (const item of [...ghosts.children]) {
      ghosts.remove(item);
      item.material.dispose();
    }
    if (!diff) return;
    for (const [list, color] of [[diff.add, 9362359], [diff.remove, 16025215], [diff.change.map((c) => c.after), 15056761]]) for (const e of list) {
      const t = e.components.transform, m = e.components.mesh;
      if (!t || !m) continue;
      const ghost = new THREE.Mesh(geo[m.primitive], new THREE.MeshBasicMaterial({ color, wireframe: true, depthTest: false, transparent: true, opacity: 0.8 }));
      ghost.position.fromArray(t.position);
      ghost.rotation.fromArray(t.rotation);
      ghost.scale.fromArray(t.scale);
      ghost.renderOrder = 12;
      ghosts.add(ghost);
    }
  }
  const objectTransform = (o) => ({ position: o.position.toArray(), rotation: [o.rotation.x, o.rotation.y, o.rotation.z], scale: o.scale.toArray() });
  const dragging = (e) => {
    if (orbit) orbit.enabled = !e.value;
  };
  const begin = () => {
    if (!selected) return;
    drag = { id: selected, original: structuredClone(entities.find((e) => e.id === selected)?.components.transform) };
    canceled = false;
  };
  const change = () => {
    if (!drag) return;
    const object = meshes.get(drag.id);
    if (canceled) {
      if (object) {
        object.position.fromArray(drag.original.position);
        object.rotation.fromArray(drag.original.rotation);
        object.scale.fromArray(drag.original.scale);
      }
      return;
    }
    if (object) {
      onPreview(drag.id, objectTransform(object));
      highlight.setFromObject(object);
    }
  };
  const end = () => {
    if (!drag) return;
    const done = drag;
    drag = null;
    if (!canceled) {
      try {
        onCommit(done.id, objectTransform(meshes.get(done.id)));
      } catch (error) {
        onError(error);
      }
    }
    onPreview(null, null);
    canceled = false;
  };
  gizmo?.addEventListener("dragging-changed", dragging);
  gizmo?.addEventListener("mouseDown", begin);
  gizmo?.addEventListener("objectChange", change);
  gizmo?.addEventListener("mouseUp", end);
  function cancel() {
    if (!drag) return;
    canceled = true;
    gizmo?.reset();
    const object = meshes.get(drag.id);
    if (object && drag.original) {
      object.position.fromArray(drag.original.position);
      object.rotation.fromArray(drag.original.rotation);
      object.scale.fromArray(drag.original.scale);
    }
    onPreview(null, null);
    highlight.setFromObject(object);
  }
  function cast(e) {
    resize();
    const r = canvas.getBoundingClientRect();
    pointer.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(pointer, camera);
  }
  function visible(o) {
    for (let p = o; p; p = p.parent) if (!p.visible || p.userData.locked) return false;
    return true;
  }
  function pick(e) {
    cast(e);
    const hit = ray.intersectObjects([...meshes.values()], true).find((h) => visible(h.object));
    if (!hit) return null;
    let object = hit.object;
    while (object && !object.userData.id) object = object.parent;
    return object;
  }
  const down = (e) => {
    if (e.button === 0) pointerStart = { x: e.clientX, y: e.clientY, wasGizmo: !!gizmo?.axis };
  };
  const up = (e) => {
    const start = pointerStart;
    pointerStart = null;
    if (!start || e.button !== 0 || start.wasGizmo || drag || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4) return;
    const hit = pick(e);
    onSelect(hit?.userData.id ?? null, { additive: e.metaKey || e.ctrlKey || e.shiftKey });
  };
  const move = (e) => {
    if (drag || gizmo?.axis || e.buttons) {
      hover.visible = false;
      return;
    }
    const object = pick(e);
    hover.visible = !!object && object.userData.id !== selected;
    if (hover.visible) hover.setFromObject(object);
    canvas.style.cursor = gizmo?.axis ? "move" : object ? "pointer" : "default";
  };
  const key = (e) => {
    if (e.key === "Escape") cancel();
  };
  for (const [event, fn] of [["pointerdown", down], ["pointerup", up], ["pointermove", move], ["pointercancel", cancel], ["keydown", key]]) canvas.addEventListener(event, fn);
  function sync(data, selection = selected, preview = null) {
    entities = data;
    selected = selection;
    const seen = /* @__PURE__ */ new Set();
    for (const e of data) {
      const t = e.components.transform, m = e.components.mesh;
      if (!t) continue;
      seen.add(e.id);
      let object2 = meshes.get(e.id);
      if (object2 && (object2.userData.primitive !== m?.primitive || object2.userData.asset !== e.components.asset?.id)) {
        object2.removeFromParent();
        if (object2.userData.primitive) object2.material?.dispose();
        meshes.delete(e.id);
        object2 = null;
      }
      if (!object2) {
        object2 = m ? new THREE.Mesh(geo[m.primitive], new THREE.MeshBasicMaterial({ color: m.color })) : models.get(e.components.asset?.id)?.clone(true) ?? new THREE.Group();
        object2.userData = { id: e.id, primitive: m?.primitive, asset: e.components.asset?.id };
        meshes.set(e.id, object2);
        scene.add(object2);
      }
      const value = e.id === selection && preview ? preview : t;
      if (!drag || drag.id !== e.id) {
        object2.position.fromArray(value.position);
        object2.rotation.fromArray(value.rotation);
        object2.scale.fromArray(value.scale);
      }
      if (m) object2.material.color.set(m.color);
      object2.visible = !e.components.editor?.hidden;
      object2.userData.locked = !!e.components.editor?.locked;
    }
    for (const [id, object2] of meshes) if (!seen.has(id)) {
      gizmo?.object === object2 && gizmo.detach();
      object2.removeFromParent();
      if (object2.userData.primitive) object2.material?.dispose();
      meshes.delete(id);
    }
    for (const e of data) {
      const o = meshes.get(e.id);
      if (!o) continue;
      const parent = meshes.get(e.components.editor?.parent) ?? scene;
      if (o.parent !== parent) parent.add(o);
    }
    scene.updateMatrixWorld(true);
    const object = meshes.get(selection);
    highlight.visible = !!object && visible(object);
    if (object && visible(object)) {
      highlight.setFromObject(object);
      if (gizmo?.object !== object) gizmo?.attach(object);
    } else gizmo?.detach();
  }
  function setModelAssets(assets = []) {
    for (const [id, object] of meshes) if (object.userData.asset) {
      if (gizmo?.object === object) gizmo.detach();
      object.removeFromParent();
      meshes.delete(id);
    }
    for (const template of models.values()) template.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
    models.clear();
    for (const asset of assets) {
      if (asset.type !== "static-model") continue;
      validateModel(asset.data);
      const group = new THREE.Group();
      for (const part of asset.data.parts) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(part.positions, 3));
        if (part.indices) geometry.setIndex(part.indices);
        if (part.normals) geometry.setAttribute("normal", new THREE.Float32BufferAttribute(part.normals, 3));
        else geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(...part.color), side: part.doubleSided ? THREE.DoubleSide : THREE.FrontSide });
        group.add(new THREE.Mesh(geometry, material));
      }
      models.set(asset.id, group);
    }
  }
  function resize() {
    const r = canvas.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    gpu.setSize(r.width, r.height, false);
    perspective.aspect = r.width / r.height;
    perspective.updateProjectionMatrix();
    const size = 10;
    orthographic.left = -size * r.width / r.height;
    orthographic.right = size * r.width / r.height;
    orthographic.top = size;
    orthographic.bottom = -size;
    orthographic.updateProjectionMatrix();
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
  }
  function render() {
    if (disposed) return;
    resize();
    orbit?.update();
    gpu.render(scene, camera);
  }
  function project(point) {
    resize();
    const v = new THREE.Vector3(...point).project(camera), r = canvas.getBoundingClientRect();
    return { x: r.left + (v.x + 1) * r.width / 2, y: r.top + (1 - v.y) * r.height / 2 };
  }
  function focus() {
    const object = meshes.get(selected);
    if (!object) return;
    const target = object.getWorldPosition(new THREE.Vector3()), offset = camera.position.clone().sub(orbit?.target ?? new THREE.Vector3()).normalize().multiplyScalar(6);
    camera.position.copy(target).add(offset);
    if (orbit) orbit.target.copy(target);
    camera.lookAt(target);
    orbit?.update();
  }
  function resetView() {
    camera.position.set(13, 16, 19);
    camera.zoom = 1;
    orbit?.target.set(0, 0, 0);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    orbit?.update();
  }
  function projection(value) {
    cancel();
    const old = camera;
    camera = value === "orthographic" ? orthographic : perspective;
    camera.position.copy(old.position);
    camera.quaternion.copy(old.quaternion);
    if (orbit) {
      orbit.object = camera;
      orbit.update();
    }
    if (gizmo) gizmo.camera = camera;
    resize();
  }
  function configure(values = {}) {
    Object.assign(settings, values);
    if (!["translate", "rotate", "scale"].includes(settings.mode) || !["world", "local"].includes(settings.space)) throw Error("Invalid transform mode");
    gizmo?.setMode(settings.mode);
    gizmo?.setSpace(settings.space);
    for (const [key2, method] of [["translationSnap", "setTranslationSnap"], ["rotationSnap", "setRotationSnap"], ["scaleSnap", "setScaleSnap"]]) {
      const n = settings[key2];
      if (n !== null && (!Number.isFinite(n) || n <= 0)) throw Error("Positive snap increment required");
      gizmo?.[method](n);
    }
    if (values.grid !== void 0) grid.visible = !!values.grid;
  }
  return {
    sync,
    render,
    setModelAssets,
    previewDiff,
    backend,
    fallback,
    project,
    focus,
    resetView,
    projection,
    configure,
    cancel,
    cameraState() {
      return { position: camera.position.toArray(), target: orbit?.target.toArray(), projection: camera === orthographic ? "orthographic" : "perspective", zoom: camera.zoom };
    },
    entityPoint(id) {
      const o = meshes.get(id);
      return o ? project(o.getWorldPosition(new THREE.Vector3()).toArray()) : null;
    },
    handlePoint(axis) {
      if (!gizmo?.object) return null;
      render();
      const name = axis.toUpperCase(), root = gizmo._gizmo?.gizmo?.[settings.mode], picker = gizmo._gizmo?.picker?.[settings.mode];
      const points = [];
      root?.traverse((o) => {
        if (o.isMesh && o.name === name && o.visible) {
          const vertices = o.geometry.getAttribute("position");
          for (let i = 0; i < vertices.count; i += Math.max(1, Math.floor(vertices.count / 80))) points.push(new THREE.Vector3().fromBufferAttribute(vertices, i).applyMatrix4(o.matrixWorld));
        }
      });
      const r = canvas.getBoundingClientRect();
      for (const p of points) {
        const screen = project(p.toArray());
        if (screen.x < r.left || screen.x > r.right || screen.y < r.top || screen.y > r.bottom) continue;
        pointer.set((screen.x - r.left) / r.width * 2 - 1, -(screen.y - r.top) / r.height * 2 + 1);
        ray.setFromCamera(pointer, camera);
        const hit = ray.intersectObject(picker, true).find((h) => h.object.visible);
        if (hit?.object.name === name) return screen;
      }
      return null;
    },
    metrics() {
      return { backend, objects: meshes.size, geometries: gpu.info.memory.geometries, drawCalls: gpu.info.render.drawCalls ?? gpu.info.render.calls, controls: !!gizmo, dragging: !!drag, modelAssets: models.size };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      previewDiff(null);
      gizmo?.removeEventListener("dragging-changed", dragging);
      gizmo?.removeEventListener("mouseDown", begin);
      gizmo?.removeEventListener("objectChange", change);
      gizmo?.removeEventListener("mouseUp", end);
      gizmo?.dispose();
      orbit?.dispose();
      for (const [event, fn] of [["pointerdown", down], ["pointerup", up], ["pointermove", move], ["pointercancel", cancel], ["keydown", key]]) canvas.removeEventListener(event, fn);
      for (const m of meshes.values()) if (m.userData.primitive) m.material?.dispose();
      meshes.clear();
      setModelAssets([]);
      for (const g of Object.values(geo)) g.dispose();
      for (const h of [highlight, hover, grid]) {
        h.geometry.dispose();
        h.material.dispose();
      }
      gpu.dispose();
    }
  };
}
export {
  createViewport
};
