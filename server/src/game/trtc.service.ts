import { Injectable, Logger } from '@nestjs/common';
import * as TLSSigAPIv2 from 'tls-sig-api-v2';

@Injectable()
export class TrtcService {
  private readonly logger = new Logger(TrtcService.name);
  private sdkAppId: number;
  private secretKey: string;
  private api: TLSSigAPIv2.Api | null = null;

  constructor() {
    this.sdkAppId = parseInt(process.env.TRTC_SDK_APP_ID || '0', 10);
    this.secretKey = process.env.TRTC_SECRET_KEY || '';
    if (this.sdkAppId && this.secretKey) {
      try {
        this.api = new TLSSigAPIv2.Api(this.sdkAppId, this.secretKey);
        this.logger.log(`TRTC 已配置，SDKAppID: ${this.sdkAppId}`);
      } catch (e) {
        this.logger.error(`TRTC 初始化失败: ${e.message}`);
      }
    } else {
      this.logger.warn('TRTC 未配置（缺少 SDK_APP_ID 或 SECRET_KEY）');
    }
  }

  isConfigured(): boolean {
    return !!this.api;
  }

  generateUserSig(userId: string, expire: number = 3600): string {
    if (!this.api) {
      throw new Error('TRTC 未配置');
    }
    return this.api.genSig(userId, expire);
  }

  getSdkAppId(): number {
    return this.sdkAppId;
  }
}
