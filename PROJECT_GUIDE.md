# 无间疑云 (Good Cop Bad Cop) - 项目开发文档

## 一、项目概述

基于 Taro + NestJS + Supabase + TRTC 的多人在线语音桌游「好警察坏警察」。
玩家通过创建/加入房间进行实时语音对战，支持 Android APK 和 H5 双端运行。

## 二、技术架构

### 前端
- **框架**: Taro 4 + React 18 + TypeScript
- **样式**: Tailwind CSS 4 + weapp-tailwindcss（跨端原子化样式）
- **组件库**: 自建 shadcn/ui Taro 版（`src/components/ui/`）
- **图标**: lucide-react-taro
- **网络**: 自封装 Network 类（`src/network.ts`），自动处理域名拼接
- **语音**: TRTC Web SDK（`src/hooks/use-trtc.ts`）
- **打包**: Capacitor → Android APK

### 后端
- **框架**: NestJS（`server/`目录）
- **数据库**: Supabase（PostgreSQL），表名 `game_rooms`
- **实时通信**: HTTP 轮询（前端每 2 秒请求一次房间/游戏状态）
- **进程管理**: PM2（进程名 `gcbc-server`）
- **服务器**: 腾讯云 Ubuntu（IP: 82.157.199.141）

### 数据库表结构 (`game_rooms`)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | 主键 |
| room_code | text | 6位数字房间号 |
| status | text | waiting / playing / ended |
| host_player_id | text | 房主 playerId |
| max_players | int | 最大玩家数 (3~8) |
| players | jsonb | 玩家数组 `[{id, name, isHost, isBot, joinedAt}]` |
| game_state | jsonb | 游戏状态 |
| password | text | 房间密码（可选，需手动执行 SQL 添加） |
| created_at | timestamptz | 创建时间 |
| updated_at | timestamptz | 更新时间 |

## 三、已完成功能清单

### 房间系统
- [x] 创建房间（支持 3~8 人，可选密码）
- [x] 加入房间（通过房间号或房间列表）
- [x] 房间列表（显示所有等待中的房间，含密码标识）
- [x] 房间密码（创建/加入时可选，Supabase 需手动加列）
- [x] 退出房间（从服务器移除玩家，房主退出自动转移/删除房间）
- [x] 返回主页（不移除玩家，主页可点「返回房间」重新进入）
- [x] 房主踢人（弹出确认框，踢出指定玩家）
- [x] 单人限制（同一 playerId 只能同时在一个房间，自动从旧房间移除）
- [x] 20 分钟无活动自动清理房间

### 游戏系统
- [x] 好警察坏警察核心游戏逻辑（`game-logic.service.ts`）
- [x] 游戏行动：调查、装备、瞄准、射击、翻牌
- [x] 单人测试模式（填充机器人）
- [x] 游戏结果与胜负判定
- [x] 房主开始游戏后，其他玩家通过轮询自动跳转游戏页

### 语音系统
- [x] TRTC 实时语音通话
- [x] 当前回合玩家自动开麦，非回合玩家自动闭麦
- [x] 手动闭麦/开麦控制
- [x] 修复 `unmuteAudio().then is not a function`（SDK 不返回 Promise）

### APP 功能
- [x] APP 名称「无间疑云」
- [x] 检查更新（`GET /api/app/version` + `GET /api/app/download`）
- [x] 版本号显示在首页
- [x] Android 明文流量配置（`network_security_config.xml`）

## 四、API 接口一览

