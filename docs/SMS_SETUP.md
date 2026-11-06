# Parent SMS: setup and operation

## Workflow (implemented)
1. Faculty saves attendance (`POST /api/attendance`). The response includes `sessionId`, `absentSmsMode`.
2. Manual mode (default): in the app, **Preview SMS** (`GET /api/sms/absent/:sessionId/preview`) shows eligibility, the exact message and **masked** numbers; **Send to All Absent Students** → **Confirm & Send** (`POST .../send`); **Check Delivery Status** (`GET .../status`); **Retry Failed SMS** (`POST .../retry`).
3. Auto mode (`ABSENT_SMS_MODE=auto`): the same sending logic runs right after the attendance transaction commits. A failure here never rolls back attendance.
4. `off` disables all absent-student SMS (kill switch).
5. Admin / Principal / HOD: **Communication → SMS Dashboard** (`GET /api/sms/dashboard`) with totals, today, filters (department, date, status), masked numbers, message text and timestamps.

## Safety rules enforced on the server
- Authorization per session: Faculty only for classes assigned to them; HOD only own department; Admin any.
- Duplicate prevention: one campaign per attendance session (unique index) and one row per student (unique index); sending atomically claims rows (PENDING→SENDING) so concurrent requests cannot double-send. Re-saving attendance and pressing send again only messages newly absent students.
- Live mode sends only to non-demo students with a valid number **and** `parent_sms_consent = true` (Admin-recorded). Mock mode is the default; incomplete provider config fails closed to mock.
- Parent numbers are read server-side, stored masked in `sms_recipients`, and never returned to clients.

## MSG91 (SMS_PROVIDER=msg91) - NOT YET TESTED against the live service
India requires a DLT-registered sender ID and template. Register the template text from `renderAbsentMessage()` (apps/api/src/services/sms.service.ts) with variables `student_name`, `roll_number`, `department`, `date`, then set `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`, `SMS_SENDER_ID`. The adapter calls the MSG91 Flow API; confirm request/response field names against your MSG91 account before going live. Delivery reports: point the MSG91 DLR callback to `POST /api/sms-webhook/msg91?secret=<SMS_WEBHOOK_SECRET>` and verify the payload mapping in `sms-webhook.routes.ts`. Until then, status "SENT" means "accepted by the provider", not "delivered".

## Test plan before enabling live SMS
Mock mode end-to-end -> a single staff test number with consent recorded -> one real class. Do not enable `auto` until the manual flow has been verified.
