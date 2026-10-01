# 听课 · 杂志式学习空间

用户于 2026-09-22 确认第二轮探索的 01 杂志方案，要求接入所有既有页面和真实功能。

## 页面组织

- `/library`：学习首页。展示真实的最近课程，左侧提供科目与课程目录。
- `/library?view=list`：完整目录，关键词搜索、科目筛选、多选、合并顺序、回收站。
- `/library?session=<id>`：独立阅读页，章节目录、笔记与原文、问答、改名、科目调整、导出、全文重整、续录入口。
- `/`：实时课堂，新建录音、暂停/续录/结束、历史课程、实时转写与持续笔记。
- `/?session=<id>`：加载已有课堂，用户点击继续录音后采集音频。
- 问答：侧面独立面板，保留自动提问识别、主动提问、引用资料、忽略和再次提问。
- 设置：API 与存储位置在当前页打开；录音模型和麦克风设置在实时课堂。

## 视觉约束

背景 #faf9f6、正文 #292923、次要文字 #706f65、边框 #deddd5、主操作砖红 #ac402b。沿用用户选定原型的本机字体、编辑式大标题和左侧常驻科目导航。封面突出真实课程，内容不足时显示真实空态。

页面标题 36–76px，阅读标题 30–46px，正文 16px / 2 行高，次要操作 12–14px。阅读页使用整页滚动，课堂长转写保留独立滚动。手机采用可收起导航、单列内容与横向章节目录。

## 行为约束

保留原控制器与所有 HTML 接口标识。课程内容通过 textContent / 安全 Markdown 渲染；不将密钥写入前端代码。录音活跃时阻止切页，暂停并保存后可导航。后台问答更新不自动打开面板。URL 可直接定位课程，浏览器前进后退可切换阅读页面。

## 实现

`static/workspace.css` 为共享主题；`static/magazine.js` 接入真实首页、目录/阅读切换、章节导航及跨页续录。`app.js`、`library.js`、`knowledge-ui.js` 保留录音、资料与问答控制器。原探索保留在 static/design-lab 与 static/explore。

## 三种正式风格（2026-09-22）

顶部「界面风格」提供 01 杂志、02 极简舞台、03 科目书房。使用 localStorage 的 classroom-appearance 保存当前浏览器偏好，首屏加载时读取，跨标签页同步。主题值仅接受三项白名单。

- 杂志：砖红封面、科目侧栏、独立阅读页，维持用户确认的第一套正式方案。
- 极简舞台：纯白、黑色主操作、横向导航；首页以开始课堂为主入口，笔记居中阅读，实时课堂将笔记与转写纵向安排。
- 科目书房：暖纸底色、绿色主操作、科目书架；根据真实科目建立书架，空科目可直接开始课堂。阅读采用书页与边侧目录，课堂采用双页排版。

三种风格共用现有 HTML 控件、控制器、存储和 API。切换只改变主题、首页呈现与导航展开状态，不重建录音或输入节点，不刷新页面。实际课程内容使用安全文本 DOM 构造。

static/themes.js 管理主题选择和真实首页呈现；static/themes.css 覆盖各风格全部页面、问答、表单和响应式布局；static/magazine.js 通过 home-data / home-error 事件共享实时元数据。新增功能需同时核对三种风格。

## 统一平铺侧栏

三种风格采用设计实验室的侧栏结构：品牌与说明、主要入口、科目标签、全部科目及各科目、新建科目、底部设置。取消折叠课程树、数量与二级查看链接；课程在主区域呈现。点击科目显示对应首页，并以底色标记当前科目。录音中的跨页保护继续生效。外观集中在 static/sidebar.css，较矮窗口压缩间距，保持新建入口可见。

## 知识问答与并排阅读（2026-09-23）

左侧“知识问答”打开完整问答视图（/library?view=questions），可选择科目和对话归属课程，检索范围仍为该科目的全部课堂。移除顶部重复入口。课堂及课程阅读页通过“边读边问”在页面内展开问答，桌面支持拖动分隔线及方向键调整宽度，窄屏上下排列，不使用浮动抽屉。课堂打开问答默认显示笔记，收起后恢复原阅读布局。两种视图复用同一问答 DOM 和后端记录，按课程在 sessionStorage 保留输入草稿；自动发现问题只显示提示。完整问答页在录音期间保留录音控制。实现为 static/qa-surface.js 与 static/qa-surface.css。

