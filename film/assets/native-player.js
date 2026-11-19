let renderer,animationId=null,rendererKey='',generation=0;
const nativePost=body=>window.webkit?.messageHandlers?.welcome?.postMessage(body);
const fontReady=Promise.all([document.fonts.load('400 140px "Cormorant Garamond"'),document.fonts.load('300 120px Manrope')]);
function normalize(input){const o=typeof input==='string'?{theme:input}:input||{};return {theme:WelcomeStyle.theme(o.theme).id,mark:['openai','claude','portal'].includes(o.mark)?o.mark:'openai',icon:o.icon||'',copy:WelcomeFilm.normalizeCopy(o.copy),style:WelcomeStyle.normalize(o.theme,o.style),token:o.token||''};}
async function configure(input,request){
 const o=normalize(input);
 await Promise.all([fontReady,WelcomePhotos.load(o.theme)]);if(request!==generation)return false;
 const key=JSON.stringify([o.theme,o.mark,o.icon,o.copy,o.style]);
 if(!renderer||key!==rendererKey){renderer?.dispose();renderer=WelcomeFilm.create(document.getElementById('canvas'),{native:true,...o});rendererKey=key;}
 renderer.at(0);return o;
}
window.configureWelcome=async input=>{cancelAnimationFrame(animationId);const request=++generation;const o=await configure(input,request);return o?{theme:o.theme,mark:o.mark,copy:o.copy,style:o.style,duration:renderer.duration}:null;};
window.playWelcome=async input=>{
 cancelAnimationFrame(animationId);const request=++generation,o=await configure(input,request);if(!o||request!==generation)return;
 // configure() has already painted frame zero. WebKit can suspend animation
 // frames until AppKit makes the panel visible, so acknowledge that frame now.
 const start=performance.now();
 nativePost({event:'started',duration:renderer.duration,token:o.token});
 function tick(stamp){if(request!==generation)return;
  const t=Math.max(0,(stamp-start)/1000);renderer.at(Math.min(t,renderer.duration));
  if(t<renderer.duration)animationId=requestAnimationFrame(tick);else nativePost({event:'finished',token:o.token});
 }
 animationId=requestAnimationFrame(tick);
};
window.stopWelcome=()=>{generation++;cancelAnimationFrame(animationId);renderer?.at(0);};
window.seekWelcome=t=>renderer.at(t);
configureWelcome(window.INITIAL_OPENING||{theme:window.INITIAL_THEME||'frost'}).then(()=>nativePost({event:'ready'}));
