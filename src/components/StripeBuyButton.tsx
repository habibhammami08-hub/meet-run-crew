import { useEffect } from "react";

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

const StripeBuyButton = ({ onSuccess, onCancel }: StripeBuyButtonProps) => {
  useEffect(() => {
    // Vérifier si le script existe déjà
    const existingScript = document.querySelector('script[src="https://js.stripe.com/v3/buy-button.js"]');
    
    if (!existingScript) {
      // Charger le script Stripe Buy Button
      const script = document.createElement('script');
      script.src = 'https://js.stripe.com/v3/buy-button.js';
      script.async = true;
      script.onload = () => {
        console.log("[stripe] Buy Button script chargé");
      };
      script.onerror = () => {
        console.error("[stripe] Erreur chargement Buy Button script");
      };
      document.body.appendChild(script);
    }

    // Écouter les événements de succès/annulation si des callbacks sont fournis
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== 'https://js.stripe.com') return;
      
      if (event.data?.type === 'stripe_checkout_session_complete') {
        console.log("[stripe] Checkout complété:", event.data);
        onSuccess?.();
      } else if (event.data?.type === 'stripe_checkout_session_cancel') {
        console.log("[stripe] Checkout annulé:", event.data);
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
        buy-button-id="buy_btn_1RvtvYKP4tLYoLjrySSiu2m2"
        publishable-key="pk_live_51L4ftdKP4tLYoLjrVwqm62fAaf0nSId8MHrgaCBvgIrTYybjRMpNTYluRbN57delFbimulCyODAD8G0QaxEaLz5T00Uey2dOSc"
      />
    </div>
  );
};

export default StripeBuyButton;