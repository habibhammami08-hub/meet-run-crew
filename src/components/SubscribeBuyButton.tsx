import { useEffect } from "react";

interface SubscribeBuyButtonProps {
  className?: string;
}

const SubscribeBuyButton = ({ className = "" }: SubscribeBuyButtonProps) => {
  useEffect(() => {
    // Load Stripe Buy Button script if not already loaded
    if (!document.getElementById('stripe-buy-button-script')) {
      const script = document.createElement('script');
      script.id = 'stripe-buy-button-script';
      script.src = 'https://js.stripe.com/v3/buy-button.js';
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  return (
    <div className={className}>
      <stripe-buy-button
        buy-button-id="buy_btn_1RvtvYKP4tLYoLjrySSiu2m2"
        publishable-key="pk_live_51L4ftdKP4tLYoLjrVwqm62fAaf0nSId8MHrgaCBvgIrTYybjRMpNTYluRbN57delFbimulCyODAD8G0QaxEaLz5T00Uey2dOSc"
      />
    </div>
  );
};

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

export default SubscribeBuyButton;