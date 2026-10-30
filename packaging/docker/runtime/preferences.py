"""Apply explicit environment preferences without dropping persisted settings."""
import json
import os
from pathlib import Path

THEMES = {'light', 'dark', 'blueprint', 'high-contrast-dark', 'high-contrast-light', 'system'}


def prepare(config=Path('/config'), files=Path('/openaec'), environ=None):
    env = os.environ if environ is None else environ
    data = config / 'data/com.opencalcstudio.app'
    data.mkdir(parents=True, exist_ok=True)
    path = data / 'settings.json'
    saved = json.loads(path.read_text()) if path.exists() else {}
    settings = saved.setdefault('settings', {})
    theme = env.get('OPENAEC_THEME')
    language = env.get('OPENAEC_LANGUAGE')
    if theme:
        if theme not in THEMES:
            raise ValueError('Unsupported OPENAEC_THEME')
        settings['theme'] = theme
    if language:
        if not language.replace('-', '').isalpha() or len(language) > 12:
            raise ValueError('Invalid OPENAEC_LANGUAGE')
        settings['locale'] = language
    settings.setdefault('theme', 'light')
    settings.setdefault('locale', 'en')
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(saved, ensure_ascii=False))
    temporary.replace(path)
    user_dirs = config / 'config/user-dirs.dirs'
    user_dirs.parent.mkdir(parents=True, exist_ok=True)
    user_dirs.write_text('XDG_DOCUMENTS_DIR="/openaec"\nXDG_DOWNLOAD_DIR="/openaec"\n')
    start = env.get('OPENAEC_START_FILE')
    if not start:
        return None
    selected = (files / start).resolve()
    if not selected.is_relative_to(files.resolve()) or not selected.is_file():
        raise ValueError('OPENAEC_START_FILE must be an existing file inside /openaec')
    return str(selected)
