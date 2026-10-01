import unittest
from knowledge import search


class MemoryStore:
    def __init__(self, items):
        self.items = items

    def list(self, deleted=False):
        return [{k: item[k] for k in ('id', 'title', 'subject', 'created')} for item in self.items]

    def get(self, sid, include_deleted=False):
        return next(item for item in self.items if item['id'] == sid)


class SentenceSearchTests(unittest.TestCase):
    def setUp(self):
        self.item = dict(id='a', title='第一课', subject='法律', created='2026-10-01',
                         transcript='执行需要依据。没有匹配的句子。执行也需要明确。' + '无关内容。' * 80 + '最后仍可执行。',
                         notes='## 条件\n- **执行**：内容合法。\n利率为2.5%，执行条件明确。')
        self.store = MemoryStore([self.item])

    def test_every_matching_sentence_including_late_matches(self):
        self.item['notes'] = self.item['transcript']
        hits = search(self.store, '执行')[0]['hits']
        original = [h['sentence'] for h in hits if h['field'] == '课程笔记']
        self.assertEqual(original, ['执行需要依据。', '执行也需要明确。', '最后仍可执行。'])

    def test_notes_remove_formatting_and_keep_decimal(self):
        hits = search(self.store, '执行')[0]['hits']
        notes = [h['sentence'] for h in hits if h['field'] == '课程笔记']
        self.assertEqual(notes, ['执行：内容合法。', '利率为2.5%，执行条件明确。'])

    def test_transcript_and_date_are_excluded(self):
        self.assertEqual(search(self.store, '最后仍可'), [])
        self.assertEqual(search(self.store, '2026-10-01'), [])
        self.assertEqual([h['field'] for h in search(self.store, '第一课')[0]['hits']], ['课程名称'])

    def test_one_sentence_of_context_on_each_side_and_boundaries(self):
        self.item['notes'] = '开头。前一句。这里执行。后一句。结尾。'
        hit = search(self.store, '执行')[0]['hits'][0]
        self.assertEqual(hit['text'], '前一句。这里执行。后一句。')
        self.assertEqual(search(self.store, '开头')[0]['hits'][0]['text'], '开头。前一句。')
        self.assertEqual(search(self.store, '结尾')[0]['hits'][0]['text'], '后一句。结尾。')

    def test_scope_multi_term_and_case_insensitive(self):
        self.assertEqual(search(self.store, '执行', '其他科目'), [])
        self.assertEqual(search(self.store, '执行 不存在'), [])
        self.item['notes'] = 'Office works. OFFICE also works.'
        self.assertEqual(len(search(self.store, 'office')[0]['hits']), 2)
