import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
import app as module
from knowledge import SubjectStore


class ArchiveWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[1] / 'work')
        self.addCleanup(self.temp.cleanup)
        self.store = SubjectStore(Path(self.temp.name))
        self.patch = patch.object(module, 'store', self.store)
        self.patch.start()
        self.addCleanup(self.patch.stop)
        self.client = TestClient(module.app)
        self.headers = {'X-Classroom': '1', 'Origin': 'http://127.0.0.1:8765'}
        self.a = self.store.create('第一课', '民法')
        self.b = self.store.create('旧归档', '民法')
        self.store.assign(self.b['id'], '已归档')
        self.c = self.store.create('旧回收记录', '执行法')
        self.store.set_deleted([self.c['id']], True)

    def post(self, path, data):
        return self.client.post(path, json=data, headers=self.headers)

    def test_archive_union_filter_and_restore_both_sources(self):
        rows = self.client.get('/api/archive').json()
        self.assertEqual({r['id'] for r in rows}, {self.b['id'], self.c['id']})
        self.assertEqual(len(self.client.get('/api/archive?q=旧归档').json()), 1)
        result = self.post('/api/sessions/unarchive', {'session_ids': [self.b['id'], self.c['id']]})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(self.store.get(self.b['id'])['subject'], '民法')
        self.assertEqual(self.store.get(self.c['id'])['subject'], '执行法')
        self.assertEqual(self.client.get('/api/archive').json(), [])

    def test_archive_preserves_text_and_origin(self):
        self.store.transcript(self.a['id'], '完整转写')
        response = self.post('/api/sessions/archive', {'session_ids': [self.a['id']]})
        self.assertEqual(response.status_code, 200, response.text)
        item = self.store.get(self.a['id'])
        self.assertEqual((item['subject'], item['archived_from'], item['transcript']), ('已归档', '民法', '完整转写'))

    def test_purge_checks_entire_selection_before_deleting(self):
        payload = {'courses': [{'id': self.b['id'], 'title': self.b['title']}, {'id': self.a['id'], 'title': self.a['title']}], 'confirmation': '彻底删除'}
        self.assertEqual(self.post('/api/archive/purge', payload).status_code, 400)
        self.assertEqual(self.store.get(self.b['id'])['title'], '旧归档')
        payload['courses'] = [{'id': self.b['id'], 'title': '错误名称'}]
        self.assertEqual(self.post('/api/archive/purge', payload).status_code, 400)
        payload['courses'] = [{'id': self.b['id'], 'title': self.b['title']}, {'id': self.c['id'], 'title': self.c['title']}]
        self.assertEqual(self.post('/api/archive/purge', payload).status_code, 200)
        self.assertEqual(self.client.get('/api/archive').json(), [])
        self.assertEqual(self.store.get(self.a['id'])['title'], '第一课')

    def test_purge_requires_confirmation(self):
        payload = {'courses': [{'id': self.b['id'], 'title': self.b['title']}], 'confirmation': '删除'}
        self.assertEqual(self.post('/api/archive/purge', payload).status_code, 400)
        self.assertTrue(self.store.get(self.b['id']))


if __name__ == '__main__':
    unittest.main()
