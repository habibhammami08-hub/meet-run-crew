-- Add subscription columns to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sub_status TEXT DEFAULT 'inactive';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sub_current_period_end TIMESTAMPTZ;

-- Create index for better performance on subscription queries
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_status ON public.profiles(sub_status, sub_current_period_end);

-- Create subscribers table for subscription management
CREATE TABLE IF NOT EXISTS public.subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  stripe_customer_id TEXT,
  subscribed BOOLEAN NOT NULL DEFAULT false,
  subscription_tier TEXT DEFAULT 'premium',
  subscription_end TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security on subscribers
ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;

-- Create policy for users to view their own subscription info
CREATE POLICY "select_own_subscription" ON public.subscribers
FOR SELECT
USING (user_id = auth.uid() OR email = auth.email());

-- Create policy for edge functions to update subscription info
CREATE POLICY "update_own_subscription" ON public.subscribers
FOR UPDATE
USING (true);

-- Create policy for edge functions to insert subscription info
CREATE POLICY "insert_subscription" ON public.subscribers
FOR INSERT
WITH CHECK (true);

-- Create a function to check if user has active subscription
CREATE OR REPLACE FUNCTION public.has_active_subscription(user_profile public.profiles)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN user_profile.sub_status IN ('active', 'trialing') AND 
         (user_profile.sub_current_period_end IS NULL OR user_profile.sub_current_period_end > now());
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update existing profiles to have subscription data
UPDATE public.profiles 
SET sub_status = 'inactive'
WHERE sub_status IS NULL;