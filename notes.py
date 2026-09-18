"""Durable sessions with complete, evidence-based note rewrites."""
import asyncio
import json
import re
from datetime import datetime
from pathlib import Path
from uuid import uuid4

NOTES_VERSION = 2


def atomic_write(path, text):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(text, encoding='utf-8')
    temp.replace(path)


class Store:
    def __init__(self, root):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.cache = {}
        self.locks = {}

    def create(self, title):
        item = dict(id=uuid4().hex, title=title or '未命名课程',
                    created=datetime.now().isoformat(timespec='seconds'),
                    transcript='', processed='', notes='', revision=0, updated='')
        self.cache[item['id']] = item
        self.save(item)
        return item

    def merge(self, ids, title):
        if len(ids) < 2 or len(ids) > 50 or len(set(ids)) != len(ids):
            raise ValueError('请选择 2 至 50 份不同的转写记录')
        sources = [self.get(sid) for sid in ids]
        if any(not item['transcript'].strip() for item in sources):
            raise ValueError('选中的记录包含空白转写，请取消勾选后再合并')
        parts = [f"【来源 {n}：{item['title']} · {item['created']}；时间戳沿用原记录】\n{item['transcript']}"
                 for n, item in enumerate(sources, 1)]
        text = '\n\n'.join(parts)
        if len(text) > 2_000_000:
            raise ValueError('合并内容超过 200 万字，请减少所选记录')
        item = dict(id=uuid4().hex, title=title.strip() or '合并课堂',
                    created=datetime.now().isoformat(timespec='seconds'),
                    transcript=text, processed='', notes='', revision=0, updated='',
                    sources=[dict(id=i['id'], title=i['title'], created=i['created'],
                                  characters=len(i['transcript'])) for i in sources])
        self.save(item)
        self.cache[item['id']] = item
        return item

    def get(self, sid, include_deleted=False):
        if not re.fullmatch(r'[a-f0-9]{32}', sid):
            raise ValueError('无效的课程编号')
        if sid not in self.cache:
            self.cache[sid] = json.loads((self.root / (sid + '.json')).read_text(encoding='utf-8'))
        if self.cache[sid].get('deleted_at') and not include_deleted:
            raise FileNotFoundError('课程已移入回收站')
        return self.cache[sid]

    def save(self, item):
        atomic_write(self.root / (item['id'] + '.json'), json.dumps(item, ensure_ascii=False, indent=2))
        atomic_write(self.root / (item['id'] + '.md'), self.markdown(item))

    def archive(self, item):
        if item['notes']:
            path = self.root / 'history' / item['id'] / f"revision-{item['revision']:05d}.json"
            if not path.exists():
                atomic_write(path, json.dumps(item, ensure_ascii=False, indent=2))

    @staticmethod
    def markdown(item):
        body = item['notes'] or '（尚未生成笔记）'
        title = '' if body.lstrip().startswith('# ') else f"# {item['title']}\n\n"
        return f"{title}{body}\n\n---\n\n## 转录原文\n\n{item['transcript']}\n"

    def rename(self, sid, title):
        item = self.get(sid)
        title = title.strip()
        if not title or len(title)>200:
            raise ValueError('课程名称需为 1 至 200 个字符')
        replacement = dict(item, title=title)
        self.save(replacement)
        item.update(replacement)
        return item

    def transcript(self, sid, text):
        item = self.get(sid)
        item['transcript'] = text
        self.save(item)
        return item

    def set_deleted(self, ids, deleted):
        if not ids or len(ids)>200 or len(set(ids))!=len(ids):
            raise ValueError('请选择 1 至 200 份不同的记录')
        items = [self.get(sid, include_deleted=True) for sid in ids]
        if any(self.locks.get(sid) and self.locks[sid].locked() for sid in ids):
            raise ValueError('所选课程正在整理，请稍后再操作')
        for item in items:
            replacement = dict(item)
            if deleted:
                replacement['deleted_at'] = item.get('deleted_at') or datetime.now().isoformat(timespec='seconds')
            else:
                replacement.pop('deleted_at', None)
            self.save(replacement)
            item.update(replacement)
            if not deleted: item.pop('deleted_at', None)
        return dict(count=len(items))

    def list(self, deleted=False):
        items = [self.get(p.stem, include_deleted=True) for p in self.root.glob('*.json')]
        items = [i for i in items if bool(i.get('deleted_at')) == deleted]
        return [dict(id=i['id'], title=i['title'], created=i['created'], characters=len(i['transcript']), revision=i['revision'], merged=bool(i.get('sources')))
                for i in sorted(items, key=lambda i: i['created'], reverse=True)]


async def update_notes(store, sid, generate, force=False):
    async with store.locks.setdefault(sid, asyncio.Lock()):
        item = store.get(sid)
        snapshot = item['transcript']
        processed = item['processed']
        if not snapshot.strip():
            return item
        if snapshot == processed and item.get('notes_version') == NOTES_VERSION and not force:
            return item
        # Old prose is deliberately excluded: every result is grounded in the
        # complete transcript, allowing later explanations to revise early ones.
        result = await generate(item['title'], snapshot)
        if not isinstance(result, str) or not result.strip():
            raise ValueError('模型返回空笔记，保留上一版，可重试')
        store.archive(item)
        replacement = dict(item, notes=result.strip(), processed=snapshot,
                           notes_version=NOTES_VERSION, revision=item['revision']+1,
                           updated=datetime.now().isoformat(timespec='seconds'))
        store.save(replacement)
        item.update(replacement)
        return item
