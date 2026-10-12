import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx

from knowledge import SubjectStore, knowledge_answer, detect_questions
from web_search import AnySearchClient, WebSearchError, parse_search_results, public_url


SEARCH_TEXT = '''## Search Results (3 results, 100ms)

### 1. 官方说明
- **URL**: https://example.com/guide
- 概念的解释与适用条件。

### 2. 重复说明
- **URL**: https://example.com/guide
- 同一网页。

### 3. 本机服务
- **URL**: http://127.0.0.1:8765/api/settings
- 不可用的外部来源。
'''


class SearchTests(unittest.IsolatedAsyncioTestCase):
    def test_parse_real_markdown_shape_and_deduplicate(self):
        refs = parse_search_results(SEARCH_TEXT)
        self.assertEqual(len(refs), 1)
        self.assertEqual(refs[0]['title'], '官方说明')
        self.assertEqual(refs[0]['url'], 'https://example.com/guide')
        self.assertIn('适用条件', refs[0]['text'])

    def test_public_urls(self):
        for value in ('javascript:alert(1)', 'file:///C:/secret', 'https://localhost/x',
                      'http://127.0.0.1/x', 'https://10.1.2.3', 'https://[::1]',
                      'https://user:pass@example.com', 'https://printer.local/x'):
            self.assertIsNone(public_url(value), value)
        self.assertEqual(public_url('https://example.com/guide#part'), 'https://example.com/guide')

    async def test_search_and_extract_send_only_query(self):
        requests = []

        def handle(req):
            data = json.loads(req.content)
            requests.append(data['params'])
            text = SEARCH_TEXT if data['params']['name'] == 'search' else '# 官方说明\n完整正文以及来源。'
            return httpx.Response(200, json={'result': {'content': [{'type': 'text', 'text': text}]}})

        client = AnySearchClient(api_key='test-secret', transport=httpx.MockTransport(handle))
        refs = await client.search('适用条件')
        self.assertEqual(requests[0]['arguments'], {'query': '适用条件', 'max_results': 3})
        self.assertEqual(len(requests), 2)
        self.assertEqual(refs[0]['kind'], 'web')
        self.assertEqual(refs[0]['evidence'], 'page')
        self.assertIn('完整正文', refs[0]['text'])
        self.assertNotIn('test-secret', json.dumps(refs))

    async def test_extract_error_keeps_search_excerpt(self):
        def handle(req):
            if json.loads(req.content)['params']['name'] == 'search':
                return httpx.Response(200, json={'result': {'content': [{'type': 'text', 'text': SEARCH_TEXT}]}})
            return httpx.Response(429, text='secret upstream message')

        refs = await AnySearchClient(api_key='key', transport=httpx.MockTransport(handle)).search('问题')
        self.assertEqual(refs[0]['evidence'], 'snippet')
        self.assertIn('适用条件', refs[0]['text'])

    async def test_tool_error_is_not_evidence(self):
        transport = httpx.MockTransport(lambda req: httpx.Response(200, json={
            'result': {'isError': True, 'content': [{'type': 'text', 'text': 'secret'}]}}))
        with self.assertRaises(WebSearchError) as error:
            await AnySearchClient(api_key='key', transport=transport).search('问题')
        self.assertNotIn('secret', str(error.exception))

    async def test_missing_key_does_not_send_request(self):
        def forbidden(req):
            self.fail('Missing credentials must not cause a request')
        with self.assertRaises(WebSearchError):
            await AnySearchClient(api_key='',transport=httpx.MockTransport(forbidden)).search('问题')

    async def test_search_timeout_is_safe_failure(self):
        def timeout(req):
            raise httpx.ReadTimeout('secret upstream detail',request=req)
        with self.assertRaises(WebSearchError) as error:
            await AnySearchClient(api_key='key',transport=httpx.MockTransport(timeout)).search('问题')
        self.assertNotIn('secret',str(error.exception))

    async def test_total_deadline_preserves_completed_search(self):
        async def handle(req):
            if json.loads(req.content)['params']['name']=='search':
                return httpx.Response(200,json={'result':{'content':[{'type':'text','text':SEARCH_TEXT}]}})
            await asyncio.sleep(10)
        original_timeout=asyncio.timeout
        with patch('web_search.asyncio.timeout',side_effect=lambda _:original_timeout(.05)):
            refs=await AnySearchClient(api_key='key',transport=httpx.MockTransport(handle)).search('问题')
        self.assertEqual(refs[0]['evidence'],'snippet')
        self.assertIn('适用条件',refs[0]['text'])


class HybridTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store = SubjectStore(Path(self.temp.name))
        item = self.store.create('注意力机制', '机器学习')
        item['notes'] = '注意力机制将查询与键匹配，再对值加权求和。'
        self.store.save(item)
        self.web = AsyncMock(return_value=[dict(kind='web', field='web', title='公开文档',
            url='https://example.com/guide', text='状态空间模型的公开说明。', evidence='page')])

    async def test_sufficient_local_never_searches(self):
        complete = AsyncMock(return_value=json.dumps(dict(sufficient=True, scope='general',
            search_query='', answer='注意力机制对值加权求和。[1]')))
        result = await knowledge_answer(self.store, '注意力机制怎么计算？', complete, web_search=self.web)
        self.web.assert_not_awaited()
        self.assertEqual(complete.await_count, 1)
        self.assertEqual(result['answer_mode'], 'local')
        self.assertIn('[1]', result['answer'])

    async def test_assessment_uses_public_citation_numbers(self):
        async def complete(system, material):
            self.assertNotIn('sid', material['sources'][0])
            self.assertEqual(material['sources'][0]['number'], 1)
            return json.dumps(dict(sufficient=True, scope='general', relevant_sources=[1],
                search_query='', answer='加权求和。[1]'))
        result=await knowledge_answer(self.store,'注意力机制怎么计算？',complete,web_search=self.web)
        self.assertEqual(result['web_status'],'not_needed')
        self.assertIn('sid',result['sources'][0])
        self.web.assert_not_awaited()

    async def test_partial_local_gets_web_and_numbered_mixed_sources(self):
        complete = AsyncMock(side_effect=[json.dumps(dict(sufficient=False, scope='general',
            search_query='注意力机制 状态空间模型 区别', answer='课程介绍了加权求和。[1]')),
            '课程说明：[1]。公开文档补充：[2]。错误引用：[99]。'])
        stages = []
        result = await knowledge_answer(self.store, '注意力机制和状态空间模型的区别？', complete,
            web_search=self.web, progress=stages.append)
        self.web.assert_awaited_once_with('注意力机制 状态空间模型 区别')
        self.assertEqual(result['answer_mode'], 'mixed')
        self.assertEqual([x['number'] for x in result['sources']], [1, 2])
        self.assertEqual(result['sources'][1]['kind'], 'web')
        self.assertIn('web', stages)
        self.assertNotIn('[99]', result['answer'])

    async def test_no_local_hits_can_answer_from_web(self):
        complete = AsyncMock(side_effect=[json.dumps(dict(sufficient=False, scope='general',
            search_query='月相 形成原因', answer='')),'月相的解释。[1]'])
        result = await knowledge_answer(self.store, '月相怎么形成？', complete, web_search=self.web)
        self.assertEqual(result['answer_mode'], 'web')
        self.assertEqual(result['sources'][0]['number'], 1)

    async def test_incidental_keyword_hits_are_excluded(self):
        complete=AsyncMock(side_effect=[json.dumps(dict(sufficient=False,scope='general',
            relevant_sources=[],search_query='注意力 临床定义',answer='')),'公开资料。[1]'])
        result=await knowledge_answer(self.store,'临床意义的注意力是什么？',complete,web_search=self.web)
        self.assertEqual(result['answer_mode'],'web')
        self.assertEqual(len(result['sources']),1)
        self.assertEqual(result['sources'][0]['number'],1)

    async def test_teacher_claim_stays_local(self):
        complete = AsyncMock(return_value=json.dumps(dict(sufficient=False, scope='course',
            search_query='', answer='笔记没有记下老师的这个例子。')))
        result = await knowledge_answer(self.store, '老师解释注意力机制时用了什么例子？', complete, web_search=self.web)
        self.web.assert_not_awaited()
        self.assertEqual(result['web_status'], 'course_only')

    async def test_local_only_keeps_original_path(self):
        complete = AsyncMock(return_value='加权求和。[1]')
        result = await knowledge_answer(self.store, '注意力机制？', complete)
        self.assertEqual(result['answer_mode'], 'local')
        self.assertEqual(complete.await_count, 1)

    async def test_search_failure_preserves_partial_answer(self):
        self.web.side_effect = WebSearchError('联网搜索暂时不可用')
        complete = AsyncMock(return_value=json.dumps(dict(sufficient=False, scope='general',
            search_query='注意力机制 区别', answer='课程内容：[1]')))
        result = await knowledge_answer(self.store, '注意力机制有什么区别？', complete, web_search=self.web)
        self.assertEqual(result['answer'], '课程内容：[1]')
        self.assertEqual(result['web_status'], 'failed')
        self.assertTrue(result['notice'])

    async def test_web_synthesis_failure_keeps_course_sources_only(self):
        complete = AsyncMock(side_effect=[json.dumps(dict(sufficient=False, scope='general',
            search_query='注意力机制', answer='已知部分。[1]')), RuntimeError('provider secret')])
        result = await knowledge_answer(self.store, '注意力机制对比？', complete, web_search=self.web)
        self.assertEqual(result['answer'], '已知部分。[1]')
        self.assertEqual(len(result['sources']), 1)
        self.assertNotIn('secret', result['notice'])

    async def test_invalid_assessment_does_not_trigger_search(self):
        complete = AsyncMock(side_effect=['{"sufficient":"false"}', '已有资料。[1]'])
        result = await knowledge_answer(self.store, '注意力机制？', complete, web_search=self.web)
        self.web.assert_not_awaited()
        self.assertEqual(result['web_status'], 'assessment_failed')
        self.assertNotIn('sufficient', result['answer'])

    async def test_automatic_detection_searches_and_deduplicates(self):
        course=self.store.create('自动问答测试','其他科目')
        quote='月相为什么发生变化？'
        self.store.transcript(course['id'],quote)
        complete=AsyncMock(side_effect=[json.dumps([dict(question=quote,quote=quote)]),
            json.dumps(dict(sufficient=False,scope='general',search_query='月相 形成原因',answer='')),
            '公开资料解释。[1]'])
        entries=await detect_questions(self.store,course['id'],complete,web_search=self.web)
        self.assertEqual(entries[0]['answer_mode'],'web')
        self.assertEqual(entries[0]['origin'],'classroom')
        self.assertEqual(entries[0]['sources'][0]['kind'],'web')
        await detect_questions(self.store,course['id'],complete,web_search=self.web)
        self.assertEqual(self.web.await_count,1)


if __name__ == '__main__':
    unittest.main()
