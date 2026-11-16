# Paystack subscriptions

The Paystack flow keeps the secret key and all payment verification in
Supabase Edge Functions. Do not put a Paystack secret key in Vite variables,
the browser, or source control.

## Before enabling paid plans

1. Reconcile the hosted schema and Supabase migration history. This repository
   has known schema/history drift; do not run `supabase db push` blindly. Review
   the new subscription migration and apply it only after that reconciliation.
2. Decide the Plus/Pro prices and currency. Configure each desired monthly and
   yearly row in `subscription_plans` with an amount in the currency's minor
   units, then set `is_active = true`. The migration deliberately leaves paid
   plans inactive at zero until pricing is chosen.
3. Add `PAYSTACK_SECRET_KEY` and `PAYSTACK_CALLBACK_URL` as Supabase Edge
   Function secrets. The callback URL must be HTTPS in production and point to
   `/app/subscription`. Never send the secret key to Vercel or the frontend.
4. Configure the Paystack webhook URL as
   `https://<project-ref>.supabase.co/functions/v1/paystack-webhook` and enable
   the `charge.success` event. The function verifies the HMAC signature and
   independently verifies each transaction with Paystack before granting
   access.
5. Deploy the migration and Edge Functions only after reviewing their
   environment and schema requirements. Test with Paystack test credentials
   and a test callback before switching to live credentials.

Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. The code expects the following
additional server-side values in production:

- `PAYSTACK_SECRET_KEY` — Paystack test or live secret, stored only in Supabase
  Function secrets.
- `PAYSTACK_CALLBACK_URL` — the HTTPS CampusConnect subscription page.

This implementation processes one-time transactions with monthly or annual
access periods. It does **not** create Paystack recurring plans or automatically
charge renewals. Customers must renew manually. Confirm supported currencies,
account settlement, test/live keys, webhook configuration, and any recurring
product setup with Paystack before enabling real payments.

The server reads the tier, amount, currency, and interval from the database.
Client-supplied prices are ignored. Payment event records are append-only;
payment and subscription state is not directly readable or writable by client
roles. The `my_subscription` RPC returns only the caller's effective plan.
The admin dashboard's subscription metrics are protected by
`analytics.view` and aggregate amounts separately by currency.

After applying the reviewed migration, plan rows can be configured by a
`settings.manage` administrator through a reviewed SQL change, for example:

```sql
update public.subscription_plans
set amount_minor = <amount_in_minor_units>,
    currency = 'NGN',
    is_active = true,
    updated_at = now()
where code = 'plus'
  and billing_interval = 'month';
```

Replace the placeholder with the price selected by the business; do not enable
a plan until its currency and amount have been confirmed with Paystack.
