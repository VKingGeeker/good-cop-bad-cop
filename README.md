# 无间疑云 (Good Cop Bad Cop)

基于 Taro + NestJS + Supabase + TRTC 的多人在线语音桌游「好警察坏警察」。
玩家通过创建/加入房间进行实时语音对战，支持 Android APK 和 H5 双端运行。

## 游戏简介

找出敌方首领并将其淘汰！忠诚警察 vs 变节黑帮，两大阵营的较量。

- **身份判定**：每人 3 张底细牌，持有「探长」= 忠诚阵营首领，持有「主谋」= 变节阵营首领
- **回合行动**：调查、取得装备、装备手枪瞄准、射击
- **中枪处理**：非首领直接淘汰，首领第一次受伤 + 抽装备，第二次淘汰
- **胜利条件**：主谋被淘汰 → 忠诚获胜；探长被淘汰 → 变节获胜；同时持有探长 + 主谋 → 独自获胜

## 技术栈

### 前端
- **框架**: Taro 4.1.9 + React 18 + TypeScript
- **样式**: Tailwind CSS 4 + weapp-tailwindcss（跨端原子化样式）
- **组件库**: 自建 shadcn/ui Taro 版（`src/components/ui/`）
- **图标**: lucide-react-taro
- **语音**: TRTC Web SDK（`src/hooks/use-trtc.ts`）
- **打包**: Capacitor → Android APK

### 后端
- **框架**: NestJS 10 + TypeScript
- **数据库**: Supabase（PostgreSQL），表名 `game_rooms`
- **实时通信**: HTTP 轮询（前端每 2 秒请求一次房间/游戏状态）
- **进程管理**: PM2（进程名 `gcbc-server`）
- **服务器**: 腾讯云 Ubuntu

## 项目结构

```
├── src/                         # 前端源码
│   ├── pages/                   # 页面
│   │   ├── index/               # 首页：创建/加入房间、检查更新
│   │   ├── room/                # 房间等待页：玩家列表、踢人、开始游戏
│   │   ├── game/                # 游戏页：游戏交互、TRTC 语音
│   │   └── result/              # 结果页：胜负展示
│   ├── components/
│   │   ├── ui/                  # shadcn/ui 组件库
│   │   └── update/              # 更新弹窗组件
│   ├── hooks/
│   │   ├── use-trtc.ts          # TRTC 语音 Hook
│   │   └── use-app-update.ts    # APP 更新管理 Hook
│   ├── config/
│   │   └── app-version.ts       # APP 版本号
│   └── network.ts               # 网络请求封装
├── server/                      # NestJS 后端
│   └── src/
│       ├── main.ts              # 入口：CORS、全局前缀 /api、定时清理
│       ├── app.module.ts        # 模块注册
│       ├── app-update.controller.ts  # 版本检查 + APK 下载（Range 断点续传）
│       └── game/
│           ├── game.controller.ts    # 游戏房间 API
│           ├── game-room.service.ts  # 房间逻辑
│           ├── game-logic.service.ts # 游戏核心逻辑
│           └── trtc.service.ts       # TRTC 签名生成
├── android/                     # Android Capacitor 工程
├── version.json                 # 服务器版本信息
└── capacitor.config.ts          # Capacitor 配置
```

## 快速开始

### 环境要求

- Node.js >= 18
- pnpm >= 9
- JDK 21（Android 打包）

### 安装依赖

```bash
pnpm install
```

### 本地开发

```bash
# 同时启动 H5 前端 + NestJS 后端
pnpm dev

# 或单独启动
pnpm dev:web        # H5 前端 → http://localhost:5002
pnpm dev:server     # 后端服务 → http://localhost:3000
```

### 构建

```bash
pnpm build:web      # 构建 H5，输出到 dist-web
pnpm build:server   # 构建后端
```

## 功能清单

### 房间系统
- 创建/加入房间（支持 3~8 人，可选密码）
- 房间列表（显示等待中的房间，含密码标识）
- 退出房间（房主退出自动转移/删除）
- 返回主页（不移除玩家，可点「返回房间」重新进入）
- 房主踢人
- 单人限制（同一 playerId 只能同时在一个房间）
- 20 分钟无活动自动清理房间
- 首页验证房间是否存在后才显示「返回房间」按钮

