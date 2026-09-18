"""Installed model catalogue and exclusive, recording-safe restart handoff."""
import json
import os
import subprocess
from pathlib import Path
from uuid import uuid4
from notes import atomic_write

MODELS = [
    dict(id='qwen-1.7b', label='Qwen3-ASR-1.7B · GPU', backend='qwen3-streaming', model='1.7B', device='cuda', environment='.venv-qwen'),
    dict(id='qwen-0.6b', label='Qwen3-ASR-0.6B · GPU', backend='qwen3-streaming', model='0.6B', device='cuda', environment='.venv-qwen'),
    dict(id='sensevoice', label='SenseVoiceSmall · CPU', backend='funasr', model='SenseVoiceSmall', device='cpu', environment='.venv-sensevoice'),
    dict(id='whisper-turbo', label='Whisper large-v3-turbo · GPU', backend='faster-whisper', model='large-v3-turbo', device='cuda', environment='.venv'),
]

class SwitchError(Exception):
    def __init__(self, message, code=409):
        super().__init__(message)
        self.code = code

class SpeechControl:
    def __init__(self, root, backend, model, device, launcher=None):
        self.root = Path(root)
        self.current = dict(backend=backend, model=model, device=device)
        self.active_recordings = self.note_jobs = 0
        self.switching = False
        self.operation_id = None
        self.launcher = launcher or self.launch

    def running(self):
        found = next((m for m in MODELS if all(m[k] == self.current[k] for k in ('backend', 'model', 'device'))), {})
        name = self.current['model']
        if self.current['backend'] == 'qwen3-streaming':
            name = 'Qwen3-ASR-' + name
        return dict(self.current, id=found.get('id', ''), model=name)

    def available(self, item):
        if not (self.root / item['environment'] / 'Scripts/python.exe').is_file():
            return False
        if item['backend'] == 'funasr':
            return (self.root / 'models/SenseVoiceSmall/model.pt').is_file()
        if item['backend'] == 'qwen3-streaming':
            folder = self.root / 'models' / ('Qwen3-ASR-' + item['model'])
            if not (folder / 'config.json').is_file():
                return False
            index = folder / 'model.safetensors.index.json'
            try:
                files = set(json.loads(index.read_text())['weight_map'].values()) if index.exists() else {'model.safetensors'}
                return bool(files) and all((folder / f).is_file() and (folder / f).stat().st_size > 0 for f in files)
            except (OSError, ValueError, KeyError):
                return False
        folder = self.root / 'models/models--mobiuslabsgmbh--faster-whisper-large-v3-turbo'
        ref = folder / 'refs/main'
        return ref.is_file() and (folder / 'snapshots' / ref.read_text().strip() / 'model.bin').is_file()

    def status(self):
        last = {}
        try:
            job = json.loads((self.root / 'logs/speech-switch.json').read_text(encoding='utf-8'))
            last = {k: job[k] for k in ('id', 'status', 'target_id')}
            if self.operation_id == last['id'] and last['status'] == 'failed':
                self.switching = False
        except (OSError, ValueError, KeyError):
            pass
        return dict(current=self.running(), switching=self.switching,
                    active_recordings=self.active_recordings, note_jobs=self.note_jobs,
                    last_switch=last,
                    models=[dict(id=m['id'], label=m['label'], available=self.available(m)) for m in MODELS])

    def request(self, model_id):
        last = self.status()['last_switch']
        if last.get('status') == 'switching':
            raise SwitchError('模型正在切换，请稍候')
        if self.switching:
            raise SwitchError('模型正在切换，请稍候')
        if model_id == self.running()['id']:
            return dict(changed=False, target=model_id)
        item = next((m for m in MODELS if m['id'] == model_id), None)
        if not item or not self.available(item):
            raise SwitchError('该模型尚未安装完整，请先安装后再选择', 400)
        if self.active_recordings:
            raise SwitchError('仍有页面正在录音或收尾，请先暂停所有录音并保存')
        if self.note_jobs:
            raise SwitchError('课程笔记正在整理，请等待本轮保存完成后切换')
        try:
            expected_pid = int((self.root / 'logs/server.pid').read_text().strip())
        except (OSError, ValueError):
            raise SwitchError('无法核对服务进程，请通过启动脚本启动服务', 503)
        job = dict(id=uuid4().hex, target_id=model_id, expected_pid=expected_pid,
                   target={k: item[k] for k in ('backend', 'model', 'device')},
                   previous=dict(self.current), status='switching')
        path = self.root / 'logs/speech-switch.json'
        self.switching = True
        self.operation_id = job['id']
        try:
            atomic_write(path, json.dumps(job, ensure_ascii=False, indent=2))
            self.launcher(path)
        except Exception as exc:
            self.switching = False
            job['status'] = 'failed'
            atomic_write(path, json.dumps(job, ensure_ascii=False, indent=2))
            raise SwitchError('无法启动模型切换，当前模型继续可用', 503) from exc
        return dict(changed=True, target=model_id, operation_id=job['id'])

    def launch(self, path):
        powershell = Path(os.environ['SystemRoot']) / 'System32/WindowsPowerShell/v1.0/powershell.exe'
        with (self.root / 'logs/speech-switch.log').open('a', encoding='utf-8') as log:
            process = subprocess.Popen([str(powershell), '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
                              str(self.root / 'switch-speech.ps1')], cwd=self.root,
                             stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                             creationflags=subprocess.CREATE_NO_WINDOW)
            try:
                code = process.wait(timeout=0.3)
            except subprocess.TimeoutExpired:
                return
            raise RuntimeError(f"Speech switch helper exited early: {code}")

class SpeechActivity:
    def __init__(self, app, control):
        self.app, self.control = app, control

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'websocket' or not scope.get('path', '').startswith('/engine/asr'):
            return await self.app(scope, receive, send)
        if self.control.switching:
            await send(dict(type='websocket.close', code=1013, reason='模型正在切换，请稍候'))
            return
        self.control.active_recordings += 1
        async def identified_send(event):
            if event['type'] == 'websocket.send' and event.get('text'):
                try:
                    data = json.loads(event['text'])
                    if data.get('type') == 'config':
                        data['asr'] = self.control.running()
                        event = dict(event, text=json.dumps(data, ensure_ascii=False))
                except (ValueError, AttributeError):
                    pass
            await send(event)
        try:
            await self.app(scope, receive, identified_send)
        finally:
            self.control.active_recordings -= 1
