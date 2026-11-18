"""Create reproducible HyperFrames entry points, sharing the runtime assets."""
import pathlib,json,re,shutil
root=pathlib.Path(__file__).resolve().parents[1]
themes=[('cinnabar','cinnabar',11.8,'openai'),('midnight','midnight',10.8,'openai'),('aurum','aurum',12.2,'openai'),('claude','cinnabar',11.8,'claude'),('civic','civic',12.6,'openai'),('spell','spell',13.6,'openai'),('voyage','voyage',12.8,'openai'),('neon','neon',11.6,'openai')]
for variant,theme,duration,mark in themes:
 dest=root/'film/variants'/variant
 dest.mkdir(parents=True,exist_ok=True)
 assets=dest/'assets'
 if not assets.exists():assets.symlink_to('../../assets',target_is_directory=True)
 html=f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><title>{theme}</title>
<link rel="stylesheet" href="assets/fonts.css">
<script src="assets/gsap.min.js"></script><script src="assets/lettering.js"></script><script src="assets/handwriting.js"></script><script src="assets/logo.js"></script><script src="assets/marks.js"></script><script src="assets/themes.js"></script><script src="assets/stages.js"></script><script src="assets/premium.js"></script><script src="assets/renderer.js"></script>
<style>html,body{{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}}#root{{position:relative;width:100%;height:100%}}#picture{{width:100%;height:100%;display:block}}</style></head><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="{duration}" data-width="1920" data-height="1080" data-fps="60">
<canvas id="picture" class="clip" data-start="0" data-duration="{duration}" data-track-index="1" data-layout-ignore="true" aria-label="Welcome Tommy opening"></canvas></div>
<script>Promise.all([document.fonts.load('400 154px "Cormorant Garamond"'),document.fonts.load('300 122px Manrope')]).then(()=>{{const renderer=WelcomeFilm.create(document.getElementById('picture'),{{theme:'{theme}',mark:'{mark}'}}),clock={{t:0}};const tl=gsap.timeline({{paused:true}});tl.to(clock,{{t:{duration},duration:{duration},ease:'none',onUpdate:()=>renderer.at(clock.t)}});window.__timelines=window.__timelines||{{}};window.__timelines.main=tl;renderer.at(0);}});</script></body></html>'''
 (dest/'index.html').write_text(html)
 (dest/'package.json').write_text(json.dumps({'name':'opening-'+theme,'private':True,'type':'module'}))
print('Prepared:',', '.join(t[0] for t in themes))
