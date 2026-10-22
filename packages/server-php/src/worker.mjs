import { WorldEvaluator } from '../runtime/evaluator.mjs';
let text='';for await(const part of process.stdin)text+=part;
const input=JSON.parse(text),evaluator=new WorldEvaluator(input.worldId);
try{console.log(JSON.stringify(await evaluator.evaluate(input)));}finally{evaluator.dispose();}
