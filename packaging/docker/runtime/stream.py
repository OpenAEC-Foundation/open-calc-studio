"""Serve noVNC and app-aware health on the same HTTP port."""
import json
import os
from pathlib import Path
import urllib.request
from websockify.websocketproxy import ProxyRequestHandler, WebSocketProxy


def alive(name):
    try:
        pid = int(Path('/run/ocs/' + name + '.pid').read_text())
        os.kill(pid, 0)
        # Reject zombies as well as missing processes.
        return Path('/proc/' + str(pid) + '/stat').read_text().split(') ', 1)[1][0] != 'Z'
    except (OSError, ValueError, IndexError):
        return False


def healthy():
    if not all(alive(name) for name in ['app', 'display', 'wm', 'vnc', 'mcp']):
        return False
    try:
        with urllib.request.urlopen('http://127.0.0.1:9742/api/v1/health', timeout=2) as response:
            return json.load(response).get('status') == 'ok'
    except (OSError, ValueError):
        return False


class Handler(ProxyRequestHandler):
    def do_GET(self):
        if self.path.split('?', 1)[0] == '/gezond':
            ok = healthy()
            body = json.dumps({'status': 'ok' if ok else 'unhealthy'}).encode()
            self.send_response(200 if ok else 503)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path == '/':
            self.send_response(302)
            self.send_header('Location', '/vnc.html?autoconnect=1&resize=remote')
            self.end_headers()
            return
        super().do_GET()


if __name__ == '__main__':
    WebSocketProxy(RequestHandlerClass=Handler, listen_host='0.0.0.0', listen_port=3000,
                   target_host='127.0.0.1', target_port=5900,
                   web='/usr/share/novnc', file_only=True).start_server()
