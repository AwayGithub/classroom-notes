# 听课 · 中文实时课堂笔记

一个面向中文课堂的本地网页应用：麦克风实时转写、每隔约 60 秒根据全文重新整理笔记、暂停续录、历史资料浏览、多段转写合并、批量删除与恢复。

语音识别由 [WhisperLiveKit](https://github.com/QuentinFuxa/WhisperLiveKit) 在本机运行。笔记整理使用用户自行配置的 OpenAI 兼容 Chat Completions API，例如 DeepSeek。仓库不含 API 密钥、课堂记录、模型权重或 Python 环境。

## 能做什么

- 左侧实时转写，右侧显示持续修订的结构化笔记。
- 每轮按全部转写重新组织主题、回填解释，再做去重与逻辑审校；保留旧版笔记。
- 默认每 60 秒检查新内容，也可选 20、30、45 秒。上一轮未完成时跳过定时触发，实际更新时间取决于 API 响应速度。
- 暂停后停止收音并保存；选择历史课程可继续录音。
- 在“课程资料”按关键词搜索课程名称、日期、转写原文和笔记，并按科目筛选。
- 自选本地知识库目录，每个科目一个文件夹；既有课程可修改所属科目。
- 课堂提问自动识别与手动问答：检索当前科目的全部课程，附可展开的原文依据。
- 多选、调整顺序、合并成新记录；原记录保留。合并后可统一生成笔记。
- 多选删除、全选搜索结果、回收站恢复。空白记录也可删除。
- 切换已安装的语音模型，显示真实的 GPU / CPU 运行状态。

## 系统与准备工作

当前启动、停止和模型切换脚本面向 **Windows 10/11 + PowerShell**。本项目主要在 Windows、Python 3.12 上验证；Linux/macOS 需要自行调整进程管理脚本。

准备：

1. **Git**，用于获取项目及递归子模块。
2. **Python 3.12 64 位**，安装后确认 `py -3.12 --version` 可用。
3. **FFmpeg**，需加入 PATH；确认 `ffmpeg -version` 能运行。可通过 `winget install --id Gyan.FFmpeg -e` 安装，然后重新打开终端。
4. Edge 或 Chrome，以及可用的麦克风。
5. 选择 GPU 模型时，需要 NVIDIA 显卡和兼容所选 PyTorch CUDA wheel 的驱动。先确认 `nvidia-smi` 正常。
6. 如需自动笔记，准备大模型服务的 Base URL、模型名、API Key。语音转写本身不依赖这个 Key。

```powershell
git clone --recurse-submodules https://github.com/AwayGithub/classroom-notes.git
cd classroom-notes
# 如果最初忘记带 --recurse-submodules：
git submodule update --init --recursive
```

上游 WhisperLiveKit 固定在提交 `363e4f6d029694d9c81ae548beddd9d3c88a3637`；内部 Qwen 运行库固定在 `89752586ca978d72773732422b81bf03eea2e5e2`。不要直接复制本机环境目录到另一台电脑。

## 要准备哪些语音识别模型

**至少安装下面一种模型和对应环境即可，不需要全部下载。** 默认配置是 Qwen3-ASR-1.7B GPU；只装 SenseVoice 时，务必按后文修改默认配置。

| 模型 | 官方/权重仓库 | 用途与设备 | 环境目录 | 本项目要求的权重位置 |
|---|---|---|---|---|
| Qwen3-ASR-1.7B | [Qwen/Qwen3-ASR-1.7B](https://huggingface.co/Qwen/Qwen3-ASR-1.7B) | 中文课堂首选尝试，NVIDIA GPU | `.venv-qwen` | `models/Qwen3-ASR-1.7B/` |
| Qwen3-ASR-0.6B | [Qwen/Qwen3-ASR-0.6B](https://huggingface.co/Qwen/Qwen3-ASR-0.6B) | 较轻量的 GPU 备选 | `.venv-qwen` | `models/Qwen3-ASR-0.6B/` |
| SenseVoiceSmall | [FunAudioLLM/SenseVoiceSmall](https://huggingface.co/FunAudioLLM/SenseVoiceSmall) | CPU 方案 | `.venv-sensevoice` | `models/SenseVoiceSmall/` |
| Whisper large-v3-turbo | [mobiuslabsgmbh/faster-whisper-large-v3-turbo](https://huggingface.co/mobiuslabsgmbh/faster-whisper-large-v3-turbo) | 多语言 GPU 备选，使用 faster-whisper 格式 | `.venv` | `models/models--mobiuslabsgmbh--faster-whisper-large-v3-turbo/` |

Qwen 的 `1.7B` / `0.6B` 表示模型参数规模。此项目使用官方 Qwen3-ASR 权重和 `windowed` 音频模式。请下载完整模型仓库中的配置、分词器和权重文件，不要只下载一个权重分片，也不要替换成其他流式微调模型。

参考实测：RTX 5060 Laptop 8 GB 上，1.7B 的约 52.8 秒中文合成音频推理约 28.6 秒，PyTorch 峰值预留显存约 4.21 GiB。8 GB 显存是已验证的配置；总占用还受系统和其他应用影响。这些数据无法保证所有设备或真实教室的效果。0.6B 的选项已接入，本项目尚未完成它的本机推理验证。

### 方案 A：Qwen GPU（默认）

在项目根目录执行：

```powershell
py -3.12 -m venv .venv-qwen
.\.venv-qwen\Scripts\python.exe -m pip install --upgrade pip
.\.venv-qwen\Scripts\python.exe -m pip install torch==2.8.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cu128
.\.venv-qwen\Scripts\python.exe -m pip install -r requirements-qwen.txt
.\.venv-qwen\Scripts\python.exe -c "import torch; print('CUDA:', torch.cuda.is_available()); print(torch.cuda.get_device_name(0))"
```

最后一条需显示 `CUDA: True`。该方案使用 PyTorch CUDA 12.8 wheel、BF16、SDPA；请使用支持 BF16 的 GPU。显卡不兼容时可使用 SenseVoice CPU。

下载 1.7B 完整权重（固定到本机验证过的 revision）：

```powershell
.\.venv-qwen\Scripts\python.exe -c "from huggingface_hub import snapshot_download; snapshot_download('Qwen/Qwen3-ASR-1.7B', revision='7278e1e70fe206f11671096ffdd38061171dd6e5', local_dir='models/Qwen3-ASR-1.7B')"
```

如果选择 0.6B，改为下载：

```powershell
.\.venv-qwen\Scripts\python.exe -c "from huggingface_hub import snapshot_download; snapshot_download('Qwen/Qwen3-ASR-0.6B', local_dir='models/Qwen3-ASR-0.6B')"
```

下载后应能在对应目录找到 `config.json`、分词器文件和所有 `.safetensors` 分片。只有 0.6B 时，把 `speech-profile.json` 的 `model` 改成 `0.6B`，保留 `backend` 为 `qwen3-streaming`、`device` 为 `cuda`。

### 方案 B：SenseVoiceSmall CPU

```powershell
py -3.12 -m venv .venv-sensevoice
.\.venv-sensevoice\Scripts\python.exe -m pip install --upgrade pip
.\.venv-sensevoice\Scripts\python.exe -m pip install torch==2.8.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cpu
.\.venv-sensevoice\Scripts\python.exe -m pip install -r requirements-sensevoice.txt
.\.venv-sensevoice\Scripts\python.exe -c "from huggingface_hub import snapshot_download; snapshot_download('FunAudioLLM/SenseVoiceSmall', local_dir='models/SenseVoiceSmall')"
```

确认 `models/SenseVoiceSmall/model.pt`、配置和 tokenizer 等资源完整。将 `speech-profile.json` 改为：

```json
{"backend":"funasr","model":"SenseVoiceSmall","device":"cpu"}
```

### 方案 C：Whisper large-v3-turbo GPU

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install torch==2.8.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cu128
.\.venv\Scripts\python.exe -m pip install -r requirements-whisper.txt
.\.venv\Scripts\python.exe -c "from huggingface_hub import snapshot_download; snapshot_download('mobiuslabsgmbh/faster-whisper-large-v3-turbo', cache_dir='models')"
```

此处使用 `cache_dir`，保留 Hugging Face 的 `refs/main` 和 `snapshots/.../model.bin` 结构，模型选择器依赖它检测安装情况。不要在这一条替换成 `local_dir`。

将 `speech-profile.json` 改为：

```json
{"backend":"faster-whisper","model":"large-v3-turbo","device":"cuda"}
```

Whisper GPU 还依赖 CTranslate2 和 NVIDIA CUDA/cuDNN DLL；依赖文件安装相关 Python 包，应用会加入 `.venv/Lib/site-packages/nvidia/*/bin`。如出现 DLL 版本错误，需核对 CTranslate2 与 CUDA/cuDNN 的兼容性。当前重点验证路线为 Qwen GPU 和 SenseVoice CPU。

### 下载慢或失败

下载可重复执行以利用已有缓存。确认网络可访问模型站点、磁盘空间充足；代理异常时可在当前 PowerShell 中清除 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY` 后重试。也可以从 ModelScope 的模型发布方官方仓库下载完整文件到上述目录；切勿混用不同版本的权重分片。仓库不提供模型网盘打包或第三方密钥。

## 启动与 API 设置

双击 `启动课堂笔记.cmd`，或执行：

```powershell
.\start.ps1
```

浏览器打开 `http://127.0.0.1:8765`。首次模型加载可能需要等待；看到“转录就绪”后开始使用。端口仅监听本机。

在左侧 **设置 → 笔记 API** 中填写：

- Base URL：例如 `https://api.deepseek.com/v1`。
- 模型名称：例如 `deepseek-chat`，以服务商实际提供的模型为准。
- API Key：填写自己的密钥，点击“保存并测试连接”。

也可以将 `config.example.json` 复制为 `config.json` 后自行填写；已有配置时不要覆盖。Key 保存到本机 `config.json`，API 不回显明文，Git 已忽略这个文件。

转录在本机完成；生成笔记时，**截至当前的全部转写文本会发送到所配置的 API 服务**。普通整理包含两轮模型调用，长课可能先分段处理；API 用量与收费取决于服务商。没有配置 API 时仍可转录并保存原文。录音前请取得课堂所需许可。

## 日常使用

1. 填科目、课程名称，选麦克风，点击“新建课程并录音”，允许麦克风权限。
2. 暂停时点击“暂停”，等待最终转写收齐并保存。点击“继续录音”接着同一节课；续录段有开始标记，段内时间戳从零开始。
3. 需要手动整理时点击“重新整理全文”。失败会保留上一版，原文继续保存。
4. 左侧导航的“课程资料”在当前标签页打开。录音时先暂停并等待保存、整理完成后再切换。点击记录标题查看原文或笔记，点击详情顶部“修改名称”可以重命名课程；勾选至少两份非空记录，调整顺序、填写标题后合并。合并生成独立快照，源记录之后的变化不会自动同步。
5. 删除：勾选记录后点“删除所选记录”，可全选搜索结果。记录进入应用回收站，可以批量恢复；文件和历史笔记仍保留在本机。录音或笔记整理进行中会拒绝删除/恢复。
6. 导出 Markdown 得到笔记和转写原文。当前**不保存原始麦克风音频**，历史资料是文字记录，不能播放旧录音。
7. 结束使用先停止录音，再双击 `停止课堂笔记.cmd` 释放模型内存。关闭网页不会自动停止后台服务。

### 界面操作

界面保留页头文案，左侧按“科目 → 课程”直接导航，导航可收起。资料页默认阅读课程笔记，科目修改与来源信息收在“科目与课程信息”中；按 Ctrl+K 可聚焦搜索。右上角“课堂问答”展开侧栏，按 Esc 收起；新增问答更新数量，不自动打断阅读。API 和知识库位置入口收在侧栏底部“设置”中。录音页将麦克风、整理间隔和语音模型收在“录音与模型设置”中，点击即可展开。资料页默认打开最近有内容的课程，勾选记录后显示批量操作；“合并为一节课”展开后可调整顺序和名称。点击阅读区的专注按钮可收起侧边内容，按 Esc 或再次点击退出。窄屏会自动改为上下布局。

### 科目知识库、搜索与问答

1. 点击左侧 **设置 → 知识库位置**，输入完整本地路径，例如 `E:\Create\课堂知识库`。选择空目录后，应用复制并核验现有课程与历史版本，再切换存储位置；旧目录保留作备份。迁移期间应停止录音并等待整理、问答完成。
2. 点击左侧“＋ 新建科目”可以提前创建科目及同名目录，尚未录课的科目也会保留。新建课程时从“所属科目”下拉框选择；已有课程在“课程资料”详情中修改科目。未指定的课程归入“未分类”。同一科目的课程存放在同名目录中，每堂课是一份“日期 时间 课程名称.md”，同时包含“大模型整理版”和“原始转写文字”。改名和修改科目会同步更新文档位置；续录持续更新同一份文档。重名冲突时追加课程编号以避免覆盖。
3. 资料页搜索框支持名称、日期、原文、笔记全文关键词搜索，并显示命中片段。多个关键词以空格分隔，结果需要同时包含这些词；可以结合科目筛选。回收站也支持搜索。
4. 左侧 **知识问答** 打开独立问答页：选择单个科目或 **所有科目** 检索。无需选择课程，问答仅在当前页面内存中临时显示，刷新后清空，不写入课程或浏览器存储。**边读边问** 则基于当前课程所属科目的全部有效课程回答（含当前课已保存转写），提问与回答保存到当前课程。展开“资料依据”可核对片段、科目与来源课程。
5. 录音时开启自动识别，按笔记整理间隔检查新增转写（默认每 60 秒）；模型正在处理时会跳过本次检查。识别到知识性提问后，自动检索同科目资料并回答。也可以点击手动识别按钮。问答会随课程保存，可以忽略不需要的条目。

位置配置保存在本机 `storage.json`。未配置时沿用项目内 `data/sessions`，设置框提供推荐目录 `E:\Create\课堂知识库`；不要求其他电脑也有 E 盘。备份时复制设置所指向的整个目录（包括隐藏的 `.听课` 管理目录），并保留 `storage.json`。Markdown 是应用自动维护的阅读文档，直接修改 Markdown 暂不会回写到网页，后续保存可能覆盖手动修改；如需自行编辑，请另存副本。跨科目合并的记录默认归入“未分类”，合并后可重新指定科目。

本版知识库读取本应用保存的课程文字，暂不自动导入文件夹中的 PDF、Word 等外部文件。检索采用本地中文关键词匹配，无需额外下载向量模型；同义表达可能漏检，可换用课程中出现的术语。问题检测根据转写内容判断，不区分老师与同学，可能漏检或误判。

问答与问题识别沿用 API 设置，会发送待识别的新增转写片段、问题及检索出的相关资料；这些调用会增加 API 用量。资料不足时会提示不足，引用方便人工核对。手动提问每次独立检索，不自动带入之前的聊天上下文。

### 切换语音模型

先完成目标环境和权重安装，再暂停所有页面的录音，等待笔记整理结束；选择“音频转录模型”并点击“切换模型”。等待实际状态显示新模型后继续录音。未安装的模型选项不可用；选择器的文件检测只用于判断安装材料是否存在，模型能否运行还取决于依赖与硬件。

`start.ps1` 根据 `speech-profile.json` 选择环境：Qwen → `.venv-qwen`，SenseVoice → `.venv-sensevoice`，Whisper → `.venv`。`CLASSROOM_BACKEND`、`CLASSROOM_MODEL`、`CLASSROOM_DEVICE` 环境变量可覆盖配置；排查模型显示与预期不符时也要检查这些变量。

## 本地数据与隐私

| 路径 | 内容 | 是否提交到 Git |
|---|---|---|
| `config.json` | API Key 和笔记服务配置 | 否 |
| `models/` | 本地语音模型 | 否 |
| `.venv*/`、`runtime/` | Python 环境与运行时 | 否 |
| `storage.json` | 本机知识库位置配置 | 否 |
| 所选知识库目录（未配置时为 `data/sessions/`） | 科目目录只展示每堂课的 Markdown；隐藏的 `.听课/` 保存 JSON、问答、历史版本和回收站 | 否，请放在代码仓库之外 |
| `data/recovery/` | 本机恢复备份 | 否 |
| `logs/`、`work/` | 日志、下载和临时测试文件 | 否 |
| `config.example.json` | 空密钥示例 | 是 |

备份课程请复制当前知识库目录；旧版 `data/` 和迁移前目录可保留作额外备份。公开仓库只包含代码、测试、安装依赖清单和示例配置。不要把密钥写进 README、命令行示例、截图或提交历史。

## 测试与已知限制

在已安装的 Python 环境中执行（以下使用 Qwen 环境）：

```powershell
.\.venv-qwen\Scripts\python.exe -m unittest discover -s tests -q
# 以下前端回归需另外安装 Node.js；日常运行应用不需要 Node.js
node tests/test_frontend.cjs
node tests/test_recording.cjs
```

当前已验证 37 项 Python 测试（含科目迁移、检索隔离、问答与问题识别）、前端渲染与暂停续录回归、Qwen GPU / SenseVoice CPU 来回切换，以及资料页合并、删除和恢复。模型推理与流式测试使用中文合成音频；远场收音、混响、专业术语、公式和板书仍需人工核对。全新机器按上述安装步骤的完整下载重装尚未逐项重跑，版本固定基于已运行项目及其上游要求；CPU/Whisper 安装示例使用配对 PyTorch wheel，不能视为跨机器兼容性保证。

## 开源来源

本项目采用 Apache-2.0，见 [LICENSE](LICENSE)。语音后端通过 Git 子模块引用 WhisperLiveKit 及其 Qwen 运行库，保留各自许可证与作者信息。模型权重请遵守对应发布方的许可证及使用条款。


### 选择界面风格

打开学习首页 `http://127.0.0.1:8765/library`，在页面顶部的 **界面风格** 中选择：

- **01 杂志**：编辑式首页、常驻科目导航、章节阅读。
- **02 极简舞台**：横向导航、极简产品首页、居中阅读。
- **03 科目书房**：按真实科目组织书架、书页式阅读。

三种风格均可使用真实录音、历史课程、搜索、合并、删除恢复、问答、导出和设置。切换风格无需刷新，保留当前课程和正在填写的内容。偏好保存在当前浏览器，刷新及跨页面继续生效，不会修改课程数据或 API 配置。

### 管理科目

科目标题右侧的「＋」可以新建科目；科目旁的「⋯」打开管理窗口。

- **重命名**：同步更新科目目录、课程归属和 Markdown 中的科目信息。
- **归档**：课程移入「已归档」，保留转写、笔记、问答、历史版本及回收站状态。
- **永久删除**：核对课程数、文件数并输入完整科目名称后，删除当前知识库内该科目目录（包含手动添加的文件）、课程记录、转写、笔记、问答、回收站记录和历史版本。无法在应用中恢复。迁移前留在旧知识库的备份、手动导出的外部副本不会被删除。
- 「已归档」为默认分类，可永久清空其中资料；分类入口保持可用，无法归档或重命名。未选择科目的新课程也存入这里。
- 录音、笔记或问答任务完成后才能管理科目。归档和重命名遇到手动添加的文件时会提示先移出这些文件。
- 升级时原「未分类」课程和目录迁移为「已归档」。
