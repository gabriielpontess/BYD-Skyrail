import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const smoke=fileURLToPath(new URL('./browser-smoke.mjs',import.meta.url));
const systemicRaces=fileURLToPath(new URL('./browser-systemic-races.mjs',import.meta.url));
const finalGates=fileURLToPath(new URL('./browser-final-gates.mjs',import.meta.url));
const retryable=/Chrome abriu, mas o endpoint de depuração não ficou disponível|Debugger do Chrome indisponível/;

async function run(script,attempt,label){
  return new Promise(resolve=>{
    const child=spawn(process.execPath,[script],{stdio:['ignore','pipe','pipe']});
    let output='';
    child.stdout.on('data',chunk=>{const text=String(chunk);output+=text;process.stdout.write(text)});
    child.stderr.on('data',chunk=>{const text=String(chunk);output+=text;process.stderr.write(text)});
    child.once('exit',(code,signal)=>resolve({code:code??1,signal,output,attempt,label}));
  });
}

async function runWithRetry(script,label){
  let result=await run(script,1,label);
  if(result.code!==0&&retryable.test(result.output)){
    console.warn(`[${label}] Chrome não expôs o debugger na primeira inicialização; repetindo uma única vez.`);
    result=await run(script,2,label);
  }
  if(result.code!==0){
    console.error(`[${label}] falhou na tentativa ${result.attempt}${result.signal?` (signal ${result.signal})`:''}.`);
    process.exit(result.code||1);
  }
}

await runWithRetry(smoke,'browser-smoke');
await runWithRetry(systemicRaces,'browser-systemic-races');
await runWithRetry(finalGates,'browser-final-gates');
