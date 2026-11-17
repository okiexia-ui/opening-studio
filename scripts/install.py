"""Install the user-requested local cold-launch companion; never modify ChatGPT."""
import os,pathlib,plistlib,shutil,subprocess,time,signal

project=pathlib.Path(__file__).resolve().parents[1]
user=pathlib.Path.home()
label='local.tommy.welcome-companion'
base=user/'Library/Application Support/WelcomeTommy'
dest=base/'Welcome Tommy.app'
source=project/'delivery/Welcome Tommy.app'
agent=user/'Library/LaunchAgents'/f'{label}.plist'
logs=user/'Library/Logs/WelcomeTommy'
assert (source/'Contents/MacOS/WelcomeTommy').is_file()
subprocess.run([str(source/'Contents/MacOS/WelcomeTommy'),'--self-test'],check=True)
base.mkdir(parents=True,exist_ok=True);agent.parent.mkdir(parents=True,exist_ok=True);logs.mkdir(parents=True,exist_ok=True)
domain=f'gui/{os.getuid()}'
subprocess.run(['launchctl','bootout',domain+'/'+label],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
# Also stop earlier direct launches of these exact generated binaries, including
# a preview application opened during inspection. Never match ChatGPT itself.
known_executables=[str(source/'Contents/MacOS/WelcomeTommy'),str(dest/'Contents/MacOS/WelcomeTommy')]
rows=subprocess.check_output(['ps','-axo','pid=,args='],text=True).splitlines()
for row in rows:
 parts=row.strip().split(None,1)
 if len(parts)!=2:continue
 pid,command=parts
 if any(command==exe or command.startswith(exe+' ') for exe in known_executables):
  try:os.kill(int(pid),signal.SIGTERM)
  except ProcessLookupError:pass
time.sleep(.2)
# Replace only this generated companion. The signed ChatGPT bundle is untouched.
if dest.exists():
 backup=base/'Welcome Tommy.previous.app'
 if backup.exists():shutil.rmtree(backup)
 dest.rename(backup)
shutil.copytree(source,dest)
config={'Label':label,'ProgramArguments':[str(dest/'Contents/MacOS/WelcomeTommy')],'RunAtLoad':True,'KeepAlive':True,'ThrottleInterval':10,'ProcessType':'Interactive','StandardOutPath':str(logs/'stdout.log'),'StandardErrorPath':str(logs/'stderr.log')}
with agent.open('wb') as f:plistlib.dump(config,f)
agent.chmod(0o644)
subprocess.run(['launchctl','bootstrap',domain,str(agent)],check=True)
subprocess.run(['launchctl','kickstart',domain+'/'+label],check=True)
time.sleep(2)
result=subprocess.run(['launchctl','print',domain+'/'+label],check=True,capture_output=True,text=True)
print('\n'.join(line for line in result.stdout.splitlines() if any(k in line for k in ['state =','pid =','program ='])))
print(f'Installed: {dest}\nLaunchAgent: {agent}\nLog: {logs / "events.jsonl"}')
