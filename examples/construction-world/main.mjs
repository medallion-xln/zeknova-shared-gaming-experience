import { createEngine } from '../../packages/core/src/index.js';
import { installConstruction } from '../../packages/gameplay-construction/src/index.js';

export async function runDemo() {
  const engine = createEngine({ id: 'independent-world', scheduler: 'manual', config: { features: { construction: 'ENGINE', combat: 'LEGACY', missions: 'LEGACY' } } });
  const entity = engine.world.createEntity('builder');
  engine.world.registerComponent('position', p => Number.isFinite(p.x));
  engine.world.addComponent(entity, 'position', { x: 0, z: 0 });
  const options = { definitions: [{ type: 'shelter', radius: 1, cost: { stone: 4 } }], inventory: { stone: 12 }, terrain: { isValid: (_d,x,z) => Math.abs(x) <= 10 && Math.abs(z) <= 10, heightAt: () => 0 } };
  const handle = installConstruction(engine, options);
  await engine.start();
  const commands = [
    { id: 'one', type: 'construction', payload: { commandId: 'one', action: 'place', id: 'shelter-1', type: 'shelter', x: 2, z: 2 } },
    { id: 'blocked', type: 'construction', payload: { commandId: 'blocked', action: 'place', id: 'shelter-2', type: 'shelter', x: 2, z: 2 } },
  ];
  const initial = engine.snapshot();
  commands.forEach(c => engine.commands.enqueue(c)); engine.step(3);
  const saved = JSON.parse(JSON.stringify(engine.snapshot()));
  engine.restore(initial);
  commands.forEach(c => engine.commands.enqueue(c)); engine.step(3);
  const deterministic = JSON.stringify(saved) === JSON.stringify(engine.snapshot());
  engine.restore(saved);
  const result = { deterministic, step: engine.clock.stepNumber, state: handle.construction.snapshot(), rejected: engine.commands.results.get('blocked'), entityCount: engine.world.entityCount };
  await engine.dispose(); return result;
}
if (typeof process !== 'undefined' && process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) console.log(JSON.stringify(await runDemo(), null, 2));
