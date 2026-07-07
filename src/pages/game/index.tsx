import { useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import {
  Swords, Target, Crosshair, Search, Package,
  Heart, EyeOff
} from 'lucide-react-taro'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Network } from '@/network'

// ============ Types ============
interface ServerCard {
  type: string
  faceUp: boolean
}

interface ServerPlayer {
  id: string
  name: string
  cards: ServerCard[]
  equipment: { name: string; description: string } | null
  hasGun: boolean
  aimingAt: string | null
  wounded: boolean
  eliminated: boolean
  bannedAction: string | null
  silenced: boolean
}

interface ServerLog {
  message: string
}

// Equipment mapping
const EQUIPMENT_MAP: Record<string, string> = {
  '烟雾弹': 'smoke', '禁制令': 'injunction', '咖啡': 'coffee',
  '勒索信': 'blackmail', '防弹衣': 'vest', '急救包': 'medkit',
  '瞄准镜': 'scope', '假情报': 'fakeIntel', '双倍射击': 'doubleShot',
  '抢夺': 'snatch', '调换': 'swap', '沉默令': 'silence',
  '侦查令': 'recon', '信号弹': 'flare', '防弹盾': 'shield', '贿赂': 'bribe',
}

const EQUIPMENT_EMOJI: Record<string, string> = {
  smoke: '💨', injunction: '🚫', coffee: '☕', blackmail: '✉️',
  vest: '🛡️', medkit: '🏥', scope: '🔍', fakeIntel: '📄',
  doubleShot: '🔫', snatch: '✋', swap: '🔄', silence: '🤫',
  recon: '👁️', flare: '🎆', shield: '🛡️', bribe: '💰',
}

const EQUIPMENT_INFO: Record<string, { name: string; desc: string }> = {
  smoke: { name: '烟雾弹', desc: '游戏方向反转' },
  injunction: { name: '禁制令', desc: '禁止1名玩家执行1种行动' },
  coffee: { name: '咖啡', desc: '立即进行1个额外回合' },
  blackmail: { name: '勒索信', desc: '与1名玩家交换1张底细牌' },
  vest: { name: '防弹衣', desc: '取消1次射击伤害' },
  medkit: { name: '急救包', desc: '移除首领受伤标记' },
  scope: { name: '瞄准镜', desc: '查看自己1张底细牌' },
  fakeIntel: { name: '假情报', desc: '将1张翻开的底细牌翻回' },
  doubleShot: { name: '双倍射击', desc: '本回合可射击2次' },
  snatch: { name: '抢夺', desc: '抢走1名玩家的手枪' },
  swap: { name: '调换', desc: '与1名玩家交换装备' },
  silence: { name: '沉默令', desc: '指定玩家下回合不能用装备' },
  recon: { name: '侦查令', desc: '查看1名玩家所有底细牌' },
  flare: { name: '信号弹', desc: '所有玩家翻开1张底细牌' },
  shield: { name: '防弹盾', desc: '免疫所有射击直到下回合' },
  bribe: { name: '贿赂', desc: '偷取1名玩家的装备牌' },
}

