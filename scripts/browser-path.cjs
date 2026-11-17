const fs=require('fs'),os=require('os'),path=require('path');
module.exports=function(){
 const candidates=[process.env.HYPERFRAMES_BROWSER_PATH,process.env.CHROME_PATH];
 const cache=path.join(os.homedir(),'Library/Caches/ms-playwright');
 if(fs.existsSync(cache))for(const name of fs.readdirSync(cache).filter(n=>n.startsWith('chromium-')).sort().reverse())for(const arch of ['arm64','x64'])candidates.push(path.join(cache,name,`chrome-mac-${arch}/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`));
 candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/google-chrome','/usr/bin/chromium');
 return candidates.find(p=>p&&fs.existsSync(p));
};
