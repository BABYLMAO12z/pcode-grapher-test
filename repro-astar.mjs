const B='/home/user/pcode-grapher-test/src/';
const {routeAvoidingBlocks,_clearRouteCache} = await import(B+'graph/astarRoute.js');
const CELL=10,TURN=26,INFLATE=3,PAD=40;
function grid(a,b,rects){
 let minX=Math.min(a.x,b.x),maxX=Math.max(a.x,b.x),minY=Math.min(a.y,b.y),maxY=Math.max(a.y,b.y);
 for(const r of rects){minX=Math.min(minX,r.x);maxX=Math.max(maxX,r.x+r.w);minY=Math.min(minY,r.y);maxY=Math.max(maxY,r.y+r.h);}
 const gx0=Math.floor((minX-PAD)/CELL),gx1=Math.ceil((maxX+PAD)/CELL),gy0=Math.floor((minY-PAD)/CELL),gy1=Math.ceil((maxY+PAD)/CELL);
 const W=gx1-gx0+1,H=gy1-gy0+1,N=W*H,bl=new Uint8Array(N);
 for(const r of rects){const x0=Math.floor((r.x-INFLATE)/CELL)-gx0,x1=Math.floor((r.x+r.w+INFLATE)/CELL)-gx0,y0=Math.floor((r.y-INFLATE)/CELL)-gy0,y1=Math.floor((r.y+r.h+INFLATE)/CELL)-gy0;
  for(let y=Math.max(0,y0);y<=Math.min(H-1,y1);y++)for(let x=Math.max(0,x0);x<=Math.min(W-1,x1);x++)bl[y*W+x]=1;}
 const cell=p=>({x:Math.max(0,Math.min(W-1,Math.round(p.x/CELL)-gx0)),y:Math.max(0,Math.min(H-1,Math.round(p.y/CELL)-gy0))});
 return {W,H,N,bl,cell,gx0,gy0};
}
function ref(a,b,rects){const G=grid(a,b,rects);const {W,H,N,bl,cell}=G;const s=cell(a),t=cell(b),si=s.y*W+s.x,ti=t.y*W+t.x;bl[si]=0;bl[ti]=0;
 const g=new Float64Array(N*5).fill(Infinity);const pq=[[0,si*5+4]];g[si*5+4]=0;const D=[[1,0],[0,1],[-1,0],[0,-1]];
 while(pq.length){pq.sort((x,y)=>x[0]-y[0]);const [c,st]=pq.shift();const idx=(st/5)|0,dir=st%5;if(c>g[st])continue;if(idx===ti)return c;
  const cx=idx%W,cy=(idx/W)|0;
  for(let nd=0;nd<4;nd++){const nx=cx+D[nd][0],ny=cy+D[nd][1];if(nx<0||ny<0||nx>=W||ny>=H)continue;const ni=ny*W+nx;if(bl[ni]&&ni!==ti)continue;
   const ng=c+CELL+(dir!==4&&dir!==nd?TURN:0);const k=ni*5+nd;if(ng<g[k]){g[k]=ng;pq.push([ng,k]);}}}
 return Infinity;}
function costGridPart(pts,a,b,G){ // quy điểm đầu/cuối về ô lưới để so công bằng
 const q=pts.map(p=>({...p})); const ca=G.cell(a), cb=G.cell(b);
 q[0]={x:(G.gx0+ca.x)*CELL,y:(G.gy0+ca.y)*CELL}; q[q.length-1]={x:(G.gx0+cb.x)*CELL,y:(G.gy0+cb.y)*CELL};
 const c=[]; for(const p of q){const l=c[c.length-1]; if(l&&Math.abs(l.x-p.x)<0.01&&Math.abs(l.y-p.y)<0.01)continue;c.push(p);}
 let cost=0,prev=null;
 for(let i=1;i<c.length;i++){const dx=c[i].x-c[i-1].x,dy=c[i].y-c[i-1].y;cost+=Math.abs(dx)+Math.abs(dy);const d=Math.abs(dx)>Math.abs(dy)?(dx>0?0:2):(dy>0?1:3);if(prev!==null&&prev!==d)cost+=TURN;prev=d;}
 return cost;}
let worse=0,tot=0,diag=0;
for(let s=0;s<80;s++){const rnd=n=>Math.floor(Math.random()*n);
 const rects=[];for(let i=0;i<4;i++)rects.push({x:rnd(400),y:rnd(400),w:60+rnd(120),h:30+rnd(80)});
 const a={x:rnd(50)*10,y:rnd(50)*10},b={x:rnd(50)*10,y:rnd(50)*10};
 _clearRouteCache();const got=routeAvoidingBlocks(a,b,rects);if(!got)continue;
 for(let i=1;i<got.length;i++)if(Math.abs(got[i].x-got[i-1].x)>0.01&&Math.abs(got[i].y-got[i-1].y)>0.01)diag++;
 const G=grid(a,b,rects);const c1=costGridPart(got,a,b,G),c2=ref(a,b,rects);tot++;if(c1>c2+1)worse++;}
console.log('kém tối ưu:',worse,'/',tot,'· tổng số đoạn CHÉO:',diag);
