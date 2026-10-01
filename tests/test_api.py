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

    def test_standalone_questions_cross_subject_with_history(self):
        from knowledge import SubjectStore
        with patch.object(module, 'store', SubjectStore(Path(self.temp.name)/'qa-kb')):
            a=module.store.create('合同第一讲','民法');b=module.store.create('合同执行','执行法')
            deleted=module.store.create('已删除课','历史科目')
            for course in (a,b,deleted):
                course['notes']='合同成立需要双方意思表示一致，合同执行需要履行义务。';module.store.save(course)
            module.store.set_deleted([deleted['id']],True)
            before={str(p.relative_to(module.store.root)):p.read_bytes() for p in module.store.root.rglob('*') if p.is_file()}
            async def complete(system, material):return '根据课程资料回答。[1]'
            with patch.object(module,'request_completion',complete):
                r=self.client.post('/api/knowledge/ask',json={'question':'合同成立及执行条件？'},headers=self.headers)
                self.assertEqual(r.status_code,200,r.text)
                self.assertEqual({s['subject'] for s in r.json()['sources']},{'民法','执行法'})
                r=self.client.post('/api/knowledge/ask',json={'question':'合同成立条件？','subject':'民法'},headers=self.headers)
                self.assertEqual(r.status_code,200,r.text)
                self.assertEqual({s['sid'] for s in r.json()['sources']},{a['id']})
                r=self.client.post('/api/knowledge/ask',json={'question':'量子隧穿条件？','subject':'民法'},headers=self.headers)
                self.assertEqual(r.status_code,200,r.text);self.assertEqual(r.json()['sources'],[])
                r=self.client.post('/api/knowledge/ask',json={'question':'   '},headers=self.headers)
                self.assertEqual(r.status_code,400)
                self.assertEqual(self.client.post('/api/knowledge/ask',json={'question':'合同成立？'}).status_code,403)
                after={str(p.relative_to(module.store.root)):p.read_bytes() for p in module.store.root.rglob('*') if p.is_file()}
                self.assertEqual(before,{k:v for k,v in after.items() if k in before},'History must not change course files')
                self.assertEqual(len(self.client.get('/api/knowledge/questions').json()),3)
                self.assertEqual(len(self.client.get('/api/knowledge/questions?subject=民法').json()),3)
                r=self.client.post('/api/sessions/'+a['id']+'/ask',json={'question':'合同成立条件？'},headers=self.headers)
                self.assertEqual(r.status_code,200,r.text)
                self.assertEqual({s['sid'] for s in r.json()['sources']},{a['id']})
                self.assertEqual(len(module.store.get(a['id'])['qa']),1)
                self.assertEqual(module.store.get(b['id']).get('qa',[]),[])

    def test_history_limit_durability_and_selected_deletion(self):
        from knowledge import SubjectStore, question_history
        root=Path(self.temp.name)/'history-kb'
        with patch.object(module,'store',SubjectStore(root)):
            course=module.store.create('测试课','测试科目')
            for i in range(12):
                r=self.client.post('/api/knowledge/ask',json={'question':f'问题{i}'},headers=self.headers)
                self.assertEqual(r.status_code,200,r.text)
                self.client.post('/api/sessions/'+course['id']+'/ask',json={'question':f'课程问题{i}'},headers=self.headers)
            entries=question_history(SubjectStore(root))
            self.assertEqual(len(entries),10)
            self.assertEqual(entries[0]['question'],'问题2')
            self.assertIn('answer',entries[-1])
            scoped=self.client.post('/api/knowledge/ask',json={'question':'科目问题','subject':'测试科目'},headers=self.headers).json()
            r=self.client.post('/api/knowledge/questions/delete',json={'ids':[entries[0]['id'],scoped['id']]},headers=self.headers)
            self.assertEqual(len(r.json()),9)
            self.assertEqual(len(question_history(SubjectStore(root),'测试科目')),9)
            persisted=SubjectStore(root).get(course['id'])['qa']
            self.assertEqual(len(persisted),10)
            r=self.client.post('/api/sessions/'+course['id']+'/questions/delete',json={'ids':[persisted[0]['id']]},headers=self.headers)
            self.assertEqual(len(r.json()),9)
            self.assertEqual(len(SubjectStore(root).get(course['id'])['qa']),9)
            self.assertEqual(self.client.post('/api/knowledge/questions/delete',json={'ids':[entries[-1]['id']]}).status_code,403)

    def test_subject_switch_keeps_shared_history_and_imports_legacy(self):
        from knowledge import SubjectStore, atomic_write
        root=Path(self.temp.name)/'shared-history-kb'
        with patch.object(module,'store',SubjectStore(root)):
            module.store.create('测试课甲','科目甲');module.store.create('测试课乙','科目乙')
            def entry(key,subject,time):
                return dict(id=key,question=key,answer='已保存回答',sources=[],subject=subject,created=time)
            legacy={'all':[entry('旧问题全部',None,'2026-10-01T10:00:00')],
                    'subject:科目甲':[entry('旧问题甲','科目甲','2026-10-01T10:01:00')],
                    'subject:科目乙':[entry('旧问题乙','科目乙','2026-10-01T10:02:00')]}
            atomic_write(root/'.听课'/'qa-history.json',json.dumps(legacy,ensure_ascii=False))
            before=self.client.get('/api/knowledge/questions?subject=科目乙').json()
            self.assertEqual([x['id'] for x in before],['旧问题全部','旧问题甲','旧问题乙'])
            for subject in ('科目甲','科目乙'):
                r=self.client.post('/api/knowledge/ask',json={'question':f'{subject}新问题','subject':subject},headers=self.headers)
                self.assertEqual(r.status_code,200,r.text)
            first=self.client.get('/api/knowledge/questions?subject=科目甲').json()
            second=self.client.get('/api/knowledge/questions?subject=科目乙').json()
            self.assertEqual(first,second)
            self.assertEqual(len(first),5)
            with patch.object(module,'store',SubjectStore(root)):
                self.assertEqual(self.client.get('/api/knowledge/questions').json(),first)
            result=self.client.post('/api/knowledge/questions/delete',json={'ids':['旧问题甲'],'subject':'科目乙'},headers=self.headers)
            self.assertEqual(len(result.json()),4)
            self.assertNotIn('旧问题甲',[x['id'] for x in self.client.get('/api/knowledge/questions').json()])

    def test_subject_management_and_busy_guards(self):
        from knowledge import SubjectStore
        with patch.object(module,'store',SubjectStore(Path(self.temp.name)/'kb')):
            c=self.client;h=self.headers
            r=c.post('/api/knowledge/subjects',json={'subject':'测试科目'},headers=h)
            self.assertEqual(r.status_code,200,r.text)
            for key in ('active_recordings','note_jobs','switching'):
                with patch.object(module.speech,key,1):
                    r=c.post('/api/knowledge/subjects/rename',json={'subject':'测试科目','name':'新名称'},headers=h)
                    self.assertEqual(r.status_code,409)
            r=c.post('/api/knowledge/subjects/rename',json={'subject':'测试科目','name':'新名称'},headers=h)
            self.assertEqual(r.status_code,200,r.text)
            r=c.post('/api/knowledge/subjects/archive',json={'subject':'新名称'},headers=h)
            self.assertEqual(r.status_code,200,r.text)
            r=c.post('/api/knowledge/subjects/archive',json={'subject':'已归档'},headers=h)
            self.assertEqual(r.status_code,400)

    def test_purge_preview_confirmation_and_retired_endpoint(self):
        from knowledge import SubjectStore
        with patch.object(module,'store',SubjectStore(Path(self.temp.name)/'purge-kb')):
            module.store.create('测试课','测试科目');c=self.client;h=self.headers
            self.assertEqual(c.post('/api/knowledge/subjects/delete',json={'subject':'测试科目'},headers=h).status_code,409)
            preview=c.post('/api/knowledge/subjects/delete-preview',json={'subject':'测试科目'},headers=h)
            self.assertEqual(preview.status_code,200,preview.text)
            payload={'subject':'测试科目','confirmation':'错','token':preview.json()['token']}
            self.assertEqual(c.post('/api/knowledge/subjects/purge',json=payload,headers=h).status_code,400)
            payload['confirmation']='测试科目'
            with patch.object(module.speech,'active_recordings',1):
                self.assertEqual(c.post('/api/knowledge/subjects/purge',json=payload,headers=h).status_code,409)
            self.assertEqual(c.post('/api/knowledge/subjects/purge',json=payload,headers=h).status_code,200)
            self.assertEqual(module.store.list(),[])

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

    def test_purge_removes_one_course_permanently(self):
        from knowledge import SubjectStore
        with patch.object(module, 'store', SubjectStore(Path(self.temp.name)/'purge-course')):
            kept=module.store.create('留下的课','民法')
            gone=module.store.create('要删除的课','民法')
            module.store.transcript(gone['id'],'这节课的转写')
            gone.update(notes='整理笔记',processed='这节课的转写',revision=1)
            module.store.save(gone)
            module.store.archive(module.store.get(gone['id']))
            h=self.headers
            self.assertEqual(self.client.post('/api/sessions/'+gone['id']+'/purge',json={'confirmation':'错了'},headers=h).status_code,400)
            with patch.object(module.speech,'active_recordings',1):
                self.assertEqual(self.client.post('/api/sessions/'+gone['id']+'/purge',json={'confirmation':gone['title']},headers=h).status_code,409)
            r=self.client.post('/api/sessions/'+gone['id']+'/purge',json={'confirmation':gone['title']},headers=h)
            self.assertEqual(r.status_code,200,r.text)
            self.assertEqual([c['id'] for c in module.store.list()],[kept['id']])
            self.assertFalse(any(gone['id'] in p.name or gone['id'] in p.read_text(encoding='utf-8') for p in module.store.root.rglob('*') if p.is_file()))

    def test_archive_course_remembers_subject_and_restores(self):
        from knowledge import SubjectStore
        with patch.object(module, 'store', SubjectStore(Path(self.temp.name)/'restore-course')):
            course=module.store.create('执行异议','强制执行法')
            h=self.headers
            r=self.client.post('/api/sessions/'+course['id']+'/subject',json={'subject':'已归档'},headers=h)
            self.assertEqual(r.status_code,200,r.text)
            listed=self.client.get('/api/sessions',headers=h).json()
            self.assertEqual(listed[0]['subject'],'已归档')
            self.assertEqual(listed[0]['archived_from'],'强制执行法')
            r=self.client.post('/api/sessions/'+course['id']+'/subject',json={'subject':'强制执行法'},headers=h)
            self.assertEqual(r.status_code,200,r.text)
            self.assertEqual(module.store.get(course['id'])['subject'],'强制执行法')
            self.assertNotIn('archived_from',module.store.get(course['id']))
            earlier=module.store.create('强制执行法-9.18','已归档')
            module.store.create_subject('强制执行法')
            listed={c['id']:c for c in self.client.get('/api/sessions',headers=h).json()}
            self.assertEqual(listed[earlier['id']]['archived_from'],'强制执行法')

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

    def test_knowledge_api_subject_search_answer_and_storage(self):
        from knowledge import SubjectStore
        with patch.object(module,'store',SubjectStore(Path(self.temp.name)/'knowledge')), patch.object(module,'STORAGE_FILE',Path(self.temp.name)/'storage.json'):
            a=self.client.post('/api/sessions',json={'title':'第一讲','subject':'民法'},headers=self.headers).json()
            sid=a['id'];module.store.transcript(sid,'合同成立需要双方意思表示一致。')
            item = module.store.get(sid)
            item['notes'] = '合同成立需要双方意思表示一致。'
            module.store.save(item)
            results=self.client.get('/api/sessions',params={'q':'意思表示','subject':'民法'}).json()
            self.assertEqual(results[0]['id'],sid);self.assertTrue(results[0]['hits'])
            async def fake(system,material):return '双方意思表示一致。[1]'
            with patch.object(module,'request_completion',fake):
                result=self.client.post('/api/sessions/'+sid+'/ask',json={'question':'合同成立需要什么？'},headers=self.headers)
                self.assertEqual(result.status_code,200,result.text);self.assertTrue(result.json()['sources'])
            self.assertEqual(len(self.client.get('/api/sessions/'+sid+'/questions').json()),1)
            changed=self.client.post('/api/sessions/'+sid+'/subject',json={'subject':'合同法'},headers=self.headers)
            self.assertEqual(changed.status_code,200,changed.text)
            response=self.client.post('/api/knowledge/storage',json={'path':str(Path(self.temp.name)/'moved')},headers=self.headers)
            self.assertEqual(response.status_code,200,response.text)
            self.assertEqual(module.store.get(sid)['subject'],'合同法')
            self.assertEqual(module.store.get(sid)['transcript'],'合同成立需要双方意思表示一致。')

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
        with patch.object(module, 'speech', controller), patch.object(controller, 'available', return_value=True):
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

    def test_create_empty_subject_api(self):
        from knowledge import SubjectStore
        with tempfile.TemporaryDirectory() as tmp, patch.object(module,'store',SubjectStore(Path(tmp))):
            response=self.client.post('/api/knowledge/subjects',json={'subject':'线性代数'},headers=self.headers)
            self.assertEqual(response.status_code,200)
            self.assertIn('线性代数',self.client.get('/api/knowledge/settings').json()['subjects'])
            self.assertTrue((Path(tmp)/'线性代数').is_dir())
            self.assertEqual(self.client.post('/api/knowledge/subjects',json={'subject':'../bad'},headers=self.headers).status_code,400)

if __name__ == '__main__':
    unittest.main()
