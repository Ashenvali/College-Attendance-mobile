export interface SmsMessage { phone: string; message: string; senderId?: string }
export interface SmsResult { status: 'SENT' | 'MOCKED' | 'FAILED'; providerId?: string; detail?: string }
export interface SmsProvider { send(input: SmsMessage): Promise<SmsResult> }

class MockSmsProvider implements SmsProvider {
  async send(input: SmsMessage): Promise<SmsResult> {
    console.info(`[SMS MOCK] to=${input.phone} chars=${input.message.length}`);
    return { status: 'MOCKED', providerId: `mock-${Date.now()}`, detail: 'No SMS gateway configured; no message was transmitted.' };
  }
}
class HttpSmsProvider implements SmsProvider {
  async send(input: SmsMessage): Promise<SmsResult> {
    const url = process.env.SMS_API_URL, key = process.env.SMS_API_KEY;
    if (!url || !key) return new MockSmsProvider().send(input);
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ to: input.phone, message: input.message, sender: input.senderId || process.env.SMS_SENDER_ID }) });
    if (!response.ok) return { status: 'FAILED', detail: `Gateway returned HTTP ${response.status}` };
    const data = await response.json() as { id?: string };
    return { status: 'SENT', providerId: data.id };
  }
}
export function smsProvider(): SmsProvider { return process.env.SMS_PROVIDER === 'http' ? new HttpSmsProvider() : new MockSmsProvider(); }
