"""Bounded AnySearch search and extraction; credentials never leave the server."""
import asyncio
import ipaddress
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import httpx

ENDPOINT = 'https://api.anysearch.com/mcp'


class WebSearchError(Exception):
    """A safe, user-facing search failure without upstream response details."""


def search_key():
    key = os.environ.get('ANYSEARCH_API_KEY', '').strip()
    if key:
        return key
    configured = os.environ.get('ANYSEARCH_ENV_FILE')
    paths = ([Path(configured)] if configured else []) + [
        Path(__file__).parent / '.env',
        Path.home() / '.codex/skills/anysearch-skill-main/.env',
    ]
    for path in paths:
        try:
            for line in path.read_text(encoding='utf-8-sig').splitlines():
                name, sep, value = line.strip().partition('=')
                if sep and name.strip() == 'ANYSEARCH_API_KEY':
                    key = value.strip().strip('\"\'').strip()
                    if key:
                        return key
        except (OSError, UnicodeError):
            continue
    return ''


def public_url(value):
    """Accept only public HTTP(S) source links; never forward local URLs to extract."""
    if not isinstance(value, str) or len(value) > 2000 or re.search(r'[\s<>\\\x00-\x1f]', value):
        return None
    try:
        parts = urlsplit(value)
        host = (parts.hostname or '').lower().rstrip('.')
        if parts.scheme not in ('https', 'http') or not host or parts.username or parts.password:
            return None
        if parts.port not in (None, 80, 443) or host == 'localhost' or host.endswith(('.localhost', '.local', '.internal')):
            return None
        try:
            if not ipaddress.ip_address(host).is_global:
                return None
        except ValueError:
            if '.' not in host or re.fullmatch(r'[\d.]+', host):
                return None
        return urlunsplit((parts.scheme, parts.netloc, parts.path, parts.query, ''))
    except ValueError:
        return None


def parse_search_results(text):
    """Normalize the service's Markdown results, with structured-result compatibility."""
    candidates = []
    try:
        data = json.loads(text)
        items = data if isinstance(data, list) else data.get('results', []) if isinstance(data, dict) else []
        for item in items:
            if isinstance(item, dict):
                candidates.append((item.get('title', ''), item.get('url', ''),
                    item.get('snippet') or item.get('description') or item.get('content') or ''))
    except (ValueError, TypeError):
        pass
    for match in re.finditer(r'^###\s+\d+\.\s+([^\n]+)\n(.*?)(?=^###\s+\d+\.|\Z)', text, re.M | re.S):
        title, block = match.groups()
        url_line = re.search(r'^\s*-?\s*\*\*URL\*\*:\s*(\S+)', block, re.M)
        if url_line:
            excerpt = block[:url_line.start()] + block[url_line.end():]
            candidates.append((title, url_line[1], excerpt.strip().removeprefix('- ').strip()))
    refs, seen = [], set()
    for title, url, excerpt in candidates:
        url = public_url(url)
        if not url or url in seen or not isinstance(excerpt, str) or not excerpt.strip():
            continue
        seen.add(url)
        refs.append(dict(kind='web', field='web', title=str(title or urlsplit(url).hostname)[:300],
            url=url, text=excerpt[:3500], evidence='snippet',
            retrieved_at=datetime.now(timezone.utc).isoformat(timespec='seconds')))
        if len(refs) == 3:
            break
    return refs


class AnySearchClient:
    def __init__(self, api_key=None, transport=None):
        self.api_key = search_key() if api_key is None else api_key
        self.transport = transport

    async def _call(self, client, name, arguments):
        try:
            # A fixed destination prevents retrieved content from changing credential routing.
            async with client.stream('POST', ENDPOINT, json={
                'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call',
                'params': {'name': name, 'arguments': arguments}},
                headers={'Authorization': 'Bearer ' + self.api_key}) as response:
                response.raise_for_status()
                body = bytearray()
                async for part in response.aiter_bytes():
                    body.extend(part)
                    if len(body) > 1_000_000:
                        raise WebSearchError('联网资料过长，本次未能读取。')
            data = json.loads(body)
            result = data.get('result', {})
            if data.get('error') or not isinstance(result, dict) or result.get('isError'):
                raise WebSearchError('联网搜索暂时不可用，请稍后重试。')
            content = result.get('content', [])
            text = '\n'.join(item['text'] for item in content
                if isinstance(item, dict) and item.get('type') == 'text' and isinstance(item.get('text'), str))
            if not text.strip():
                raise WebSearchError('联网搜索返回了空响应，请稍后重试。')
            return text[:100_000]
        except httpx.TimeoutException as exc:
            raise WebSearchError('联网搜索超时，请稍后重试。') from exc
        except (httpx.HTTPError, ValueError, TypeError, AttributeError, KeyError) as exc:
            raise WebSearchError('联网搜索暂时不可用，请检查网络或 AnySearch 额度。') from exc

    async def search(self, query):
        if not self.api_key:
            raise WebSearchError('尚未配置 AnySearch 密钥，本次仅使用课程资料。')
        refs = []
        try:
            async with asyncio.timeout(45):
                async with httpx.AsyncClient(timeout=20, trust_env=False, transport=self.transport) as client:
                    text = await self._call(client, 'search', {'query': query[:240], 'max_results': 3})
                    refs = parse_search_results(text)

                    async def extract(ref):
                        try:
                            page = await self._call(client, 'extract', {'url': ref['url']})
                            ref.update(text=page[:6000], evidence='page')
                        except WebSearchError:
                            pass  # Search excerpts remain usable and explicitly labelled.

                    await asyncio.gather(*(extract(ref) for ref in refs[:2]))
                    return refs
        except TimeoutError as exc:
            if refs:
                return refs  # Preserve completed search evidence when extraction runs out of time.
            raise WebSearchError('联网搜索超时，请稍后重试。') from exc
