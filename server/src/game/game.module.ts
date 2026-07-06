import { Module } from '@nestjs/common';
import { GameController } from './game.controller';
import { GameRoomService } from './game-room.service';
import { GameLogicService } from './game-logic.service';

@Module({
  controllers: [GameController],
  providers: [GameRoomService, GameLogicService],
  exports: [GameRoomService, GameLogicService],
})
export class GameModule {}