const puppeteer=require('puppeteer-core'),fs=require('fs'),path=require('path'),assert=require('assert'),crypto=require('crypto');
(async()=>{
 const executablePath=require('./browser-path.cjs')();if(!executablePath)throw Error('Install Chrome or set HYPERFRAMES_BROWSER_PATH.');
 const browser=await puppeteer.launch({executablePath,headless:true});
 try {
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const viewports=[[1920,1080],[1470,853],[900,700],[500,900],[320,1200]],results=[];
  fs.mkdirSync('.build',{recursive:true});fs.mkdirSync('docs/media',{recursive:true});
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
   if(width===1920){await page.evaluate(id=>renderer.at(WelcomeThemes.find(x=>x.id===id).posterTime),theme);await page.screenshot({path:`docs/media/${theme}.png`});}
  }
  // Custom greetings: every theme takes the words, stays continuous, fits the stage and still exits cleanly.
  const custom=[{greeting:'Hello',name:'Ada Lovelace',title:'早上好',seal:'通'},{greeting:'你好',name:'小明',title:'智能政务工作平台',seal:'准予通行'}];
  for(const copy of custom)for(const theme of themes)for(const [width,height] of [[1920,1080],[320,1200]]){
   await page.setViewport({width,height,deviceScaleFactor:1});
   await page.evaluate(o=>configureWelcome(o),{theme}).then(()=>page.evaluate(()=>{renderer.at(renderer.duration*.45);window.__base=document.getElementById('canvas').toDataURL();}));
   const info=await page.evaluate(o=>configureWelcome(o),{theme,copy});
   const r=await page.evaluate(()=>{const m=renderer.metrics(),c=document.getElementById('canvas'),frames=[];for(const f of [.15,.45,.65,.9]){renderer.at(renderer.duration*f);frames.push(c.toDataURL());}
    const differs=frames[1]!==window.__base;renderer.at(renderer.duration);const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let opaque=false;for(let i=3;i<d.length;i+=4)if(d[i]){opaque=true;break;}
    return {copy:m.copy,joins:m.joinDistances,bounds:m.textBounds,distinct:new Set(frames).size,differs,opaque};});
   assert.deepStrictEqual(info.copy,copy,`${theme} receives the custom words`);assert.deepStrictEqual(r.copy,copy);
   assert(r.joins.every(x=>x<.001),`${theme} pen path stays continuous for ${copy.name}`);
   assert(r.bounds.minX>=200&&r.bounds.maxX<=1720&&r.bounds.minY>=380&&r.bounds.maxY<=760,`${copy.name} handwriting fits the stage: ${JSON.stringify(r.bounds)}`);
   assert.equal(r.distinct,4,`${theme} still moves with ${copy.name}`);assert(r.differs,`${theme} shows the custom words`);assert.equal(r.opaque,false,`${theme} exits transparently with ${copy.name}`);
  }
  // Over-long and hostile input is cleaned the same way native code cleans it.
  assert.deepStrictEqual(await page.evaluate(()=>WelcomeFilm.normalizeCopy({greeting:'  ',name:'A\u0007\u202Eda\n\n Lovelace-Byron-King',title:7,seal:'一二三四五'})),{greeting:'Welcome',name:'Ada Lovelace-Byr',title:'欢迎回来',seal:'一二三四'});
  // Alternative brand geometry must remain continuous and reveal every pixel.
  for(const mark of ['claude','portal'])for(const theme of themes)for(const [width,height] of [[1920,1080],[320,1200]]){
   await page.setViewport({width,height,deviceScaleFactor:1});await page.evaluate(o=>configureWelcome(o),{theme,mark});
   const check=await page.evaluate(()=>{const m=renderer.metrics();renderer.at(renderer.duration);const c=document.getElementById('canvas'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return {mark:m.mark,joins:m.joinDistances,opaque:d.some((x,i)=>i%4===3&&x!==0)};});
   assert.equal(check.mark,mark);assert(check.joins.every(x=>x<.001));assert.equal(check.opaque,false);
   if(width===1920&&theme==='cinnabar'){await page.evaluate(()=>renderer.at(renderer.duration*13.2/15.8));await page.screenshot({path:`docs/media/${mark}.png`});}
  }
  await page.setViewport({width:1920,height:1080,deviceScaleFactor:1});
  const icon='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192"><rect width="192" height="192" fill="#0369a1"/></svg>').toString('base64');
  await page.evaluate(o=>configureWelcome(o),{theme:'cinnabar',mark:'portal',icon});
  await page.waitForFunction(()=>{renderer.at(renderer.duration*13.2/15.8);const c=document.getElementById('canvas'),p=c.getContext('2d').getImageData(1392,540,1,1).data;return p[0]===3&&p[1]===105&&p[2]===161;});
  // A stop issued while font/configuration work is pending cancels playback.
  await page.evaluate(async()=>{window.__nativeEvents=[];window.webkit={messageHandlers:{welcome:{postMessage:m=>__nativeEvents.push(m)}}};const p=playWelcome({theme:'cinnabar',mark:'claude',token:'cancelled'});stopWelcome();await p;});
  await new Promise(r=>setTimeout(r,100));assert.equal(await page.evaluate(()=>__nativeEvents.some(x=>x.token==='cancelled')),false);
  // Exercise selection, keyboard scrubbing, playback and small-window layout.
  await page.setViewport({width:1440,height:1080,deviceScaleFactor:1});await page.goto('file://'+path.resolve('film/gallery.html'));await page.waitForFunction('window.galleryReady');
  for(const theme of themes){await page.click(`[data-theme="${theme}"]`);assert.equal(await page.$eval(`[data-theme="${theme}"]`,el=>el.getAttribute('aria-pressed')),'true');}
  await page.click('[data-theme="cinnabar"]');await page.screenshot({path:'docs/media/gallery.png',fullPage:true});
  await page.click('#replay');await page.waitForFunction('Number(document.getElementById("seek").value)>.2');await page.click('#play');assert.equal(await page.$eval('#play',el=>el.getAttribute('aria-label')),'播放动画');
  await page.focus('#seek');await page.keyboard.press('ArrowRight');
  await page.setViewport({width:520,height:900,deviceScaleFactor:1});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No narrow-screen horizontal overflow');
  // Exercise the native settings protocol with a local message-handler stub.
  await page.evaluateOnNewDocument(()=>{window.__settingsMessages=[];window.webkit={messageHandlers:{settings:{postMessage:m=>__settingsMessages.push(m)}}};});
  await page.goto('file://'+path.resolve('film/gallery.html'));await page.waitForFunction('window.galleryReady');
  await page.select('#target-app','com.anthropic.claudefordesktop');await page.click('[data-theme="aurum"]');await page.click('#profile-enabled');await page.click('#apply');
  const saved=await page.evaluate(()=>__settingsMessages.findLast(x=>x.event==='apply'));assert.deepStrictEqual(saved,{event:'apply',bundleID:'com.anthropic.claudefordesktop',theme:'aurum',enabled:false});
  await page.evaluate(x=>didApplyTheme(x),saved);await page.select('#target-app','com.openai.codex');assert.equal(await page.$eval('[data-theme="frost"]',e=>e.getAttribute('aria-pressed')),'true');
  await page.select('#target-app','com.anthropic.claudefordesktop');assert.equal(await page.$eval('[data-theme="aurum"]',e=>e.getAttribute('aria-pressed')),'true');assert.equal(await page.$eval('#profile-enabled',e=>e.checked),false);
  await page.click('#add-app');assert(await page.evaluate(()=>__settingsMessages.some(x=>x.event==='add_app')));
  // Greeting editor: live edit, save over the bridge, confirmation.
  for(const [id,v] of [['#copy-name','Ada'],['#copy-greeting','Hello'],['#copy-seal','通']]){await page.$eval(id,e=>{e.value='';});await page.type(id,v);}
  await new Promise(r=>setTimeout(r,400));assert.equal(await page.$eval('#copy-save',e=>e.disabled),false,'Save enables after an edit');
  await page.click('#copy-save');const copyMessage=await page.evaluate(()=>__settingsMessages.findLast(x=>x.event==='copy'));
  assert.deepStrictEqual(copyMessage,{event:'copy',greeting:'Hello',name:'Ada',title:'欢迎回来',seal:'通'});
  await page.evaluate(x=>didSaveCopy(x),copyMessage);assert.equal(await page.$eval('#copy-save',e=>e.disabled),true,'Save disables once stored');
  await page.click('#copy-reset');await new Promise(r=>setTimeout(r,400));assert.equal(await page.$eval('#copy-name',e=>e.value),'Tommy');
  await page.setViewport({width:1440,height:1080,deviceScaleFactor:1});await page.click('[data-theme="cinnabar"]');await page.$eval('#profile-enabled',e=>e.checked=true);await page.screenshot({path:'docs/media/apps-gallery.png',fullPage:true});
  assert.deepStrictEqual(errors,[]);fs.writeFileSync('.build/renderer-validation-v03.json',JSON.stringify({ok:true,errors,results},null,2));
  console.log(JSON.stringify({ok:true,themes:themes.length,viewports:viewports.length,marks:3,checks:'motion, transparent exit, app/theme isolation, native protocol, cancellation, replay, seek, responsive layout',maxSubmissionMs:Math.max(...results.map(r=>r.frameMs))},null,2));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