### 游戏系统
- 好警察坏警察核心游戏逻辑
- 游戏行动：调查、装备、瞄准、射击、翻牌
- 单人测试模式（填充机器人）
- 游戏结果与胜负判定
- 房主开始游戏后，其他玩家通过轮询自动跳转

### 语音系统
- TRTC 实时语音通话
- 当前回合玩家自动开麦，非回合玩家自动闭麦
- 手动闭麦/开麦控制

### APP 更新系统
- 游戏内更新弹窗（进度条 + 安装/取消按钮）
- 中文更新日志展示（条目间换行分隔）
- APK 断点续传下载（HTTP Range 请求，取消后保存进度）
- 下载状态持久化（进度百分比、完成状态保存到 localStorage）
- 安装按钮状态控制（未达 100% 置灰，完成后可用）
- 首页 + 游戏页均可触发更新检查

## API 接口

所有接口前缀 `/api`，响应格式 `{ code: 0/-1, msg, data }`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/game/room/create` | 创建房间 |
| POST | `/api/game/room/join` | 加入房间 |
| GET | `/api/game/rooms` | 获取房间列表 |
| GET | `/api/game/room/:roomCode` | 获取房间状态 |
| POST | `/api/game/room/:roomCode/leave` | 离开房间 |
| POST | `/api/game/room/:roomCode/kick` | 踢人 |
| POST | `/api/game/room/:roomCode/start` | 开始游戏 |
| POST | `/api/game/room/:roomCode/solo-start` | 单人测试开始 |
| GET | `/api/game/room/:roomCode/state` | 获取游戏状态 |
| POST | `/api/game/room/:roomCode/action` | 执行游戏行动 |
| GET | `/api/game/room/:roomCode/result` | 获取游戏结果 |
| GET | `/api/game/room/:roomCode/trtc-sign` | 获取 TRTC 签名 |
| GET | `/api/app/version` | 获取最新版本信息 |
| GET | `/api/app/download` | 下载 APK（支持 Range 断点续传） |

## 部署

### 1. 部署后端

```bash
# 上传源文件
scp -i "E:\Downloads\good_cop_bad_cop.pem" server/src/xxx.ts ubuntu@82.157.199.141:/home/ubuntu/good-cop-bad-cop/server/src/

# 编译并重启
ssh -i "E:\Downloads\good_cop_bad_cop.pem" ubuntu@82.157.199.141 "cd /home/ubuntu/good-cop-bad-cop/server && npx nest build && pm2 restart gcbc-server"
```

### 2. 构建 Web 资源

```bash
$env:PROJECT_DOMAIN="http://82.157.199.141:3000"; pnpm build:web
```

### 3. 打包 Android APK

```bash
# 复制 web 资源
Copy-Item -Path "dist-web\*" -Destination "android\app\src\main\assets\public\" -Recurse -Force

# 同步 Capacitor
$env:JAVA_HOME="C:\Program Files\Java\jdk-21.0.2"; npx cap sync android

# 构建 APK（国内需阿里云镜像加速）
cd android; .\gradlew assembleDebug --init-script init-mirror.gradle
```

APK 输出: `android/app/build/outputs/apk/debug/app-debug.apk`

### 4. 发布更新

```bash
# 上传 APK
scp -i "E:\Downloads\good_cop_bad_cop.pem" android/app/build/outputs/apk/debug/app-debug.apk ubuntu@82.157.199.141:/home/ubuntu/apks/app-debug.apk

# 上传版本信息
scp -i "E:\Downloads\good_cop_bad_cop.pem" version.json ubuntu@82.157.199.141:/home/ubuntu/apks/version.json
```

同时更新 `src/config/app-version.ts` 中的 `APP_VERSION`。

## 开发规范

- **包管理器**: 必须使用 pnpm，禁止 npm/yarn
- **样式**: 优先 Tailwind CSS，禁止硬编码 px 任意值
- **组件**: 优先使用 `@/components/ui` 下的组件，不手搓通用 UI
- **网络请求**: 使用 `Network` 类，禁止直接 `Taro.request`
- **Git 提交**: 遵循 Commitlint 规范（`feat:` / `fix:` / `style:` 等）
- **图标**: 使用 lucide-react-taro，注意部分旧名不可用（如 `CheckCircle` → `CircleCheck`）

详细开发规范见 [AGENTS.md](./AGENTS.md)，完整项目文档见 [PROJECT_GUIDE.md](./PROJECT_GUIDE.md)。
