import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script=fileURLToPath(new URL('./browser-smoke.mjs',import.meta.url));
const retryable=/Chrome abriu, mas o endpoint de depuração não ficou disponível/;

async function run(attempt){
  return new Promise(resolve=>{
    const child=spawn(process.execPath,[script],{stdio:['ignore','pipe','pipe']});
    let output='';
    child.stdout.on('data',chunk=>{const text=String(chunk);output+=text;process.stdout.write(text)});
    child.stderr.on('data',chunk=>{const text=String(chunk);output+=text;process.stderr.write(text)});
    child.once('exit',(code,signal)=>resolve({code:code??1,signal,output,attempt}));
  });
}

let result=await run(1);
if(result.code!==0&&retryable.test(result.output)){
  console.warn('[browser-smoke] Chrome não expôs o debugger na primeira inicialização; repetindo uma única vez com novo perfil/porta.');
  result=await run(2);
}
if(result.code!==0){
  console.error(`[browser-smoke] falhou na tentativa ${result.attempt}${result.signal?` (signal ${result.signal})`:''}.`);
  process.exit(result.code||1);
}
