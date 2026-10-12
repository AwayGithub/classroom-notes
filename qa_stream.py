"""Optional NDJSON progress for Q&A; normal callers retain the JSON response."""
import asyncio
import json
from contextlib import suppress
from fastapi import HTTPException
from fastapi.responses import StreamingResponse

STAGES = {'local': '正在检索课程资料并判断是否需要补充…',
          'web': '正在通过 AnySearch 联网补充…',
          'answer': '正在结合课程与网页资料组织回答…'}


async def qa_response(request, run):
    if 'application/x-ndjson' not in request.headers.get('accept', ''):
        return await run(None)

    async def events():
        queue = asyncio.Queue()

        def progress(stage):
            if stage in STAGES:
                queue.put_nowait(dict(type='status', stage=stage, message=STAGES[stage]))

        async def produce():
            try:
                result = await run(progress)
                queue.put_nowait(dict(type='result', result=result))
            except HTTPException as exc:
                queue.put_nowait(dict(type='error', message=str(exc.detail)))
            except Exception:
                queue.put_nowait(dict(type='error', message='问答未完成，请稍后重试。'))

        task = asyncio.create_task(produce())
        try:
            while True:
                message = await queue.get()
                yield json.dumps(message, ensure_ascii=False) + '\n'
                if message['type'] in ('result', 'error'):
                    break
        finally:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task

    return StreamingResponse(events(), media_type='application/x-ndjson', headers={'X-Accel-Buffering': 'no'})
