"""Run the real installer against a disposable Library and a simulated login session."""
import os
from pathlib import Path
import plistlib
import select
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

    # A downloaded build keeps its quarantine mark, and macOS refuses to run an
    # un-notarized app that carries it. The installer must ask before removing
    # the mark, and change nothing unless the person answers yes.
    download = work / 'download' / APP.name
    subprocess.run(['ditto', str(APP), str(download)], check=True)
    subprocess.run(['find', str(download), '-exec', 'xattr', '-w', 'com.apple.quarantine', '0083;00000000;Safari;', '{}', ';'], check=True)
    if subprocess.run(['spctl', '--assess', '--type', 'execute', str(download)], capture_output=True).returncode == 0:
        print('SKIP: Gatekeeper accepts the quarantined build here, so the download prompt cannot be exercised')
    else:
        def install_download(name, answer=None):
            target = work / name / 'Library'
            command = ['/bin/zsh', '-c', 'source "$1"; install_companion "$2" "$3" gui/fixture',
                       'installer-test', str(ROOT / 'scripts/install.sh'), str(download), str(target)]
            if answer is None:
                run = subprocess.run(command, env=env, stdin=subprocess.DEVNULL, capture_output=True, text=True)
                return run.returncode, run.stdout + run.stderr, target
            # A real terminal, as when the .command is opened from Finder.
            primary, secondary = os.openpty()
            proc = subprocess.Popen(command, env=env, stdin=secondary, stdout=secondary, stderr=secondary)
            os.close(secondary)
            output, sent = b'', False
            while select.select([primary], [], [], 60)[0]:
                try:
                    chunk = os.read(primary, 4096)
                except OSError:
                    break
                if not chunk:
                    break
                output += chunk
                if not sent and '[y/N]'.encode() in output:
                    os.write(primary, answer.encode())
                    sent = True
            proc.wait(timeout=60)
            os.close(primary)
            return proc.returncode, output.decode(errors='replace'), target

        for name, answer in [('unattended', None), ('declined', 'n')]:
            code, output, target = install_download(name, answer)
            assert code != 0 and '未做任何更改' in output, (name, code, output)
            assert not (target / 'Application Support/WelcomeTommy' / APP.name).exists(), name
        code, output, target = install_download('accepted', 'y')
        installed = target / 'Application Support/WelcomeTommy' / APP.name
        assert code == 0 and installed.is_dir(), (code, output)
        assert not subprocess.run(['xattr', '-p', 'com.apple.quarantine', str(installed / 'Contents/MacOS/WelcomeTommy')], capture_output=True).returncode == 0
        assert subprocess.run(['xattr', '-p', 'com.apple.quarantine', str(download / 'Contents/MacOS/WelcomeTommy')], capture_output=True).returncode == 0
        subprocess.run(['codesign', '--verify', '--deep', '--strict', str(installed)], check=True)
        print('PASS: quarantined download stops unattended or when declined, installs after an explicit yes')
