const puppeteer=require('puppeteer-core'),fs=require('fs'),path=require('path'),assert=require('assert'),crypto=require('crypto');
(async()=>{
 const executablePath=require('./browser-path.cjs')();if(!executablePath)throw Error('Install Chrome or set HYPERFRAMES_BROWSER_PATH.');
 const browser=await puppeteer.launch({executablePath,headless:true});
 try {
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const viewports=[[1920,1080],[1470,853],[900,700],[500,900],[320,1200]],results=[];
  const media=process.env.OPENING_STUDIO_MEDIA_DIR || 'docs/media';
  fs.mkdirSync('.build',{recursive:true});fs.mkdirSync(media,{recursive:true});
  await page.goto('file://'+path.resolve('film/native.html'));await page.waitForFunction('typeof renderer !== "undefined" && !!renderer');
  const themes=await page.evaluate(()=>WelcomeThemes.map(x=>x.id));
  for(const theme of themes)for(const [width,height] of viewports){
   await page.setViewport({width,height,deviceScaleFactor:1});
   await page.evaluate(id=>configureWelcome(id),theme);
   const report=await page.evaluate(()=>{
    const metrics=renderer.metrics(),duration=renderer.duration,frames=[];
    for(const fraction of [.15,.45,.65,.9]){renderer.at(duration*fraction);frames.push(document.getElementById('canvas').toDataURL());}
    const begin=performance.now();for(let i=0;i<60;i++)renderer.at(duration*(.7+i/600));const frameMs=(performance.now()-begin)/60;
    renderer.at(duration);const c=document.getElementById('canvas'),end=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let nonTransparent=0;for(let i=3;i<end.length;i+=4)if(end[i])nonTransparent++;
    return {metrics,duration,frames,frameMs,nonTransparent,width:c.width,height:c.height};
   });
   const hashes=report.frames.map(x=>crypto.createHash('sha256').update(x).digest('hex'));delete report.frames;
   assert.equal(new Set(hashes).size,4,'Animation must change across all four sampled beats');assert.equal(report.nonTransparent,0,'Exit reveals real application');assert.equal(report.width,width);assert.equal(report.height,height);
   results.push({theme,viewport:[width,height],hashes,...report});
   if(width===1920){await page.evaluate(id=>renderer.at(WelcomeThemes.find(x=>x.id===id).posterTime),theme);await page.screenshot({path:path.join(media,theme+'.png')});}
  }
  // Custom greetings: every theme takes the words, stays continuous, fits the stage and still exits cleanly.
  const custom=[{greeting:'Hello',name:'Ada Lovelace',title:'早上好',seal:'通'},{greeting:'你好',name:'小明',title:'智能政务工作平台',seal:'准予通行'}];
  for(const copy of custom)for(const theme of themes)for(const [width,height] of [[1920,1080],[320,1200]]){
   await page.setViewport({width,height,deviceScaleFactor:1});
   await page.evaluate(o=>configureWelcome(o),{theme}).then(()=>page.evaluate(()=>{renderer.at(renderer.duration*.45);window.__base=document.getElementById('canvas').toDataURL();}));
   const info=await page.evaluate(o=>configureWelcome(o),{theme,copy});
   const r=await page.evaluate(()=>{const m=renderer.metrics(),c=document.getElementById('canvas'),frames=[];for(const f of [.15,.45,.65,.9]){renderer.at(renderer.duration*f);frames.push(c.toDataURL());}
    const differs=frames[1]!==window.__base;renderer.at(renderer.duration);const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let opaque=false;for(let i=3;i<d.length;i+=4)if(d[i]){opaque=true;break;}
    return {copy:m.copy,joins:m.joinDistances,bounds:m.textBounds,layout:m.style.layout,distinct:new Set(frames).size,differs,opaque};});
   assert.deepStrictEqual(info.copy,copy,`${theme} receives the custom words`);assert.deepStrictEqual(r.copy,copy);
   assert(r.joins.every(x=>x<.001),`${theme} pen path stays continuous for ${copy.name}`);
   const [top,bottom]=r.layout==='two'?[330,810]:[380,760];
   assert(r.bounds.minX>=200&&r.bounds.maxX<=1720&&r.bounds.minY>=top&&r.bounds.maxY<=bottom,`${copy.name} handwriting fits the stage (${r.layout}): ${JSON.stringify(r.bounds)}`);
   assert.equal(r.distinct,4,`${theme} still moves with ${copy.name}`);assert(r.differs,`${theme} shows the custom words`);assert.equal(r.opaque,false,`${theme} exits transparently with ${copy.name}`);
  }
  // Over-long and hostile input is cleaned the same way native code cleans it.
  assert.deepStrictEqual(await page.evaluate(()=>WelcomeFilm.normalizeCopy({greeting:'  ',name:'A\u0007\u202Eda\n\n Lovelace-Byron-King',title:7,seal:'一二三四五'})),{greeting:'Welcome',name:'Ada Lovelace-Byr',title:'欢迎回来',seal:'一二三四'});
  // Style options: every palette, an accent, both paces, element extremes, every font and layout, size
  // extremes. Each must still move, keep its pen path continuous and exit fully transparent.
  await page.setViewport({width:1280,height:720,deviceScaleFactor:1});
  for(const theme of themes){
   const schema=await page.evaluate(id=>{const t=WelcomeThemes.find(x=>x.id===id);return {base:t.duration,palettes:t.palettes.map(p=>p.id),elements:t.elements.map(e=>e.id),fonts:t.fonts,layouts:t.layouts};},theme);
   const variants=[...schema.palettes.map(id=>({palette:id})),{accent:'#ff3366'},{pace:'brisk'},{pace:'calm'},
    {elements:Object.fromEntries(schema.elements.map(id=>[id,0]))},{elements:Object.fromEntries(schema.elements.map(id=>[id,1]))},
    ...schema.fonts.map(font=>({font})),...schema.layouts.map(layout=>({layout})),{size:.75},{size:1.25}];
   const paletteFrames=new Set();
   for(const style of variants){
    const info=await page.evaluate(o=>configureWelcome(o),{theme,style});
    const r=await page.evaluate(()=>{const c=document.getElementById('canvas'),m=renderer.metrics(),a=[];for(const f of [.3,.5])(renderer.at(renderer.duration*f),a.push(c.toDataURL()));
     renderer.at(renderer.duration);const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let opaque=false;for(let i=3;i<d.length;i+=4)if(d[i]){opaque=true;break;}
     return {frames:a,opaque,joins:m.joinDistances,style:m.style};});
    const label=`${theme} ${JSON.stringify(style)}`;
    assert.equal(r.opaque,false,`${label} exits transparently`);assert(r.joins.every(x=>x<.001),`${label} keeps the pen path continuous`);
    assert.notEqual(r.frames[0],r.frames[1],`${label} still moves`);
    const factor={brisk:.78,calm:1.22}[style.pace]??1;assert(Math.abs(info.duration-schema.base*factor)<1e-9,`${label} lasts ${schema.base*factor}s`);
    if(style.palette)paletteFrames.add(r.frames[1]);
    for(const k of Object.keys(style))if(k!=='elements')assert.deepStrictEqual(r.style[k],style[k],`${label} applied ${k}`);
   }
   assert.equal(paletteFrames.size,schema.palettes.length,`${theme} palettes all look different`);
  }
  // Untrusted options are reduced to what the theme understands; retired ids load their successor.
  assert.deepStrictEqual(await page.evaluate(()=>WelcomeStyle.normalize('ink',{palette:'nope',accent:'red',pace:'x',font:'mono',layout:'two',size:7,elements:{boat:'yes',mist:2,junk:1},extra:1})),
   {theme:'ink',palette:'classic',accent:null,pace:'standard',font:'script',layout:'two',size:1.25,elements:{mountains:.8,mist:1,boat:1,seal:1}});
  for(const [old,now] of [['cinnabar','ink'],['midnight','aurora'],['aurum','terminal']])assert.equal((await page.evaluate(o=>configureWelcome(o),{theme:old})).theme,now,`${old} opens as ${now}`);
  // Alternative brand geometry must remain continuous and reveal every pixel.
  for(const mark of ['claude','portal'])for(const theme of themes)for(const [width,height] of [[1920,1080],[320,1200]]){
   await page.setViewport({width,height,deviceScaleFactor:1});await page.evaluate(o=>configureWelcome(o),{theme,mark});
   const check=await page.evaluate(()=>{const m=renderer.metrics();renderer.at(renderer.duration);const c=document.getElementById('canvas'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return {mark:m.mark,joins:m.joinDistances,opaque:d.some((x,i)=>i%4===3&&x!==0)};});
   assert.equal(check.mark,mark);assert(check.joins.every(x=>x<.001));assert.equal(check.opaque,false);
   if(width===1920&&theme==='ink'){await page.evaluate(()=>renderer.at(renderer.duration*13.2/15.8));await page.screenshot({path:path.join(media,mark+'.png')});}
  }
  await page.setViewport({width:1920,height:1080,deviceScaleFactor:1});
  const icon='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192"><rect width="192" height="192" fill="#0369a1"/></svg>').toString('base64');
  await page.evaluate(o=>configureWelcome(o),{theme:'ink',mark:'portal',icon});
  await page.waitForFunction(()=>{renderer.at(renderer.duration*13.2/15.8);const c=document.getElementById('canvas'),p=c.getContext('2d').getImageData(1392,540,1,1).data;return p[0]===3&&p[1]===105&&p[2]===161;});
  // A stop issued while font/configuration work is pending cancels playback.
  await page.evaluate(async()=>{window.__nativeEvents=[];window.webkit={messageHandlers:{welcome:{postMessage:m=>__nativeEvents.push(m)}}};const p=playWelcome({theme:'ink',mark:'claude',token:'cancelled'});stopWelcome();await p;});
  await new Promise(r=>setTimeout(r,100));assert.equal(await page.evaluate(()=>__nativeEvents.some(x=>x.token==='cancelled')),false);
  const firstFrame=await page.evaluate(async()=>{
   const schedule=window.requestAnimationFrame;
   window.requestAnimationFrame=()=>0; // WebKit may suppress frames while the panel is transparent.
   try {
    await playWelcome({theme:'ink',mark:'claude',token:'hidden-panel'});
    return __nativeEvents.filter(e=>e.token==='hidden-panel').map(e=>e.event);
   } finally {stopWelcome();window.requestAnimationFrame=schedule;}
  });
  assert.deepStrictEqual(firstFrame,['started'],'A painted first frame must make the native panel visible without a display tick');
  // Exercise selection, keyboard scrubbing, playback and small-window layout.
  await page.setViewport({width:1440,height:1080,deviceScaleFactor:1});await page.goto('file://'+path.resolve('film/gallery.html'));await page.waitForFunction('window.galleryReady');
  for(const theme of themes){await page.click(`[data-theme="${theme}"]`);assert.equal(await page.$eval(`[data-theme="${theme}"]`,el=>el.getAttribute('aria-pressed')),'true');}
  await page.click('[data-theme="ink"]');await page.screenshot({path:path.join(media,'gallery.png'),fullPage:true});
  await page.click('#replay');await page.waitForFunction('Number(document.getElementById("seek").value)>.2');await page.click('#play');assert.equal(await page.$eval('#play',el=>el.getAttribute('aria-label')),'播放动画');
  await page.focus('#seek');await page.keyboard.press('ArrowRight');
  await page.setViewport({width:520,height:900,deviceScaleFactor:1});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No narrow-screen horizontal overflow');
  // Exercise the native settings protocol with a local message-handler stub.
  await page.evaluateOnNewDocument(()=>{window.__settingsMessages=[];window.webkit={messageHandlers:{settings:{postMessage:m=>__settingsMessages.push(m)}}};});
  await page.goto('file://'+path.resolve('film/gallery.html'));await page.waitForFunction('window.galleryReady');
  await page.select('#target-app','com.anthropic.claudefordesktop');await page.click('[data-theme="terminal"]');await page.click('#profile-enabled');await page.click('#apply');
  const saved=await page.evaluate(()=>__settingsMessages.findLast(x=>x.event==='apply'));assert.deepStrictEqual(saved,{event:'apply',bundleID:'com.anthropic.claudefordesktop',theme:'terminal',enabled:false});
  await page.evaluate(x=>didApplyTheme(x),saved);await page.select('#target-app','com.openai.codex');assert.equal(await page.$eval('[data-theme="frost"]',e=>e.getAttribute('aria-pressed')),'true');
  await page.select('#target-app','com.anthropic.claudefordesktop');assert.equal(await page.$eval('[data-theme="terminal"]',e=>e.getAttribute('aria-pressed')),'true');assert.equal(await page.$eval('#profile-enabled',e=>e.checked),false);
  await page.click('#add-app');assert(await page.evaluate(()=>__settingsMessages.some(x=>x.event==='add_app')));
  // Greeting editor: live edit, save over the bridge, confirmation.
  for(const [id,v] of [['#copy-name','Ada'],['#copy-greeting','Hello'],['#copy-seal','通']]){await page.$eval(id,e=>{e.value='';});await page.type(id,v);}
  await new Promise(r=>setTimeout(r,400));assert.equal(await page.$eval('#copy-save',e=>e.disabled),false,'Save enables after an edit');
  await page.click('#copy-save');const copyMessage=await page.evaluate(()=>__settingsMessages.findLast(x=>x.event==='copy'));
  assert.deepStrictEqual(copyMessage,{event:'copy',greeting:'Hello',name:'Ada',title:'欢迎回来',seal:'通'});
  await page.evaluate(x=>didSaveCopy(x),copyMessage);assert.equal(await page.$eval('#copy-save',e=>e.disabled),true,'Save disables once stored');
  await page.click('#copy-reset');await new Promise(r=>setTimeout(r,400));assert.equal(await page.$eval('#copy-name',e=>e.value),'Tommy');
  // Style editor: palette, pace and an element are saved as a minimal delta, then confirmed.
  await page.click('[data-theme="aurora"]');await page.click('#palettes [data-value="crimson"]');await page.click('#pace [data-value="brisk"]');
  await page.$eval('[data-element="meteor"]',e=>e.click());await new Promise(r=>setTimeout(r,300));
  assert.equal(await page.$eval('#style-save',e=>e.disabled),false,'Style save enables after an edit');
  assert.equal(await page.$eval('#time',e=>e.textContent.split(' / ')[1]),(12*.78).toFixed(1),'Preview length follows the pace');
  await page.click('#style-save');const styleMessage=await page.evaluate(()=>__settingsMessages.findLast(x=>x.event==='style'));
  assert.deepStrictEqual(styleMessage,{event:'style',theme:'aurora',options:{palette:'crimson',pace:'brisk',elements:{meteor:0}}});
  await page.evaluate(m=>didSaveStyle(m),styleMessage);assert.equal(await page.$eval('#style-save',e=>e.disabled),true,'Style save disables once stored');
  await page.click('#style-reset');await new Promise(r=>setTimeout(r,300));
  assert.equal(await page.$eval('#palettes [aria-checked="true"]',e=>e.dataset.value),'boreal','Reset returns to the default palette');
  const race=await page.evaluate(()=>{
    const name=document.getElementById('copy-name'), enabled=document.getElementById('profile-enabled');
    const payload={selectedID:'com.anthropic.claudefordesktop',profiles:[
      {bundleID:'com.anthropic.claudefordesktop',theme:'terminal',enabled:false,mark:'claude',name:'Claude'}],copy:WelcomeFilm.copyDefaults};
    updateOpeningProfiles(payload);
    document.querySelector('[data-theme="spell"]').click();enabled.click();
    const type=value=>{name.value=value;name.dispatchEvent(new Event('input'));};
    type('April');document.getElementById('copy-save').click();
    type('Aprilia');didSaveCopy({...WelcomeFilm.copyDefaults,name:'April'});updateOpeningProfiles(payload);
    return [name.value,document.querySelector('.choice[aria-pressed="true"]').dataset.theme,enabled.checked,document.getElementById('copy-save').disabled];
  });
  assert.deepStrictEqual(race,['Aprilia','spell',true,false],'A delayed save or resync must preserve new edits');
  await page.$eval('#copy-name',input=>{input.value='😀'.repeat(17);input.dispatchEvent(new Event('input'));});
  assert.equal(await page.$eval('#copy-name',input=>Array.from(input.value).length),16,'Unicode length agrees with native storage');
  await page.reload();await page.waitForFunction('window.galleryReady');await page.select('#target-app','com.anthropic.claudefordesktop');
  await page.setViewport({width:1440,height:1080,deviceScaleFactor:1});await page.click('[data-theme="ink"]');await page.$eval('#profile-enabled',e=>e.checked=true);await page.screenshot({path:path.join(media,'apps-gallery.png'),fullPage:true});
  assert.deepStrictEqual(errors,[]);fs.writeFileSync('.build/renderer-validation-v03.json',JSON.stringify({ok:true,errors,results},null,2));
  console.log(JSON.stringify({ok:true,themes:themes.length,viewports:viewports.length,marks:3,checks:'motion, transparent exit, style options, migration, app/theme isolation, native protocol, cancellation, replay, seek, responsive layout',maxSubmissionMs:Math.max(...results.map(r=>r.frameMs))},null,2));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
