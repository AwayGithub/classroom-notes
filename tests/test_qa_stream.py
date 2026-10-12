import asyncio
import json
import unittest
from types import SimpleNamespace
from fastapi import HTTPException
from qa_stream import qa_response


class StreamTests(unittest.IsolatedAsyncioTestCase):
    async def test_json_keeps_original_contract(self):
        async def run(progress):
            self.assertIsNone(progress)
            return {'answer': '答案'}
        self.assertEqual(await qa_response(SimpleNamespace(headers={}), run), {'answer': '答案'})

    async def test_stages_result_and_error(self):
        async def run(progress):
            progress('local'); progress('web'); progress('answer')
            return {'answer': '答案', 'sources': []}
        request = SimpleNamespace(headers={'accept': 'application/x-ndjson'})
        response = await qa_response(request, run)
        messages = [json.loads(chunk) async for chunk in response.body_iterator]
        self.assertEqual([m['stage'] for m in messages[:-1]], ['local', 'web', 'answer'])
        self.assertEqual(messages[-1]['type'], 'result')
        async def fail(progress):
            raise RuntimeError('secret upstream detail')
        response = await qa_response(request, fail)
        messages = [json.loads(chunk) async for chunk in response.body_iterator]
        self.assertEqual(messages[-1]['type'], 'error')
        self.assertNotIn('secret', str(messages))

    async def test_disconnection_cancels_work(self):
        cancelled = asyncio.Event()
        async def run(progress):
            try:
                progress('local')
                await asyncio.sleep(100)
            finally:
                cancelled.set()
        response = await qa_response(SimpleNamespace(headers={'accept': 'application/x-ndjson'}), run)
        iterator = response.body_iterator
        await anext(iterator)
        await iterator.aclose()
        self.assertTrue(cancelled.is_set())
