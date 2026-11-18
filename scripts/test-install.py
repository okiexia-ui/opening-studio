"""Run the real installer against a disposable Library and a simulated login session."""
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'delivery/Welcome Tommy.app'
LABEL = 'local.tommy.welcome-companion'

with tempfile.TemporaryDirectory(prefix='opening-install-') as temp:
    work = Path(temp)
    library = work / 'Test & Upgrade' / 'Library'
    base = library / 'Application Support' / 'WelcomeTommy'
    dest = base / APP.name
    agent = library / 'LaunchAgents' / (LABEL + '.plist')
    disabled = base / 'disabled-launch-agent.plist'
    mock = work / 'launchctl'
    mock.write_text("""#!/bin/zsh
set -eu
[[ "$2" == gui/fixture || "$2" == gui/fixture/local.tommy.welcome-companion ]] || exit 90
state=$MOCK_SESSION/loaded
print -r -- "$1" >> "$MOCK_SESSION/calls"
case $1 in
  print) [[ -f "$state" ]] || exit 1
         if [[ -f "$MOCK_SESSION/stalled" ]]; then print 'state = waiting'
         else print 'pid = 1234'; fi ;;
  bootstrap) [[ -f "$3" ]] || exit 1; touch "$state" ;;
  bootout) /bin/rm -f "$state" "$MOCK_SESSION/stalled";;
  *) exit 91;;
esac
""")
    mock.chmod(0o755)
    env = {**os.environ, 'PATH': str(work) + ':' + os.environ['PATH'], 'MOCK_SESSION': temp}

    def install(source=APP, success=True):
        run = subprocess.run(['/bin/zsh', '-c', 'source "$1"; install_companion "$2" "$3" gui/fixture',
                              'installer-test', str(ROOT / 'scripts/install.sh'), str(source), str(library)],
                             env=env, capture_output=True, text=True)
        assert (run.returncode == 0) == success, (run.returncode, run.stdout, run.stderr)

    install()
    assert plistlib.loads(agent.read_bytes())['ProgramArguments'] == [str(dest / 'Contents/MacOS/WelcomeTommy')]
    original = dest.stat().st_ino
    original_plist = agent.read_bytes()
    damaged = work / 'damaged.app'
    shutil.copytree(APP, damaged)
    with (damaged / 'Contents/Resources/film/native.html').open('a') as file:
        file.write('damaged')
    (work / 'calls').write_text('')
    install(damaged, success=False)
    assert not (work / 'calls').read_text() and dest.stat().st_ino == original

    # Request a registration whose process immediately exits. Bootout of the
    # old job happens before bootstrap, so arm the failure at the new bootstrap.
    script = mock.read_text().replace('touch "$state"', '''touch "$state"
         if [[ -f "$MOCK_SESSION/fail-next" ]]; then /bin/mv "$MOCK_SESSION/fail-next" "$MOCK_SESSION/stalled"; fi''')
    mock.write_text(script)
    (work / 'fail-next').touch()
    install(success=False)
    assert dest.stat().st_ino == original and agent.read_bytes() == original_plist
    assert (work / 'loaded').exists() and not (work / 'stalled').exists()
    assert not any(p.is_dir() for p in base.glob('.install.*'))

    install()
    assert (base / 'Welcome Tommy.previous.app').stat().st_ino == original
    (work / 'loaded').unlink()
    agent.rename(disabled)
    install()
    assert disabled.is_file() and not agent.exists() and not (work / 'loaded').exists()
    print('PASS: clean install, staged signature check, failed startup rollback, previous build and disabled upgrade')
