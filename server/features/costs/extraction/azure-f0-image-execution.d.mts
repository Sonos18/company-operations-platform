export type AzureF0ImageDecoder = (bytes: Uint8Array, mimeType: string) => Promise<boolean>
/** workerFile is a trusted server construction/test port, never request input. */
export declare function createAzureF0ImageDecoder(workerFile?: string): AzureF0ImageDecoder
export declare const decodeAzureF0Image: AzureF0ImageDecoder
