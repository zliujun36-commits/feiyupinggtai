import {parentPort} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
globalThis.self=globalThis;
globalThis.fetch=async(url,{signal}={})=>{const data=await readFile(new URL('../dist/'+url,import.meta.url),{signal});return new Response(data)};
self.postMessage=message=>parentPort.postMessage(message);
await import('../dist/data-worker.js');
parentPort.on('message',data=>self.onmessage({data}));
