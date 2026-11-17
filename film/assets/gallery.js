(async()=>{
 await Promise.all([document.fonts.load('400 154px "Cormorant Garamond"'),document.fonts.load('300 122px Manrope')]);
 const $=id=>document.getElementById(id),bridge=window.webkit?.messageHandlers?.settings;
 let renderer,selected,profile,profiles=[],playing=false,start=0,frame=null,t=0;
 const thumbs=[];
 const examples=[{bundleID:'com.openai.codex',name:'ChatGPT',theme:'frost',mark:'openai',enabled:true},{bundleID:'com.anthropic.claudefordesktop',name:'Claude',theme:'cinnabar',mark:'claude',enabled:true},{bundleID:'generic',name:'其他应用',theme:'midnight',mark:'portal',enabled:false}];
 function stop(){playing=false;cancelAnimationFrame(frame);$('play').textContent='▶';$('play').setAttribute('aria-label','播放动画');}
 function update(){renderer.at(t);$('seek').value=t;$('time').textContent=`${t.toFixed(1).padStart(4,'0')} / ${selected.duration.toFixed(1)}`;}
 function choose(id){stop();renderer?.dispose();selected=WelcomeThemes.find(x=>x.id===id)||WelcomeThemes[0];renderer=WelcomeFilm.create($('stage'),{theme:selected.id,mark:profile?.mark,icon:profile?.icon});t=selected.posterTime;$('seek').max=selected.duration;
  $('number').textContent=String(WelcomeThemes.indexOf(selected)+1).padStart(2,'0');['name','english','description','motif'].forEach(k=>$(k).textContent=selected[k]);document.querySelectorAll('.choice').forEach(b=>b.setAttribute('aria-pressed',b.dataset.theme===selected.id?'true':'false'));$('apply').textContent='保存此应用设置';if(bridge)$('status').textContent='保存后，下次完整退出并打开此应用时生效。';update();}
 function chooseApp(id){
  profile=profiles.find(x=>x.bundleID===id)||profiles[0];$('target-app').value=profile.bundleID;$('profile-enabled').checked=profile.enabled;
  $('app-note').textContent=bridge?(profile.installed===false?'未检测到此应用；安装后即可生效。':'样式和开关独立保存，切回时不重播。'):'浏览器内可预览，安装后可添加本机应用。';
  choose(profile.theme);for(const x of thumbs){x.painter?.dispose();x.painter=WelcomeFilm.create(x.canvas,{theme:x.theme.id,mark:profile.mark,icon:profile.icon});x.painter.at(x.theme.posterTime);}
 }
 function play(restart=false){if(playing){stop();return;}if(restart||t>=selected.duration)t=0;playing=true;start=performance.now()-t*1000;$('play').textContent='Ⅱ';$('play').setAttribute('aria-label','暂停动画');function tick(now){t=Math.min(selected.duration,(now-start)/1000);update();if(t<selected.duration)frame=requestAnimationFrame(tick);else stop();}frame=requestAnimationFrame(tick);}
 for(const [index,theme] of WelcomeThemes.entries()){
  const button=document.createElement('button');button.className='choice';button.dataset.theme=theme.id;button.setAttribute('aria-pressed','false');button.innerHTML=`<canvas aria-label="${theme.name}缩略图"></canvas><span class="choice-title"><span>${theme.name}</span><span class="choice-dot"></span></span><span class="choice-meta">0${index+1} / ${theme.duration.toFixed(1)} SEC</span>`;$('choices').append(button);
  thumbs.push({canvas:button.querySelector('canvas'),theme,painter:null});button.addEventListener('click',()=>choose(theme.id));
 }
 $('play').addEventListener('click',()=>play());$('replay').addEventListener('click',()=>{stop();play(true);});$('seek').addEventListener('input',()=>{stop();t=Number($('seek').value);update();});
 $('target-app').addEventListener('change',()=>{chooseApp($('target-app').value);bridge?.postMessage({event:'select_profile',bundleID:profile.bundleID});});
 $('profile-enabled').disabled=!bridge;$('profile-enabled').addEventListener('change',()=>{$('apply').textContent='保存此应用设置';$('status').textContent='设置尚未保存。';});
 if(bridge){$('apply').hidden=false;$('add-app').hidden=false;$('status').textContent='保存后，下次完整退出并打开此应用时生效。';$('apply').addEventListener('click',()=>bridge.postMessage({event:'apply',bundleID:profile.bundleID,theme:selected.id,enabled:$('profile-enabled').checked}));$('add-app').addEventListener('click',()=>bridge.postMessage({event:'add_app'}));}
 window.didApplyTheme=result=>{const p=profiles.find(x=>x.bundleID===result.bundleID);if(p){p.theme=result.theme;p.enabled=result.enabled;}$('apply').textContent='已保存';$('status').textContent=result.enabled?'下次冷启动生效，切回时不重播。':'已关闭此应用的开屏。';};
 window.openingError=text=>{$('status').textContent=text;};
 window.updateOpeningProfiles=data=>{profiles=data.profiles?.length?data.profiles:examples;$('target-app').replaceChildren(...profiles.map(p=>{const option=document.createElement('option');option.value=p.bundleID;option.textContent=p.name;return option;}));chooseApp(data.selectedID||profiles[0].bundleID);};
 window.selectWelcomeTheme=choose;window.updateOpeningProfiles(window.OPENING_PROFILES||{profiles:examples,selectedID:new URLSearchParams(location.search).get('app')||'com.openai.codex'});
 const queryTheme=new URLSearchParams(location.search).get('theme');if(queryTheme)choose(queryTheme);
 window.addEventListener('resize',()=>{update();thumbs.forEach(x=>x.painter.at(x.theme.posterTime));});window.galleryReady=true;bridge?.postMessage({event:'ready'});
})();
