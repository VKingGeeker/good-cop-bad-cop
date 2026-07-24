import { Controller, Post, Get, Body, Param, Query, Logger, HttpCode } from '@nestjs/common';
import { GameRoomService, GameRoom } from './game-room.service';
import { GameLogicService } from './game-logic.service';
import { TrtcService } from './trtc.service';

@Controller('game')
export class GameController {
  private readonly logger = new Logger(GameController.name);

  constructor(
    private gameRoomService: GameRoomService,
    private gameLogicService: GameLogicService,
    private trtcService: TrtcService,
  ) {}

  /** 创建房间 */
  @Post('room/create')
  @HttpCode(200)
  async createRoom(@Body() body: { hostName: string; maxPlayers: number; password?: string; playerId?: string }) {
    console.log(`[API] createRoom: hostName=${body.hostName}, maxPlayers=${body.maxPlayers}, hasPassword=${!!body.password}`);
    // BUG-4: 校验最大玩家数 3~8
    if (!body.maxPlayers || body.maxPlayers < 3 || body.maxPlayers > 8) {
      return { code: -1, msg: '玩家数必须在3~8之间', data: null };
    }
    if (!body.hostName || !body.hostName.trim()) {
      return { code: -1, msg: '房主昵称不能为空', data: null };
    }
    try {
      const result = await this.gameRoomService.createRoom(body.hostName, body.maxPlayers, body.password, body.playerId);
      return { code: 0, msg: 'success', data: result };
    } catch (error: any) {
      return { code: -1, msg: error.message || '创建房间失败', data: null };
    }
  }

  /** 加入房间 */
  @Post('room/join')
  @HttpCode(200)
  async joinRoom(@Body() body: { roomCode: string; playerName: string; password?: string; playerId?: string }) {
    console.log(`[API] joinRoom: roomCode=${body.roomCode}, playerName=${body.playerName}`);
    // BUG-12: 校验玩家昵称非空
    if (!body.playerName || !body.playerName.trim()) {
      return { code: -1, msg: '玩家昵称不能为空', data: null };
    }
    try {
      const result = await this.gameRoomService.joinRoom(body.roomCode, body.playerName, body.password, body.playerId);
      return { code: 0, msg: 'success', data: result };
    } catch (error: any) {
      return { code: -1, msg: error.message || '加入房间失败', data: null };
    }
  }

  /** 获取房间列表 */
  @Get('rooms')
  async getRoomList() {
    try {
      const rooms = await this.gameRoomService.getRoomList();
      return { code: 0, msg: 'success', data: rooms };
    } catch (error: any) {
      return { code: -1, msg: error.message || '获取房间列表失败', data: null };
    }
  }

  /** 离开房间 */
  @Post('room/:roomCode/leave')
  @HttpCode(200)
  async leaveRoom(@Param('roomCode') roomCode: string, @Body() body: { playerId: string }) {
    console.log(`[API] leaveRoom: roomCode=${roomCode}, playerId=${body.playerId}`);
    try {
      await this.gameRoomService.leaveRoom(roomCode, body.playerId);
      return { code: 0, msg: 'success', data: null };
    } catch (error: any) {
      return { code: -1, msg: error.message || '离开房间失败', data: null };
    }
  }

  /** 踢出玩家（仅房主） */
  @Post('room/:roomCode/kick')
  @HttpCode(200)
  async kickPlayer(
    @Param('roomCode') roomCode: string,
    @Body() body: { hostPlayerId: string; targetPlayerId: string },
  ) {
    console.log(`[API] kickPlayer: roomCode=${roomCode}, target=${body.targetPlayerId}`);
    try {
      const room = await this.gameRoomService.kickPlayer(roomCode, body.hostPlayerId, body.targetPlayerId);
      return { code: 0, msg: 'success', data: room };
    } catch (error: any) {
      return { code: -1, msg: error.message || '踢出玩家失败', data: null };
    }
  }

  /** 获取房间状态 */
  @Get('room/:roomCode')
  async getRoom(@Param('roomCode') roomCode: string) {
    console.log(`[API] getRoom: roomCode=${roomCode}`);
    try {
      const room = await this.gameRoomService.getRoom(roomCode);
      // 对玩家列表过滤掉隐私信息
      return { code: 0, msg: 'success', data: {
        roomCode: room.roomCode,
        status: room.status,
        hostPlayerId: room.hostPlayerId,
        maxPlayers: room.maxPlayers,
        players: room.players.map(p => ({ id: p.id, name: p.name, isHost: p.isHost, isBot: p.isBot, joinedAt: p.joinedAt })),
        gameState: room.gameState,
      }};
    } catch (error: any) {
      return { code: -1, msg: error.message || '查询房间失败', data: null };
    }
  }

