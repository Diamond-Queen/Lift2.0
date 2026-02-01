Release: Terms of Service Update
Date: 2026-02-01

Summary:
- Added Password Reset Policy clarifying token expiry, single-use tokens, and session behavior.
- Added Refund Policy outlining refund eligibility, request process, and chargeback handling.

Files changed:
- important/TERMS_OF_SERVICE.md (added sections: 3.4 Password Reset Policy, 7.6 Refund Policy)
- important/PRIVACY_POLICY.md (added reference section for password reset and refunds)
- important/TERMS_UPDATE_EMAIL.md (email template for notifying users)

Notes for ops:
- Notify users via email using `important/TERMS_UPDATE_EMAIL.md` template.
- Consider invalidating active sessions only if security issue suspected; otherwise current behavior keeps existing sessions valid until expiry.
- Update public changelog and site footer to reflect new Terms effective date if required.
