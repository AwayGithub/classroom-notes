import tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from knowledge import SubjectStore

class SubjectManagementTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.store=SubjectStore(Path(self.tmp.name)/'kb')
    def test_rename_delete_preserves_live_and_trash_contents(self):
        s=self.store;a=s.create('第一讲','民法');s.transcript(a['id'],'完整原文');a.update(notes='完整笔记',qa=[{'answer':'答案'}]);s.save(a)
        b=s.create('第二讲','民法');s.set_deleted([b['id']],True)
        s.change_subject('民法','民法总论')
        self.assertFalse((s.root/'民法').exists())
        fresh=SubjectStore(s.root);self.assertEqual(fresh.get(a['id'])['subject'],'民法总论')
        self.assertEqual(fresh.get(b['id'],True)['subject'],'民法总论')
        s.change_subject('民法总论')
        fresh=SubjectStore(s.root);item=fresh.get(a['id'])
        self.assertEqual((item['subject'],item['transcript'],item['notes'],item['qa']),('已归档','完整原文','完整笔记',[{'answer':'答案'}]))
        self.assertIn('完整原文',(s.root/item['_markdown_path']).read_text(encoding='utf-8'))
        self.assertTrue(fresh.get(b['id'],True).get('deleted_at'))
    def test_empty_duplicate_reserved_and_unmanaged(self):
        s=self.store;s.create_subject('民法');s.change_subject('民法','刑法');s.change_subject('刑法')
        self.assertNotIn('刑法',s.subjects())
        s.create_subject('民法');s.create_subject('刑法')
        for name,target in [('已归档','改名'),('民法','刑法'),('民法','../outside')]:
            with self.assertRaises(ValueError):s.change_subject(name,target)
        extra=s.root/'民法'/'我的资料.txt';extra.write_text('保留',encoding='utf-8')
        with self.assertRaises(ValueError):s.change_subject('民法')
        self.assertEqual(extra.read_text(encoding='utf-8'),'保留')
    def test_failed_write_rolls_back(self):
        s=self.store;a=s.create('第一讲','民法');b=s.create('第二讲','民法');original=s.save;count=0
        def fail_once(item):
            nonlocal count
            count+=1
            if count==2:raise OSError('disk error')
            return original(item)
        with patch.object(s,'save',side_effect=fail_once):
            with self.assertRaises(OSError):s.change_subject('民法','刑法')
        fresh=SubjectStore(s.root)
        for item in [a,b]:self.assertEqual(fresh.get(item['id'])['subject'],'民法')
        self.assertNotIn('刑法',s.subjects())
    def test_permanent_delete_all_owned_files_and_keep_other_subject(self):
        s=self.store;a=s.create('第一课','删除测试');a['notes']='旧笔记';s.save(a);s.archive(a)
        b=s.create('回收记录','删除测试');s.set_deleted([b['id']],True)
        other=s.create('保留课','其他科目');s.transcript(other['id'],'应当保留')
        extra=s.root/'删除测试'/'附件';extra.mkdir();(extra/'manual.json').write_text('{}')
        legacy=s.root/'.听课'/'history'/'legacy'/'旧科目'/'history'/a['id'];legacy.mkdir(parents=True);(legacy/'revision.json').write_text('{}')
        plan=s.deletion_plan('删除测试')
        with self.assertRaises(ValueError):s.purge_subject('删除测试','错误名称',plan['token'])
        (extra/'new.txt').write_text('新文件')
        with self.assertRaises(ValueError):s.purge_subject('删除测试','删除测试',plan['token'])
        plan=s.deletion_plan('删除测试');s.purge_subject('删除测试','删除测试',plan['token'])
        for path in plan['files']:self.assertFalse(path.exists(),str(path))
        self.assertFalse((s.root/'删除测试').exists())
        with self.assertRaises(FileNotFoundError):s.get(a['id'])
        self.assertEqual(SubjectStore(s.root).get(other['id'])['transcript'],'应当保留')
    def test_migrate_legacy_uncategorized(self):
        s=self.store;a=s.create('旧课程','临时科目')
        a['subject']='未分类'
        import json
        (s.root/'.听课'/'records'/(a['id']+'.json')).write_text(json.dumps(a,ensure_ascii=False),encoding='utf-8')
        s.cache.clear();(s.root/'未分类').mkdir()
        s.migrate_uncategorized();s.migrate_uncategorized()
        self.assertEqual(s.get(a['id'])['subject'],'已归档')
        self.assertFalse((s.root/'未分类').exists())
    def test_purge_archive_keeps_default_category(self):
        s=self.store;a=s.create('归档课');plan=s.deletion_plan('已归档')
        s.purge_subject('已归档','已归档',plan['token'])
        self.assertIn('已归档',s.subjects());self.assertEqual(s.list(),[])
    def test_reject_link_before_deletion(self):
        s=self.store;s.create('课','民法');extra=s.root/'民法'/'linked';outside=Path(self.tmp.name)/'outside';outside.mkdir()
        try:extra.symlink_to(outside,target_is_directory=True)
        except OSError:self.skipTest('symlink privilege unavailable')
        with self.assertRaises(ValueError):s.deletion_plan('民法')
        self.assertTrue((s.root/'民法').exists())
if __name__=='__main__':unittest.main()