  /** 开始游戏（房主操作） */
  @Post('room/:roomCode/start')
  @HttpCode(200)
  async startGame(@Param('roomCode') roomCode: string, @Body() body: { playerId: string }): Promise<any> {
    console.log(`[API] startGame: roomCode=${roomCode}, playerId=${body.playerId}`);
    try {
      const room = await this.gameRoomService.getRoom(roomCode);
      // BUG-3: 防止重复开始游戏
      if (room.status === 'playing') {
        return { code: -1, msg: '游戏已开始', data: null };
      }
      if (room.hostPlayerId !== body.playerId) {
        return { code: -1, msg: '只有房主可以开始游戏', data: null };
      }
      if (room.players.length < 3) {
        return { code: -1, msg: '至少需要3名玩家', data: null };
      }
      const gameState = await this.gameLogicService.startGame(roomCode);
      return { code: 0, msg: 'success', data: { gameState } };
    } catch (error: any) {
      return { code: -1, msg: error.message || '开始游戏失败', data: null };
    }
  }

  /** 单人测试模式：填充机器人并开始游戏 */
  @Post('room/:roomCode/solo-start')
  @HttpCode(200)
  async soloStartGame(@Param('roomCode') roomCode: string, @Body() body: { playerId: string }): Promise<any> {
    console.log(`[API] soloStartGame: roomCode=${roomCode}, playerId=${body.playerId}`);
    try {
      const room = await this.gameRoomService.getRoom(roomCode);
      // BUG-3: 防止重复开始游戏
      if (room.status === 'playing') {
        return { code: -1, msg: '游戏已开始', data: null };
      }
      await this.gameRoomService.startSoloGame(roomCode, body.playerId);
      const gameState = await this.gameLogicService.startGame(roomCode);
      return { code: 0, msg: 'success', data: { gameState } };
    } catch (error: any) {
      return { code: -1, msg: error.message || '开始单人测试失败', data: null };
    }
  }

  /** 获取游戏状态（含隐私过滤）- Query param 方式 */
  @Get('room/:roomCode/state')
  async getGameState(
    @Param('roomCode') roomCode: string,
    @Query('playerId') playerId: string,
  ) {
    console.log(`[API] getGameState: roomCode=${roomCode}, playerId=${playerId}`);
    try {
      const room = await this.gameRoomService.getRoom(roomCode);
      if (!room.gameState) {
        return { code: -1, msg: '游戏未开始', data: null };
      }
      if (room.gameState.phase === 'result' || room.gameState.winner) {
        // 游戏结束
        return { code: 0, msg: 'success', data: {
          status: 'ended',
          winner: room.gameState.winner,
          players: room.gameState.players.map((p: any) => ({
            id: p.id,
            name: p.name,
            alive: !p.eliminated,
            eliminated: p.eliminated,
            wounded: p.wounded,
            cards: p.cards.map((c: any) => ({ identity: c.type, faceUp: true })),
            equipment: p.equipment?.name || null,
            hasGun: p.hasGun,
            faction: room.gameState.winner === 'solo' ? 'solo' : this.gameLogicService.determineAlignment(p.cards),
          })),
          gameLog: room.gameState.gameLog,
        }};
      }
      const visibleState = this.gameLogicService.getVisibleGameState(room.gameState, playerId);
      return { code: 0, msg: 'success', data: {
        status: 'playing',
        ...visibleState,
      }};
    } catch (error: any) {
      return { code: -1, msg: error.message || '获取游戏状态失败', data: null };
    }
  }

