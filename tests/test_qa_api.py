import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
import app as module
from knowledge import SubjectStore


class HybridApiTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.store=SubjectStore(self.root/'kb')
        self.course=self.store.create('示例课','测试科目')
        for patcher in (patch.object(module,'store',self.store),patch.object(module,'CONFIG_FILE',self.root/'config.json')):
            patcher.start();self.addCleanup(patcher.stop)
        self.client=TestClient(module.app)
        self.headers={'X-Classroom':'1'}
        self.refs=[dict(kind='web',field='web',url='https://example.com/article',title='公开资料',text='示例知识',evidence='page')]
        self.decision=json.dumps(dict(sufficient=False,scope='general',search_query='公开问题',answer=''))

    def test_stream_and_reload_web_history(self):
        with patch.object(module,'request_completion',AsyncMock(side_effect=[self.decision,'回答。[1]'])), patch.object(module.AnySearchClient,'search',AsyncMock(return_value=self.refs)):
            response=self.client.post('/api/knowledge/ask',json={'question':'公开问题'},headers=self.headers|{'Accept':'application/x-ndjson'})
        events=[json.loads(x) for x in response.text.splitlines()]
        self.assertEqual([x['stage'] for x in events[:-1]],['local','web','answer'])
        self.assertEqual(events[-1]['type'],'result')
        history=self.client.get('/api/knowledge/questions').json()
        self.assertEqual(history[0]['answer_mode'],'web')
        self.assertEqual(history[0]['sources'][0]['url'],'https://example.com/article')
        self.assertEqual(module.speech.note_jobs,0)

    def test_auto_detection_uses_same_fallback(self):
        quote='月相为什么会发生变化？'
        self.store.transcript(self.course['id'],quote)
        with patch.object(module,'request_completion',AsyncMock(side_effect=[json.dumps([dict(question=quote,quote=quote)]),self.decision,'回答。[1]'])), patch.object(module.AnySearchClient,'search',AsyncMock(return_value=self.refs)) as search:
            response=self.client.post('/api/sessions/'+self.course['id']+'/detect-questions',json={},headers=self.headers)
            repeated=self.client.post('/api/sessions/'+self.course['id']+'/detect-questions',json={},headers=self.headers)
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(response.json()['items'][0]['answer_mode'],'web')
        self.assertEqual(response.json()['items'][0]['quote'],quote)
        self.assertEqual(len(repeated.json()['items']),1)
        self.assertEqual(search.await_count,1)
        self.assertEqual(SubjectStore(self.root/'kb').get(self.course['id'])['qa'][0]['sources'][0]['kind'],'web')

    def test_local_option_and_mode_validation(self):
        with patch.object(module,'request_completion',AsyncMock()) as model,patch.object(module.AnySearchClient,'search',AsyncMock()) as search:
            response=self.client.post('/api/knowledge/ask',json={'question':'问题','mode':'local'},headers=self.headers)
            self.assertEqual(response.status_code,200,response.text)
            self.assertEqual(response.json()['web_status'],'local_only')
            model.assert_not_awaited();search.assert_not_awaited()
        response=self.client.post('/api/knowledge/ask',json={'question':'问题','mode':'invalid'},headers=self.headers)
        self.assertEqual(response.status_code,422)

    def test_stream_rechecks_admission_when_body_starts(self):
        async def scenario():
            request=SimpleNamespace(headers={'accept':'application/x-ndjson'})
            response=await module.ask_knowledge(module.KnowledgeQuestionRequest(question='问题'),request)
            with patch.object(module.speech,'switching',True):
                events=[json.loads(x) async for x in response.body_iterator]
            self.assertEqual(events[-1]['type'],'error')
            self.assertIn('模型切换',events[-1]['message'])
            self.assertEqual(module.speech.note_jobs,0)
            response=await module.ask_question(self.course['id'],module.QuestionRequest(question='问题'),request)
            lock=module.qa_locks[self.course['id']]
            await lock.acquire()
            try:
                events=[json.loads(x) async for x in response.body_iterator]
            finally:
                lock.release()
            self.assertEqual(events[-1]['type'],'error')
            self.assertIn('本课问答正在处理',events[-1]['message'])
            self.assertEqual(module.speech.note_jobs,0)
        with patch.object(module,'request_completion',AsyncMock(return_value=self.decision)) as model, patch.object(module.AnySearchClient,'search',AsyncMock(return_value=[])):
            asyncio.run(asyncio.wait_for(scenario(),1))
            model.assert_not_awaited()
