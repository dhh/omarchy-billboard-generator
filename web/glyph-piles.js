// Native glyphs packed into irregular, low heaps, not terminal columns.
// Elliptical support is a visual deposition heuristic, not airborne physics.
export function createGlyphPiles(runs,{columns,rows,cellW,cellH,originX,lifetime=4,drawGlyph,totalFrames=375,width=900,scale=1}){
 let seed=87139;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const events=Array.from({length:totalFrames},()=>[]),frames=[];
 for(const [id,run] of runs.entries()){
  const x=originX+(run.col+.5)*cellW;
  if(run.start<totalFrames&&x>=0&&x<width)events[run.start].push({...run,id,end:run.start+run.samples.length*lifetime});
 }
 let active=[],landings=0,stackedLandings=0,rolledGlyphs=0,peakStackRise=0;
 function support(p,others,x=p.x){
  let z=p.ry;
  for(const q of others){
   const dx=Math.abs(x-q.x),rx=p.rx+q.rx;
   if(dx<rx)z=Math.max(z,q.z+(p.ry+q.ry)*Math.sqrt(1-(dx/rx)**2));
  }
  return z;
 }
 for(let frame=0;frame<totalFrames;frame++){
  active=active.filter(p=>frame<p.event.end);
  // Support can disappear as embers cool. Settle in individual, staggered
  // pixel steps, without a shared 120ms beat or any interpolated falling.
  active.sort((a,b)=>a.z-b.z||a.event.id-b.event.id);
  const settled=[];
  for(const p of active){
   if(frame>=p.nextSettle){p.z=Math.min(p.z,support(p,settled));p.nextSettle=frame+p.tick;}
   settled.push(p);
  }
  for(const event of events[frame]){
   const nativeX=originX+(event.col+.5)*cellW;
   const small=[46,44,39,96,183].includes(event.samples[0].code);
   const p={event,x:Math.max(scale,Math.min(width-scale,nativeX+(random()-.5)*cellW)),rx:(2.5+random()*1.7)*scale,ry:((small?1.2:2)+random()*.9)*scale,tick:2+Math.floor(random()*4),base:random()*1.4*scale};
   // Persistent offsets belong to the ember, never random per-frame jitter.
   // Prefer nearby lower support, but penalize travel to avoid flattening
   // everything into a uniform bar. No fixed bins or common layer heights.
   const landingX=p.x;let bestX=p.x,bestZ=support(p,active),bestCost=bestZ;
   for(const shift of [-cellW,cellW,-cellW*.5,cellW*.5]){
    const x=Math.max(scale,Math.min(width-scale,landingX+shift)),z=support(p,active,x),cost=z+Math.abs(x-landingX)*.55;
    if(cost<bestCost){bestCost=cost;bestX=x;bestZ=z;}
   }
   p.x=bestX;p.z=bestZ;p.nextSettle=frame+p.tick;
   if(Math.abs(p.x-landingX)>.1)rolledGlyphs++;
   if(p.z>p.ry+.1)stackedLandings++;
   active.push(p);landings++;
  }
  const snapshot=active.map(p=>{
   const rise=p.z-p.ry+p.base;peakStackRise=Math.max(peakStackRise,rise);
   return {col:(p.x-originX)/cellW-.5,row:rows-1-rise/cellH,sample:p.event.samples[Math.floor((frame-p.event.start)/lifetime)]};
  });
  frames.push(snapshot);
 }
 return {
  metadata:{model:'Irregular elliptical packing of native ember glyphs',oneGlyphPerImpact:true,originalGlyphAndColor:true,noGrainRectangles:true,noFixedColumns:true,noUniformLayers:true,noGlobalTick:true,settleTickFrames:[2,5],cooling:'Original native samples at quarter speed, relative to each individual landing',lifetimeMultiplier:lifetime,landings,stackedLandings,rolledGlyphs,peakStackRise,lastVisibleFrame:frames.reduce((last,f,i)=>f.length?i:last,-1)},
  draw(ctx,frame){let count=0;for(const p of frames[frame]||[])if(drawGlyph(ctx,p.col,p.row,p.sample,true))count++;return count;}
 };
}
