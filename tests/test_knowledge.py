import asyncio,json,tempfile,unittest
from pathlib import Path
from notes import Store
from knowledge import SubjectStore, migrate, search, retrieve, answer, detect_questions

class KnowledgeTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);self.store=SubjectStore(self.root/'kb')
    def test_subject_directories_and_traversal(self):
        a=self.store.create('第一讲','民法');self.store.transcript(a['id'],'合同成立')
        self.assertTrue((self.store.root/'.听课'/'records'/(a['id']+'.json')).exists())
        self.assertEqual(SubjectStore(self.store.root).get(a['id'])['transcript'],'合同成立')
        for name in ('../outside','CON','x/y','x:y','..'):
            with self.assertRaises(ValueError):self.store.create('x',name)
        self.store.assign(a['id'],'法理学')
        self.assertFalse(list((self.store.root/'民法').glob('*.md')))
        self.assertEqual(SubjectStore(self.store.root).get(a['id'])['subject'],'法理学')
    def test_migration_preserves_source_and_history(self):
        old=Store(self.root/'old');a=old.create('旧课');old.transcript(a['id'],'完整内容')
        a['notes']='旧笔记';old.save(a);old.archive(a)
        before=(old.root/(a['id']+'.json')).read_bytes()
        new=migrate(old,self.root/'new')
        self.assertEqual(new.get(a['id'])['transcript'],'完整内容')
        self.assertEqual((old.root/(a['id']+'.json')).read_bytes(),before)
        self.assertTrue((new.root/'.听课'/'history'/'legacy'/'history'/a['id']/'revision-00000.json').exists())
        with self.assertRaises(ValueError):migrate(old,self.root/'new')
    def test_keyword_and_retrieval_scope(self):
        a=self.store.create('第一讲','民法');self.store.transcript(a['id'],'合同成立需要双方意思表示一致。')
        a=self.store.get(a['id']);a['notes']='合同成立需要双方意思表示一致。';self.store.save(a)
        b=self.store.create('其他课','刑法');self.store.transcript(b['id'],'合同成立不能参考这份内容。')
        self.assertEqual([x['id'] for x in search(self.store,'意思表示','民法')],[a['id']])
        refs=retrieve(self.store,'合同如何成立？','民法')
        self.assertTrue(refs);self.assertTrue(all(r['sid']==a['id'] and r['field']=='notes' for r in refs))
        self.assertEqual(retrieve(self.store,'合同成立','刑法'),[])
        self.store.set_deleted([a['id']],True)
        self.assertEqual(search(self.store,'意思表示','民法'),[])
        self.assertEqual(retrieve(self.store,'合同如何成立？','民法'),[])
    async def test_answer_has_sources_and_no_evidence_no_api(self):
        a=self.store.create('第一讲','民法');self.store.transcript(a['id'],'合同成立需要双方意思表示一致。')
        a=self.store.get(a['id']);a['notes']='合同成立需要双方意思表示一致。';self.store.save(a)
        async def llm(system,material):return '需要双方意思表示一致。[1]'
        result=await answer(self.store,a['id'],'合同成立需要什么？',llm)
        self.assertTrue(result['sources']);self.assertEqual(result['sources'][0]['sid'],a['id'])
        async def never(*args):raise AssertionError('No API without evidence')
        result=await answer(self.store,a['id'],'量子隧穿是什么？',never)
        self.assertEqual(result['sources'],[])
    async def test_detector_exact_quote_dedup_and_incremental(self):
        a=self.store.create('第一讲','民法');self.store.transcript(a['id'],'[00:01] 合同成立需要什么条件？')
        async def llm(system,material):
            if '问题识别' in system:return json.dumps([{'question':'合同成立需要什么条件？','quote':'合同成立需要什么条件？'},{'question':'编造的问题','quote':'原文不存在'}],ensure_ascii=False)
            return '资料不足，尚未出现条件的讲解。'
        first=await detect_questions(self.store,a['id'],llm)
        self.assertEqual(len(first),1);self.assertEqual(first[0]['origin'],'classroom')
        again=await detect_questions(self.store,a['id'],llm)
        self.assertEqual(len(again),1)

    def test_readable_documents_rename_trash_restore(self):
        a=self.store.create('第一讲','民法');self.store.transcript(a['id'],'逐字记录')
        a['notes']='# 整理标题\n知识内容';self.store.save(a)
        path=self.store.root/a['_markdown_path'];text=path.read_text(encoding='utf8')
        self.assertIn('第一讲',path.name);self.assertIn('## 大模型整理版',text)
        self.assertIn('## 原始转写文字',text);self.assertIn('逐字记录',text);self.assertIn('知识内容',text)
        self.assertEqual(list((self.store.root/'民法').glob('*.json')),[])
        self.store.rename(a['id'],'第二讲');self.assertFalse(path.exists())
        path=self.store.root/a['_markdown_path'];self.assertTrue(path.exists())
        self.store.set_deleted([a['id']],True);self.assertFalse(path.exists())
        self.store.set_deleted([a['id']],False);self.assertTrue(path.exists())
        self.assertEqual(len(list((self.store.root/'民法').glob('*.md'))),1)
    def test_same_timestamp_title_does_not_overwrite(self):
        a=self.store.create('同名','民法');b=self.store.create('同名','民法')
        b['created']=a['created'];self.store.save(b)
        self.assertNotEqual(a['_markdown_path'],b['_markdown_path'])
        self.assertTrue((self.store.root/a['_markdown_path']).exists())
        self.assertTrue((self.store.root/b['_markdown_path']).exists())

    def test_empty_subject_persists_and_migrates(self):
        self.store.create_subject('线性代数')
        self.store.create_subject('线性代数')
        self.assertTrue((self.store.root/'线性代数').is_dir())
        self.assertIn('线性代数',SubjectStore(self.store.root).subjects())
        new=migrate(self.store,self.root/'moved')
        self.assertIn('线性代数',new.subjects())
        with self.assertRaises(ValueError):self.store.create_subject('../escape')