## 全站按钮规范（2026-09-23）

生产页面最后加载 `static/controls.css`，统一动作控件的视觉属性，替代局部按钮补丁。保留既有控制器和布局。

- 主按钮：`.primary`，主题色实心，用于开始录音、保存、提交提问等主要动作。
- 次按钮：普通按钮、`.quiet` 及带文字的工具按钮，纸色底、细边框，用于返回、刷新、导出、改名、暂停与专注切换。
- 轻按钮：`.text-button`、纯图标、导航与标签，透明底，悬停浅色反馈。选中态使用淡主题色。
- 危险操作沿用次按钮的形状，使用语义红色。课程封面、书本及资料行属于内容入口，保留内容排版。
- 常规按钮字号 15px、字重 500、最小高度 40px、圆角 6px；纯图标 34px。图标统一 18px。
- 悬停颜色过渡 160ms，按下位移 1px（导航不移动），键盘聚焦 2px 外轮廓；禁用态保留文字和轮廓。遵从减少动态效果偏好。
- 动态生成的按钮沿用同样的语义类，无需重新绑定事件。今后按钮变体集中修改此文件。

## 全站下拉框规范（2026-09-23）

下拉框统一由 `static/controls.css` 管理，覆盖界面风格、历史课程、科目筛选与归属、问答检索范围及录音设置。原生 select 保留动态选项、键盘导航及屏幕阅读器语义。

使用主题纸色、细边框、6px 圆角、40px 最小高度、15px 中等字重和统一 18px 箭头。选中文字预留右侧箭头空间，长标题省略；窄屏采用 16px 字号。悬停轻微变色，聚焦主题色轮廓，禁用及无效状态有明确反馈。遵从减少动画与系统高对比偏好。系统原生展开菜单保留平台交互。

表单底色跟随所在表面：文本输入框、搜索框、多行输入与下拉框使用透明背景，融入页面、阅读面板及设置弹窗。边框与聚焦提示保持可见；复选框、单选框和系统高对比模式保留原生表现。

## 课程阅读目录（2026-10-01）

课程目录条目统一 16px、标题“本课目录”20px。书房主题桌面端在正文和右侧目录之间提供可拖动分隔线，默认目录宽度 260px，可在 200–480px 范围内调整，并为正文保留至少 420px。分隔线支持左右方向键、Home/End 和取消拖动；宽度保存在当前浏览器。长目录在可视高度内独立滚动；窄屏沿用横向目录，专注阅读和边读边问隐藏目录分隔线。实现集中在 static/reader-outline.css 与 static/reader-outline.js。


### 课程浏览与返回（2026-10-01）

学习首页与全部资料保持各自的展示方式。左侧科目在当前区域筛选；从课程详情选择科目时回到该课程的来源区域。详情保留来源区域的主导航高亮，返回课程目录恢复来源的科目、搜索、选择项和滚动位置。浏览器历史状态保存来源，列表 URL 保存科目与搜索条件，刷新可继续筛选。无来源的课程链接默认归入全部资料。


### 长课程阅读（2026-10-01）

移除课程正文末尾的覆盖情况小字。目录按正文 h1、h2、h3 标题逐级缩进 0、16、32px，保持 16px 字号并区分字重。课程页向下滚动 400px 后在正文区域右下角显示 44px 的回到顶部箭头，位置随正文和目录宽度调整，悬停或键盘聚焦显示“回到顶部”提示，返回顶部后隐藏；尊重减少动画的系统设置。


## 2026-10-01 Unified study surfaces

Preserve the warm ivory palette, dark green actions, serif page titles and generous introductory space. Shared study-refinement.css aligns page controls and improves supporting text. The folio home groups the subject action near its heading and lightens shelf separators; the archive shelf has no create-course action. Course-list metadata stays together beneath the title, with distinct hover and selected states. The classroom focus control shares the reading-mode toolbar. Full knowledge questions use a shared large heading, compact scope controls and three empty-state examples that fill the draft without sending a request. Return labels reflect the source page. Desktop and 390px layouts were visually inspected, along with filtering, contextual return, draft preservation and focus-mode exit.
