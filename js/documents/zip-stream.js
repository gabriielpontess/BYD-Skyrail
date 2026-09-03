import { Inflate } from 'fflate';
import { Sha256Stream } from './sha256-stream.js';

const u16=(view,offset)=>view.getUint16(offset,true);
const u32=(view,offset)=>view.getUint32(offset,true);
const textDecoder=new TextDecoder('utf-8',{fatal:false});

function throwIfAborted(signal){
  if(!signal?.aborted)return;
  const error=new Error('Operação cancelada pelo usuário.');error.name='AbortError';throw error;
}

function u64(view,offset){
  const lo=BigInt(u32(view,offset)),hi=BigInt(u32(view,offset+4));
  const value=(hi<<32n)|lo;
  if(value>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('ZIP possui tamanho acima do limite seguro deste navegador.');
  return Number(value);
}

export function normalizeZipPath(value){
  let path=String(value??'').replace(/\\/g,'/');
  while(path.startsWith('./'))path=path.slice(2);
  if(path.includes('\0')||path.startsWith('/')||/^[A-Za-z]:\//.test(path))throw new Error(`ZIP contém caminho inseguro: ${value}`);
  const parts=path.split('/');
  if(parts.some(part=>part==='.'||part==='..'))throw new Error(`ZIP contém caminho inseguro: ${value}`);
  return path;
}

function decodeName(bytes){try{return textDecoder.decode(bytes)}catch{return String.fromCharCode(...bytes)}}

function zip64Values(extra,{compressedSize,originalSize,localOffset}){
  let offset=0,compressed=compressedSize,original=originalSize,local=localOffset;
  const view=new DataView(extra.buffer,extra.byteOffset,extra.byteLength);
  while(offset+4<=extra.length){
    const id=u16(view,offset),size=u16(view,offset+2),start=offset+4,end=start+size;
    if(end>extra.length)break;
    if(id===0x0001){
      let pos=start;
      if(original===0xffffffff&&pos+8<=end){original=u64(view,pos);pos+=8}
      if(compressed===0xffffffff&&pos+8<=end){compressed=u64(view,pos);pos+=8}
      if(local===0xffffffff&&pos+8<=end){local=u64(view,pos);pos+=8}
      break;
    }
    offset=end;
  }
  return{compressedSize:compressed,originalSize:original,localOffset:local};
}

export async function readZipDirectory(file,onProgress,signal){
  if(!(file instanceof File)||!/\.zip$/i.test(file.name))throw new Error('Selecione um pacote .zip válido.');
  throwIfAborted(signal);
  const tailSize=Math.min(file.size,22+65535+20);
  const tailStart=file.size-tailSize;
  const tail=new Uint8Array(await file.slice(tailStart).arrayBuffer());
  const tailView=new DataView(tail.buffer,tail.byteOffset,tail.byteLength);
  let eocd=-1;
  for(let i=tail.length-22;i>=0;i--){if(u32(tailView,i)===0x06054b50){eocd=i;break}}
  if(eocd<0)throw new Error('Não encontrei o diretório central do ZIP. O arquivo pode estar corrompido.');
  const entryCount=u16(tailView,eocd+10),centralSize=u32(tailView,eocd+12),centralOffset=u32(tailView,eocd+16);
  if(entryCount===0xffff||centralSize===0xffffffff||centralOffset===0xffffffff)throw new Error('ZIP64 não é suportado nesta versão do importador web.');
  if(centralOffset+centralSize>file.size)throw new Error('Diretório central do ZIP está fora dos limites do arquivo.');
  throwIfAborted(signal);
  const central=new Uint8Array(await file.slice(centralOffset,centralOffset+centralSize).arrayBuffer());
  const view=new DataView(central.buffer,central.byteOffset,central.byteLength);
  const entries=[];let offset=0;
  for(let index=0;index<entryCount;index++){
    throwIfAborted(signal);
    if(offset+46>central.length||u32(view,offset)!==0x02014b50)throw new Error(`ZIP inválido próximo da entrada ${index+1}.`);
    const flags=u16(view,offset+8),compression=u16(view,offset+10);
    let compressedSize=u32(view,offset+20),originalSize=u32(view,offset+24),localOffset=u32(view,offset+42);
    const nameLength=u16(view,offset+28),extraLength=u16(view,offset+30),commentLength=u16(view,offset+32);
    const nameStart=offset+46,nameEnd=nameStart+nameLength,extraEnd=nameEnd+extraLength;
    if(extraEnd+commentLength>central.length)throw new Error(`ZIP inválido na entrada ${index+1}.`);
    const path=normalizeZipPath(decodeName(central.subarray(nameStart,nameEnd)));
    if(compressedSize===0xffffffff||originalSize===0xffffffff||localOffset===0xffffffff){
      ({compressedSize,originalSize,localOffset}=zip64Values(central.subarray(nameEnd,extraEnd),{compressedSize,originalSize,localOffset}));
    }
    entries.push({path,fileName:path.split('/').pop()||'',compressedSize,originalSize,compression,flags,localOffset,directory:path.endsWith('/')});
    offset=extraEnd+commentLength;
    if(index%100===0||index+1===entryCount)onProgress?.({phase:'scan',done:index+1,total:entryCount});
  }
  return entries;
}

export async function localDataBounds(file,item){
  const header=new Uint8Array(await file.slice(item.localOffset,item.localOffset+30).arrayBuffer());
  if(header.length<30)throw new Error(`Cabeçalho local incompleto para ${item.fileName||item.path}.`);
  const view=new DataView(header.buffer,header.byteOffset,header.byteLength);
  if(u32(view,0)!==0x04034b50)throw new Error(`Cabeçalho local inválido para ${item.fileName||item.path}.`);
  const nameLength=u16(view,26),extraLength=u16(view,28);
  const start=item.localOffset+30+nameLength+extraLength,end=start+Number(item.compressedSize||0);
  if(start<0||end>file.size||end<start)throw new Error(`Dados fora dos limites do ZIP para ${item.fileName||item.path}.`);
  return{start,end};
}

export async function streamZipEntry(file,item,{write=()=>{},drain=async()=>{},signal,maxOutputBytes=Number.POSITIVE_INFINITY,hash=false,onCompressedChunk}={}){
  throwIfAborted(signal);
  if(item.directory)throw new Error(`A entrada ${item.path} é um diretório.`);
  if(item.flags&1)throw new Error(`A entrada ${item.path} está criptografada e não pode ser importada.`);
  if(item.compression!==0&&item.compression!==8)throw new Error(`Método de compressão ${item.compression} não suportado em ${item.fileName||item.path}.`);
  const {start,end}=await localDataBounds(file,item);
  const reader=file.slice(start,end).stream().getReader();
  const hasher=hash?new Sha256Stream():null;
  let compressedBytes=0,outputBytes=0,finished=item.compression===0,outputFailure=null;
  const emit=data=>{
    try{
      if(!data?.length)return;
      outputBytes+=data.length;
      if(outputBytes>maxOutputBytes)throw new Error(`Entrada ${item.fileName||item.path} excede o limite seguro de tamanho.`);
      hasher?.update(data);write(data);
    }catch(error){outputFailure=error}
  };
  try{
    if(item.compression===0){
      while(true){
        throwIfAborted(signal);
        const {value,done}=await reader.read();if(done)break;
        const chunk=value||new Uint8Array();compressedBytes+=chunk.length;emit(chunk);if(outputFailure)throw outputFailure;onCompressedChunk?.(chunk.length);await drain();
      }
    }else{
      const inflater=new Inflate();
      inflater.ondata=(data,final)=>{emit(data||new Uint8Array());if(final)finished=true};
      while(true){
        throwIfAborted(signal);
        const {value,done}=await reader.read();if(done)break;
        const chunk=value||new Uint8Array();compressedBytes+=chunk.length;inflater.push(chunk,false);if(outputFailure)throw outputFailure;onCompressedChunk?.(chunk.length);await drain();
      }
      inflater.push(new Uint8Array(),true);if(outputFailure)throw outputFailure;await drain();
    }
    if(compressedBytes!==Number(item.compressedSize||0))throw new Error(`Leitura incompleta de ${item.fileName||item.path}: ${compressedBytes} de ${item.compressedSize} bytes.`);
    if(!finished)throw new Error(`Descompressão não finalizada para ${item.fileName||item.path}.`);
    if(Number.isFinite(item.originalSize)&&item.originalSize>=0&&outputBytes!==Number(item.originalSize))throw new Error(`Tamanho descompactado divergente em ${item.fileName||item.path}.`);
    return{compressedBytes,outputBytes,sha256:hasher?.hex()||null};
  }finally{try{await reader.cancel()}catch{}}
}

export async function readZipEntryBytes(file,item,{signal,maxBytes=16*1024*1024}={}){
  const chunks=[];let total=0;
  const result=await streamZipEntry(file,item,{signal,maxOutputBytes:maxBytes,write:data=>{const copy=data.slice();chunks.push(copy);total+=copy.length}});
  const out=new Uint8Array(total);let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length}
  return{bytes:out,outputBytes:result.outputBytes};
}

export async function readZipEntryText(file,item,options={}){
  const {bytes}=await readZipEntryBytes(file,item,options);
  let value=textDecoder.decode(bytes);if(value.startsWith('\uFEFF'))value=value.slice(1);
  return value;
}

export { throwIfAborted };