  /** 执行游戏行动 */
  @Post('room/:roomCode/action')
  @HttpCode(200)
  async performAction(
    @Param('roomCode') roomCode: string,
    @Body() body: { playerId: string; action: string; target?: string; cardIndex?: number; equipment?: string; [key: string]: any },
  ) {
    console.log(`[API] performAction: roomCode=${roomCode}, playerId=${body.playerId}, action=${body.action}`);
    // BUG-5: 统一 use_equipment → useEquipment
    if (body.action === 'use_equipment') body.action = 'useEquipment';
    try {
      // 构建payload
      const payload: any = body.payload || {};
      if (body.action === 'investigate') {
        payload.targetId = body.target;
        if (payload.cardIndex === undefined) payload.cardIndex = body.cardIndex;
      } else if (body.action === 'equip') {
        if (payload.flipCardIndex === undefined) payload.flipCardIndex = body.cardIndex;
      } else if (body.action === 'gun') {
        payload.aimTargetId = body.target;
        if (payload.flipCardIndex === undefined) payload.flipCardIndex = body.cardIndex;
      } else if (body.action === 'shoot') {
        // 从瞄准目标射击
      } else if (body.action === 'aim') {
        payload.targetId = body.target;
      } else if (body.action === 'useEquipment') {
        payload.effect = body.payload?.equipment || body.equipment;
        payload.data = { targetId: body.target, cardIndex: payload.cardIndex ?? body.cardIndex };
      } else if (body.action === 'flip_card') {
        if (payload.flipCardIndex === undefined) payload.flipCardIndex = body.cardIndex;
      }

      const gameState = await this.gameLogicService.performAction(
        roomCode,
        body.playerId,
        body.action,
        payload,
      );

      // 构造响应
      const response: any = { code: 0, msg: 'success', data: {} };
      // 从按玩家隔离的 investigationResults 中读取当前玩家的调查结果
      const invResult = gameState.investigationResults?.[body.playerId];
      if (body.action === 'investigate' && invResult) {
        response.data.result = {
          card: invResult.cardType,
          cardTypeName: invResult.cardTypeName,
          targetName: invResult.targetName,
          cardIndex: invResult.cardIndex,
        };
      }
      if (body.action === 'equip') {
        const currentPlayer = gameState.players[gameState.currentPlayerIndex];
        response.data.equipment = { name: currentPlayer.equipment?.name, desc: currentPlayer.equipment?.description };
      }
      if (body.action === 'shoot') {
        // 检查是否有人被淘汰
        const eliminated = gameState.players.filter(p => p.eliminated);
        response.data.notification = {
          title: '💥 射击！',
          msg: `发生了射击事件！${eliminated.length > 0 ? `${eliminated.map((p: any) => p.name).join(', ')} 被淘汰！` : ''}`,
        };
      }

      return response;
    } catch (error: any) {
      return { code: -1, msg: error.message || '执行行动失败', data: null };
    }
  }

  /** 获取游戏结果 */
  @Get('room/:roomCode/result')
  async getResult(@Param('roomCode') roomCode: string) {
    console.log(`[API] getResult: roomCode=${roomCode}`);
    try {
      const room = await this.gameRoomService.getRoom(roomCode);
      if (!room.gameState) {
        return { code: -1, msg: '游戏未开始', data: null };
      }
      const gs = room.gameState;
      const players = gs.players.map((p: any) => {
        const alignment = gs.winner === 'solo'
          ? (p.cards.some((c: any) => c.type === 'chief' && c.type === 'mastermind') ? 'solo' : '')
          : (p.cards.some((c: any) => c.type === 'chief') ? 'loyal' : 'traitor');
        return {
          id: p.id,
          name: p.name,
          alive: !p.eliminated,
          eliminated: p.eliminated,
          wounded: p.wounded,
          cards: p.cards.map((c: any) => ({ identity: c.type, faceUp: true })),
          equipment: p.equipment?.name || null,
          hasGun: p.hasGun,
          faction: this.gameLogicService.determineAlignment(p.cards),
          isWinner: false, // 前端计算
        };
      });
      // 计算获胜者
      for (const p of players) {
        if (!gs.winner) {
          // BUG-8: 游戏未结束时不应计算胜负
          p.isWinner = false;
        } else if (gs.winner === 'solo') {
          p.isWinner = p.cards.some((c: any) => c.identity === 'chief') && p.cards.some((c: any) => c.identity === 'mastermind');
        } else if (gs.winner === 'loyal') {
          p.isWinner = p.faction === 'loyal';
        } else {
          p.isWinner = p.faction === 'traitor';
        }
      }
      return { code: 0, msg: 'success', data: { winner: gs.winner, winnerFaction: gs.winner, players, roomCode } };
    } catch (error: any) {
      return { code: -1, msg: error.message || '获取结果失败', data: null };
    }
  }

  /** 获取 TRTC 语音通话签名 */
  @Get('room/:roomCode/trtc-sign')
  async getTrtcSign(
    @Param('roomCode') roomCode: string,
    @Query('playerId') playerId: string,
  ) {
    try {
      if (!this.trtcService.isConfigured()) {
        return { code: -1, msg: 'TRTC 未配置，请在服务端设置 SDKAppID 和 SecretKey', data: null };
      }
      // 房间号转为数字（TRTC roomId 必须是整数）
      const roomId = parseInt(roomCode, 10) || Math.abs(hashCode(roomCode));
      const userSig = this.trtcService.generateUserSig(playerId, 3600);
      return {
        code: 0,
        msg: 'success',
        data: {
          sdkAppId: this.trtcService.getSdkAppId(),
          userSig,
          userId: playerId,
          roomId,
        },
      };
    } catch (error: any) {
      return { code: -1, msg: error.message || '获取语音签名失败', data: null };
    }
  }
}

/** 字符串转数字哈希（用于将非数字 roomCode 转为 TRTC roomId） */
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}