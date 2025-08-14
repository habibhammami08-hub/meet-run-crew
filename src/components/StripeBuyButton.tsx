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

const StripeBuyButton = () => {
  useEffect(() => {
    // Chargement du script Stripe Buy Button
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/buy-button.js';
    script.async = true;
    document.body.appendChild(script);

    return () => {
      // Nettoyage du script lors du démontage
      const existingScript = document.querySelector('script[src="https://js.stripe.com/v3/buy-button.js"]');
      if (existingScript) {
        document.body.removeChild(existingScript);
      }
    };
  }, []);

  return (
    <stripe-buy-button
      buy-button-id="buy_btn_1RvtvYKP4tLYoLjrySSiu2m2"
      publishable-key="pk_live_51L4ftdKP4tLYoLjrVwqm62fAaf0nSId8MHrgaCBvgIrTYybjRMpNTYluRbN57delFbimulCyODAD8G0QaxEaLz5T00Uey2dOSc"
    />
  );
};

export default StripeBuyButton;