declare module 'tls-sig-api-v2' {
  export class Api {
    constructor(sdkappid: number, key: string)
    genSig(identifier: string, expire?: number): string
    genSigV4(options: any): string
  }
  export function genSig(sdkappid: number, key: string, identifier: string, expire?: number): string
}