所有接口前缀 `/api`，响应格式 `{ code: 0/-1, msg, data }`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/game/room/create` | 创建房间 `{hostName, maxPlayers, password?, playerId?}` |
| POST | `/api/game/room/join` | 加入房间 `{roomCode, playerName, password?, playerId?}` |
| GET | `/api/game/rooms` | 获取房间列表 |
| GET | `/api/game/room/:roomCode` | 获取房间状态 |
| POST | `/api/game/room/:roomCode/leave` | 离开房间 `{playerId}` |
| POST | `/api/game/room/:roomCode/kick` | 踢人 `{hostPlayerId, targetPlayerId}` |
| POST | `/api/game/room/:roomCode/start` | 开始游戏 `{playerId}` |
| POST | `/api/game/room/:roomCode/solo-start` | 单人测试开始 `{playerId}` |
| GET | `/api/game/room/:roomCode/state?playerId=` | 获取游戏状态 |
| POST | `/api/game/room/:roomCode/action` | 执行游戏行动 |
| GET | `/api/game/room/:roomCode/result` | 获取游戏结果 |
| GET | `/api/game/room/:roomCode/trtc-sign?playerId=` | 获取 TRTC 签名 |
| GET | `/api/app/version` | 获取最新版本信息 |
| GET | `/api/app/download` | 下载最新 APK |

## 五、关键文件索引

### 前端
| 文件 | 说明 |
|------|------|
| `src/pages/index/index.tsx` | 首页：创建/加入房间、房间列表、检查更新 |
| `src/pages/room/index.tsx` | 房间等待页：玩家列表、踢人、开始游戏、轮询跳转 |
| `src/pages/game/index.tsx` | 游戏页：游戏交互、TRTC 语音 |
| `src/pages/result/index.tsx` | 结果页：胜负展示 |
| `src/hooks/use-trtc.ts` | TRTC 语音 Hook |
| `src/network.ts` | 网络请求封装 |
| `src/config/app-version.ts` | APP 版本号（每次打包前更新） |
| `capacitor.config.ts` | Capacitor 配置（appName: 无间疑云） |

### 后端
| 文件 | 说明 |
|------|------|
| `server/src/main.ts` | 入口：CORS、全局前缀 `/api`、定时清理房间 |
| `server/src/app.module.ts` | 模块注册 |
| `server/src/app-update.controller.ts` | 版本检查 + APK 下载 |
| `server/src/game/game.controller.ts` | 游戏房间 API |
| `server/src/game/game-room.service.ts` | 房间逻辑：创建/加入/离开/踢人/列表/清理 |
| `server/src/game/game-logic.service.ts` | 游戏核心逻辑 |
| `server/src/game/trtc.service.ts` | TRTC 签名生成 |
| `server/src/storage/database/supabase-client.ts` | Supabase 客户端 |

### Android
| 文件 | 说明 |
|------|------|
| `android/app/src/main/res/values/strings.xml` | APP 名称 |
| `android/app/src/main/AndroidManifest.xml` | 清单文件（含 cleartext 配置） |
| `android/app/src/main/res/xml/network_security_config.xml` | 网络安全配置 |

## 六、部署流程

### 前置条件
- SSH 密钥: `E:\Downloads\good_cop_bad_cop.pem`
- 服务器: `ubuntu@82.157.199.141`
- JDK: `C:\Program Files\Java\jdk-21.0.2`

### 1. 部署后端
```bash
# 上传修改的源文件
scp -i "E:\Downloads\good_cop_bad_cop.pem" server/src/xxx.ts ubuntu@82.157.199.141:/home/ubuntu/good-cop-bad-cop/server/src/

# 编译并重启
ssh -i "E:\Downloads\good_cop_bad_cop.pem" ubuntu@82.157.199.141 "cd /home/ubuntu/good-cop-bad-cop/server && npx nest build && pm2 restart gcbc-server"
```

### 2. 构建 Web 资源
```bash
# 设置域名后构建（关键！）
$env:PROJECT_DOMAIN="http://82.157.199.141:3000"; pnpm build:web
```

### 3. 同步到 Android 并打包 APK
```bash
# 复制 web 资源
Copy-Item -Path "dist-web\*" -Destination "android\app\src\main\assets\public\" -Recurse -Force

# 同步 Capacitor 配置
$env:JAVA_HOME="C:\Program Files\Java\jdk-21.0.2"; npx cap sync android

# 构建 APK
cd android; .\gradlew assembleDebug
```

APK 输出: `android/app/build/outputs/apk/debug/app-debug.apk`

### 4. 发布更新（供 APP 内检查更新）
```bash
# 上传新 APK 到服务器
scp -i "E:\Downloads\good_cop_bad_cop.pem" android/app/build/outputs/apk/debug/app-debug.apk ubuntu@82.157.199.141:/home/ubuntu/apks/app-debug.apk

# 更新版本信息（修改 version.json 后上传）
scp -i "E:\Downloads\good_cop_bad_cop.pem" version.json ubuntu@82.157.199.141:/home/ubuntu/apks/version.json
```

同时更新 `src/config/app-version.ts` 中的 `APP_VERSION`。

### 5. 本地 H5 调试
```bash
$env:PROJECT_DOMAIN="http://82.157.199.141:3000"; pnpm dev:web
# 浏览器打开 http://localhost:5002/
```

## 七、注意事项

1. **PROJECT_DOMAIN 必须设置**: 构建时必须设置环境变量 `PROJECT_DOMAIN=http://82.157.199.141:3000`，否则 API 请求会走 localhost 导致失败
2. **密码列需手动添加**: Supabase 不支持 REST API 执行 DDL，需在 Supabase 控制台执行:
   ```sql
   ALTER TABLE game_rooms ADD COLUMN IF NOT EXISTS password TEXT DEFAULT NULL;
   ```
3. **TRTC SDK 兼容**: `muteAudio()`/`unmuteAudio()` 在某些版本不返回 Promise，必须用 `async/await` + `try-catch`
4. **H5 跨端兼容**: 垂直 Text 加 `block` 类；Input/Textarea 用 View 包裹；Fixed+Flex 用 inline style
5. **APK 明文流量**: Android 9+ 默认禁止 HTTP，已通过 `network_security_config.xml` 配置允许
6. **pnpm 必须**: 禁止使用 npm 或 yarn

## 八、后续可展开的工作

### 待修复/优化
- [ ] Supabase 添加 `password` 列（需在控制台手动执行 SQL）
- [ ] 游戏页面 UI 美化
- [ ] 断线重连机制
- [ ] 游戏中途加入/观战模式

### 新功能建议
- [ ] 好友系统
- [ ] 游戏回放
- [ ] 排行榜
- [ ] 自定义规则
- [ ] iOS 支持
- [ ] 推送通知
- [ ] 房间内文字聊天
