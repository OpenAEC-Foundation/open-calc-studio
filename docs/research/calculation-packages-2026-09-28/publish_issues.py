#!/usr/bin/env python3
"""Publish the reviewed research backlog after gh authentication; dry-run by default."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import sys

REPO = 'OpenAEC-Foundation/open-calc-studio'
BASE = Path(__file__).resolve().parent
MANIFEST = BASE / 'issues.json'

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--gh', default=shutil.which('gh') or 'gh')
    parser.add_argument('--publish', action='store_true')
    args = parser.parse_args()
    issues = json.loads(MANIFEST.read_text())
    for issue in issues:
        if not (BASE / issue['body_file']).is_file():
            raise SystemExit(f"Missing body: {issue['body_file']}")
    if not args.publish:
        for issue in issues:
            print(f"{issue['priority']} | {issue['title']} | {issue['status']}")
        print('Dry-run only. Use --publish after gh authentication.')
        return

    def gh(*arguments):
        result = subprocess.run([args.gh, *arguments], text=True, capture_output=True)
        if result.returncode:
            raise RuntimeError(result.stderr.strip() or 'GitHub command failed')
        return result.stdout.strip()

    gh('auth', 'status', '--hostname', 'github.com')
    pages = json.loads(gh('api', '--paginate', '--slurp',
                         f'repos/{REPO}/issues?state=all&per_page=100'))
    existing = [i for page in pages for i in page if 'pull_request' not in i]
    for issue in issues:
        marker = f"<!-- ocs-research:2026-09-28:{issue['key']} -->"
        matches = [i for i in existing if i['title'] == issue['title']
                   or marker in (i.get('body') or '')]
        if len(matches) > 1:
            raise RuntimeError(f"Multiple existing matches; review manually: {issue['title']}")
        if matches:
            issue['url'] = matches[0]['html_url']
            issue['status'] = 'existing-' + matches[0]['state']
        else:
            # Marker persists in body and makes a retry safe if creation succeeded
            # but writing the local manifest was interrupted.
            body_path = BASE / issue['body_file']
            body = body_path.read_text()
            if marker not in body:
                body_path.write_text(body.rstrip() + '\n\n' + marker + '\n')
            result = gh('issue', 'create', '--repo', REPO, '--title', issue['title'],
                        '--body-file', str(body_path))
            url = next((line.strip() for line in result.splitlines()
                        if line.startswith(f'https://github.com/{REPO}/issues/')), None)
            if not url:
                raise RuntimeError('Creation returned no issue URL; inspect GitHub before retrying.')
            # Verify the created issue, not just CLI exit status.
            verified = json.loads(gh('issue', 'view', url, '--repo', REPO,
                                     '--json', 'url,title,body,state'))
            if verified['title'] != issue['title'] or marker not in verified['body']:
                raise RuntimeError(f'Created issue verification failed: {url}')
            issue['url'] = verified['url']
            issue['status'] = 'published'
            existing.append({'title': issue['title'], 'body': verified['body'],
                             'html_url': verified['url'], 'state': 'open'})
        temporary = MANIFEST.with_suffix('.tmp')
        temporary.write_text(json.dumps(issues, ensure_ascii=False, indent=2) + '\n')
        temporary.replace(MANIFEST)
        print(f"{issue['status']}: {issue['url']}")
    report = BASE / 'README.md'
    report.write_text(report.read_text().replace(
        '**Publicatiestatus: zeven conceptissues klaar; nog niet op GitHub aangemaakt wegens ontbrekende aanmelding.**',
        '**Publicatiestatus: alle zeven voorstellen zijn gekoppeld aan geverifieerde GitHub-issues.**'))

if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, ValueError) as exc:
        print(f'Stopped: {exc}', file=sys.stderr)
        sys.exit(1)
