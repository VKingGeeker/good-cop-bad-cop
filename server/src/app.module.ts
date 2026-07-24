import { Module } from '@nestjs/common';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { GameModule } from '@/game/game.module';
import { ErrorLogModule } from '@/error-log/error-log.module';
import { AppUpdateController } from '@/app-update.controller';

@Module({
  imports: [GameModule, ErrorLogModule],
  controllers: [AppController, AppUpdateController],
  providers: [AppService],
})
export class AppModule {}
