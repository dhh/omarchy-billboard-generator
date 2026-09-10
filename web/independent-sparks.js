import {createGlyphPiles} from './glyph-piles.js';
const sparkCodes=new Set([..."*.,'`+^·"].map(c=>c.codePointAt(0)));
const isSpark=(f,i)=>sparkCodes.has(f.symbols[i])&&!(f.flags[i]&32);
const brightness=color=>Math.max((color>>16)&255,(color>>8)&255,color&255);
export function createIndependentSparks(primary,secondary,columns,rows,cellW,cellH,originX,originY,{width,height,scale=1,mapY=row=>originY+row*cellH,floorY=originY+(rows-.5)*cellH}){
 const groundDurationMultiplier=4,cache=new Map(),runs=[];
 function glyph(code,color,flags){
  const key=`${code}/${color}/${flags&3}`;if(cache.has(key))return cache.get(key);
  const c=document.createElement('canvas');c.width=10;c.height=20;const x=c.getContext('2d');
  x.font=`${flags&2?'italic ':''}${flags&1?'700':'400'} 17px "JetBrains Mono"`;
  x.textAlign='center';x.textBaseline='middle';x.fillStyle='#'+(color||0xc8c8c8).toString(16).padStart(6,'0');
  x.fillText(String.fromCodePoint(code),5,10);cache.set(key,c);return c;
 }
 function drawGlyph(ctx,col,row,sample,ground=false){
  const glyphY=ground?floorY-cellH/2-(rows-1-row)*cellH:mapY(row);
  const x=Math.round(originX+col*cellW),y=Math.round(glyphY);
  const w=Math.round(originX+(col+1)*cellW)-x,h=Math.round(glyphY+cellH)-y;
  if(x+w<=0||x>=width||y+h<=0||y>=height)return false;
  ctx.drawImage(glyph(sample.code,sample.color,sample.flags),x,y,w,h);return true;
 }
 // Track continuous native ground-cell events, separating new impacts when
 // glyphs change or a cooling ember becomes substantially brighter again.
 for(const [emitter,frames] of [primary,secondary].entries())for(let col=0;col<columns;col++){
  let run=null;const i=(rows-1)*columns+col;
  for(let frame=0;frame<frames.length;frame++){
   const f=frames[frame];
   if(!isSpark(f,i)){run=null;continue;}
   const sample={code:f.symbols[i],color:f.fg[i]&0xffffff,flags:f.flags[i]};
   const prev=run?.samples.at(-1);
   if(!run||prev.code!==sample.code||brightness(sample.color)>brightness(prev.color)*1.35+12){run={emitter,col,start:frame,samples:[]};runs.push(run);}
   run.samples.push(sample);
  }
 }
 const nativeSamples=runs.reduce((n,r)=>n+r.samples.length,0);
 const airborneFrameSamples=[0,0];let differentAirborneFrames=0;
 for(let frame=0;frame<125;frame++){
  const positions=[primary[frame],secondary[frame]].map((f,emitter)=>{
   const ids=[];for(let i=0;i<(rows-1)*columns;i++)if(isSpark(f,i)){ids.push(i);airborneFrameSamples[emitter]++;}return ids.join(',');
  });if(positions[0]!==positions[1])differentAirborneFrames++;
 }
 const stripped=primary.map(f=>{const symbols=f.symbols.slice();for(let i=(rows-1)*columns;i<rows*columns;i++)if(isSpark(f,i))symbols[i]=32;return {...f,symbols};});
 const metadata={primarySeed:42,secondarySeed:137,airborneFrameSamples,differentAirborneFrames,method:'Independent native WASM simulations, not offset duplicates',groundDurationMultiplier,groundTiming:'Landing unchanged; replay cooling/color samples at quarter speed after landing',groundEventCount:runs.length,nativeGroundFrameSamples:nativeSamples,extendedGroundFrameSamples:nativeSamples*groundDurationMultiplier,lastGroundFrame:Math.max(...runs.map(r=>r.start+r.samples.length*groundDurationMultiplier-1)),groundEvents:runs.map(r=>({emitter:r.emitter,col:r.col,start:r.start,nativeFrames:r.samples.length,extendedFrames:r.samples.length*groundDurationMultiplier}))};
 const piles=createGlyphPiles(runs,{columns,rows,cellW,cellH,originX,lifetime:groundDurationMultiplier,drawGlyph,width,scale});
 metadata.piles=piles.metadata;
 return {
  metadata,
  withoutPrimaryFloor:index=>stripped[index],
  draw(ctx,index){
   let extraAirborne=0,ground=0;
   ctx.save();ctx.globalAlpha=1;ctx.imageSmoothingEnabled=false;
   if(index<125){const f=secondary[index];for(let i=0;i<(rows-1)*columns;i++)if(isSpark(f,i)){
    if(drawGlyph(ctx,i%columns,Math.floor(i/columns),{code:f.symbols[i],color:f.fg[i]&0xffffff,flags:f.flags[i]}))extraAirborne++;
   }}
   ground=piles.draw(ctx,index);
   ctx.restore();return {extraAirborne,ground};
  }
 };
}
