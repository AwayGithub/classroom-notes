import asyncio
import tempfile
import unittest
from pathlib import Path
try:
    from notes import Store, update_notes
except ImportError:
    Store = None


class NotesTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.assertIsNotNone(Store, 'notes storage and updater must exist')
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store = Store(Path(self.temp.name))
        self.session = self.store.create('数学课')

    async def test_full_rewrite_and_duplicate_snapshot(self):
        calls = []
        async def llm(title, transcript):
            calls.append((title, transcript))
            return '## 极限与连续\n条件之间的关系' if '连续' in transcript else '## 极限\n函数的趋势'
        sid = self.session['id']
        self.store.transcript(sid, '极限是函数的趋势。')
        await update_notes(self.store, sid, llm)
        await update_notes(self.store, sid, llm)
        self.assertEqual(len(calls), 1)
        self.store.transcript(sid, '极限是函数的趋势。连续要求极限等于函数值。')
        result = await update_notes(self.store, sid, llm)
        self.assertEqual(calls[1], ('数学课', '极限是函数的趋势。连续要求极限等于函数值。'))
        self.assertEqual(result['notes'], '## 极限与连续\n条件之间的关系')
        self.assertEqual(Store(Path(self.temp.name)).get(sid)['notes'], result['notes'])

    async def test_failed_call_keeps_cursor_and_retries(self):
        sid = self.session['id']
        self.store.transcript(sid, '老师强调单位换算。')
        async def fail(old, delta):
            raise RuntimeError('offline')
        with self.assertRaises(RuntimeError):
            await update_notes(self.store, sid, fail)
        self.assertEqual(self.store.get(sid)['processed'], '')
        async def ok(old, delta):
            return '## 重点\n单位换算'
        result = await update_notes(self.store, sid, ok)
        self.assertEqual(result['processed'], '老师强调单位换算。')

    async def test_corrected_snapshot_and_concurrent_calls(self):
        sid = self.session['id']
        calls = []
        async def llm(old, delta):
            calls.append(delta)
            await asyncio.sleep(0.01)
            return '## 定义\n' + delta
        self.store.transcript(sid, '速度等于距离乘时间')
        await asyncio.gather(update_notes(self.store, sid, llm), update_notes(self.store, sid, llm))
        self.assertEqual(len(calls), 1)
        self.store.transcript(sid, '速度等于距离除以时间')
        await update_notes(self.store, sid, llm)
        self.assertIn('速度等于距离除以时间', calls[-1])

    async def test_path_escape_rejected(self):
        with self.assertRaises(ValueError):
            self.store.get('../config')

    async def test_legacy_notes_rebuilt_without_new_audio_and_archived(self):
        item=self.session
        item.update(transcript='完整课堂材料', processed='完整课堂材料', notes='新增：错乱旧笔记', revision=7)
        self.store.save(item)
        async def llm(title, transcript):
            self.assertEqual(transcript, '完整课堂材料')
            self.assertNotIn('错乱', title+transcript)
            return '## 课程主题\n重新组织的正文'
        result=await update_notes(self.store,item['id'],llm)
        self.assertEqual(result['notes'],'## 课程主题\n重新组织的正文')
        self.assertEqual(result['revision'],8)
        archives=list((self.store.root/'history'/item['id']).glob('*.json'))
        self.assertTrue(archives)
        self.assertIn('错乱旧笔记',archives[0].read_text(encoding='utf-8'))

    async def test_long_transcript_is_one_revision_and_failure_keeps_old_notes(self):
        text='早期概念。'*3000+'后半段解释和纠正。'*1000
        self.store.transcript(self.session['id'],text)
        self.session['notes']='原有笔记'
        calls=[]
        async def llm(title, transcript):
            calls.append(transcript)
            return '完整重写'
        result=await update_notes(self.store,self.session['id'],llm)
        self.assertEqual(calls,[text])
        self.assertEqual(result['revision'],1)
        self.assertEqual(result['processed'],text)

    async def test_force_regeneration_without_new_transcript(self):
        sid=self.session['id']
        self.store.transcript(sid,'同一份课堂转录')
        async def first(title,transcript): return '第一版'
        async def second(title,transcript): return '主动重整的第二版'
        await update_notes(self.store,sid,first)
        result=await update_notes(self.store,sid,second,force=True)
        self.assertEqual(result['notes'],'主动重整的第二版')

if __name__ == '__main__':
    unittest.main()
