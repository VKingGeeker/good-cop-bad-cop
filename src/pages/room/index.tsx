import { useState, useEffect } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { Users, Copy, Play, User, Clock, LogOut } from 'lucide-react-taro'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Network } from '@/network'

interface RoomPlayer {
  id: string
  name: string
  isHost: boolean
  joinedAt: string
}

interface RoomData {
  roomCode: string
  hostPlayerId: string
  maxPlayers: number
  status: string
  players: RoomPlayer[]
}

const RoomPage = () => {
  const router = useRouter()
  const roomCode = router.params.roomCode || ''
  const playerId = Taro.getStorageSync('playerId') || ''
  const isHost = Taro.getStorageSync('isHost') === 'true'

  const [room, setRoom] = useState<RoomData | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [soloStarting, setSoloStarting] = useState(false)
  const [copied, setCopied] = useState(false)

  const fetchRoom = async () => {
    try {
      const res = await Network.request({ url: `/api/game/room/${roomCode}` })
      const result = res.data as any
      if (result.code === 0) {
        setRoom(result.data)
      }
    } catch {
      // ignore polling errors
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRoom()
    const timer = setInterval(fetchRoom, 2000)
    return () => clearInterval(timer)
  }, [])

  const handleCopyCode = () => {
    Taro.setClipboardData({ data: roomCode }).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleStartGame = async () => {
    if (starting || !isHost) return
    setStarting(true)
    try {
      const res = await Network.request({
        url: '/api/game/room/' + roomCode + '/start',
        method: 'POST',
        data: { playerId },
      })
      const result = res.data as any
      if (result.code === 0) {
        Taro.redirectTo({ url: `/pages/game/index?roomCode=${roomCode}&playerId=${playerId}` })
      } else {
        Taro.showToast({ title: result.msg || '启动失败', icon: 'none' })
      }
    } catch (err: any) {
      Taro.showToast({ title: err.message || '网络错误', icon: 'none' })
    } finally {
      setStarting(false)
    }
  }

  const handleSoloStart = async () => {
    if (soloStarting || !isHost) return
    setSoloStarting(true)
    try {
      const res = await Network.request({
        url: '/api/game/room/' + roomCode + '/solo-start',
        method: 'POST',
        data: { playerId },
      })
      const result = res.data as any
      if (result.code === 0) {
        Taro.redirectTo({ url: `/pages/game/index?roomCode=${roomCode}&playerId=${playerId}` })
      } else {
        Taro.showToast({ title: result.msg || '启动失败', icon: 'none' })
      }
    } catch (err: any) {
      Taro.showToast({ title: err.message || '网络错误', icon: 'none' })
    } finally {
      setSoloStarting(false)
    }
  }

  const handleLeaveRoom = () => {
    Taro.removeStorageSync('playerId')
    Taro.removeStorageSync('roomCode')
    Taro.removeStorageSync('isHost')
    Taro.removeStorageSync('playerName')
    Taro.redirectTo({ url: '/pages/index/index' })
  }

  if (loading) {
    return (
      <View className="min-h-screen bg-[#0a0e1a] flex items-center justify-center">
        <View className="text-center">
          <Text className="block text-3xl mb-4">🔍</Text>
          <Text className="block text-gray-400 text-sm">正在加载房间...</Text>
        </View>
      </View>
    )
  }

  if (!room) {
    return (
      <View className="min-h-screen bg-[#0a0e1a] flex items-center justify-center px-6">
        <View className="text-center">
          <Text className="block text-3xl mb-4">❌</Text>
          <Text className="block text-gray-400 text-sm mb-4">房间不存在或已关闭</Text>
          <Button className="bg-blue-600 text-white rounded-xl px-6 py-2" onClick={() => Taro.redirectTo({ url: '/pages/index/index' })}>
            <Text>返回首页</Text>
          </Button>
        </View>
      </View>
    )
  }

  return (
    <View className="min-h-screen bg-[#0a0e1a] flex flex-col">
      <View className="bg-[#0e1322] px-6 py-4 flex items-center justify-between">
        <Text className="block text-sm text-white font-bold">等待中</Text>
        <Button variant="secondary" className="flex items-center gap-1 px-3 py-1 rounded-xl"
          style={{backgroundColor: 'rgba(239,68,68,0.2)'}} onClick={handleLeaveRoom}
        >
          <LogOut size={14} color="#8892a8" />
          <Text className="text-xs text-gray-400">退出</Text>
        </Button>
      </View>

      <View className="px-6 pt-6">
        <Card className="rounded-xl"
          style={{background: 'linear-gradient(135deg, rgba(30,64,175,0.4) 0%, rgba(107,33,168,0.4) 100%)', border: '1px solid rgba(59,130,246,0.3)'}}
        >
          <CardContent className="p-4">
            <View className="flex items-center justify-between">
              <View>
                <Text className="block text-xs text-blue-400 mb-1">房间号</Text>
                <Text className="block text-2xl font-bold text-white tracking-widest">{roomCode}</Text>
              </View>
              <Button
                className="bg-blue-600 text-white rounded-lg px-4 py-2 flex items-center gap-1"
                onClick={handleCopyCode}
              >
                <Copy size={14} color="#60a5fa" />
                <Text className="text-xs">{copied ? '已复制' : '复制'}</Text>
              </Button>
            </View>
          </CardContent>
        </Card>
      </View>

      <View className="flex-1 px-6 pt-4">
        <View className="flex items-center justify-between mb-3">
          <View className="flex items-center gap-2">
            <Users size={16} color="#3b82f6" />
            <Text className="block text-sm text-gray-300">
              玩家 ({room?.players.length || 0}/{room?.maxPlayers || 0})
            </Text>
          </View>
          {room && room.players.length >= 2 && (
            <Text className="block text-xs text-green-400">人数已够</Text>
          )}
        </View>

        <View className="space-y-2">
          {room?.players.map((p) => (
            <Card key={p.id} className="rounded-xl"
              style={{
                backgroundColor: p.id === playerId ? 'rgba(37,99,235,0.15)' : '#1a1f2e',
                borderColor: p.id === playerId ? 'rgba(37,99,235,0.5)' : '#374151',
                borderWidth: 1,
              }}
            >
              <CardContent className="p-3">
                <View className="flex items-center gap-3">
                  <View className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    p.isHost ? 'bg-gradient-to-br from-yellow-500 to-yellow-700' : 'bg-gradient-to-br from-blue-600 to-blue-800'
                  }`}
                  >
                    <User size={14} color="#ffffff" />
                  </View>
                  <View className="flex-1">
                    <Text className="block text-sm text-white">{p.name}</Text>
                    <View className="flex items-center gap-2 mt-1">
                      {p.isHost && <Text className="block text-xs text-yellow-500">房主</Text>}
                      {p.id === playerId && <Text className="block text-xs text-blue-400">(你)</Text>}
                    </View>
                  </View>
                  {p.id === playerId && (
                    <View className="bg-green-600 rounded-full px-2 py-0">
                      <Text className="text-xs text-white">已加入</Text>
                    </View>
                  )}
                </View>
              </CardContent>
            </Card>
          ))}
        </View>
      </View>

      <View className="px-6 py-6">
        {isHost ? (
          <View className="flex flex-col gap-3">
            <Button
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl py-4 flex items-center justify-center gap-2"
              onClick={handleStartGame}
              disabled={starting || (room?.players.length || 0) < 2}
              style={{opacity: (starting || (room?.players.length || 0) < 2) ? 0.6 : 1}}
            >
              <Play size={18} color="#ffffff" />
              <Text className="font-bold">
                {starting ? '正在启动...' : `开始游戏 (${room?.players.length || 0}人)`}
              </Text>
            </Button>
            <Button
              className="w-full rounded-xl py-3 flex items-center justify-center gap-2"
              style={{background: 'linear-gradient(135deg, rgba(16,185,129,0.3) 0%, rgba(59,130,246,0.3) 100%)', border: '1px solid rgba(16,185,129,0.4)'}}
              onClick={handleSoloStart}
              disabled={soloStarting}
            >
              <Text className="font-bold text-emerald-400">
                {soloStarting ? '正在启动...' : '🧪 单人测试（AI填充）'}
              </Text>
            </Button>
          </View>
        ) : (
          <View className="flex items-center justify-center gap-2 p-4"
            style={{backgroundColor: 'rgba(234,179,8,0.15)', borderRadius: 12, border: '1px solid rgba(234,179,8,0.3)'}}
          >
            <Clock size={16} color="#f59e0b" />
            <Text className="block text-sm text-yellow-400">等待房主开始游戏</Text>
          </View>
        )}
      </View>
    </View>
  )
}

export default RoomPage