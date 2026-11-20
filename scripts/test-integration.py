"""Exercise lifecycle and independent profiles with disposable local apps."""
import json, os, pathlib, plistlib, signal, subprocess, time
root=pathlib.Path(__file__).resolve().parents[1]
work=root/'.build';work.mkdir(exist_ok=True)
helper=root/'delivery/Welcome Tommy.app/Contents/MacOS/WelcomeTommy'
fixtures=[]
subprocess.run(['xcrun','swiftc','-swift-version','5','-module-cache-path',str(work/'module-cache'),'-framework','AppKit',str(root/'native/LaunchFixture.swift'),'-o',str(work/'LaunchFixture')],check=True)
for suffix in ['a','b']:
 app=work/f'Launch Fixture {suffix.upper()}.app';(app/'Contents/MacOS').mkdir(parents=True,exist_ok=True)
 import shutil
 shutil.copy2(work/'LaunchFixture',app/'Contents/MacOS/LaunchFixture')
 with (app/'Contents/Info.plist').open('wb') as f:plistlib.dump({'CFBundleIdentifier':f'local.tommy.opening-fixture-{suffix}','CFBundleExecutable':'LaunchFixture','CFBundleName':f'Launch Fixture {suffix.upper()}','CFBundlePackageType':'APPL','NSPrincipalClass':'NSApplication'},f)
 subprocess.run(['codesign','--force','--sign','-',str(app)],check=True,capture_output=True);fixtures.append(app)
ids=['local.tommy.opening-fixture-a','local.tommy.opening-fixture-b']
config=work/'integration-profiles.json'
doc={'version':1,'selectedID':ids[0],'profiles':[{'bundleID':ids[0],'name':'Fixture A','theme':'cinnabar','enabled':True,'path':str(fixtures[0])},{'bundleID':ids[1],'name':'Fixture B','theme':'aurum','enabled':False,'path':str(fixtures[1])}]}
config.write_text(json.dumps(doc))
log=work/'integration-events-v03.jsonl';log.write_text('');proc=None;pids={}
def events():return [json.loads(x) for x in log.read_text().splitlines() if x.strip()]
def wait_for(event,target=None,count=1,timeout=30):
 deadline=time.monotonic()+timeout
 while time.monotonic()<deadline:
  found=[e for e in events() if e['event']==event and (target is None or e.get('target')==target)]
  if len(found)>=count:return found[-1]
  time.sleep(.08)
 raise RuntimeError(f'Timed out waiting for {event} {target}: {events()[-8:]}')
def start_observer(count=1):
 global proc
 proc=subprocess.Popen([str(helper),'--profiles',str(config),'--log',str(log)],stdout=subprocess.DEVNULL,stderr=open(work/'integration-stderr-v03.log','a'))
 wait_for('renderer_ready',count=count)
def stop_observer():
 global proc
 if proc:
  proc.terminate()
  try:proc.wait(timeout=5)
  except subprocess.TimeoutExpired:proc.kill();proc.wait()
  proc=None
def launch(i,background=False,delayed=False):
 prior=sum(e['event']=='cold_launch_detected' and e['target']==ids[i] for e in events())
 args=['open']+(['-g'] if background else [])+[str(fixtures[i])]
 if background or delayed:
  flag='--background-fixture' if background else '--delayed-fixture'
  args+=['--args',flag]
 subprocess.run(args,check=True)
 if i not in pids:pids[i]=wait_for('cold_launch_detected',ids[i],count=prior+1)['pid']
def close(i):
 if i in pids:
  try:os.kill(pids.pop(i),signal.SIGTERM)
  except ProcessLookupError:pass
try:
 start_observer()
 launch(0,background=True);pids[0]=wait_for('cold_launch_detected',ids[0])['pid']
 assert wait_for('launch_skipped',ids[0])['reason']=='background_launch'
 assert not any(e['event']=='animation_started' for e in events()), 'background launch covered the foreground app'
 launch(0);wait_for('activation_no_replay',ids[0]);time.sleep(.3)
 assert not any(e['event']=='animation_started' for e in events()), 'switching to a resident app replayed its opening'
 close(0);wait_for('target_terminated',ids[0])
 print('PASS: background cold launch and later foreground activation stay silent',flush=True)
 launch(0,delayed=True);a=wait_for('animation_started',ids[0]);pids[0]=a['pid'];assert a['theme']=='ink' and a['duration']==12.4
 wait_for('animation_visible',ids[0]);time.sleep(.5);os.kill(pids[0],signal.SIGUSR1);wait_for('window_followed',ids[0])
 first_finish=wait_for('animation_finished',ids[0]);assert first_finish['reason'] in {'completed','user_switched_app'}, first_finish
 if first_finish['reason']=='user_switched_app':print('User switched apps: verified prompt cancellation instead of natural completion',flush=True)
 for _ in range(3):launch(0);time.sleep(.2)
 os.kill(pids[0],signal.SIGUSR2);time.sleep(.3);launch(0);time.sleep(.5)
 assert len([e for e in events() if e['event']=='animation_started'])==1
 print('PASS: cold launch, resize, completion, reopen/hide/activate without replay',flush=True)
 launch(1);disabled=wait_for('cold_launch_detected',ids[1]);pids[1]=disabled['pid'];wait_for('cold_launch_ignored_disabled',ids[1])
 assert len([e for e in events() if e['event']=='animation_started'])==1
 close(1);wait_for('target_terminated',ids[1]);stop_observer()
 saved=json.loads(config.read_text());assert saved['profiles'][0]['theme']=='cinnabar' and saved['profiles'][1]['theme']=='aurum'
 saved['profiles'][1]['enabled']=True;config.write_text(json.dumps(saved));start_observer(2);time.sleep(.3)
 assert len([e for e in events() if e['event']=='animation_started'])==1
 print('PASS: disabled profile, independent persistence, existing app ignored after observer restart',flush=True)
 launch(1);b=wait_for('animation_started',ids[1]);pids[1]=b['pid'];assert b['theme']=='terminal' and b['duration']==11.4
 wait_for('animation_visible',ids[1]);close(0);wait_for('target_terminated',ids[0],count=2);launch(0)
 a2=wait_for('animation_started',ids[0],count=2);pids[0]=a2['pid'];wait_for('animation_visible',ids[0],count=2)
 assert a2['theme']=='ink'
 running=None
 for e in events():
  if e['event']=='animation_started':assert running is None, 'overlapping playback';running=e['target']
  elif e['event']=='animation_finished':assert e['target']==running;running=None
 os.kill(pids[0],signal.SIGHUP);lost=wait_for('animation_finished',ids[0],count=2,timeout=3)
 assert lost['reason'] in {'window_unavailable','user_switched_app'},lost
 launch(0);time.sleep(.4)
 assert sum(e['event']=='animation_started' and e['target']==ids[0] for e in events())==2
 close(0);close(1);wait_for('target_terminated',ids[0],count=3)
 print('PASS: closing the target window dismisses the overlay; reopening stays silent',flush=True)
 print('PASS: second app uses its own theme; overlapping launch supersedes; quit/relaunch replays',flush=True)
 (work/'integration-result-v03.json').write_text(json.dumps({'ok':True,'firstPlaybackFinish':first_finish['reason'],'checks':['background launch ignored','return after background launch','cold launch','resize','visible playback','completion or real-user cancellation','no activation replay','window closed','profile disabled','independent persisted themes','observer restart no replay','single overlay across apps','quit/relaunch'],'events':events()},indent=2))
finally:
 for i in list(pids):close(i)
 stop_observer()
