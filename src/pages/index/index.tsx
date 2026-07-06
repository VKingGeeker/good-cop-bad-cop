import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Swords, BookOpen, DoorOpen, LogIn } from 'lucide-react-taro'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Network } from '@/network'

const IndexPage = () => {
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [showRules, setShowRules] = useState(false)

  // 创建房间
  const [hostName, setHostName] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(4)
  const [creating, setCreating] = useState(false)

  // 加入房间
  const [roomCode, setRoomCode] = useState('')
  const [joinName, setJoinName] = useState('')
  const [joining, setJoining] = useState(false)

  const [error, setError] = useState('')

  const handleCreateRoom = async () => {
    if (creating) return
    if (!hostName.trim()) {
      setError('请输入昵称')
      return
    }
    setCreating(true)
    setError('')
    try {
      const res = await Network.request({
        url: '/api/game/room/create',
        method: 'POST',
        data: { hostName: hostName.trim(), maxPlayers },
      })
      const result = res.data as any
      if (result.code === 0) {
        const { roomCode: newRoomCode, playerId } = result.data
        // 保存到本地存储
        Taro.setStorageSync('playerId', playerId)
        Taro.setStorageSync('playerName', hostName.trim())
        Taro.setStorageSync('roomCode', newRoomCode)
        Taro.setStorageSync('isHost', 'true')
        Taro.redirectTo({ url: `/pages/room/index?roomCode=${newRoomCode}` })
      } else {
        setError(result.msg || '创建房间失败')
      }
    } catch (err: any) {
      setError(err.message || '网络错误')
    } finally {
      setCreating(false)
    }
  }

  const handleJoinRoom = async () => {
    if (!roomCode.trim() || roomCode.length !== 6) {
      setError('请输入6位房间号')
      return
    }
    if (!joinName.trim()) {
      setError('请输入昵称')
      return
    }
    setJoining(true)
    setError('')
    try {
      const res = await Network.request({
        url: '/api/game/room/join',
        method: 'POST',
        data: { roomCode: roomCode.trim(), playerName: joinName.trim() },
      })
      const result = res.data as any
      if (result.code === 0) {
        const { playerId } = result.data
        Taro.setStorageSync('playerId', playerId)
        Taro.setStorageSync('playerName', joinName.trim())
        Taro.setStorageSync('roomCode', roomCode.trim())
        Taro.setStorageSync('isHost', 'false')
        Taro.redirectTo({ url: `/pages/room/index?roomCode=${roomCode.trim()}` })
      } else {
        setError(result.msg || '加入房间失败')
      }
    } catch (err: any) {
      setError(err.message || '网络错误')
    } finally {
      setJoining(false)
    }
  }

  return (
    <View className="min-h-screen bg-[#0a0e1a] flex flex-col" style={{ position: 'relative' }}>
      {/* 背景装饰 */}
      <View className="absolute inset-0 opacity-5">
        <View className="w-full h-64 bg-gradient-to-b from-blue-600 to-transparent rounded-full blur-3xl -top-32" />
      </View>

      {/* 标题区域 */}
      <View className="flex-1 flex flex-col items-center justify-center px-6 pt-12">
        <View className="w-24 h-24 rounded-2xl bg-gradient-to-br from-blue-600 to-red-600 flex items-center justify-center mb-6 shadow-2xl animate-pulse-glow">
          <Swords size={48} color="#ffffff" />
        </View>

        <Text className="block text-3xl font-bold text-white text-center mb-2 tracking-wider">
          无间疑云
        </Text>
        <Text className="block text-sm text-gray-400 text-center mb-2">
          Good Cop Bad Cop
        </Text>
        <View className="w-16 h-1 bg-gradient-to-r from-blue-500 to-red-500 rounded-full mb-6" />

        <Text className="block text-xs text-gray-500 text-center mb-10 max-w-xs leading-relaxed">
          在线联机 · 3-8人 · 身份推理阵营对决定
        </Text>

        {/* 按钮组 */}
        <View className="w-full max-w-xs space-y-3 px-4">
          <Button
            className="w-full h-12 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl text-base font-semibold"
            style={{boxShadow: '0 10px 15px -3px rgba(37,99,235,0.3)'}}
            onClick={() => { setShowCreate(true); setError('') }}
          >
            <DoorOpen size={18} color="#ffffff" className="mr-2" />
            <Text>创建房间</Text>
          </Button>

          <Button
            variant="secondary"
            className="w-full h-12 bg-gray-800 text-gray-200 rounded-xl text-base border border-gray-700"
            onClick={() => { setShowJoin(true); setError('') }}
          >
            <LogIn size={18} color="#ffffff" className="mr-2" />
            <Text>加入房间</Text>
          </Button>

          <Button
            variant="secondary"
            className="w-full h-12 bg-gray-800 text-gray-200 rounded-xl text-base border border-gray-700"
            onClick={() => setShowRules(true)}
          >
            <BookOpen size={18} color="#ffffff" className="mr-2" />
            <Text>游戏规则</Text>
          </Button>
        </View>

        <Text className="block text-xs text-gray-600 mt-8">v1.0 · 在线联机</Text>
      </View>

      {/* 创建房间弹窗 */}
      <Dialog open={showCreate} onOpenChange={(open) => setShowCreate(open)}>
        <DialogContent className="bg-[#1a1f2e] border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white text-lg font-bold">创建房间</DialogTitle>
          </DialogHeader>
          <View className="space-y-4">
            <View>
              <Text className="block text-xs text-gray-400 mb-2">你的昵称</Text>
              <View className="bg-gray-800 rounded-lg px-3 py-2 border border-gray-700">
                <Input
                  className="w-full bg-transparent text-sm text-white"
                  value={hostName}
                  onInput={(e) => setHostName(e.detail.value)}
                  placeholder="请输入昵称"
                  maxlength={8}
                />
              </View>
            </View>
            <View>
              <Text className="block text-xs text-gray-400 mb-2">玩家人数</Text>
              <View className="flex items-center justify-center gap-4 py-2">
                {[3, 4, 5, 6, 7, 8].map(n => (
                  <Button
                    key={n}
                    className={`w-10 h-10 rounded-full ${maxPlayers === n ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 border border-gray-700'}`}
                    onClick={() => setMaxPlayers(n)}
                  >
                    <Text className="text-sm">{n}</Text>
                  </Button>
                ))}
              </View>
            </View>
            {error && <Text className="block text-xs text-red-400">{error}</Text>}
            <Button
              className="w-full h-11 bg-blue-600 hover:bg-blue-500 text-white rounded-xl"
              onClick={handleCreateRoom}
              disabled={creating}
            >
              <Text>{creating ? '创建中...' : '创建房间'}</Text>
            </Button>
          </View>
        </DialogContent>
      </Dialog>

      {/* 加入房间弹窗 */}
      <Dialog open={showJoin} onOpenChange={(open) => setShowJoin(open)}>
        <DialogContent className="bg-[#1a1f2e] border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white text-lg font-bold">加入房间</DialogTitle>
          </DialogHeader>
          <View className="space-y-4">
            <View>
              <Text className="block text-xs text-gray-400 mb-2">房间号（6位数字）</Text>
              <View className="bg-gray-800 rounded-lg px-3 py-2 border border-gray-700">
                <Input
                  className="w-full bg-transparent text-sm text-white tracking-widest text-center text-lg"
                  value={roomCode}
                  onInput={(e) => setRoomCode(e.detail.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  maxlength={6}
                />
              </View>
            </View>
            <View>
              <Text className="block text-xs text-gray-400 mb-2">你的昵称</Text>
              <View className="bg-gray-800 rounded-lg px-3 py-2 border border-gray-700">
                <Input
                  className="w-full bg-transparent text-sm text-white"
                  value={joinName}
                  onInput={(e) => setJoinName(e.detail.value)}
                  placeholder="请输入昵称"
                  maxlength={8}
                />
              </View>
            </View>
            {error && <Text className="block text-xs text-red-400">{error}</Text>}
            <Button
              className="w-full h-11 bg-blue-600 hover:bg-blue-500 text-white rounded-xl"
              onClick={handleJoinRoom}
              disabled={joining}
            >
              <Text>{joining ? '加入中...' : '加入房间'}</Text>
            </Button>
          </View>
        </DialogContent>
      </Dialog>

      {/* 规则说明弹窗 */}
      <Dialog open={showRules} onOpenChange={(open) => setShowRules(open)}>
        <DialogContent className="bg-[#1a1f2e] border-gray-700 max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="text-white text-lg font-bold">游戏规则</DialogTitle>
          </DialogHeader>
          <View className="max-h-[60vh] overflow-y-auto space-y-4 px-1">
            <Section title="游戏概述" text="身份推理阵营桌游《无间疑云》的数字化版本，支持3-8人在线联机。玩家扮演警察，但阵营分为忠诚警察和变节黑帮，需找出并消灭敌方首领。" />
            <Section title="身份判定" text="每人有3张底细牌：持有探长牌→忠诚阵营首领；持有主谋牌→变节阵营首领；无首领牌则按多数牌决定阵营。一人同时持有探长和主谋则独自获胜。" />
            <Section title="回合行动" text="每回合四选一：①调查：秘密查看1名玩家的1张底细牌 ②取得装备：抽1张装备牌，翻开1张底细牌 ③装备手枪：拿手枪，翻开1张底细牌 ④射击：射击瞄准的玩家。持枪时必须瞄准1人。" />
            <Section title="中枪处理" text="中枪后翻开所有底细牌：非首领直接淘汰；首领第一次中枪受伤+抽装备，第二次中枪淘汰。" />
            <Section title="胜利条件" text="主谋被淘汰→忠诚阵营胜；探长被淘汰→变节阵营胜；持有探长+主谋→独狼获胜。" />
            <Section title="装备牌" text="共16种装备牌：烟雾弹、禁制令、咖啡、勒索信、防弹衣、急救包、瞄准镜、假情报、双倍射击、抢夺、调换、沉默令、侦查令、信号弹、防弹盾、贿赂。" />
          </View>
          <Button className="w-full mt-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl" onClick={() => setShowRules(false)}>
            <Text>我知道了</Text>
          </Button>
        </DialogContent>
      </Dialog>
    </View>
  )
}

const Section = ({ title, text }: { title: string; text: string }) => (
  <View className="mb-3">
    <Text className="block text-blue-400 text-sm font-bold mb-1">{title}</Text>
    <Text className="block text-gray-300 text-xs leading-relaxed">{text}</Text>
  </View>
)

export default IndexPage