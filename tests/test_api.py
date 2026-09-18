import json
import tempfile
import unittest
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
import app as module
from notes import Store


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.patches = [patch.object(module, 'store', Store(root / 'sessions')),
                        patch.object(module, 'CONFIG_FILE', root / 'config.json')]
        for p in self.patches:
            p.start()
            self.addCleanup(p.stop)
        self.client = TestClient(module.app)
        self.headers = {'X-Classroom': '1', 'Origin': 'http://127.0.0.1:8765'}

    def test_library_merge_preserves_sources_and_order(self):
        a = module.store.create('第一段'); b = module.store.create('第二段')
        module.store.transcript(a['id'], '[00:01] 甲'); module.store.transcript(b['id'], '[00:02] 乙')
        a['notes'] = '原笔记'; module.store.save(a)
        before = {p.name:p.read_bytes() for p in module.store.root.glob('*.*')}
        r = self.client.post('/api/sessions/merge', json={'title':'合并课堂','session_ids':[b['id'],a['id']]}, headers=self.headers)
        self.assertEqual(r.status_code, 200, r.text)
        merged = r.json()
        self.assertNotIn(merged['id'], [a['id'],b['id']])
        self.assertLess(merged['transcript'].index('[00:02] 乙'), merged['transcript'].index('[00:01] 甲'))
        self.assertEqual([x['id'] for x in merged['sources']], [b['id'],a['id']])
        self.assertEqual(merged['notes'], '')
        self.assertEqual(merged['processed'], '')
        for name, content in before.items(): self.assertEqual((module.store.root/name).read_bytes(), content)
        self.assertIn('课程资料', self.client.get('/library').text)
        self.assertEqual(self.client.get('/api/sessions/'+merged['id']).json(), merged)

    def test_merge_rejects_invalid_inputs_without_creating_records(self):
        a = module.store.create('有效'); module.store.transcript(a['id'], '原文')
        empty = module.store.create('空白')
        for ids in ([a['id']], [a['id'],a['id']], [a['id'],'f'*32], [a['id'],'../config'], [a['id'],empty['id']]):
            r = self.client.post('/api/sessions/merge', json={'title':'合并','session_ids':ids}, headers=self.headers)
            self.assertIn(r.status_code, (400,404,422), r.text)
            self.assertEqual(len(module.store.list()), 2)
        r = self.client.post('/api/sessions/merge', json={'title':'合并','session_ids':[a['id'],empty['id']]}, headers={'Origin':'https://example.com'})
        self.assertEqual(r.status_code, 403)

    def test_bulk_delete_restore_and_stale_write(self):
        a=module.store.create('空记录'); b=module.store.create('有内容')
        module.store.transcript(b['id'], '保存原文')
        ids=[a['id'],b['id']]
        r=self.client.post('/api/sessions/trash', json={'session_ids':ids}, headers=self.headers)
        self.assertEqual(r.status_code,200,r.text)
        self.assertEqual(self.client.get('/api/sessions').json(),[])
        self.assertEqual(len(self.client.get('/api/trash').json()),2)
        self.assertEqual(self.client.get('/api/sessions/'+b['id']).status_code,404)
        self.assertEqual(self.client.post('/api/sessions/'+b['id']+'/transcript',json={'text':'过期页面'},headers=self.headers).status_code,404)
        r=self.client.post('/api/sessions/restore',json={'session_ids':ids},headers=self.headers)
        self.assertEqual(r.status_code,200,r.text)
        self.assertEqual(module.store.get(b['id'])['transcript'],'保存原文')
        self.assertEqual(len(module.store.list()),2)
        self.assertEqual(self.client.get('/api/trash').json(),[])

    def test_bulk_delete_validation_and_busy_guard(self):
        a=module.store.create('保留')
        for ids in ([a['id'],'f'*32], [a['id'],a['id']], []):
            r=self.client.post('/api/sessions/trash',json={'session_ids':ids},headers=self.headers)
            self.assertIn(r.status_code,(400,404,422),r.text)
            self.assertEqual(len(module.store.list()),1)
        for key in ('active_recordings','note_jobs'):
            with patch.object(module.speech,key,1):
                r=self.client.post('/api/sessions/trash',json={'session_ids':[a['id']]},headers=self.headers)
                self.assertEqual(r.status_code,409,r.text)
        self.assertEqual(self.client.post('/api/sessions/trash',json={'session_ids':[a['id']]}).status_code,403)

    def test_rename_preserves_content_and_survives_reload(self):
        a=module.store.create('旧名称');module.store.transcript(a['id'],'原文')
        a.update(notes='# 原笔记',processed='原文',revision=3);module.store.save(a)
        original=dict(a)
        r=self.client.post('/api/sessions/'+a['id']+'/title',json={'title':'  新课程名称  '},headers=self.headers)
        self.assertEqual(r.status_code,200,r.text)
        self.assertEqual(r.json(),dict(original,title='新课程名称'))
        module.store.cache.clear()
        self.assertEqual(module.store.get(a['id'])['title'],'新课程名称')
        self.assertEqual(module.store.list()[0]['title'],'新课程名称')

    def test_rename_rejects_invalid_deleted_busy_and_cross_site(self):
        import asyncio
        a=module.store.create('保留名称');url='/api/sessions/'+a['id']+'/title'
        for title in ('   ', '长'*201):
            self.assertIn(self.client.post(url,json={'title':title},headers=self.headers).status_code,(400,422))
        lock=asyncio.Lock();asyncio.run(lock.acquire());module.store.locks[a['id']]=lock
        self.assertEqual(self.client.post(url,json={'title':'新名'},headers=self.headers).status_code,409)
        lock.release()
        self.assertEqual(self.client.post(url,json={'title':'新名'}).status_code,403)
        module.store.set_deleted([a['id']],True)
        self.assertEqual(self.client.post(url,json={'title':'新名'},headers=self.headers).status_code,404)
        self.assertEqual(module.store.get(a['id'],include_deleted=True)['title'],'保留名称')

    def test_session_save_export_and_missing_api(self):
        r = self.client.post('/api/sessions', json={'title': '测试课堂'}, headers=self.headers)
        self.assertEqual(r.status_code, 200)
        sid = r.json()['id']
        self.client.post(f'/api/sessions/{sid}/transcript', json={'text': '函数的极限'}, headers=self.headers)
        self.assertIn('函数的极限', self.client.get(f'/api/sessions/{sid}/export').text)
        r = self.client.post(f'/api/sessions/{sid}/notes', json={}, headers=self.headers)
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.client.get(f'/api/sessions/{sid}').json()['processed'], '')

    def test_key_hidden_and_not_forwarded_to_new_provider(self):
        settings = {'base_url': 'https://example.com/v1', 'model': 'test', 'api_key': 'test-secret', 'interval': 45}
        self.assertEqual(self.client.post('/api/settings', json=settings, headers=self.headers).status_code, 200)
        self.assertNotIn('test-secret', self.client.get('/api/settings').text)
        settings['api_key'] = ''
        self.client.post('/api/settings', json=settings, headers=self.headers)
        self.assertEqual(module.read_config()['api_key'], 'test-secret')
        settings['base_url'] = 'https://different.example/v1'
        self.client.post('/api/settings', json=settings, headers=self.headers)
        self.assertEqual(module.read_config()['api_key'], '')

    def test_cross_site_write_rejected(self):
        r = self.client.post('/api/sessions', json={'title': 'bad'}, headers={'X-Classroom': '1', 'Origin': 'https://example.com'})
        self.assertEqual(r.status_code, 403)

    def test_speech_catalog_and_recording_switch_guard(self):
        response = self.client.get('/api/speech/models')
        self.assertEqual(response.status_code, 200)
        self.assertIn('current', response.json())
        self.assertNotIn('api_key', response.text)
        self.assertEqual(self.client.post('/api/speech/model', json={'model_id':'sensevoice'}, headers={'Origin':'https://example.com'}).status_code, 403)
        from speech_control import SpeechControl
        controller = SpeechControl(module.ROOT, 'qwen3-streaming', '1.7B', 'cuda', lambda _: self.fail('Must not launch during recording'))
        controller.active_recordings = 1
        with patch.object(module, 'speech', controller):
            r = self.client.post('/api/speech/model', json={'model_id':'sensevoice'}, headers=self.headers)
            self.assertEqual(r.status_code, 409)
            self.assertIn('录音', r.json()['detail'])

    def test_http_model_contract_and_truncation_preserves_notes(self):
        # External provider is simulated locally; actual HTTP and application code run.
        class Provider(BaseHTTPRequestHandler):
            truncated = False
            def log_message(self, *args):
                pass
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                material = json.loads(body['messages'][1]['content'])
                text = '# '+material['课程名称']+'\n## 课程主线\n'+material['截至当前的全部课堂材料']
                result = {'choices': [{'message': {'content': text}, 'finish_reason': 'length' if self.truncated else 'stop'}]}
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(result).encode())
        server = ThreadingHTTPServer(('127.0.0.1', 0), Provider)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        config = dict(base_url=f'http://127.0.0.1:{server.server_port}/v1', model='local-test', api_key='')
        with patch.object(module, 'read_config', return_value=config):
            sid = self.client.post('/api/sessions', json={'title': 'HTTP测试'}, headers=self.headers).json()['id']
            endpoint = f'/api/sessions/{sid}'
            self.client.post(endpoint+'/transcript', json={'text': '极限'}, headers=self.headers)
            first = self.client.post(endpoint+'/notes', json={}, headers=self.headers)
            self.assertEqual(first.status_code, 200)
            self.assertIn('极限', first.json()['notes'])
            self.client.post(endpoint+'/transcript', json={'text': '极限与连续'}, headers=self.headers)
            second = self.client.post(endpoint+'/notes', json={}, headers=self.headers)
            self.assertIn('极限', second.json()['notes'])
            self.assertIn('与连续', second.json()['notes'])
            Provider.truncated = True
            self.client.post(endpoint+'/transcript', json={'text': '极限与连续，还有导数'}, headers=self.headers)
            self.assertEqual(self.client.post(endpoint+'/notes', json={}, headers=self.headers).status_code, 502)
            saved = self.client.get(endpoint).json()
            self.assertEqual(saved['notes'], second.json()['notes'])
            self.assertEqual(saved['processed'], '极限与连续')

if __name__ == '__main__':
    unittest.main()
