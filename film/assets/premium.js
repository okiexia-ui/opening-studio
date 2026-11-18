/* Three distinct, deterministic opening choreographies. No media/network clock. */
window.WelcomePremium = (()=>{
 const clamp=x=>Math.min(1,Math.max(0,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x);},mix=(a,b,u)=>a+(b-a)*u;
 function create(o){
  const {canvas,ctx,points,logoLength,options,theme,geometry}=o;
  const warm=theme.id==='aurum',red=theme.id==='cinnabar';
  const ink=theme.ink,ground=theme.ground;
  // Newer themes register a stage; the original three keep their inline branches below.
  const copy=o.copy,upper=copy.greeting.toUpperCase();
  const stage=window.WelcomeStages?.[theme.id]?.({copy,points,logoLength,text:o.text,textLength:o.textLength,travel:o.travel,travelLength:o.travelLength,options,theme});
  function line(x1,y1,x2,y2,alpha=1,width=1,color=ink){ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.restore();}
  // Long custom names shrink to fit `fit` design pixels instead of overflowing.
  function word(text,x,y,size,alpha=1,family='Cormorant Garamond',weight=400,tracking=0,fit=1500){
   if(alpha<=0)return;ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle=ink;ctx.font=`${weight} ${size}px "${family}"`;ctx.textBaseline='alphabetic';ctx.textAlign='center';
   const natural=[...text].reduce((n,c)=>n+ctx.measureText(c).width,0)+([...text].length-1)*tracking;
   if(natural>fit){const k=fit/natural;ctx.translate(x,y);ctx.scale(k,k);ctx.translate(-x,-y);}
   if(!tracking){ctx.fillText(text,x,y);}else{const chars=[...text],width=chars.reduce((n,c)=>n+ctx.measureText(c).width,0)+(chars.length-1)*tracking;let xx=x-width/2;ctx.textAlign='left';for(const c of chars){ctx.fillText(c,xx,y);xx+=ctx.measureText(c).width+tracking;}}
   ctx.restore();
  }
  function glow(x,y,r,c){const gr=ctx.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,c);gr.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=gr;ctx.fillRect(0,0,1920,1080);}
  function trace(limit,alpha=1,width=3,color=ink){
   ctx.save();ctx.lineJoin='round';ctx.lineCap='round';ctx.lineWidth=width;ctx.strokeStyle=color;
   let tip=points[0],activeAlpha=null;
   // Stroke each continuous contour once, so translucent joins stay smooth
   // when the camera magnifies them during the tunnel move.
   for(let i=1;i<points.length&&points[i-1].l<limit;i++){
    const p=points[i],last=points[i-1];let a=alpha;if(p.bridge)a*=1-smooth((limit-p.l-18)/140);
    if(a!==activeAlpha){if(activeAlpha!==null)ctx.stroke();ctx.globalAlpha=a;ctx.beginPath();ctx.moveTo(last.x,last.y);activeAlpha=a;}
    if(p.l>limit){const k=(limit-last.l)/(p.l-last.l);tip={x:mix(last.x,p.x,k),y:mix(last.y,p.y,k)};ctx.lineTo(tip.x,tip.y);break;}
    ctx.lineTo(p.x,p.y);tip=p;
   }
   if(activeAlpha!==null)ctx.stroke();
   ctx.restore();return tip;
  }
  function at(realTime){
   o.size();const {w,h,dpr}=o.dimensions(),t=clamp(realTime/theme.duration)*15.8,g=geometry(realTime),s=Math.min(w/1920,h/1080),ox=(w-1920*s)/2,oy=(h-1080*s)/2;
   ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.save();
   if(g.aperture>0){ctx.beginPath();ctx.rect(0,0,w,h);ctx.arc(ox+g.centreX*s,oy+540*s,g.aperture*s,0,Math.PI*2,true);ctx.clip('evenodd');}
   if(!stage){ctx.fillStyle=ground;ctx.fillRect(0,0,w,h);}ctx.translate(ox,oy);ctx.scale(s,s);
   const intro=smooth(t/2.1),fade=1-smooth((t-7.5)/2.4);
   const view={left:-ox/s,top:-oy/s,right:(w-ox)/s,bottom:(h-oy)/s},api={ctx,t,g,s,view,trace};
   if(stage){stage.scene(api);}
   else if(red){
    // Two paper leaves separate along one typographic axis.
    const edge=mix(960,180,intro);ctx.fillStyle='#e8dfd1';ctx.fillRect(0,0,edge,1080);ctx.fillRect(1920-edge,0,edge,1080);
    line(edge,0,edge,1080,.25,1,'#a98868');line(1920-edge,0,1920-edge,1080,.25,1,'#a98868');
    ctx.save();ctx.beginPath();ctx.rect(edge,340,1920-edge*2,360);ctx.clip();
    word(`${copy.greeting} ${copy.name}`,960,584,154,fade,'Cormorant Garamond',400,0,1340);ctx.restore();
    const reach=smooth((t-.3)/3.7);line(460,652,mix(460,1460,reach),652,fade*.55,1.5,'#a28557');
    // A hairline becomes the single connector, not another unrelated cut.
    if(t>7.1){ctx.save();ctx.globalAlpha=1-smooth((t-10.5)/2);ctx.strokeStyle='#a28557';ctx.lineWidth=2;ctx.setLineDash([990*clamp((t-7.1)/2.2),1100]);ctx.beginPath();ctx.moveTo(1460,652);ctx.bezierCurveTo(1595,650,1580,810,points[0].x,points[0].y);ctx.stroke();ctx.restore();}
   } else if(!warm){
    // An illuminated horizon opens into shallow, architectural orbital space.
    glow(960,610,950,'rgba(38,103,148,.16)');
    ctx.save();ctx.globalAlpha=.25;ctx.strokeStyle='#4b80a5';ctx.lineWidth=1;
    for(let i=0;i<4;i++){ctx.beginPath();ctx.ellipse(1392,540,280+i*120,175+i*62,-.32,Math.PI*.11,Math.PI*(.11+1.74*intro));ctx.stroke();}ctx.restore();
    const rise=1-smooth((t-1.7)/2.2);line(960,540-170*intro,960,540+170*intro,rise*.45,1);
    ctx.save();const reach=620*smooth((t-.55)/2.8);ctx.beginPath();ctx.rect(960-reach,350,reach*2,300);ctx.clip();
    word(upper,960,445,72,fade*.9,'Manrope',500,5,1180);
    word(copy.name,960,594,122,fade,'Manrope',300,2,1180);ctx.restore();
    line(780,652,mix(780,1140,smooth((t-2.2)/2.8)),652,fade*.5,1);
    if(t>7.2){ctx.save();ctx.strokeStyle=ink;ctx.lineWidth=2;ctx.globalAlpha=1-smooth((t-10.5)/2);ctx.setLineDash([1000*clamp((t-7.2)/2),1100]);ctx.beginPath();ctx.moveTo(1140,652);ctx.bezierCurveTo(1310,651,1560,818,points[0].x,points[0].y);ctx.stroke();ctx.restore();}
   } else {
    // A tall slit opens like theatre curtains; the moving edge is the light.
    const open=810*smooth((t-.2)/2.7);const grad=ctx.createLinearGradient(0,100,1920,980);grad.addColorStop(0,'#211e17');grad.addColorStop(.52,'#151411');grad.addColorStop(1,'#262117');ctx.fillStyle=grad;ctx.fillRect(960-open,0,open*2,1080);
    glow(960,450,690,'rgba(179,131,51,.065)');
    const edgeAlpha=(1-smooth((t-4)/2.5))*.55;line(960-open,100,960-open,980,edgeAlpha,1);line(960+open,100,960+open,980,edgeAlpha,1);
    ctx.save();ctx.beginPath();ctx.rect(960-open,300,open*2,440);ctx.clip();
    word(upper,960,430,72,fade*.9,'Manrope',400,5,1400);word(copy.name,960,613,184,fade,'Cormorant Garamond',400,0,1400);ctx.restore();
    line(960,685,mix(960,1375,smooth((t-3.2)/3.6)),685,fade*.6,1);
    if(t>7.1){ctx.save();ctx.globalAlpha=1-smooth((t-10.5)/2);ctx.strokeStyle=ink;ctx.lineWidth=1.5;ctx.setLineDash([900*clamp((t-7.1)/2.2),1000]);ctx.beginPath();ctx.moveTo(1375,685);ctx.bezierCurveTo(1575,686,1480,770,points[0].x,points[0].y);ctx.stroke();ctx.restore();}
   }
   // The typographic stage hands over to the exact same brand geometry.
   const progress=clamp((t-9.3)/3.8),limit=logoLength*progress;
   ctx.save();ctx.translate(g.centreX,g.centreY);ctx.scale(g.zoom,g.zoom);ctx.translate(-1392,-540);
   if(progress>0){
    if(stage?.mark instanceof Function){stage.mark(api,limit,progress);}
    else{const m=stage?.mark||{},core=m.core||ink;trace(limit,m.haloAlpha??.11,m.haloWidth??(red?10:12),m.halo||ink);const tip=trace(limit,1,m.width??(red?3:2.4),core);if(progress<1){ctx.fillStyle=core;ctx.beginPath();ctx.arc(tip.x,tip.y,2.8,0,Math.PI*2);ctx.fill();}}
   }
   if(g.z>0){for(let k=1;k<=3;k++){ctx.save();ctx.translate(1392,540);ctx.scale(.80**k,.80**k);ctx.translate(-1392,-540);trace(logoLength,clamp(g.z*3-k*.2)*.08,1.5,stage?.echo||ink);ctx.restore();}}
   o.drawAppIcon(progress,g);
   ctx.restore();stage?.front?.(api);ctx.restore();
   if(!options.native&&g.aperture>0){ctx.save();ctx.globalCompositeOperation='destination-over';ctx.fillStyle=stage?.end||(red?'#f7f5f0':'#171819');ctx.fillRect(0,0,w,h);ctx.restore();}
   return {time:realTime,phase:t<7.5?'greeting':t<9.3?'connecting':t<13.5?'blossom':'tunnel',aperture:g.aperture,centreX:g.centreX,theme:theme.id};
  }
  return {at};
 }
 return {create};
})();
