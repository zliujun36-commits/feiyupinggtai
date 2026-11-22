// Road graph columns are delta/byte-plane encoded before gzip. Decoding restores FYR2 byte for byte.
const headerSize = 12;
const rawMagic = 0x46595232, packedMagic = 0x46595031;
function layout(buffer) {
  const head = new DataView(buffer);
  if (buffer.byteLength < headerSize) throw Error('路网文件头不完整');
  const n = head.getUint32(4,true), m = head.getUint32(8,true);
  return {head,n,m,rawSize:headerSize+n*8+m*9,packedSize:headerSize+n*8+m*8+Math.ceil(m/8)};
}
export function packRoadGraph(raw) {
  const {head,n,m,rawSize,packedSize}=layout(raw);
  if(head.getUint32(0)!==rawMagic || raw.byteLength!==rawSize) throw Error('路网格式错误');
  const packed=new Uint8Array(packedSize), bytes=new Uint8Array(raw);
  packed.set(bytes.subarray(0,headerSize));
  new DataView(packed.buffer).setUint32(0,packedMagic);
  const xy=new Int32Array(raw,12,n*2), edges=new Uint32Array(raw,12+8*n,m*2);
  let offset=headerSize;
  function planes(count,value) {
    for(let i=0;i<count;i++) {
      const v=value(i)>>>0;
      for(let k=0;k<4;k++) packed[offset+k*count+i]=v>>>(8*k);
    }
    offset+=4*count;
  }
  for(let axis=0;axis<2;axis++) {
    let last=0;
    planes(n,i=>{const p=xy[2*i+axis],d=p-last;last=p;return (d<<1)^(d>>31);});
  }
  let previous=0;
  planes(m,i=>{const u=edges[2*i],d=u-previous;previous=u;return d;});
  planes(m,i=>edges[2*i+1]-edges[2*i]-1);
  for(let i=0;i<m;i++) {
    const v=bytes[headerSize+8*n+8*m+i];
    if(v>1) throw Error('路段标志无效');
    packed[offset+(i>>3)]|=v<<(i&7);
  }
  return packed.buffer;
}
export function unpackRoadGraph(input) {
  const {head,n,m,rawSize,packedSize}=layout(input);
  if(head.getUint32(0)===rawMagic && input.byteLength===rawSize) return input;
  if(head.getUint32(0)!==packedMagic || input.byteLength!==packedSize) throw Error('路网数据不完整');
  const bytes=new Uint8Array(input), raw=new Uint8Array(rawSize);
  raw.set(bytes.subarray(0,headerSize));new DataView(raw.buffer).setUint32(0,rawMagic);
  const xy=new Int32Array(raw.buffer,12,n*2), edges=new Uint32Array(raw.buffer,12+8*n,m*2);
  let offset=headerSize;
  function planes(count,write) {
    for(let i=0;i<count;i++) {
      const k=offset+i;
      write(i,(bytes[k]|(bytes[k+count]<<8)|(bytes[k+2*count]<<16)|(bytes[k+3*count]<<24))>>>0);
    }
    offset+=4*count;
  }
  for(let axis=0;axis<2;axis++) {
    let last=0;
    planes(n,(i,v)=>{last=(last+((v>>>1)^-(v&1)))|0;xy[2*i+axis]=last;});
  }
  let previous=0;
  planes(m,(i,v)=>{previous+=v;edges[2*i]=previous;});
  planes(m,(i,v)=>{edges[2*i+1]=edges[2*i]+1+v;});
  for(let i=0;i<m;i++) raw[headerSize+8*n+8*m+i]=(bytes[offset+(i>>3)]>>>(i&7))&1;
  return raw.buffer;
}
