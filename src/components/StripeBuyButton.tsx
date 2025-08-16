import { useEffect } from "react";
import { logger } from "@/utils/logger";
import { CONFIG } from '@/config';
import EnvHelp from './EnvHelp';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'stripe-buy-button': {
        'buy-button-id': string;
        'publishable-key': string;
      };
    }
  }
}

interface StripeBuyButtonProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

// Environment variables for Stripe
const STRIPE_PUBLISHABLE_KEY = CONFIG.STRIPE_PUBLISHABLE_KEY;
const STRIPE_BUY_BUTTON_ID = CONFIG.STRIPE_BUY_BUTTON_ID;

const StripeBuyButton = ({ onSuccess, onCancel }: StripeBuyButtonProps) => {
  // Early return if Stripe config is missing
  if (!STRIPE_PUBLISHABLE_KEY || !STRIPE_BUY_BUTTON_ID) {
    return <EnvHelp />;
  }

  useEffect(() => {
    // Vérifier si le script existe déjà
    const existingScript = document.querySelector('script[src="https://js.stripe.com/v3/buy-button.js"]');
    
    if (!existingScript) {
      // Charger le script Stripe Buy Button
      const script = document.createElement('script');
      script.src = 'https://js.stripe.com/v3/buy-button.js';
      script.async = true;
      script.onload = () => {
        logger.debug("Stripe Buy Button script loaded");
      };
      script.onerror = () => {
        logger.error("Error loading Stripe Buy Button script");
      };
      document.head.appendChild(script);
    }

    // Listen for success/cancel events if callbacks are provided
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== 'https://js.stripe.com') return;
      
      if (event.data?.type === 'stripe_checkout_session_complete') {
        logger.debug("Stripe checkout completed:", event.data);
        onSuccess?.();
      } else if (event.data?.type === 'stripe_checkout_session_cancel') {
        logger.debug("Stripe checkout cancelled:", event.data);
        onCancel?.();
      }
    };

    if (onSuccess || onCancel) {
      window.addEventListener('message', handleMessage);
    }

    return () => {
      // Nettoyer les événements mais pas le script (réutilisable)
      if (onSuccess || onCancel) {
        window.removeEventListener('message', handleMessage);
      }
    };
  }, [onSuccess, onCancel]);

  return (
    <div className="stripe-buy-button-container w-full">
      <stripe-buy-button
        buy-button-id={STRIPE_BUY_BUTTON_ID}
        publishable-key={STRIPE_PUBLISHABLE_KEY}
      />
    </div>
  );
};

export default StripeBuyButton;