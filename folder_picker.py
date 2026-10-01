"""Read-only local folder listings for the in-page storage chooser."""
import os
from pathlib import Path


def list_folders(value):
    if value == '':
        if os.name == 'nt':
            import ctypes
            mask = ctypes.windll.kernel32.GetLogicalDrives()
            roots = [f'{chr(65+i)}:\\' for i in range(26) if mask & (1 << i)]
        else:
            roots = ['/']
        return dict(path='', parent=None, folders=[dict(name=p, path=p) for p in roots])
    if value.startswith(('\\\\', '//')):
        raise ValueError('请选择本机磁盘中的文件夹。')
    path = Path(value)
    if not path.is_absolute():
        raise ValueError('请输入完整的文件夹路径。')
    path = path.resolve(strict=True)
    if not path.is_dir():
        raise ValueError('此路径不是文件夹，请重新选择。')
    folders = []
    with os.scandir(path) as entries:
        for entry in entries:
            try:
                if entry.is_dir(follow_symlinks=False):
                    folders.append(dict(name=entry.name, path=str(path / entry.name)))
            except OSError:
                continue
    folders.sort(key=lambda item: item['name'].casefold())
    return dict(path=str(path), parent=str(path.parent) if path.parent != path else '', folders=folders)


def create_folder(parent, name):
    import re
    if (not name or name != name.strip() or name.endswith('.') or
        any(ord(c) < 32 or c in '<>:"/\\|?*' for c in name) or
        name in ('.', '..') or len(name) > 120 or
        re.fullmatch(r'(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?', name, re.I)):
        raise ValueError('请使用有效的文件夹名称，避免特殊字符、末尾空格和系统保留名称。')
    if not parent or parent.startswith(('\\\\', '//')) or not Path(parent).is_absolute():
        raise ValueError('请先进入本机文件夹。')
    directory = Path(parent).resolve(strict=True)
    if not directory.is_dir():
        raise ValueError('当前目录不存在，请重新选择。')
    target = directory / name
    target.mkdir(exist_ok=False)
    return {'path': str(target)}
