"""Local classroom UI, notes API and WhisperLiveKit integration."""
import os
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
os.environ.setdefault('HF_HOME', str(ROOT / 'models'))
os.environ.setdefault('HF_HUB_DISABLE_XET', '1')
os.environ.setdefault('TORCH_HOME', str(ROOT / 'models' / 'torch'))
profile_path = ROOT / 'speech-profile.json'
profile = json.loads(profile_path.read_text(encoding='utf-8')) if profile_path.exists() else {}
BACKEND = os.environ.get('CLASSROOM_BACKEND', profile.get('backend', 'funasr'))
if BACKEND != profile.get('backend'):
    profile = {}
DEVICE = os.environ.get('CLASSROOM_DEVICE', profile.get('device', 'cpu' if BACKEND == 'funasr' else 'cuda'))
default_model = 'SenseVoiceSmall' if BACKEND == 'funasr' else ('1.7B' if BACKEND == 'qwen3-streaming' else ('large-v3-turbo' if DEVICE == 'cuda' else 'small'))
MODEL = os.environ.get('CLASSROOM_MODEL', profile.get('model', default_model))
os.environ.setdefault('MODELSCOPE_CACHE', str(ROOT / 'models' / 'modelscope'))
_dll_handles = []
if DEVICE == 'cuda' and BACKEND == 'faster-whisper':
    for folder in (ROOT / '.venv/Lib/site-packages/nvidia').glob('*/bin'):
        _dll_handles.append(os.add_dll_directory(str(folder)))
        os.environ['PATH'] = str(folder) + os.pathsep + os.environ['PATH']
if DEVICE == 'cpu':
    os.environ['CUDA_VISIBLE_DEVICES'] = '-1'

from contextlib import asynccontextmanager
from urllib.parse import urlparse
import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware
from pydantic import BaseModel, Field
from notes import Store, atomic_write, update_notes
from note_writer import compose_notes
from speech_control import SpeechControl, SpeechActivity, SwitchError

CONFIG_FILE = ROOT / 'config.json'
store = Store(ROOT / 'data' / 'sessions')
engine = None
speech = SpeechControl(ROOT, BACKEND, MODEL, DEVICE)


def read_config():
    if CONFIG_FILE.exists():
        return json.loads(CONFIG_FILE.read_text(encoding='utf-8'))
    return dict(base_url='', model='', api_key='', interval=20)


@asynccontextmanager
async def lifespan(app):
    global engine
    from whisperlivekit.basic_server import create_app
    from whisperlivekit.config import WhisperLiveKitConfig
    repo = {'small': 'Systran--faster-whisper-small', 'large-v3-turbo': 'mobiuslabsgmbh--faster-whisper-large-v3-turbo'}.get(MODEL)
    cached = None
    if repo:
        cache = ROOT / 'models' / ('models--' + repo)
        ref = cache / 'refs' / 'main'
        if ref.exists():
            candidate = cache / 'snapshots' / ref.read_text().strip()
            if (candidate / 'model.bin').exists():
                cached = str(candidate)
    if BACKEND == 'funasr':
        cached = str(ROOT / 'models' / 'SenseVoiceSmall')
    qwen_options = {}
    if BACKEND == 'qwen3-streaming':
        import torch
        torch.set_num_threads(4)
        cached = str(ROOT / 'models' / f'Qwen3-ASR-{MODEL}')
        qwen_options = dict(qwen3_streaming_device=DEVICE,
            qwen3_streaming_dtype='bfloat16' if DEVICE == 'cuda' else 'float32',
            qwen3_streaming_attn_implementation='sdpa',
            qwen3_streaming_audio_backend='windowed',
            qwen3_streaming_chunk_sec=float(profile.get('chunk_seconds', 2.0)))
    cfg = WhisperLiveKitConfig(host='127.0.0.1', port=8765, lan='zh',
        backend=BACKEND, backend_policy='localagreement',
        model_size=MODEL, model_dir=cached,
        model_cache_dir=str(ROOT / 'models'), min_chunk_size=1.0,
        asr_coalesce_min_s=1.0,
        pcm_input=False, log_level='INFO', **qwen_options)
    engine = create_app(cfg)
    app.mount('/engine', engine)
    async with engine.router.lifespan_context(engine):
        yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(SpeechActivity, control=speech)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=['127.0.0.1', 'localhost', 'testserver'])


