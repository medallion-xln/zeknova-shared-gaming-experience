import * as THREE from '../../assets/vendor/three.module.min.js';
import { NativeRenderer, ReferenceRenderer } from '../../packages/rendering/src/index.js';
import { PresentationController } from '../../packages/neural-rendering/src/PresentationController.js';
import { rocks, heightAt } from './world.js';
import { worldCaptureProvenance } from '../../packages/rendering/src/WorldCaptureProvenance.js';

/** Disposable presentation of immutable world state. No scene object is read by
 * simulation. One renderer/context; optional capture uses that same instance. */
export async function createGameplayScene(canvas, session) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor(0x0d242e); renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(43, 1, .1, 150);
  camera.position.set(20, 24, 28); camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xd2f9ed, 0x193840, 2.6)); const light = new THREE.DirectionalLight(0xffe5ba, 3); light.position.set(4, 12, 6); scene.add(light);
  const terrainGeometry = new THREE.PlaneGeometry(24, 24, 48, 48); terrainGeometry.rotateX(-Math.PI / 2);
  const vertices = terrainGeometry.attributes.position;
  for (let i = 0; i < vertices.count; i++) vertices.setY(i, heightAt(vertices.getX(i), vertices.getZ(i)));
  terrainGeometry.computeVertexNormals();
  const terrain = new THREE.Mesh(terrainGeometry, new THREE.MeshStandardMaterial({ color: 0x315d53, roughness: .95 })); scene.add(terrain);
  const grid = new THREE.GridHelper(24, 24, 0x709e86, 0x477465); grid.position.y = .23; scene.add(grid);
  const pond = new THREE.Mesh(new THREE.PlaneGeometry(4, 8), new THREE.MeshStandardMaterial({ color: 0x348fa0, metalness: .4, roughness: .2 })); pond.rotation.x = -Math.PI / 2; pond.position.set(-10, .3, 8); scene.add(pond);
  for (const r of rocks) { const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r.radius, 0), new THREE.MeshStandardMaterial({ color: 0x678080, roughness: 1 })); rock.position.set(r.x, heightAt(r.x, r.z) + r.radius * .55, r.z); rock.scale.y = .7; scene.add(rock); }
  const player = new THREE.Group(), body = new THREE.Mesh(new THREE.CapsuleGeometry(.35, .65, 4, 8), new THREE.MeshStandardMaterial({ color: 0xffca72, roughness: .45 })); body.position.y = .8; player.add(body);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.55, .045, 6, 30), new THREE.MeshBasicMaterial({ color: 0xffe4a3 })); ring.rotation.x = Math.PI / 2; ring.position.y = .25; player.add(ring); scene.add(player);
  const avatars=new Map();
  const structures = new Map(); let signature = null, lastSnapshot = null;
  const material = new THREE.MeshStandardMaterial({ color: 0xa5e0c6, roughness: .55 }), accent = new THREE.MeshStandardMaterial({ color: 0x37bea7, metalness: .2, roughness: .4 });
  const geometries = { shelter: new THREE.BoxGeometry(1.5, 1.3, 1.5), beacon: new THREE.CylinderGeometry(.25, .5, 2.8, 8), roof: new THREE.ConeGeometry(1.2, .7, 4) };
  function sync() {
    if (session.snapshot() === lastSnapshot) return;
    lastSnapshot = session.snapshot();
    const view=session.inspect(),world=view.world,ownId=view.player?.id??'player',entity=world.entities.find(e=>e.id===ownId);
    player.visible=!!entity;if(entity){const transform=entity.components.transform;player.position.set(transform.x,transform.y,transform.z);}
    const present=new Set();
    for(const peer of(view.players??[])){if(peer.id===ownId)continue;present.add(peer.id);let avatar=avatars.get(peer.id);if(!avatar){avatar=new THREE.Mesh(new THREE.CapsuleGeometry(.35,.65,4,8),new THREE.MeshStandardMaterial({color:0x75c8ff,roughness:.45}));avatars.set(peer.id,avatar);scene.add(avatar);}avatar.position.set(peer.x,peer.y+.8,peer.z);}
    for(const[id,avatar]of avatars){if(!present.has(id)){scene.remove(avatar);avatar.geometry.dispose();avatar.material.dispose();avatars.delete(id);}}
    const nextSignature = JSON.stringify(world.buildings);
    if (signature !== nextSignature) {
      for (const node of structures.values()) scene.remove(node); structures.clear();
      for (const b of world.buildings) {
        const group = new THREE.Group(), mesh = new THREE.Mesh(geometries[b.type], material); mesh.position.y = b.type === 'beacon' ? 1.4 : .65; group.add(mesh);
        if (b.type === 'shelter') { const roof = new THREE.Mesh(geometries.roof, accent); roof.position.y = 1.6; roof.rotation.y = Math.PI / 4; group.add(roof); }
        group.position.set(b.x, b.y, b.z); group.rotation.y = b.rotation; structures.set(b.id, group); scene.add(group);
      }
      signature = nextSignature;
    }
    scene.userData.sceneRevision = world.revision;
  }
  const native = new NativeRenderer({ getRenderer: () => renderer, getScene: () => scene, getCamera: () => camera, id: 'source-world-webgl' }); await native.initialize();
  const reference = new ReferenceRenderer({ sessionId: 'capture-'+crypto.randomUUID(), getInputProvenance: () => { const s=session.snapshot(); return worldCaptureProvenance({worldId:s.worldId,worldRevision:s.revision,playerEntityId:s.player?.id??null,playerRevision:s.player?.revision??null,replicaCursor:session.client?.serverCursor??null,workerGeneration:session.client?.runtimeGeneration??null}); }, getRenderer: () => renderer, getScene: () => scene, getCamera: () => camera, width: 640, height: 360, sceneId: session.snapshot().worldId, sceneRevision: () => session.snapshot().revision, getSimulationTime: () => session.engine.clock.stepNumber / 60 });
  const presentation = new PresentationController(); if (new URLSearchParams(location.search).get('present') === 'neural') presentation.fallback('no inference backend configured');
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  return {
    draw() { sync(); const width = canvas.clientWidth, height = canvas.clientHeight; if (canvas.width !== Math.round(width * renderer.getPixelRatio()) || canvas.height !== Math.round(height * renderer.getPixelRatio())) { renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); } renderer.render(scene, camera); native.present(); },
    point(event) { const rect = canvas.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1); raycaster.setFromCamera(pointer, camera); const point = raycaster.ray.intersectPlane(plane, new THREE.Vector3()); return point ? { x: Math.round(point.x), z: Math.round(point.z) } : null; },
    project(x, z) { const p = new THREE.Vector3(x, heightAt(x, z), z).project(camera), rect = canvas.getBoundingClientRect(); return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2 }; },
    async capture() { sync(); return reference.capture(); },
    status() { return { native: native.status(), reference: reference.status(), presentation: presentation.status(), structures: structures.size,avatars:avatars.size+(player.visible?1:0) }; },
    async dispose() { const geometry = new Set(), materials = new Set(); scene.traverse(node => { if (node.geometry) geometry.add(node.geometry); if (node.material) (Array.isArray(node.material) ? node.material : [node.material]).forEach(m => materials.add(m)); }); Object.values(geometries).forEach(g => geometry.add(g)); materials.add(material); materials.add(accent); geometry.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); await native.dispose(); await reference.dispose(); renderer.dispose(); },
  };
}
