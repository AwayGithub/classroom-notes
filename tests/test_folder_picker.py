import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
import app
from folder_picker import list_folders

class FolderPickerTests(unittest.TestCase):
    def test_lists_only_directories_and_parent(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent) as tmp:
            root=Path(tmp);(root/'中文目录').mkdir();(root/'file.txt').write_text('not exposed')
            result=list_folders(tmp)
            self.assertEqual(result['folders'],[{'name':'中文目录','path':str(root/'中文目录')}])
            self.assertEqual(result['parent'],str(root.parent))
            self.assertEqual(list_folders(str(root/'中文目录'))['folders'],[])
    def test_rejects_files_relative_and_missing_paths(self):
        for path in ['relative/path','//server/share',str(Path(tempfile.gettempdir())/'missing-picker-12345')]:
            with self.assertRaises((ValueError,OSError)):list_folders(path)
    def test_browse_does_not_migrate(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent) as tmp,patch('app.migrate') as migrate:
            response=TestClient(app.app).post('/api/knowledge/storage/browse',json={'path':tmp},headers={'X-Classroom':'1'})
            self.assertEqual(response.status_code,200)
            self.assertEqual(response.json()['path'],str(Path(tmp).resolve()))
            migrate.assert_not_called()
    def test_untrusted_requests_blocked(self):
        with patch('folder_picker.list_folders') as browse:
            client=TestClient(app.app)
            for headers in [{},{'X-Classroom':'1','Origin':'https://example.com'}]:
                self.assertEqual(client.post('/api/knowledge/storage/browse',json={'path':''},headers=headers).status_code,403)
            browse.assert_not_called()
    def test_missing_folder_returns_error(self):
        response=TestClient(app.app).post('/api/knowledge/storage/browse',json={'path':'relative'},headers={'X-Classroom':'1'})
        self.assertEqual(response.status_code,400)

    def test_create_named_folder_and_reject_duplicate(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent) as tmp:
            client=TestClient(app.app);headers={'X-Classroom':'1'}
            payload={'path':tmp,'name':'我的知识库'}
            response=client.post('/api/knowledge/storage/folders',json=payload,headers=headers)
            self.assertEqual(response.status_code,200)
            self.assertTrue(Path(response.json()['path']).is_dir())
            self.assertEqual(client.post('/api/knowledge/storage/folders',json=payload,headers=headers).status_code,409)
    def test_create_rejects_traversal_and_untrusted_requests(self):
        from folder_picker import create_folder
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent) as tmp:
            for name in ['../outside','..','a/b','a\\b','CON','NUL.txt','bad.',' bad']:
                with self.assertRaises(ValueError):create_folder(tmp,name)
            response=TestClient(app.app).post('/api/knowledge/storage/folders',json={'path':tmp,'name':'blocked'})
            self.assertEqual(response.status_code,403)
            self.assertEqual(list(Path(tmp).iterdir()),[])