@app.middleware('http')
async def local_only(request: Request, call_next):
    if request.method not in ('GET', 'HEAD', 'OPTIONS') and request.url.path.startswith('/api/'):
        origin = request.headers.get('origin')
        if request.headers.get('x-classroom') != '1' or (origin and origin not in
            ('http://127.0.0.1:8765', 'http://localhost:8765', 'http://testserver')):
            return JSONResponse({'detail': '请从本地课堂页面操作'}, status_code=403)
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Cache-Control'] = 'no-store'
    return response


class Settings(BaseModel):
    base_url: str = Field(max_length=2000)
    model: str = Field(max_length=200)
    api_key: str = Field(default='', max_length=4000)
    interval: int = Field(default=20, ge=20, le=60)


class NewSession(BaseModel):
    title: str = Field(default='课堂笔记', max_length=200)


class Transcript(BaseModel):
    text: str = Field(max_length=2_000_000)


def session(sid):
    try:
        return store.get(sid)
    except (ValueError, FileNotFoundError):
        raise HTTPException(404, '课程不存在')


@app.get('/')
async def index():
    return FileResponse(ROOT / 'static' / 'index.html')


@app.get('/library')
async def library():
    return FileResponse(ROOT / 'static' / 'library.html')


@app.get('/api/health')
async def health():
    return dict(app='classroom-notes', ready=engine is not None,
                model=f'Qwen3-ASR-{MODEL}' if BACKEND == 'qwen3-streaming' else MODEL,
                device=DEVICE, backend=BACKEND, speech_id=speech.running()['id'], switching=speech.switching)


@app.get('/api/speech/models')
async def speech_models():
    return speech.status()


class SpeechSelection(BaseModel):
    model_id: str = Field(max_length=40)


@app.post('/api/speech/model')
async def select_speech_model(value: SpeechSelection):
    try:
        return speech.request(value.model_id)
    except SwitchError as exc:
        raise HTTPException(exc.code, str(exc))


@app.get('/api/settings')
async def settings():
    config = read_config()
    return {k: v for k, v in config.items() if k != 'api_key'} | {'has_key': bool(config.get('api_key'))}


@app.post('/api/settings')
async def save_settings(value: Settings):
    data = value.model_dump()
    url = urlparse(data['base_url'].strip())
    if url.scheme not in ('http', 'https') or not url.hostname or url.username or url.password or url.query or url.fragment:
        raise HTTPException(400, '请填写有效的 API Base URL，例如 https://服务地址/v1')
    if url.scheme == 'http' and url.hostname not in ('localhost', '127.0.0.1'):
        raise HTTPException(400, '远程 API 地址请使用 HTTPS')
    old = read_config()
    if not data['api_key']:
        data['api_key'] = old.get('api_key', '') if old.get('base_url', '').rstrip('/') == data['base_url'].strip().rstrip('/') else ''
    data['base_url'] = data['base_url'].strip().rstrip('/')
    data['model'] = data['model'].strip()
    atomic_write(CONFIG_FILE, json.dumps(data, ensure_ascii=False, indent=2))
    return {'ok': True}


async def request_completion(system, material):
    cfg = read_config()
    if not cfg.get('base_url') or not cfg.get('model'):
        raise HTTPException(400, '请先在 API 设置中填写 Base URL 和模型名称')
    endpoint = cfg['base_url'].rstrip('/')
    if not endpoint.endswith('/chat/completions'):
        endpoint += '/chat/completions'
    headers = {'Authorization': 'Bearer ' + cfg['api_key']} if cfg.get('api_key') else {}
    try:
        async with httpx.AsyncClient(timeout=120, trust_env=False) as client:
            response = await client.post(endpoint, headers=headers, json={
                'model': cfg['model'], 'messages': [
                    {'role': 'system', 'content': system},
                    {'role': 'user', 'content': json.dumps(material, ensure_ascii=False)}],
                'temperature': 0.2, 'stream': False})
        if response.status_code >= 400:
            raise HTTPException(502, f'大模型 API 返回 HTTP {response.status_code}，请检查地址、密钥、模型和额度')
        choice = response.json()['choices'][0]
        if choice.get('finish_reason') == 'length':
            raise HTTPException(502, '模型输出被截断，已保留上一版笔记；请调整模型输出限制')
        text = choice['message']['content']
        if not isinstance(text, str) or not text.strip():
            raise ValueError('empty content')
        return text
    except httpx.TimeoutException:
        raise HTTPException(504, '模型响应超时，上一版笔记已保留，可以重试')
    except (httpx.RequestError, KeyError, IndexError, ValueError):
        raise HTTPException(502, '模型连接失败或响应格式不兼容；请检查 API 设置')


