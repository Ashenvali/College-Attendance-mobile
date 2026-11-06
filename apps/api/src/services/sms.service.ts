export interface SmsMessage { phone: string; message: string; senderId?: string; variables?: Record<string, string> }
export interface SmsResult { status: 'SENT' | 'MOCKED' | 'FAILED'; providerId?: string; detail?: string }
export interface SmsProvider { send(input: SmsMessage): Promise<SmsResult> }
export type SmsDeliveryMode = 'mock' | 'gateway';
export type AbsentSmsMode = 'off' | 'manual' | 'auto';

/** Administrator control: ABSENT_SMS_MODE=off|manual|auto (default manual). */
export function absentSmsMode(): AbsentSmsMode {
  const v = (process.env.ABSENT_SMS_MODE || 'manual').toLowerCase();
  return v === 'off' || v === 'auto' ? v : 'manual';
}

type GatewayConfig =
  | { kind: 'http'; url: string; key: string; senderId: string }
  | { kind: 'msg91'; url: string; authKey: string; templateId: string; senderId: string };

function httpsUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    const localHttp = process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !localHttp) return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch { return null; }
}

function gatewayConfig(): GatewayConfig | null {
  const provider = process.env.SMS_PROVIDER;
  const senderId = process.env.SMS_SENDER_ID?.trim();
  if (provider === 'msg91') {
    const authKey = process.env.MSG91_AUTH_KEY?.trim();
    const templateId = process.env.MSG91_TEMPLATE_ID?.trim();
    const url = httpsUrl(process.env.MSG91_API_URL?.trim() || 'https://control.msg91.com/api/v5/flow/');
    if (!authKey || !templateId || !senderId || !url) return null;
    return { kind: 'msg91', url, authKey, templateId, senderId };
  }
  if (provider === 'http') {
    const url = httpsUrl(process.env.SMS_API_URL);
    const key = process.env.SMS_API_KEY?.trim();
    if (!url || !key || !senderId) return null;
    return { kind: 'http', url, key, senderId };
  }
  return null;
}

export function smsDeliveryMode(): SmsDeliveryMode { return gatewayConfig() ? 'gateway' : 'mock'; }

export function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  let digits = value.trim().replace(/[^\d]/g, '');
  if (digits.length === 10) digits = `91${digits}`;
  else if (digits.length === 11 && digits.startsWith('0')) digits = `91${digits.slice(1)}`;
  if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
  return `+${digits}`;
}

export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  return `${value.startsWith('+') ? '+' : ''}${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

/** Official parent absence template. Keep wording in sync with the DLT-registered template. */
export function renderAbsentMessage(v: { studentName: string; rollNumber: string; department: string; date: string }): string {
  const [y, m, d] = v.date.split('-');
  const date = y && m && d ? `${d}-${m}-${y}` : v.date;
  return `Dear Parent/Guardian,\n\nYour child ${v.studentName}, Roll Number ${v.rollNumber}, from ${v.department}, was marked ABSENT on ${date}.\n\nPlease contact Brindavan Institute of Technology & Science for further information.\n\nRegards,\nBITS Kurnool.`;
}

class MockSmsProvider implements SmsProvider {
  async send(input: SmsMessage): Promise<SmsResult> {
    console.info(`[SMS MOCK] to=${maskPhone(input.phone)} chars=${input.message.length}`);
    return { status: 'MOCKED', providerId: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, detail: 'Mock mode only; no message was transmitted.' };
  }
}

class GatewaySmsProvider implements SmsProvider {
  async send(input: SmsMessage): Promise<SmsResult> {
    const config = gatewayConfig();
    if (!config) return { status: 'FAILED', detail: 'SMS gateway is not completely configured.' };
    try {
      const response = config.kind === 'msg91'
        ? await fetch(config.url, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json', authkey: config.authKey },
            // MSG91 Flow API: template variables must match the DLT-registered template (##student_name## etc.).
            body: JSON.stringify({ template_id: config.templateId, short_url: '0', recipients: [{ mobiles: input.phone.replace('+', ''), ...(input.variables ?? {}) }] }),
            signal: AbortSignal.timeout(12_000),
          })
        : await fetch(config.url, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${config.key}` },
            body: JSON.stringify({ to: input.phone, message: input.message, sender: input.senderId || config.senderId }),
            signal: AbortSignal.timeout(12_000),
          });
      const body = await response.json().catch(() => ({})) as { id?: unknown; message?: unknown; type?: unknown };
      if (!response.ok) return { status: 'FAILED', detail: `Gateway returned HTTP ${response.status}` };
      if (config.kind === 'msg91') {
        if (body.type !== 'success') return { status: 'FAILED', detail: 'MSG91 did not accept the request.' };
        return { status: 'SENT', providerId: typeof body.message === 'string' ? body.message.slice(0, 80) : undefined };
      }
      return { status: 'SENT', providerId: typeof body.id === 'string' ? body.id.slice(0, 80) : undefined };
    } catch {
      return { status: 'FAILED', detail: 'SMS gateway request failed.' };
    }
  }
}

export function smsProvider(): SmsProvider {
  return smsDeliveryMode() === 'gateway' ? new GatewaySmsProvider() : new MockSmsProvider();
}
