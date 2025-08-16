import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' });
const whSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

serve(async (req) => {
  const sig = req.headers.get('stripe-signature');
  if (!sig) return new Response('No signature', { status: 400 });
  const raw = await req.text();
  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(raw, sig, whSecret); }
  catch (e) { return new Response(`Webhook Error: ${(e as Error).message}`, { status: 400 }); }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const upsertProfile = async (custId: string, status: string | null, end: number | null) => {
    const periodEnd = end ? new Date(end * 1000).toISOString() : null;
    await supabase.from('profiles').update({
      stripe_customer_id: custId,
      sub_status: status,
      sub_current_period_end: periodEnd,
    }).eq('stripe_customer_id', custId);
  };

  switch (event.type) {
    case 'checkout.session.completed': {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.customer && s.subscription) {
        const sub = await stripe.subscriptions.retrieve(String(s.subscription));
        await upsertProfile(String(s.customer), sub.status, sub.current_period_end);
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      await upsertProfile(String(sub.customer), sub.status, sub.current_period_end ?? null);
      break;
    }
  }
  return new Response('ok', { status: 200 });
});