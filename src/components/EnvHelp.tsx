import { ENV_STATUS } from '@/config';

export default function EnvHelp() {
  if (typeof window !== 'undefined' && import.meta.env.DEV) {
    // Log de diagnostique au runtime (DEV uniquement)
    // eslint-disable-next-line no-console
    console.log('[ENV] vite=', ENV_STATUS.vite);
    // eslint-disable-next-line no-console
    console.log('[ENV] window.__ENV=', ENV_STATUS.win);
  }
  return (
    <div style={{padding: 24}}>
      <h2>Variables d'environnement manquantes</h2>
      <p>L'application n'a pas trouvé VITE_SUPABASE_URL et/ou VITE_SUPABASE_ANON_KEY.</p>
      <ol>
        <li>Ajoutez les variables dans Settings → Environment Variables <strong>ou</strong> créez <code>public/env.js</code> avec vos valeurs.</li>
      </ol>
      <pre>{String.raw`window.__ENV = {
  VITE_SUPABASE_URL: "https://your-project-ref.supabase.co",
  VITE_SUPABASE_ANON_KEY: "your_anon_key_here",
  VITE_STRIPE_PUBLISHABLE_KEY: "pk_live_your_publishable_key_here",
  VITE_STRIPE_BUY_BUTTON_ID: "buy_btn_your_stripe_buy_button_id_here",
  VITE_SITE_URL: "https://your-domain.com"
};`}</pre>
    </div>
  );
}