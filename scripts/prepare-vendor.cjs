const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const src=path.join(root,'node_modules/hyperframes/dist/vendor/npm/gsap@3.15.0/dist/gsap.min.js');
if(!fs.existsSync(src))throw Error('Pinned HyperFrames GSAP vendor file was not found. Run npm ci.');
fs.copyFileSync(src,path.join(root,'film/assets/gsap.min.js'));
console.log('Prepared the pinned GSAP export runtime. Native playback has no npm dependency.');
