import { Module } from '@nestjs/common';
import { GameController } from './game.controller';
import { GameRoomService } from './game-room.service';
import { GameLogicService } from './game-logic.service';
import { TrtcService } from './trtc.service';

@Module({
  controllers: [GameController],
  providers: [GameRoomService, GameLogicService, TrtcService],
  exports: [GameRoomService, GameLogicService, TrtcService],
})
export class GameModule {}