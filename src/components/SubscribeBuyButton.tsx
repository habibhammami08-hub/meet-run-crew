import { useEffect } from 'react';

// Declare Stripe Buy Button as a custom element
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

const SubscribeBuyButton = () => {
  useEffect(() => {
    // Load Stripe Buy Button script if not already loaded
    if (!document.querySelector('script[src="https://js.stripe.com/v3/buy-button.js"]')) {
      const script = document.createElement('script');
      script.src = 'https://js.stripe.com/v3/buy-button.js';
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  return (
    <div className="text-center">
      <stripe-buy-button
        buy-button-id="buy_btn_1RvtvYKP4tLYoLjrySSiu2m2"
        publishable-key="pk_live_51L4ftdKP4tLYoLjrVwqm62fAaf0nSId8MHrgaCBvgIrTYybjRMpNTYluRbN57delFbimulCyODAD8G0QaxEaLz5T00Uey2dOSc"
      />
    </div>
  );
};

export default SubscribeBuyButton;