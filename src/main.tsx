import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { checkEnvironmentVariables } from './utils/envCheck'

// Check environment variables at startup
checkEnvironmentVariables();

createRoot(document.getElementById("root")!).render(<App />);
