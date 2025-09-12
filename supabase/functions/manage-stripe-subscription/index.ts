import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from 'https://esm.sh/stripe@14.21.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
});

interface SubscriptionRequest {
  action: 'cancel_at_period_end' | 'reactivate' | 'cancel_immediately';
  subscription_id: string;
  customer_id?: string;
  reason?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    });
  }

  try {
    if (req.method !== 'POST') {
      throw new Error('Only POST method allowed');
    }

    const { action, subscription_id, customer_id, reason }: SubscriptionRequest = await req.json();

    if (!subscription_id) {
      throw new Error('subscription_id is required');
    }

    console.log(`${action} for subscription: ${subscription_id}`);

    let result;

    switch (action) {
      case 'cancel_at_period_end':
        result = await stripe.subscriptions.update(subscription_id, {
          cancel_at_period_end: true,
          metadata: {
            cancellation_reason: reason || 'account_deletion',
            cancelled_by: 'user_account_deletion',
            cancelled_at: new Date().toISOString()
          }
        });

        console.log(`Subscription ${subscription_id} will cancel at period end: ${new Date(result.current_period_end * 1000)}`);
        break;

      case 'reactivate':
        result = await stripe.subscriptions.update(subscription_id, {
          cancel_at_period_end: false,
          metadata: {
            reactivated_reason: reason || 'account_reactivation',
            reactivated_by: 'user_account_reactivation',
            reactivated_at: new Date().toISOString()
          }
        });

        console.log(`Subscription ${subscription_id} reactivated successfully`);
        break;

      case 'cancel_immediately':
        result = await stripe.subscriptions.cancel(subscription_id, {
          prorate: true,
        });

        console.log(`Subscription ${subscription_id} cancelled immediately`);
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify({
      success: true,
      action: action,
      subscription_id: result.id,
      status: result.status,
      cancel_at_period_end: result.cancel_at_period_end,
      current_period_end: result.current_period_end,
      cancelled_at: result.cancelled_at,
      message: `Subscription ${action} completed successfully`
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error) {
    console.error(`Error managing subscription:`, error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
});