async def generate_notes(title, transcript):
    try:
        return await compose_notes(title, transcript, request_completion)
    except ValueError as exc:
        raise HTTPException(502, str(exc))


@app.post('/api/settings/test')
async def test_api():
    result = await generate_notes('连接测试', '今天学习函数的极限。')
    return {'ok': bool(result)}


@app.get('/api/sessions')
async def list_sessions():
    return store.list()


@app.post('/api/sessions')
async def new_session(value: NewSession):
    return store.create(value.title)


class MergeRequest(BaseModel):
    title: str = Field(default='合并课堂', max_length=200)
    session_ids: list[str] = Field(min_length=2, max_length=50)


@app.post('/api/sessions/merge')
async def merge_sessions(value: MergeRequest):
    try:
        return store.merge(value.session_ids, value.title)
    except FileNotFoundError:
        raise HTTPException(404, '选中的课程不存在，请刷新列表')
    except ValueError as exc:
        raise HTTPException(400, str(exc))


class BatchSessions(BaseModel):
    session_ids: list[str] = Field(min_length=1, max_length=200)


@app.get('/api/trash')
async def trash_sessions():
    return store.list(deleted=True)


async def change_deleted(value, deleted):
    if speech.active_recordings or speech.note_jobs or speech.switching:
        raise HTTPException(409, '请先暂停录音，并等待笔记整理或模型切换完成')
    try:
        return store.set_deleted(value.session_ids, deleted)
    except FileNotFoundError:
        raise HTTPException(404, '部分记录不存在，请刷新列表')
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@app.post('/api/sessions/trash')
async def delete_sessions(value: BatchSessions):
    return await change_deleted(value, True)


@app.post('/api/sessions/restore')
async def restore_sessions(value: BatchSessions):
    return await change_deleted(value, False)


@app.get('/api/sessions/{sid}')
async def get_session(sid: str):
    return session(sid)


class RenameSession(BaseModel):
    title: str = Field(min_length=1, max_length=200)


@app.post('/api/sessions/{sid}/title')
async def rename_session(sid: str, value: RenameSession):
    session(sid)
    lock = store.locks.get(sid)
    if lock and lock.locked():
        raise HTTPException(409, '这节课正在整理笔记，请等待保存后修改名称')
    try:
        return store.rename(sid, value.title)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@app.post('/api/sessions/{sid}/transcript')
async def save_transcript(sid: str, value: Transcript):
    session(sid)
    store.transcript(sid, value.text)
    return {'ok': True}


class NotesRequest(BaseModel):
    force: bool = False


@app.post('/api/sessions/{sid}/notes')
async def notes(sid: str, value: NotesRequest):
    session(sid)
    if speech.switching:
        raise HTTPException(503, '模型正在切换，请稍后重新整理笔记')
    speech.note_jobs += 1
    try:
        return await update_notes(store, sid, generate_notes, force=value.force)
    finally:
        speech.note_jobs -= 1


@app.get('/api/sessions/{sid}/export')
async def export(sid: str):
    item = session(sid)
    return Response(store.markdown(item), media_type='text/markdown; charset=utf-8',
                    headers={'Content-Disposition': f'attachment; filename="classroom-{sid[:8]}.md"'})


app.mount('/static', StaticFiles(directory=ROOT / 'static'), name='static')

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='127.0.0.1', port=8765, log_level='info')
