import unittest
from note_writer import compose_notes

class WriterTests(unittest.IsolatedAsyncioTestCase):
    async def test_editor_checks_draft_against_source_and_returns_only_final(self):
        calls=[]
        async def complete(system, material):
            calls.append(material)
            if len(calls)==1:return '重复且含推测的初稿'
            self.assertEqual(material['待审校初稿'],'重复且含推测的初稿')
            self.assertEqual(material['截至当前的全部课堂材料'],'有证据的完整转录')
            return '# 课程\n完整精简成稿'
        self.assertEqual(await compose_notes('课程','有证据的完整转录',complete),'# 课程\n完整精简成稿')
        self.assertEqual(len(calls),2)

    async def test_full_source_reaches_writer_without_old_note_or_delta(self):
        async def complete(system, material):
            self.assertEqual(material['课程名称'],'课程')
            self.assertEqual(material['截至当前的全部课堂材料'],'前文定义。后文解释并修正。')
            return '# 课程\n## 定义与解释\n完整成稿'
        result=await compose_notes('课程','前文定义。后文解释并修正。',complete)
        self.assertEqual(result,'# 课程\n## 定义与解释\n完整成稿')

    async def test_long_lecture_includes_beginning_and_end_in_global_rewrite(self):
        source='开头的重要定义。'+('中间材料。'*10000)+'结尾纠正前面的定义。'
        async def complete(system, material):
            if '课堂材料' in material:
                chunk=material['课堂材料']
                return ('开头的重要定义。' if '开头的重要定义' in chunk else '')+('结尾纠正前面的定义。' if '结尾纠正前面' in chunk else '')+'压缩后中间知识。'
            whole=material['截至当前的全部课堂材料']
            self.assertIn('开头的重要定义',whole)
            self.assertIn('结尾纠正前面的定义',whole)
            return '整合全课后的新结构'
        self.assertEqual(await compose_notes('课程',source,complete),'整合全课后的新结构')

    async def test_failed_long_lecture_reduction_propagates(self):
        async def complete(system, material): return ''
        with self.assertRaises(ValueError):
            await compose_notes('课程','字'*50000,complete)
