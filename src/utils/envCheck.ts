// Environment variables checker for debugging
export const checkEnvironmentVariables = () => {
  console.log('🚀 Environment Variables Check');
  console.log('================================');
  
  // Check build mode
  console.log('📦 Build Info:');
  console.log(`- Mode: ${import.meta.env.MODE}`);
  console.log(`- Development: ${import.meta.env.DEV}`);
  console.log(`- Production: ${import.meta.env.PROD}`);
  
  // List all VITE_ prefixed variables
  const viteVars = Object.keys(import.meta.env).filter(key => key.startsWith('VITE_'));
  console.log(`\n🔧 Available VITE_ variables (${viteVars.length}):`);
  viteVars.forEach(key => {
    const value = import.meta.env[key];
    const maskedValue = key.includes('KEY') || key.includes('SECRET') ? 
      value ? `${value.substring(0, 10)}...` : 'undefined' : 
      value || 'undefined';
    console.log(`- ${key}: ${maskedValue}`);
  });
  
  // Check required variables
  const requiredVars = {
    'VITE_SUPABASE_URL': import.meta.env.VITE_SUPABASE_URL,
    'VITE_SUPABASE_ANON_KEY': import.meta.env.VITE_SUPABASE_ANON_KEY,
    'VITE_STRIPE_PUBLIC_KEY': import.meta.env.VITE_STRIPE_PUBLIC_KEY,
    'VITE_SITE_URL': import.meta.env.VITE_SITE_URL
  };
  
  console.log('\n✅ Required Variables Status:');
  let allPresent = true;
  
  Object.entries(requiredVars).forEach(([key, value]) => {
    const status = value ? '✅ PRESENT' : '❌ MISSING';
    const displayValue = value ? 
      (key.includes('KEY') ? `${value.substring(0, 15)}...` : `${value.substring(0, 30)}...`) : 
      'undefined';
    console.log(`- ${key}: ${status} (${displayValue})`);
    if (!value) allPresent = false;
  });
  
  // Summary
  console.log('\n📊 Summary:');
  console.log(`- All required variables present: ${allPresent ? 'YES ✅' : 'NO ❌'}`);
  console.log(`- Total VITE_ variables: ${viteVars.length}`);
  
  if (!allPresent) {
    console.warn('⚠️ Some required environment variables are missing!');
    console.warn('Please check your Lovable project settings → Environment Variables');
    console.warn('Make sure variables are prefixed with VITE_ for frontend access');
  }
  
  return allPresent;
};