const GAME_PAGE = () => {
  const router = useRouter()
  const roomCode = router.params.roomCode || ''
  const playerId = router.params.playerId || Taro.getStorageSync('playerId') || ''

  const [serverState, setServerState] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [actionModal, setActionModal] = useState<string | null>(null)
  const [selectedTarget, setSelectedTarget] = useState('')
  const [selectedAction, setSelectedAction] = useState('')
  const [equipmentResult, setEquipmentResult] = useState<{ name: string; desc: string } | null>(null)
  const [investigateResult, setInvestigateResult] = useState<{ card: string; cardTypeName: string; targetName: string } | null>(null)
  const [notification, setNotification] = useState<{ title: string; msg: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const fetchGameState = useCallback(async () => {
    try {
      const res = await Network.request({ url: `/api/game/room/${roomCode}/state?playerId=${playerId}` })
      const result = res.data as any
      if (result.code === 0) {
        const state = result.data
        setServerState(state)
        if (state.status === 'ended') {
          setTimeout(() => {
            Taro.redirectTo({ url: `/pages/result/index?roomCode=${roomCode}&winner=${state.winner || ''}` })
          }, 1500)
          return
        }
      }
    } catch {
      // ignore polling errors
    } finally {
      setLoading(false)
    }
  }, [roomCode, playerId])

  useEffect(() => {
    fetchGameState()
    const timer = setInterval(fetchGameState, 2500)
    return () => clearInterval(timer)
  }, [fetchGameState])

  if (!serverState) {
    return (
      <View className="min-h-screen bg-[#0a0e1a] flex items-center justify-center">
        <View className="text-center">
          {loading ? (
            <>
              <Text className="block text-3xl mb-4">🔍</Text>
              <Text className="block text-gray-400 text-sm">正在加载游戏...</Text>
            </>
          ) : (
            <>
              <Text className="block text-3xl mb-4">⚠️</Text>
              <Text className="block text-gray-400 text-sm mb-4">无法加载游戏状态</Text>
              <Button className="bg-blue-600 text-white rounded-xl px-6 py-2" onClick={fetchGameState}>
                <Text>重试</Text>
              </Button>
            </>
          )}
        </View>
      </View>
    )
  }

  const allPlayers: ServerPlayer[] = serverState.players || []
  const me = allPlayers.find(p => p.id === playerId)
  const currentPlayerDeviceId = serverState.currentPlayerDeviceId || ''
  const isMyTurn = currentPlayerDeviceId === playerId && me && !me.eliminated
  const currentPlayerName = allPlayers.find(p => p.id === currentPlayerDeviceId)?.name || '未知'
  const alivePlayers = allPlayers.filter(p => !p.eliminated)
  const enemyPlayers = alivePlayers.filter(p => p.id !== playerId)

  const getEquipKey = (equip: any): string | null => {
    if (!equip) return null
    const name = typeof equip === 'string' ? equip : equip.name
    return EQUIPMENT_MAP[name] || name
  }

  const myEquipmentKey = me?.equipment ? getEquipKey(me.equipment) : null

  const submitAction = async (action: string, target: string = '', extra: any = {}) => {
    if (submitting) return
    setSubmitting(true)
    try {
      const data: any = { playerId, action }
      if (target) data.target = target
      Object.assign(data, extra)

      const res = await Network.request({
        url: `/api/game/room/${roomCode}/action`,
        method: 'POST',
        data,
      })
      const result = res.data as any
      if (result.code === 0) {
        const rd = result.data || {}
        if (rd.result) {
          setInvestigateResult(rd.result)
        }
        if (rd.equipment) {
          setEquipmentResult(rd.equipment)
        }
        if (rd.notification) {
          showNotification(rd.notification.title, rd.notification.msg)
        }
        setActionModal(null)
        setSelectedTarget('')
        await fetchGameState()
      } else {
        Taro.showToast({ title: result.msg || '操作失败', icon: 'none' })
      }
    } catch (err: any) {
      Taro.showToast({ title: err.message || '网络错误', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  const showNotification = (title: string, msg: string) => {
    setNotification({ title, msg })
    setTimeout(() => setNotification(null), 3500)
  }

  const handleUseEquipment = async (equipKey: string) => {
    const needTarget = ['injunction', 'blackmail', 'snatch', 'swap', 'silence', 'recon', 'bribe', 'medkit']
    const needCard = ['fakeIntel', 'scope']

    if (needTarget.includes(equipKey)) {
      setSelectedAction(`equip_${equipKey}`)
      setActionModal('select_target')
    } else if (needCard.includes(equipKey)) {
      setSelectedAction(`equip_${equipKey}`)
      setActionModal('select_card')
    } else {
      await submitAction('use_equipment', '', { equipment: equipKey })
    }
  }

  const gameLogs: string[] = (serverState.gameLog || []).map((l: ServerLog) => l.message)

  return (
    <View className="min-h-screen bg-[#0a0e1a] flex flex-col pb-16">
      {notification && (
        <View className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-blue-600 to-purple-600 p-4"
          style={{boxShadow: '0 10px 15px rgba(37,99,235,0.3)'}}
        >
          <Text className="block text-sm text-white font-bold">{notification.title}</Text>
          <Text className="block text-xs text-blue-100 mt-1">{notification.msg}</Text>
        </View>
      )}

      <View className="bg-[#0e1322] border-b border-gray-800 px-6 py-4">
        <View className="flex items-center justify-between mb-1">
          <Text className="block text-xs text-gray-500">房间 {roomCode}</Text>
          <View className="flex items-center gap-2">
            <View className="flex items-center gap-1">
              <Swords size={12} color="#f59e0b" />
              <Text className="block text-xs text-yellow-400">x{serverState.gunCount || 0}</Text>
            </View>
            <View className="bg-blue-600 rounded-full px-2 py-0" style={{opacity: 0.2}}>
              <Text className="text-xs text-blue-400">{serverState.direction === 1 ? '➡' : '⬅'} 回合{serverState.round || 1}</Text>
            </View>
          </View>
        </View>
        <Text className={`block text-sm font-bold ${isMyTurn ? 'text-green-400' : 'text-gray-400'}`}>
          {isMyTurn ? '🎯 轮到你了！' : `⏳ ${currentPlayerName} 行动中...`}
        </Text>
      </View>

      <ScrollView scrollY className="flex-1">
        {me && (
          <View className="px-6 pt-4">
            <Text className="block text-xs text-gray-400 mb-2">我的底细牌</Text>
            <View className="flex gap-2">
              {me.cards.map((card, i) => (
                <View key={i} className="w-20 h-28 rounded-xl border-2 flex items-center justify-center"
                  style={{
                    borderColor: card.faceUp
                      ? card.type === 'chief' ? '#eab308' : card.type === 'mastermind' ? '#ef4444' : card.type === 'traitor' ? '#b91c1c' : '#3b82f6'
                      : '#4b5563',
                    backgroundColor: card.faceUp
                      ? card.type === 'chief' ? 'rgba(234,179,8,0.3)' : card.type === 'mastermind' ? 'rgba(239,68,68,0.3)' : card.type === 'traitor' ? 'rgba(185,28,28,0.2)' : 'rgba(59,130,246,0.3)'
                      : 'rgba(55,65,81,0.5)'
                  }}
                >
                  <View className="text-center">
                    {card.faceUp ? (
                      <View>
                        <Text className={`block text-lg ${card.type === 'chief' ? 'text-yellow-400' : card.type === 'mastermind' ? 'text-red-400' : card.type === 'traitor' ? 'text-red-500' : 'text-blue-400'}`}>
                          {card.type === 'chief' ? '🔍' : card.type === 'mastermind' ? '🎭' : card.type === 'traitor' ? '🔴' : '🔵'}
                        </Text>
                        <Text className="block text-xs text-white mt-1">
                          {card.type === 'chief' ? '探长' : card.type === 'mastermind' ? '主谋' : card.type === 'traitor' ? '变节' : '忠诚'}
                        </Text>
                      </View>
                    ) : (
                      <View className="items-center justify-center">
                        <EyeOff size={20} color="#4b5563" />
                        <Text className="block text-xs text-gray-600 mt-1">底细</Text>
                      </View>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {myEquipmentKey && (
          <View className="px-6 pt-3">
            <Text className="block text-xs text-gray-400 mb-2">装备</Text>
            <Card className="bg-gradient-to-r from-purple-900 to-blue-900 rounded-xl" style={{opacity: 0.9}}>
              <CardContent className="p-3 flex items-center justify-between">
                <View className="flex items-center gap-2">
                  <Text className="text-base">{EQUIPMENT_EMOJI[myEquipmentKey] || '📦'}</Text>
                  <View>
                    <Text className="block text-sm text-white font-medium">{EQUIPMENT_INFO[myEquipmentKey]?.name || myEquipmentKey}</Text>
                    <Text className="block text-xs text-gray-400">{EQUIPMENT_INFO[myEquipmentKey]?.desc || ''}</Text>
                  </View>
                </View>
                {isMyTurn && (
                  <Button className="bg-purple-600 text-white rounded-lg px-3 py-1 text-xs" onClick={() => handleUseEquipment(myEquipmentKey)}>
                    <Text>使用</Text>
                  </Button>
                )}
              </CardContent>
            </Card>
          </View>
        )}

        <View className="px-6 pt-4">
          <Text className="block text-xs text-gray-400 mb-2">
            玩家 ({alivePlayers.length}/{allPlayers.length})
          </Text>
          <View className="space-y-2">
            {allPlayers.map((p) => {
              const faceUpCount = p.cards.filter(c => c.faceUp && c.type !== 'unknown').length
              const isCurrentTurn = p.id === currentPlayerDeviceId
              return (
                <Card key={p.id} className="rounded-xl"
                  style={{
                    backgroundColor: p.id === playerId ? 'rgba(30,64,175,0.2)' : isCurrentTurn && !isMyTurn ? 'rgba(22,163,74,0.2)' : p.eliminated ? 'rgba(17,24,39,0.5)' : '#1a1f2e',
                    borderColor: p.id === playerId ? 'rgba(37,99,235,0.4)' : isCurrentTurn && !isMyTurn ? 'rgba(22,163,74,0.4)' : p.eliminated ? '#1f2937' : '#374151',
                    opacity: p.eliminated ? 0.5 : 1,
                    borderWidth: 1,
                  }}
                >
                  <CardContent className="p-3">
                    <View className="flex items-center gap-2">
                      <View className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${p.eliminated ? 'bg-gray-800' : p.id === playerId ? 'bg-blue-600' : isCurrentTurn ? 'bg-green-600' : 'bg-gray-700'}`}>
                        <Text className="text-xs text-white">{p.name.charAt(0)}</Text>
                      </View>
                      <View className="flex-1 min-w-0">
                        <View className="flex items-center gap-1 flex-wrap">
                          <Text className={`block text-sm font-medium ${p.eliminated ? 'text-gray-500 line-through' : 'text-white'}`}>{p.name}</Text>
                          {p.wounded && <View className="bg-red-600 rounded px-1"><Heart size={10} color="#fca5a5" /></View>}
                          {p.eliminated && <View className="bg-gray-700 rounded px-1"><Text className="text-xs text-gray-400">淘汰</Text></View>}
                          {p.hasGun && <Swords size={12} color="#f59e0b" />}
                        </View>
                        <View className="flex items-center gap-1 mt-1 flex-wrap">
                          <Text className="block text-xs text-gray-500">底细 {faceUpCount}/{p.cards.length}</Text>
                          {p.equipment && (
                            <Text className="block text-xs text-purple-400">
                              {EQUIPMENT_EMOJI[EQUIPMENT_MAP[p.equipment.name] || ''] || '📦'} {p.equipment.name}
                            </Text>
                          )}
                          {p.aimingAt && !p.eliminated && (
                            <Text className="block text-xs text-yellow-500">
                              🎯 {allPlayers.find(p2 => p2.id === p.aimingAt)?.name || '?'}
                            </Text>
                          )}
                        </View>
                      </View>
                      {isMyTurn && p.id !== playerId && !p.eliminated && (
                        <View className="flex gap-1 flex-shrink-0">
                          <Button className="w-7 h-7 rounded-lg flex items-center justify-center"
                            style={{backgroundColor: 'rgba(37,99,235,0.3)'}}
                            onClick={() => { setActionModal('investigate_target'); setSelectedTarget(p.id) }}
                          >
                            <Search size={12} color="#60a5fa" />
                          </Button>
                          <Button className="w-7 h-7 rounded-lg flex items-center justify-center"
                            style={{backgroundColor: 'rgba(239,68,68,0.3)'}}
                            onClick={() => { setActionModal('shoot_confirm'); setSelectedTarget(p.id) }}
                          >
                            <Crosshair size={12} color="#f87171" />
                          </Button>
                        </View>
                      )}
                    </View>
                  </CardContent>
                </Card>
              )
            })}
          </View>
        </View>

        {isMyTurn && (
          <View className="px-6 pt-6 pb-4">
            <Text className="block text-xs text-gray-400 mb-3">选择行动</Text>
            <View className="grid grid-cols-2 gap-3">
              <ActionCard
                icon={<Search size={20} color="#3b82f6" />}
                title="调查"
                desc="查看1名玩家的1张底细牌"
                onClick={() => setActionModal('investigate_target')}
                disabled={!enemyPlayers.length}
              />
              <ActionCard
                icon={<Package size={20} color="#8b5cf6" />}
                title="取得装备"
                desc="抽1张装备牌，翻开1张底细牌"
                onClick={() => setActionModal('equip_flip')}
              />
              <ActionCard
                icon={<Target size={20} color="#f59e0b" />}
                title="装备手枪"
                desc="拿手枪+翻开1张底细牌"
                onClick={() => setActionModal('gun_flip')}
                disabled={!serverState.gunCount || serverState.gunCount <= 0}
              />
              <ActionCard
                icon={<Crosshair size={20} color="#ef4444" />}
                title="射击"
                desc="射击瞄准的玩家"
                onClick={() => setActionModal('shoot_confirm')}
                disabled={!me?.hasGun || !me?.aimingAt}
                subtitle={!me?.hasGun ? '需先装手枪' : !me?.aimingAt ? '未瞄准' : undefined}
              />
            </View>
          </View>
        )}

        <View className="px-6 pt-4 pb-20">
          <Text className="block text-xs text-gray-400 mb-2">游戏日志</Text>
          <View className="bg-gray-900 rounded-xl max-h-32 overflow-y-auto" style={{border: '1px solid #1f2937'}}>
            <View className="p-3">
              {gameLogs.slice(-20).reverse().map((log, i) => (
                <Text key={i} className="block text-xs text-gray-400 mb-1 leading-relaxed">{log}</Text>
              ))}
              {gameLogs.length === 0 && (
                <Text className="block text-xs text-gray-600 text-center py-2">暂无日志</Text>
              )}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* 调查选择目标 */}
      <Modal visible={actionModal === 'investigate_target'} title="选择调查目标" onClose={() => setActionModal(null)}>
        {enemyPlayers.map(p => (
          <Button key={p.id} className="w-full bg-gray-800 text-gray-200 rounded-xl mb-2 py-3" style={{border: '1px solid #374151'}}
            onClick={() => { setSelectedTarget(p.id); setActionModal('investigate_card') }}
          >
            <Text className="block text-sm">{p.name}</Text>
          </Button>
        ))}
        <Button variant="secondary" className="w-full bg-gray-800 text-gray-400 rounded-xl py-2 mt-1" onClick={() => setActionModal(null)}>
          <Text>取消</Text>
        </Button>
      </Modal>

      <Modal visible={actionModal === 'investigate_card'} title="选择底细牌" onClose={() => setActionModal(null)}>
        <Text className="block text-xs text-gray-400 mb-3">
          查看 {allPlayers.find(p => p.id === selectedTarget)?.name} 的第几张底细牌
        </Text>
        {[0, 1, 2].map(i => (
          <Button key={i} className="w-full bg-gray-800 text-gray-200 rounded-xl mb-2 py-3" style={{border: '1px solid #374151'}}
            onClick={() => submitAction('investigate', selectedTarget, { cardIndex: i })}
          >
            <Text>第 {i + 1} 张底细牌</Text>
          </Button>
        ))}
      </Modal>

      <Modal visible={!!investigateResult} title="调查结果" onClose={() => setInvestigateResult(null)}>
        <View className="flex items-center justify-center py-4">
          <View className="text-center">
            <Text className="block text-sm text-gray-400 mb-3">
              {investigateResult?.targetName} 的底细牌
            </Text>
            <View className="w-24 h-32 rounded-xl border-2 flex items-center justify-center mx-auto"
              style={{
                borderColor: investigateResult?.card === 'chief' ? '#eab308' : investigateResult?.card === 'mastermind' ? '#ef4444' : investigateResult?.card === 'traitor' ? '#b91c1c' : '#3b82f6',
                backgroundColor: investigateResult?.card === 'chief' ? 'rgba(234,179,8,0.3)' : investigateResult?.card === 'mastermind' ? 'rgba(239,68,68,0.3)' : investigateResult?.card === 'traitor' ? 'rgba(185,28,28,0.2)' : 'rgba(59,130,246,0.3)'
              }}
            >
              <Text className={`block text-2xl ${investigateResult?.card === 'chief' ? 'text-yellow-400' : investigateResult?.card === 'mastermind' ? 'text-red-400' : investigateResult?.card === 'traitor' ? 'text-red-500' : 'text-blue-400'}`}>
                {investigateResult?.card === 'chief' ? '🔍' : investigateResult?.card === 'mastermind' ? '🎭' : investigateResult?.card === 'traitor' ? '🔴' : '🔵'}
              </Text>
              <Text className={`block text-xs mt-1 ${investigateResult?.card === 'traitor' || investigateResult?.card === 'mastermind' ? 'text-red-400' : 'text-blue-400'}`}>
                {investigateResult?.card === 'chief' ? '探长' : investigateResult?.card === 'mastermind' ? '主谋' : investigateResult?.card === 'traitor' ? '变节' : '忠诚'}
              </Text>
            </View>
            <Text className="block text-xs text-yellow-400 text-center mt-3">仅你可见，关闭后消失</Text>
          </View>
        </View>
      </Modal>

      <Modal visible={actionModal === 'equip_flip'} title="取得装备" onClose={() => setActionModal(null)}>
        <Text className="block text-xs text-gray-400 mb-3">选择要翻开的底细牌</Text>
        {me?.cards.map((card, i) => (
          !card.faceUp ? (
            <Button key={i} className="w-full bg-gray-800 text-gray-200 rounded-xl mb-2 py-3" style={{border: '1px solid #374151'}}
              onClick={() => submitAction('equip', '', { cardIndex: i })}
            >
              <Text>翻开第 {i + 1} 张</Text>
            </Button>
          ) : null
        ))}
        {me?.cards.filter(c => !c.faceUp).length === 0 && (
          <Text className="block text-xs text-gray-500 text-center py-2">所有底细牌已翻开</Text>
        )}
      </Modal>

      <Modal visible={actionModal === 'gun_flip'} title="装备手枪" onClose={() => setActionModal(null)}>
        <Text className="block text-xs text-gray-400 mb-3">选择要翻开的底细牌</Text>
        {me?.cards.map((card, i) => (
          !card.faceUp ? (
            <Button key={i} className="w-full bg-gray-800 text-gray-200 rounded-xl mb-2 py-3" style={{border: '1px solid #374151'}}
              onClick={() => { submitAction('gun', '', { cardIndex: i }); setActionModal('aim_target') }}
            >
              <Text>翻开第 {i + 1} 张并拿枪</Text>
            </Button>
          ) : null
        ))}
      </Modal>

      {/* 选择瞄准目标 */}
      <Modal visible={actionModal === 'aim_target'} title="选择瞄准目标" onClose={() => setActionModal(null)}>
        {enemyPlayers.map(p => (
          <Button key={p.id} className="w-full bg-gray-800 text-gray-200 rounded-xl mb-2 py-3" style={{border: '1px solid #374151'}}
            onClick={() => { submitAction('aim', p.id); setActionModal(null) }}
          >
            <Target size={14} className="mr-2" color="#9ca3af" />
            <Text>{p.name}</Text>
          </Button>
        ))}
      </Modal>

      <Modal visible={actionModal === 'shoot_confirm'} title="确认射击" onClose={() => setActionModal(null)}>
        <View className="rounded-xl p-4 mb-4" style={{backgroundColor: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.3)'}}>
          <Text className="block text-sm text-red-400 text-center">
            确定射击 {selectedTarget ? allPlayers.find(p => p.id === selectedTarget)?.name : me?.aimingAt ? allPlayers.find(p => p.id === me.aimingAt)?.name : '目标'}？
          </Text>
        </View>
        <Button className="w-full bg-red-600 text-white rounded-xl py-3"
          onClick={() => { submitAction('shoot', me?.aimingAt || selectedTarget); setActionModal(null) }}
          disabled={submitting}
        >
          <Crosshair size={16} className="mr-2" color="#ffffff" />
          <Text>确认射击</Text>
        </Button>
        <Button variant="secondary" className="w-full bg-gray-800 text-gray-400 rounded-xl py-3 mt-2" onClick={() => setActionModal(null)}>
          <Text>取消</Text>
        </Button>
      </Modal>

      <Modal visible={actionModal === 'select_target'} title="选择目标玩家" onClose={() => setActionModal(null)}>
        {enemyPlayers.map(p => (
          <Button key={p.id} className="w-full bg-gray-800 text-gray-200 rounded-xl mb-2 py-3" style={{border: '1px solid #374151'}}
            onClick={() => { const eq = selectedAction.replace('equip_', ''); submitAction('use_equipment', p.id, { equipment: eq }); setActionModal(null) }}
          >
            <Text className="block text-sm">{p.name}</Text>
          </Button>
        ))}
        <Button variant="secondary" className="w-full bg-gray-800 text-gray-400 rounded-xl py-2 mt-1" onClick={() => setActionModal(null)}>
          <Text>取消</Text>
        </Button>
      </Modal>

      <Modal visible={actionModal === 'select_card'} title="选择底细牌" onClose={() => setActionModal(null)}>
        {me?.cards.map((card, i) => {
          const equipName = selectedAction.replace('equip_', '')
          return (
            <Button key={i} className="w-full bg-gray-800 text-gray-200 rounded-xl mb-2 py-3" style={{border: '1px solid #374151'}}
              onClick={() => { submitAction('use_equipment', '', { equipment: equipName, cardIndex: i }); setActionModal(null) }}
            >
              <Text>第 {i + 1} 张 {card.faceUp ? '(已翻开)' : '(未翻开)'}</Text>
            </Button>
          )
        })}
      </Modal>

      <Modal visible={!!equipmentResult} title="获得装备" onClose={() => setEquipmentResult(null)}>
        <View className="flex items-center justify-center py-4">
          <Text className="block text-3xl mb-2">{EQUIPMENT_EMOJI[EQUIPMENT_MAP[equipmentResult?.name || ''] || ''] || '📦'}</Text>
          <Text className="block text-white text-lg font-bold mb-1">{equipmentResult?.name}</Text>
          <Text className="block text-xs text-gray-400 text-center">{equipmentResult?.desc}</Text>
        </View>
      </Modal>
    </View>
  )
}

const ActionCard = ({
  icon, title, desc, onClick, disabled, subtitle
}: {
  icon: React.ReactNode; title: string; desc: string
  onClick: () => void; disabled?: boolean; subtitle?: string
}) => (
  <Button
    className={`relative p-4 rounded-xl text-left flex items-start gap-3 ${disabled ? 'opacity-50' : ''}`}
    onClick={onClick}
    disabled={disabled}
    style={{
      backgroundColor: disabled ? 'rgba(17,24,39,0.5)' : '#1a1f2e',
      border: disabled ? '1px solid #1f2937' : '1px solid #374151',
    }}
  >
    <View className="flex-shrink-0 mt-1">{icon}</View>
    <View className="flex-1 min-w-0">
      <Text className="block text-sm text-white font-medium">{title}</Text>
      <Text className="block text-xs text-gray-500 mt-1 leading-relaxed">{desc}</Text>
      {subtitle && <Text className="block text-xs text-yellow-500 mt-1">{subtitle}</Text>}
    </View>
  </Button>
)

const Modal = ({
  visible, title, children, onClose
}: {
  visible: boolean; title: string; children: React.ReactNode; onClose: () => void
}) => {
  if (!visible) return null
  return (
    <View className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}
      style={{backgroundColor: 'rgba(0,0,0,0.6)'}}
    >
      <View className="rounded-2xl w-4/5 max-w-sm p-5" style={{backgroundColor: '#1a1f2e', border: '1px solid #374151'}}
        onClick={e => e.stopPropagation()}
      >
        <View className="flex items-center justify-between mb-4">
          <Text className="block text-base text-white font-bold">{title}</Text>
          <Button variant="secondary" className="w-6 h-6 bg-gray-800 rounded-full flex items-center justify-center"
            onClick={onClose}
          >
            <Text className="text-xs text-gray-400">✕</Text>
          </Button>
        </View>
        {children}
      </View>
    </View>
  )
}

export default GAME_PAGE