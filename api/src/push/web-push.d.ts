// web-push n'embarque pas ses types : seulement ce que PushService emploie.
declare module 'web-push' {
  export interface PushSubscription { endpoint: string; keys: { p256dh: string; auth: string } }
  export interface VapidDetails { subject: string; publicKey: string; privateKey: string }
  export function generateVAPIDKeys(): { publicKey: string; privateKey: string };
  export function sendNotification(
    subscription: PushSubscription,
    payload: string,
    options: { vapidDetails: VapidDetails; TTL?: number; timeout?: number },
  ): Promise<{ statusCode: number }>;
  export class WebPushError extends Error { statusCode: number }
}
