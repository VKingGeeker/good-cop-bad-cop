import { Controller, Post, Get, Body, Param, Query, Logger, HttpCode } from '@nestjs/common';
import { GameRoomService, GameRoom } from './game-room.service';
import { GameLogicService } from './game-logic.service';

@Controller('game')
export class GameController {
  private readonly logger = new Logger(GameController.name);

  constructor(
    private gameRoomService: GameRoomService,
    private gameLogicService: GameLogicService,
  ) {}

  /** 创建房间 */
  @Post('room/create')
  @HttpCode(200)
  async createRoom(@Body() body: { hostName: string; maxPlayers: number }) {
    console.log(`[API] createRoom: hostName=${body.hostName}, maxPlayers=${body.maxPlayers}`);
    try {
      const result = await this.gameRoomService.createRoom(body.hostName, body.maxPlayers);
      return { code: 0, msg: 'success', data: result };
    } catch (error: any) {
      return { code: -1, msg: error.message || '创建房间失败', data: null };
    }
  }

  /** 加入房间 */
  @Post('room/join')
  @HttpCode(200)
  async joinRoom(@Body() body: { roomCode: string; playerName: string }) {
    console.log(`[API] joinRoom: roomCode=${body.roomCode}, playerName=${body.playerName}`);
    try {
      const result = await this.gameRoomService.joinRoom(body.roomCode, body.playerName);
      return { code: 0, msg: 'success', data: result };
    } catch (error: any) {
      return { code: -1, msg: error.message || '加入房间失败', data: null };
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
        players: room.players.map(p => ({ id: p.id, name: p.name, isHost: p.isHost, joinedAt: p.joinedAt })),
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
      if (room.hostPlayerId !== body.playerId) {
        return { code: -1, msg: '只有房主可以开始游戏', data: null };
      }
      if (room.players.length < 2) {
        return { code: -1, msg: '至少需要2名玩家', data: null };
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
    try {
      // 构建payload
      const payload: any = {};
      if (body.action === 'investigate') {
        payload.targetId = body.target;
        payload.cardIndex = body.cardIndex;
      } else if (body.action === 'equip') {
        payload.flipCardIndex = body.cardIndex;
      } else if (body.action === 'gun') {
        payload.flipCardIndex = body.cardIndex;
        payload.aimTargetId = body.target;
      } else if (body.action === 'shoot') {
        // 从瞄准目标射击
      } else if (body.action === 'aim') {
        payload.targetId = body.target;
      } else if (body.action === 'use_equipment') {
        payload.effect = body.equipment;
        payload.data = { targetId: body.target, cardIndex: body.cardIndex };
      } else if (body.action === 'flip_card') {
        payload.flipCardIndex = body.cardIndex;
      }

      const gameState = await this.gameLogicService.performAction(
        roomCode,
        body.playerId,
        body.action,
        payload,
      );

      // 构造响应
      const response: any = { code: 0, msg: 'success', data: {} };
      if (body.action === 'investigate' && gameState.investigationResult) {
        response.data.result = {
          card: gameState.investigationResult.cardType,
          cardTypeName: gameState.investigationResult.cardTypeName,
          targetName: gameState.investigationResult.targetName,
          cardIndex: gameState.investigationResult.cardIndex,
        };
        // 清除调查结果
        gameState.investigationResult = null;
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

      // 自动结束回合（除了equip使用后需要翻牌的情况）
      if (!['use_equipment', 'endTurn'].includes(body.action) && body.action !== 'aim') {
        // 如果是调查/装备/手枪/射击，自动推进到下一回合
        if (['investigate', 'equip', 'gun', 'shoot', 'flip_card'].includes(body.action)) {
          await this.gameLogicService.performAction(roomCode, body.playerId, 'endTurn', {});
        }
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
        if (gs.winner === 'solo') {
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
}