import assert from 'node:assert/strict';
import { diffCatalogs, NotificationService } from '../js/documents/notification-service.js';

const previous=[
  {id:'a',code:'DE-001',title:'Desenho A',revision:'0',approval_status:'Em análise'},
  {id:'b',code:'DE-002',title:'Desenho B',revision:'1',approval_status:'Aprovado'},
  {id:'c',code:'DE-003',title:'Desenho C',revision:'0',approval_status:'Aprovado'}
];
const next=[
  {id:'a',code:'DE-001',title:'Desenho A',revision:'1',approval_status:'Aprovado'},
  {id:'b',code:'DE-002',title:'Desenho B',revision:'1',approval_status:'Aprovado'},
  {id:'d',code:'DE-004',title:'Desenho D',revision:'0',approval_status:'Em análise'}
];
const events=diffCatalogs(previous,next,{packageVersion:'2026.08.25',createdAt:'2026-08-25T15:00:00.000Z'});
assert.equal(events[0].type,'PACKAGE_UPDATED');
assert.deepEqual(events[0].summary,{newCount:1,revisionCount:1,statusCount:1,removedCount:1,totalChanges:4});
assert.equal(events.filter(item=>item.type==='NEW_DOCUMENT').length,1);
assert.equal(events.filter(item=>item.type==='REVISION_UPDATED').length,1);
assert.equal(events.filter(item=>item.type==='STATUS_CHANGED').length,1);
assert.equal(events.filter(item=>item.type==='DOCUMENT_REMOVED').length,1);
assert.equal(events.find(item=>item.type==='REVISION_UPDATED').documentId,'a');

// Código PW pode se repetir quando o Sistema é diferente. Mesmo no fallback de
// catálogos legados sem ID, a comparação não pode fundir AMV e PARA-CHOQUE.
const repeatedPrevious=[
  {code:'FT-17.95.99.XX-630-1201',system_id:'amv',title:'Teste',revision:'0',approval_status:'Aprovado'},
  {code:'FT-17.95.99.XX-630-1201',system_id:'para-choque',title:'Teste',revision:'0',approval_status:'Aprovado'}
];
const repeatedNext=[
  {code:'FT-17.95.99.XX-630-1201',system_id:'amv',title:'Teste',revision:'A1',approval_status:'Aprovado'},
  {code:'FT-17.95.99.XX-630-1201',system_id:'para-choque',title:'Teste',revision:'0',approval_status:'Aprovado'}
];
const repeatedEvents=diffCatalogs(repeatedPrevious,repeatedNext,{packageVersion:'2026.08.26',createdAt:'2026-08-26T15:00:00.000Z'});
assert.deepEqual(repeatedEvents[0].summary,{newCount:0,revisionCount:1,statusCount:0,removedCount:0,totalChanges:1});
assert.equal(repeatedEvents.filter(item=>item.type==='REVISION_UPDATED').length,1);

const map=new Map();
let dispatched=0;
globalThis.localStorage={getItem:key=>map.has(key)?map.get(key):null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key)};
globalThis.dispatchEvent=()=>{dispatched++;return true};
if(typeof globalThis.CustomEvent==='undefined')globalThis.CustomEvent=class CustomEvent{constructor(type){this.type=type}};
const service=new NotificationService();
service.append(events);
assert.equal(service.list().length,5);
assert.equal(service.unreadCount('user-1'),5);
const beforeReadDispatches=dispatched;
service.markAllRead('user-1');
assert.equal(service.unreadCount('user-1'),0);
assert.equal(dispatched,beforeReadDispatches,'marcar como lidas não pode redisparar o evento que renderiza o painel');
service.append(events);
assert.equal(service.list().length,5,'IDs de eventos devem impedir notificações duplicadas do mesmo pacote');
console.log('notifications.test.mjs: ok');
