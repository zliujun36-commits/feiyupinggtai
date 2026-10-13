export const number=v=>v==null?'—':Number(v).toLocaleString('zh-CN',{maximumFractionDigits:2});
export const percent=v=>v==null?'—':(v*100).toFixed(2)+'%';
export const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const nodeColors={DZ:'#278374',LD:'#4789c9',DC:'#885db5',demand:'#479b8a',added:'#de963b',virtual:'#de963b'};
export const labels={DZ:'DZ 需求组',LD:'LD 二级节点',DC:'DC 三级节点'};
export function decodeTable(t){return t.rows.map(row=>Object.fromEntries(t.columns.map((k,i)=>[k,row[i]])))}
export function pointInRing(x,y,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];const cross=(x-a[0])*(b[1]-a[1])-(y-a[1])*(b[0]-a[0]);if(Math.abs(cross)<1e-10&&x>=Math.min(a[0],b[0])-1e-10&&x<=Math.max(a[0],b[0])+1e-10&&y>=Math.min(a[1],b[1])-1e-10&&y<=Math.max(a[1],b[1])+1e-10)return true;if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside}return inside}
export function inPolygon(x,y,coordinates){return pointInRing(x,y,coordinates[0])&&!coordinates.slice(1).some(r=>pointInRing(x,y,r))}
export function csvText(rows,columns){const encode=v=>{let s=v==null?'':String(v);if(/^[=+@\-]/.test(s)&&typeof v==='string')s="'"+s;return '"'+s.replaceAll('"','""')+'"'};return '\ufeff'+[columns.map(encode).join(','),...rows.map(r=>columns.map(c=>encode(r[c])).join(','))].join('\r\n')}
export function bboxContains(b,x,y){return !b||(x>=b[0]&&x<=b[2]&&y>=b[1]&&y<=b[3])}
export function project(lng,lat,zoom){const s=256*2**zoom,sin=Math.sin(Math.max(-85,Math.min(85,lat))*Math.PI/180);return [(lng+180)/360*s,(.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*s]}
