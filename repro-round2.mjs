const B='/home/user/pcode-grapher-test/src/';
const {lex} = await import(B+'core/lexer.js');
const {parseFunction} = await import(B+'core/parser.js');
const {CfgBuilder} = await import(B+'core/cfg.js');
const {graphBounds} = await import(B+'graph/layout.js');
const {routeAvoidingBlocks} = await import(B+'graph/astarRoute.js');
const {mainPathFallback} = await import(B+'notes/mainpath.js');

const cfg = (code)=>{const p=parseFunction(lex(code));return {p, g:new CfgBuilder().build(p)};};

console.log('=== BUG A: switch, lệnh trước case đầu không phải raw ===');
{
const code=`void f(int x){ switch(x){ if (x>1) { g(); } case 1: a(); break; default: b(); } }`;
const {g}=cfg(code);
console.log('nodes:', g.nodes.map(n=>n.kind+':'+n.lines.map(l=>(l.toks?l.toks.map(t=>t.v).join(' '):l.text||l.comment)).join(' | ')));
console.log('có thấy "g()" không?', JSON.stringify(g.nodes).includes('"g"'));
}

console.log('\n=== BUG B: dấu ) thừa làm depth âm, nuốt hết phần còn lại ===');
{
const code=`void f(void){ a = b); c(); d(); return; }`;
const {p}=cfg(code);
console.log('số statement:', p.body.length, p.body.map(s=>s.k));
}

console.log('\n=== BUG C: nhãn trùng tên / nhãn tên toString ===');
{
const {g}=cfg(`void f(void){ goto toString; x(); toString: y(); }`);
console.log('edges:', JSON.stringify(g.edges));
console.log('warnings:', g.warnings);
}
{
const {g}=cfg(`void f(void){ goto L; a(); L: b(); c(); L: d(); }`);
console.log('nhãn trùng → edges:', JSON.stringify(g.edges), g.warnings);
}

console.log('\n=== BUG D: graphBounds với toạ độ âm ===');
{
const gd={nodes:[{id:0},{id:1}],edges:[]};
const pos={0:{x:-500,y:-400},1:{x:-300,y:-200}};
const sz={0:{width:100,height:50},1:{width:100,height:50}};
console.log(graphBounds(gd,pos,sz,{}), 'đúng phải là {x:-500,y:-400,width:300,height:250}');
}

console.log('\n=== BUG E: A* trả đoạn chéo ở đầu/cuối ===');
{
const r=routeAvoidingBlocks({x:103,y:47},{x:517,y:333},[{x:200,y:100,w:150,h:120}]);
console.log(JSON.stringify(r));
let diag=0; for(let i=1;i<r.length;i++){if(Math.abs(r[i].x-r[i-1].x)>0.01 && Math.abs(r[i].y-r[i-1].y)>0.01) diag++;}
console.log('số đoạn CHÉO:', diag);
}

console.log('\n=== BUG F: mainPathFallback khi không có entry ===');
{
const {g}=cfg(`a = 1; if (a) { b(); } c();`);
console.log('kinds:', g.nodes.map(n=>n.kind), 'flags:', g.nodes.map(n=>JSON.stringify(n.flags)));
const fb=mainPathFallback(g);
console.log('lit nodes:', [...fb.n], 'lit edges:', [...fb.e]);
}
