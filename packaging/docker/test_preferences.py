import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('preferences', Path(__file__).parent / 'runtime/preferences.py')
preferences = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preferences)


class Preferences(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.config = Path(self.temp.name) / 'config'
        self.files = Path(self.temp.name) / 'openaec'
        self.files.mkdir()

    def prepare(self, env):
        return preferences.prepare(self.config, self.files, env)

    def settings(self):
        return json.loads((self.config / 'data/com.opencalcstudio.app/settings.json').read_text())

    def test_defaults_and_no_file(self):
        self.assertIsNone(self.prepare({}))
        self.assertEqual(self.settings()['settings'], {'theme': 'light', 'locale': 'en'})

    def test_environment_overrides_keep_existing_documents_and_settings(self):
        self.prepare({})
        path = self.config / 'data/com.opencalcstudio.app/settings.json'
        path.write_text(json.dumps({'settings': {'theme': 'dark', 'recentFiles': ['/openaec/one.ifcCalc']}, 'other': 123}))
        self.prepare({'OPENAEC_LANGUAGE': 'nl', 'OPENAEC_THEME': 'blueprint'})
        self.assertEqual(self.settings(), {'settings': {'theme': 'blueprint', 'locale': 'nl', 'recentFiles': ['/openaec/one.ifcCalc']}, 'other': 123})

    def test_valid_start_file(self):
        path = self.files / 'budget.ifcCalc'
        path.write_text('{}')
        self.assertEqual(self.prepare({'OPENAEC_START_FILE': 'budget.ifcCalc'}), str(path))

    def test_parent_traversal_and_symlink_escape_are_refused(self):
        outside = self.files.parent / 'outside.ifcCalc'
        outside.write_text('{}')
        (self.files / 'link').symlink_to(outside)
        for name in ['../outside.ifcCalc', 'link', 'missing.ifcCalc']:
            with self.assertRaises(ValueError):
                self.prepare({'OPENAEC_START_FILE': name})

    def test_invalid_preferences_do_not_replace_the_saved_file(self):
        self.prepare({})
        before = self.settings()
        for env in [{'OPENAEC_THEME': 'invalid'}, {'OPENAEC_LANGUAGE': '../nl'}]:
            with self.assertRaises(ValueError): self.prepare(env)
            self.assertEqual(self.settings(), before)


if __name__ == '__main__':
    unittest.main()
