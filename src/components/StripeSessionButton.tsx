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

interface StripeSessionButtonProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

// Environment variables for Stripe - session payment
const STRIPE_PUBLISHABLE_KEY = "pk_live_51L4ftdKP4tLYoLjrVwqm62fAaf0nSId8MHrgaCBvgIrTYybjRMpNTYluRbN57delFbimulCyODAD8G0QaxEaLz5T00Uey2dOSc";
const STRIPE_SESSION_BUY_BUTTON_ID = "buy_btn_1S5VHCKP4tLYoLjrVUCBUZ7A";

const StripeSessionButton = ({ onSuccess, onCancel }: StripeSessionButtonProps) => {
  // Early return if Stripe config is missing
  if (!STRIPE_PUBLISHABLE_KEY || !STRIPE_SESSION_BUY_BUTTON_ID) {
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
        logger.debug("Stripe session checkout completed:", event.data);
        onSuccess?.();
      } else if (event.data?.type === 'stripe_checkout_session_cancel') {
        logger.debug("Stripe session checkout cancelled:", event.data);
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
    <div className="stripe-session-button-container w-full">
      <stripe-buy-button
        buy-button-id={STRIPE_SESSION_BUY_BUTTON_ID}
        publishable-key={STRIPE_PUBLISHABLE_KEY}
      />
    </div>
  );
};

export default StripeSessionButton;