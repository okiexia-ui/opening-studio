const path=require('path'),fs=require('fs'),cp=require('child_process');
const root=path.resolve(__dirname,'..'),cli=path.join(root,'node_modules/hyperframes/bin/hyperframes.mjs');
if(!fs.existsSync(cli)){console.error('Run npm ci at the repository root first.');process.exit(1);}
const browser=require('./browser-path.cjs')(),env={...process.env};if(browser)env.HYPERFRAMES_BROWSER_PATH=browser;
const result=cp.spawnSync(process.execPath,[cli,...process.argv.slice(2)],{cwd:path.join(root,'film'),env,stdio:'inherit'});process.exit(result.status??1);
