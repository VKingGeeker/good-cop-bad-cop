import { useState, useEffect, useCallback, useRef } from 'react'
import Taro from '@tarojs/taro'
import { Network } from '@/network'
import { isH5 } from '@/lib/platform'

interface TrtcSignResponse {
  sdkAppId: number
  userSig: string
  userId: string
  roomId: number
}

interface UseTrtcOptions {
  roomCode: string
  playerId: string
  /** 是否是当前玩家的行动回合（狼人杀式：仅当前回合玩家可发言） */
  isMyTurn: boolean
  /** 远端音频播放容器的 DOM 元素 ID（TRTC SDK play() 必需参数） */
  containerId?: string
}

export interface UseTrtcResult {
  /** 是否已加入语音房间 */
  joined: boolean
  /** 麦克风是否开启 */
  micOn: boolean
  /** 正在连接中 */
  connecting: boolean
  /** 当前在房间内发言的玩家数量 */
  peerCount: number
  /** 错误信息 */
  error: string | null
  /** 是否在微信小程序环境（小程序不支持 TRTC Web SDK，降级为无语音） */
  isWeapp: boolean
  /** 加入语音房间 */
  joinRoom: () => Promise<void>
  /** 离开语音房间 */
  leaveRoom: () => Promise<void>
  /** 手动切换麦克风（仅当前回合玩家可操作） */
  toggleMic: () => Promise<void>
}

