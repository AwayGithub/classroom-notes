import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from speech_control import SpeechControl, SpeechActivity, SwitchError


class SpeechTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.launched = []
        self.control = SpeechControl(self.root, 'qwen3-streaming', '1.7B', 'cuda', self.launched.append)
        for name in ['.venv-sensevoice/Scripts/python.exe', 'models/SenseVoiceSmall/model.pt', 'logs/server.pid']:
            p = self.root / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text('123')

    def test_catalog_and_uninstalled_rejected(self):
        choices = {m['id']: m for m in self.control.status()['models']}
        self.assertTrue(choices['sensevoice']['available'])
        self.assertFalse(choices['qwen-0.6b']['available'])
        with self.assertRaises(SwitchError):
            self.control.request('qwen-0.6b')
        self.assertFalse(self.launched)

    def test_active_recording_or_notes_blocks_switch(self):
        for field in ['active_recordings', 'note_jobs']:
            setattr(self.control, field, 1)
            with self.assertRaises(SwitchError) as caught:
                self.control.request('sensevoice')
            self.assertEqual(caught.exception.code, 409)
            setattr(self.control, field, 0)
        self.assertFalse(self.launched)

    def test_switch_plan_and_duplicate(self):
        result = self.control.request('sensevoice')
        self.assertTrue(result['changed'])
        plan = json.loads(self.launched[0].read_text())
        self.assertEqual(plan['target']['backend'], 'funasr')
        self.assertEqual(plan['previous']['backend'], 'qwen3-streaming')
        self.assertEqual(plan['expected_pid'], 123)
        self.assertFalse((self.root / 'speech-profile.json').exists(), 'Helper must change the profile after stopping the old service')
        with self.assertRaises(SwitchError):
            self.control.request('sensevoice')

    def test_launcher_failure_unlocks(self):
        def fail(_):
            raise OSError('test failure')
        self.control.launcher = fail
        with self.assertRaises(SwitchError):
            self.control.request('sensevoice')
        self.assertFalse(self.control.switching)

    def test_websocket_reports_actual_model_and_tracks_until_closed(self):
        sent = []
        async def downstream(scope, receive, send):
            self.assertEqual(self.control.active_recordings, 1)
            await send({'type': 'websocket.send', 'text': json.dumps({'type': 'config'})})
        async def send(value):
            sent.append(value)
        asyncio.run(SpeechActivity(downstream, self.control)({'type': 'websocket', 'path': '/engine/asr'}, None, send))
        self.assertEqual(self.control.active_recordings, 0)
        self.assertEqual(json.loads(sent[0]['text'])['asr']['model'], 'Qwen3-ASR-1.7B')
        self.control.switching = True
        sent.clear()
        asyncio.run(SpeechActivity(downstream, self.control)({'type': 'websocket', 'path': '/engine/asr'}, None, send))
        self.assertEqual(sent[0]['type'], 'websocket.close')

if __name__ == '__main__':
    unittest.main()
