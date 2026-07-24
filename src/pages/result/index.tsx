import { useState, useEffect } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { Swords, Users, House, RefreshCw, Shield, Skull, Trophy } from 'lucide-react-taro'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Network } from '@/network'

interface FinalPlayer {
  id: string
  name: string
  eliminated: boolean
  wounded: boolean
  faction: string
  cards: { type: string; identity: string; faceUp: boolean }[]
  isWinner: boolean
}

interface FinalResult {
  winner: string
  players: FinalPlayer[]
}

const ResultPage = () => {
  const router = useRouter()
  const roomCode = router.params.roomCode || ''
  const winner = router.params.winner || ''

  const [result, setResult] = useState<FinalResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchResult = async () => {
      try {
        const res = await Network.request({ url: `/api/game/room/${roomCode}/result` })
        const data = res.data as any
        if (data.code === 0) {
          setResult(data.data)
        }
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    fetchResult()
  }, [roomCode])

  const isLoyalWin = winner === 'loyal' || result?.winner === 'loyal'
  const isSoloWin = winner === 'solo' || result?.winner === 'solo'
  const titleText = isSoloWin ? '独狼获胜！' : isLoyalWin ? '忠诚阵营获胜！' : '变节阵营获胜！'
  const titleColor = isSoloWin ? 'text-yellow-400' : isLoyalWin ? 'text-blue-400' : 'text-red-400'

  const getIconBg = () => {
    if (isSoloWin) return 'from-yellow-500 to-purple-600'
    if (isLoyalWin) return 'from-blue-500 to-blue-700'
    return 'from-red-500 to-red-700'
  }

  const getBgGrad = () => {
    if (isSoloWin) return 'linear-gradient(180deg, rgba(234,179,8,0.4) 0%, rgba(107,33,168,0.2) 100%)'
    if (isLoyalWin) return 'linear-gradient(180deg, rgba(37,99,235,0.4) 0%, rgba(30,64,175,0.2) 100%)'
    return 'linear-gradient(180deg, rgba(239,68,68,0.4) 0%, rgba(185,28,28,0.2) 100%)'
  }

  if (loading) {
    return (
      <View className="min-h-screen bg-[#0a0e1a] flex items-center justify-center">
        <View className="text-center">
          <Trophy size={28} color="#8892a8" />
          <Text className="block text-gray-400 text-sm mt-4">加载结算...</Text>
        </View>
      </View>
    )
  }

  return (
    <View className="min-h-screen bg-[#0a0e1a] flex flex-col">
      <View className="px-6 pt-12 pb-8" style={{background: getBgGrad()}}>
        <View className="flex flex-col items-center">
          <View className={`w-20 h-20 rounded-full bg-gradient-to-br ${getIconBg()} flex items-center justify-center mb-4`}
            style={{boxShadow: '0 25px 50px -12px rgba(37,99,235,0.3)'}}
          >
            {isSoloWin ? <Swords size={36} color="#ffffff" /> :
             isLoyalWin ? <Shield size={36} color="#ffffff" /> : <Skull size={36} color="#ffffff" />}
          </View>
          <Text className={`block text-2xl font-bold ${titleColor} text-center mb-2`}>{titleText}</Text>
          <Text className="block text-sm text-gray-400 text-center">游戏结束</Text>
        </View>
      </View>

      <ScrollView scrollY className="flex-1">
        <View className="px-6 pt-6">
          <Text className="block text-xs text-gray-400 mb-3">所有玩家身份</Text>
          <View className="space-y-2">
            {result?.players.map((p) => {
              const isChief = p.cards.some(c => c.identity === 'chief')
              const isMastermind = p.cards.some(c => c.identity === 'mastermind')
              const factionColor = p.faction === 'loyal' ? 'text-blue-400' : 'text-red-400'
              const factionBg = p.faction === 'loyal'
                ? { backgroundColor: 'rgba(37,99,235,0.2)', borderColor: 'rgba(37,99,235,0.3)', borderWidth: 1 }
                : { backgroundColor: 'rgba(239,68,68,0.2)', borderColor: 'rgba(239,68,68,0.3)', borderWidth: 1 }

              return (
                <Card key={p.id} className="rounded-xl"
                  style={p.isWinner ? factionBg : { backgroundColor: 'rgba(17,24,39,0.5)', borderColor: '#1f2937', borderWidth: 1, opacity: 0.7 }}
                >
                  <CardContent className="p-4">
                    <View className="flex items-center gap-3">
                      <View className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                        p.faction === 'loyal' ? 'bg-blue-600' : 'bg-red-600'
                      }`}
                      >
                        <Users size={16} color="#ffffff" />
                      </View>
                      <View className="flex-1">
                        <View className="flex items-center gap-2 flex-wrap">
                          <Text className={`block text-sm font-medium ${p.eliminated ? 'text-gray-500 line-through' : 'text-white'}`}>{p.name}</Text>
                          {isChief && <Badge className="bg-yellow-500 bg-opacity-20 text-yellow-400 border-yellow-500 border-opacity-30"><Text>探长</Text></Badge>}
                          {isMastermind && <Badge className="bg-red-500 bg-opacity-20 text-red-400 border-red-500 border-opacity-30"><Text>主谋</Text></Badge>}
                          {p.eliminated && <Text className="block text-xs text-gray-500">[淘汰]</Text>}
                          {p.isWinner && <Text className="block text-xs text-green-400">✓ 获胜</Text>}
                        </View>
                        <View className="flex items-center gap-1 mt-1">
                          {p.faction === 'loyal' ? (
                            <View className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
                          ) : (
                            <View className="w-3 h-3 rounded-full bg-red-500 inline-block" />
                          )}
                          <Text className={`block text-xs ${factionColor}`}>
                            {p.faction === 'loyal' ? '忠诚阵营' : '变节阵营'}
                          </Text>
                        </View>
                        <View className="flex gap-1 mt-2 flex-wrap">
                          {p.cards.map((c, i) => {
                            const cardLabel = c.identity === 'chief' ? '探长' :
                              c.identity === 'mastermind' ? '主谋' :
                              c.identity === 'traitor' ? '变节' : '忠诚'
                            const cardBg = c.identity === 'chief' ? { backgroundColor: 'rgba(234,179,8,0.3)', borderColor: 'rgba(234,179,8,0.5)' } :
                              c.identity === 'mastermind' ? { backgroundColor: 'rgba(239,68,68,0.3)', borderColor: 'rgba(239,68,68,0.5)' } :
                              c.identity === 'traitor' ? { backgroundColor: 'rgba(185,28,28,0.2)', borderColor: 'rgba(185,28,28,0.4)' } : { backgroundColor: 'rgba(37,99,235,0.3)', borderColor: 'rgba(37,99,235,0.5)' }
                            return (
                              <View key={i} className="rounded px-2 py-1 border"
                                style={{opacity: 0.8, ...cardBg}}
                              >
                                <Text className="text-xs">{cardLabel}</Text>
                              </View>
                            )
                          })}
                        </View>
                      </View>
                    </View>
                  </CardContent>
                </Card>
              )
            })}
          </View>
        </View>

        <View className="px-6 pt-6 pb-8 space-y-3">
          <Button className="w-full bg-gray-800 text-white rounded-xl py-4 flex items-center justify-center gap-2"
            style={{border: '1px solid #374151'}}
            onClick={() => Taro.redirectTo({ url: '/pages/index/index' })}
          >
            <House size={16} color="#ffffff" />
            <Text>返回首页</Text>
          </Button>
          <Button className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-xl py-4 flex items-center justify-center gap-2"
            onClick={() => Taro.redirectTo({ url: `/pages/room/index?roomCode=${roomCode}` })}
          >
            <RefreshCw size={16} color="#ffffff" />
            <Text>再来一局</Text>
          </Button>
        </View>
      </ScrollView>
    </View>
  )
}

export default ResultPage