export function useTRTC({ roomCode, playerId, isMyTurn, containerId }: UseTrtcOptions): UseTrtcResult {
  const isWeapp = Taro.getEnv() === Taro.ENV_TYPE.WEAPP

  const [joined, setJoined] = useState(false)
  const [micOn, setMicOn] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [peerCount, setPeerCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // TRTC 实例与本地流引用（避免 re-render）
  const clientRef = useRef<any>(null)
  const localStreamRef = useRef<any>(null)
  // 记录是否手动关闭麦，避免 isMyTurn 变化时强制开麦覆盖用户意图
  const manualMutedRef = useRef(false)

  /** 拉取 UserSig 并初始化 TRTC 客户端 */
  const fetchSign = useCallback(async (): Promise<TrtcSignResponse | null> => {
    try {
      const res = await Network.request({
        url: `/api/game/room/${roomCode}/trtc-sign?playerId=${encodeURIComponent(playerId)}`,
      })
      const result = res?.data as any
      if (result?.code !== 0 || !result?.data) {
        throw new Error(result?.msg || '获取语音签名失败')
      }
      return result.data as TrtcSignResponse
    } catch (e: any) {
      setError(e.message || '获取语音签名失败')
      return null
    }
  }, [roomCode, playerId])

  /** 加入语音房间 */
  const joinRoom = useCallback(async () => {
    if (!isH5()) {
      // 微信小程序环境：TRTC Web SDK 不可用，静默降级
      setError('小程序环境暂不支持实时语音，请使用安卓 App 体验')
      return
    }
    if (joined || connecting) return
    setConnecting(true)
    setError(null)
    try {
      const sign = await fetchSign()
      if (!sign) throw new Error('无法获取语音签名')

      // 动态导入，避免小程序打包时把 WebRTC SDK 打进去
      const { default: TRTC } = await import('trtc-js-sdk')

      const client = TRTC.createClient({
        mode: 'rtc',
        sdkAppId: sign.sdkAppId,
        userId: sign.userId,
        userSig: sign.userSig,
      })
      clientRef.current = client

      // 监听远端流订阅
      client.on('peer-join', () => setPeerCount(c => c + 1))
      client.on('peer-leave', () => setPeerCount(c => Math.max(0, c - 1)))
      client.on('stream-added', async (event: any) => {
        try {
          await client.subscribe(event.stream, { audio: true, video: false })
        } catch (e) {
          // 订阅失败不阻断主流程
        }
      })
      client.on('stream-subscribed', (event: any) => {
        // 显式调用 play() 播放远端音频，否则远端声音无法输出
        // TRTC SDK play() 必须传入 elementId 参数，指向 DOM 容器元素
        try {
          const stream = event?.stream || event
          if (containerId) {
            stream?.play?.(containerId)
          }
        } catch (e) {
          // 播放失败不阻断
        }
      })
      client.on('stream-removed', (event: any) => {
        try {
          const stream = event?.stream || event
          stream?.stop?.()
        } catch (e) {
          // 清理失败不阻断
        }
      })
      client.on('error', (e: any) => {
        setError(e?.message || '语音连接异常')
      })

      // 创建纯音频本地流
      const localStream = TRTC.createStream({
        audio: true,
        video: false,
        userId: sign.userId,
      })
      await localStream.initialize()
      localStreamRef.current = localStream

      // 加入房间
      await client.join({ roomId: sign.roomId })
      // 发布本地音频流
      await client.publish(localStream)

      setJoined(true)
      // 狼人杀式：仅当前回合玩家可开麦，其他人默认静音
      if (isMyTurn && !manualMutedRef.current) {
        await localStream.unmuteAudio()
        setMicOn(true)
      } else {
        await localStream.muteAudio()
        setMicOn(false)
      }
    } catch (e: any) {
      setError(e?.message || '加入语音房间失败')
      // 清理半初始化状态
      try { clientRef.current?.leave?.() } catch {}
      clientRef.current = null
      try { localStreamRef.current?.close?.() } catch {}
      localStreamRef.current = null
    } finally {
      setConnecting(false)
    }
  }, [isH5, joined, connecting, fetchSign, isMyTurn, containerId])

  /** 离开语音房间 */
  const leaveRoom = useCallback(async () => {
    const client = clientRef.current
    const localStream = localStreamRef.current
    try {
      if (localStream && client) {
        try { await client.unpublish(localStream) } catch {}
      }
      try { localStream?.close?.() } catch {}
      if (client) {
        try { await client.leave() } catch {}
        client.removeAllListeners?.()
      }
    } catch {}
    clientRef.current = null
    localStreamRef.current = null
    setJoined(false)
    setMicOn(false)
    setPeerCount(0)
  }, [])

  /** 手动切换麦克风（仅当前回合玩家） */
  const toggleMic = useCallback(async () => {
    const localStream = localStreamRef.current
    if (!localStream || !joined) return
    if (!isMyTurn) {
      setError('只有当前回合玩家可以发言')
      return
    }
    try {
      if (micOn) {
        await localStream.muteAudio()
        setMicOn(false)
        manualMutedRef.current = true
      } else {
        await localStream.unmuteAudio()
        setMicOn(true)
        manualMutedRef.current = false
      }
    } catch (e: any) {
      setError(e?.message || '麦克风切换失败')
    }
  }, [joined, micOn, isMyTurn])

  /** 狼人杀式：回合切换时自动控制麦克风
   *  - 轮到我：自动开麦（除非用户手动关闭过）
   *  - 轮到别人：自动闭麦
   */
  useEffect(() => {
    const localStream = localStreamRef.current
    if (!localStream || !joined) return
    const manageMic = async () => {
      if (isMyTurn) {
        if (!manualMutedRef.current) {
          try { await localStream.unmuteAudio(); setMicOn(true) } catch {}
        }
      } else {
        try { await localStream.muteAudio(); setMicOn(false) } catch {}
        manualMutedRef.current = false
      }
    }
    manageMic()
  }, [isMyTurn, joined])

  /** 卸载时自动离开房间 */
  useEffect(() => {
    return () => {
      const client = clientRef.current
      const localStream = localStreamRef.current
      try { localStream?.close?.() } catch {}
      try { client?.leave?.() } catch {}
      try { client?.removeAllListeners?.() } catch {}
      clientRef.current = null
      localStreamRef.current = null
    }
  }, [])

  return {
    joined,
    micOn,
    connecting,
    peerCount,
    error,
    isWeapp,
    joinRoom,
    leaveRoom,
    toggleMic,
  }
}
