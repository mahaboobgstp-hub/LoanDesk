# LoanDesk — Loan Eligibility Screening Platform

React + Vite web app, Supabase backend, private document storage, and Capacitor Android build workflow.

## Included
- Agent login and lead submission
- Admin-only application review and Decision workspace
- Configurable income-share / FOIR scenario calculator
- EMI and eligible principal calculator
- Applicant, co-applicant, income, credit-report metadata, extracted account and DPD structures
- Private credit-report/document storage service
- Supabase SQL schema with RLS and private storage policies
- GitHub Actions workflow that builds the web app and generates a debug Android APK

## Before first use
1. Create a Supabase project.
2. In Supabase SQL Editor, run `supabase/schema.sql` completely.
3. Create the first admin account in Supabase Authentication.
4. Promote that user by running the admin bootstrap SQL shown at the bottom of `supabase/schema.sql` (replace the email).
5. Add the two environment values from `.env.example` to your local `.env` for preview, and to GitHub repository Actions secrets:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` (or legacy anon key)
6. Push the extracted project to GitHub. The `Build Android APK` workflow runs on push and creates a downloadable debug APK as a workflow artifact.

## Agent accounts
Public self-registration is intentionally not provided. Create agent accounts through Supabase Authentication (or a future admin provisioning function). A matching `profiles` row is created automatically with role `agent`. Only an authorized administrator should promote users to `admin`.

## Android build
The GitHub Actions workflow creates the native Android wrapper using Capacitor, builds the web bundle, syncs it, and compiles `app-debug.apk`. No local Android Studio installation is required for this workflow.

## Important implementation boundary
The application includes the data model, secure upload path, PDF text extraction foundation, configurable calculations and admin workflow. Credit bureau PDF formats vary by bureau, report vendor, password protection and scan quality. The included parser is a best-effort text extractor and intentionally flags reports for admin verification; it does not claim bank-grade or guaranteed bureau interpretation. Add and validate bureau-specific parsing rules against real, consented sample reports before using automated outputs for lending decisions.

This is a preliminary decision-support tool, not a lender sanction engine. Policies and thresholds must be reviewed by the DSA/client and lender-specific rules must be maintained separately.

## Security
- Never put a Supabase service-role/secret key in frontend environment variables.
- Keep the Storage bucket private.
- RLS is enabled on application tables.
- Agent access is scoped to their own submitted applications.
- Admin role is stored in `profiles.role`, not user-editable metadata.
- Test RLS using separate agent and admin accounts before uploading real customer data.

## Stack
- React 19 / Vite
- Supabase JS
- PostgreSQL + Supabase Auth + Storage
- Capacitor 8 / Android
