# Implementation notes and next validation

## Included functional path
1. Authenticated agent signs in.
2. Agent submits applicant, loan, income, co-applicant and credit report metadata.
3. Credit report PDF is uploaded to a private Storage bucket.
4. Admin lists all applications and opens a consolidated review.
5. Admin can adjust eligible income percentage, interest rate and tenure.
6. Calculator shows available EMI, requested EMI and indicative maximum loan.
7. Admin saves scenarios, requests documents, approves for processing, rejects or holds.

## Deliberate next enhancements
- Complete co-applicant income and co-applicant credit-report capture.
- Add a document upload response flow for requested documents.
- Build a robust bureau-specific parser for CIBIL, Experian, Equifax and CRIF reports, including password-protected and scanned PDFs.
- Add bank/NBFC-specific policy templates, policy versioning UI and policy effective dates.
- Add a proper agent management screen and admin invitation/provisioning workflow.
- Add notifications (email/WhatsApp/SMS) after the communication provider is selected.
- Add audit event triggers for all sensitive status changes.
- Add application search, filters, exports and pagination.
- Add consent evidence fields (consent text version, timestamp and source) after legal review.

## Critical security note
This starter is designed to keep eligibility assessments and admin decisions inaccessible to agents through RLS. Run the SQL in a test Supabase project first. Verify with:
- Agent A cannot select Agent B's applications or child records.
- Agent cannot select eligibility_assessments or admin_decisions.
- Agent cannot access another agent's Storage files.
- Admin can view all files and internal assessments.
- A normal authenticated user cannot promote their own profile role.

Never use real PAN/credit report data until these tests and applicable privacy/legal requirements have been reviewed.
