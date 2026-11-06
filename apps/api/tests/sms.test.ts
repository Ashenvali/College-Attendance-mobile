import test from 'node:test';
import assert from 'node:assert/strict';
import { absentSmsMode, maskPhone, normalizePhone, renderAbsentMessage, smsDeliveryMode, smsProvider } from '../src/services/sms.service';

test('normalizePhone accepts Indian formats and rejects junk', () => {
  assert.equal(normalizePhone('98765 43210'), '+919876543210');
  assert.equal(normalizePhone('09876543210'), '+919876543210');
  assert.equal(normalizePhone('+91-9876543210'), '+919876543210');
  assert.equal(normalizePhone('12345'), null);
  assert.equal(normalizePhone(''), null);
  assert.equal(normalizePhone(null), null);
});
test('maskPhone hides all but last 4 digits', () => {
  assert.equal(maskPhone('+919876543210'), '+********3210');
  assert.ok(!maskPhone('+919876543210').includes('98765'));
});
test('absence template contains required fields and the official wording', () => {
  const m = renderAbsentMessage({ studentName: 'Asha K', rollNumber: '23CS0A0501', department: 'Computer Science & Engineering', date: '2026-11-06' });
  for (const part of ['Dear Parent/Guardian,', 'Asha K', '23CS0A0501', 'Computer Science & Engineering', '06-11-2026', 'was marked ABSENT', 'BITS Kurnool.']) assert.ok(m.includes(part), part);
});
test('without gateway configuration SMS stays in mock mode and never transmits', async () => {
  for (const k of ['SMS_PROVIDER', 'SMS_API_URL', 'SMS_API_KEY', 'SMS_SENDER_ID', 'MSG91_AUTH_KEY', 'MSG91_TEMPLATE_ID']) delete process.env[k];
  assert.equal(smsDeliveryMode(), 'mock');
  const r = await smsProvider().send({ phone: '+919876543210', message: 'x' });
  assert.equal(r.status, 'MOCKED');
});
test('incomplete msg91 config fails closed to mock', () => {
  process.env.SMS_PROVIDER = 'msg91'; process.env.MSG91_AUTH_KEY = 'k';
  assert.equal(smsDeliveryMode(), 'mock');
  delete process.env.SMS_PROVIDER; delete process.env.MSG91_AUTH_KEY;
});
test('absent SMS administrator mode defaults to manual', () => {
  delete process.env.ABSENT_SMS_MODE; assert.equal(absentSmsMode(), 'manual');
  process.env.ABSENT_SMS_MODE = 'AUTO'; assert.equal(absentSmsMode(), 'auto');
  process.env.ABSENT_SMS_MODE = 'off'; assert.equal(absentSmsMode(), 'off');
  process.env.ABSENT_SMS_MODE = 'bogus'; assert.equal(absentSmsMode(), 'manual');
  delete process.env.ABSENT_SMS_MODE;
});
