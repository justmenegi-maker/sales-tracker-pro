# Security Specification & Threat Model for SK Tapri

## 1. Data Invariants
1. **Admin Master Gate**: Only verified system administrators (existing in `/admins/{uid}` or matching runtime bootstrapped admin `justmenegi@gmail.com`) can void reports, change review status, manage branches, or modify admin records.
2. **Branch User Isolation**: Authenticated branch users can read branch listings and file reports only for their own designated branch, or general branch reports if permitted.
3. **Report Immutability**: Once a daily report is filed (`status == "active"`), non-admin users cannot alter its figures (cash, online, lines, total). Only an admin can void a report (`status = "voided"` with a `voidReason`) or review it.
4. **Identity Binding**: Any report created must have `submittedBy == request.auth.uid`.
5. **Debt Ledger State Machine**: Debt entries cannot be voided by regular users after creation. Payments can be appended to `payments` with strict schema validation.
6. **Input Boundaries & ID Hardening**: All IDs and paths must conform to alphanumeric/hyphen/underscore patterns up to 128 characters. Strings must be bounded in length.

## 2. The Dirty Dozen Payloads (Designed to Fail)
1. **Unauthenticated Read on Reports**: Unauthenticated client attempting to list `/reports`. (Expect: PERMISSION_DENIED)
2. **Report Creation with Spoofed UID**: Authenticated user trying to set `submittedBy: "other_user_id"`. (Expect: PERMISSION_DENIED)
3. **Ghost Field Injection in Report**: Creating a report with unapproved shadow property `isAdmin: true`. (Expect: PERMISSION_DENIED)
4. **Regular User Voiding Report**: Non-admin user attempting to update report status to `"voided"`. (Expect: PERMISSION_DENIED)
5. **Regular User Editing Financials**: Non-admin user attempting to change `cashPaise` from 28450 to 100. (Expect: PERMISSION_DENIED)
6. **Unauthorized Admin Elevation**: Normal user creating a document in `/admins/{uid}`. (Expect: PERMISSION_DENIED)
7. **Junk Path ID Poisoning**: Creating a report with a 2048-byte ID containing special characters. (Expect: PERMISSION_DENIED)
8. **Negative Amount Poisoning**: Submitting negative cash paise `cashPaise: -5000`. (Expect: PERMISSION_DENIED)
9. **Tampering with Review Status**: Branch user attempting to approve their own report by setting `reviewStatus: "ok"`. (Expect: PERMISSION_DENIED)
10. **Voiding Debt Record**: Non-admin user attempting to set `voided: true` on debt document. (Expect: PERMISSION_DENIED)
11. **Spoofed Email in Auth**: User without `email_verified == true` attempting admin writes. (Expect: PERMISSION_DENIED)
12. **Branch Record Deletion**: Any client attempting to delete a branch record from `/branches/{branchId}`. (Expect: PERMISSION_DENIED)
