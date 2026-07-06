# 无间疑云 (Good Cop Bad Cop) 设计文档

## 项目说明
桌游《无间疑云》小程序版，3-8 人本地同屏（pass-and-play）身份推理阵营游戏。

## 技术选型
- **框架**：Taro 4（React），纯前端实现
- **状态管理**：React Context + useReducer（全局游戏状态）
- **存储**：localStorage（游戏状态持久化，支持中断恢复）
- **路由**：Taro 原生路由（navigateTo/redirectTo）
- **UI组件**：`@/components/ui/*`（shadcn/ui 风格）+ 自定义游戏组件

## 页面结构
| 页面 | 路由 | 说明 |
|------|------|------|
| 首页 | pages/index/index | 游戏标题、开始游戏、规则说明 |
| 设置页 | pages/setup/index | 选择人数、输入玩家姓名 |
| 身份确认页 | pages/identity/index | 轮流查看底细牌，确认身份 |
| 游戏主界面 | pages/game/index | 游戏主界面，行动交互 |
| 结算页 | pages/result/index | 显示获胜阵营和所有玩家身份 |

## 设计风格

### 气质与意象
**警匪片/黑色电影 noir 风格** —— 雨夜城市、霓虹灯倒影、审讯室强光。
- 场景意象：深色审讯室，一盏孤灯打在桌面上，烟雾缭绕，警徽与手枪在暗处闪光
- 色彩情绪：深沉、紧张、悬疑，但信息清晰可读
- 图形语言：简洁几何化，卡牌式布局，直角+轻微倒角结合

### 配色方案
**暗色主题为基础，蓝/红阵营色区分**

| 用途 | 色值 | Tailwind 类名 | 意象来源 |
|------|------|---------------|----------|
| 页面背景 | `#0a0e1a` | bg-gray-950 | 深夜警局 |
| 卡片背景 | `#1a1f2e` | bg-gray-900 | 档案袋 |
| 主文字 | `#e8edf5` | text-gray-100 | 白炽灯 |
| 副文字 | `#8892a8` | text-gray-400 | 阴天 |
| 忠诚阵营 | `#2563eb` | text-blue-600 | 警徽蓝 |
| 忠诚阵营暗色 | `#1e40af` | bg-blue-800 | 深蓝制服 |
| 变节阵营 | `#dc2626` | text-red-600 | 血/警报红 |
| 变节阵营暗色 | `#991b1b` | bg-red-800 | 暗红 |
| 探长特殊 | `#3b82f6` | blue-500 | 金色警徽 |
| 主谋特殊 | `#ef4444` | red-500 | 危险信号 |
| 强调/行动 | `#f59e0b` | amber-500 | 证据/线索 |
| 成功/安全 | `#10b981` | emerald-500 | 安全屋 |
| 分割线 | `#2a2f3e` | border-gray-800 | 铁栏杆 |

### 字体排版
- 中文默认系统字体，标题使用粗体
- 英文数字使用系统等宽字体（monospace）
- 标题层级：`text-lg` → `text-base` → `text-sm`
- 卡牌内容：`text-sm` 或 `text-xs`
- 关键信息使用 `font-bold` 加粗

### 间距系统
- 页面边距：`p-4`
- 卡片内边距：`p-3` 或 `p-4`
- 卡片间距：`gap-3`
- 列表项间距：`space-y-2` 或 `gap-2`
- 圆角：`rounded-lg`（卡片）、`rounded-xl`（弹窗）、`rounded-full`（头像/徽章）
- 阴影：`shadow-lg`（卡片）、`shadow-md`（弹窗）

### 组件使用原则
1. **通用 UI 组件优先使用 `@/components/ui/*`**：
   - Button → `@/components/ui/button`
   - Card → `@/components/ui/card`（Card, CardHeader, CardContent, CardFooter）
   - Dialog → `@/components/ui/dialog`
   - Badge → `@/components/ui/badge`
   - Input → `@/components/ui/input`
   - Tabs → `@/components/ui/tabs`
   - Toast → `@/components/ui/toast`（配合 sonner）
   - Progress → `@/components/ui/progress`
   - Separator → `@/components/ui/separator`
   - Skeleton → `@/components/ui/skeleton`
2. **游戏专属组件**：卡牌、玩家面板、行动菜单等在 `src/components/game/` 下自定义
3. **禁止**用 `View/Text` 手搓通用 UI 组件

### 动效与交互
- 翻牌动画：`transform rotate-y` 3D 翻转（CSS transition）
- 射击动画：红色闪光 + 震动
- 淘汰动画：卡片淡出 + 红色遮罩
- 页面切换：简化过渡，聚焦内容
- 按钮点击：`active:scale-95` 缩放反馈

### 设计禁忌
- 不要使用纯黑背景（`#000`），用 `#0a0e1a` 替代
- 不要使用高饱和度颜色大面积铺色
- 不要使用过多圆角（保持警匪硬朗风格）
- 不要使用 Emoji 替代图标（使用 lucide-react-taro）
- 不要在游戏过程中出现非必要动画（避免干扰策略思考）