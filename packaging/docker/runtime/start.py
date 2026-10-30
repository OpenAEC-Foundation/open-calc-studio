"""Supervise one native app and its local display, stream and MCP server."""
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
from preferences import prepare


def main():
    if os.geteuid() == 0:
        raise RuntimeError('Run the container as its unprivileged user')
    start_file = prepare()
    children = []

    def stop(*_):
        for child in reversed(children):
            if child.poll() is None:
                child.terminate()
        for child in children:
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                child.kill()

    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    signal.signal(signal.SIGINT, lambda *_: sys.exit(0))

    def launch(args, name):
        child = subprocess.Popen(args)
        children.append(child)
        Path('/run/ocs/' + name + '.pid').write_text(str(child.pid))
        return child

    try:
        size = os.environ.get('OPENAEC_RESOLUTION', '1440x900')
        width, height = size.split('x')
        if not (640 <= int(width) <= 3840 and 480 <= int(height) <= 2160):
            raise ValueError('Invalid OPENAEC_RESOLUTION')
        launch(['Xvfb', ':99', '-screen', '0', size + 'x24', '-nolisten', 'tcp'], 'display')
        for _ in range(100):
            if Path('/tmp/.X11-unix/X99').exists():
                break
            time.sleep(.1)
        else:
            raise RuntimeError('Virtual display did not start')
        os.environ['DBUS_SESSION_BUS_ADDRESS'] = 'unix:path=/tmp/ocs-dbus'
        launch(['dbus-daemon', '--session', '--nofork', '--address=unix:path=/tmp/ocs-dbus'], 'dbus')
        # openbox has no desktop, panel or launcher; it only manages this window.
        launch(['openbox', '--sm-disable'], 'wm')
        launch(['x11vnc', '-display', ':99', '-localhost', '-rfbport', '5900', '-forever', '-shared', '-nopw'], 'vnc')
        executable = '/usr/bin/Open Calc Studio'
        launch([executable] + ([start_file] if start_file else []), 'app')
        bundle = Path('/usr/lib/Open Calc Studio/_up_/mcp-server/dist/ocs-mcp.mjs')
        if not bundle.is_file():
            raise RuntimeError('The release package has no bundled MCP server')
        launch(['node', str(bundle)], 'mcp')
        launch(['python3', '/opt/ocs-container/stream.py'], 'stream')
        while True:
            # A closed/crashed app makes the container stop, rather than stay green.
            for child in children:
                code = child.poll()
                if code is not None:
                    raise RuntimeError('Container process exited: ' + str(code))
            time.sleep(1)
    finally:
        stop()


if __name__ == '__main__':
    main()
