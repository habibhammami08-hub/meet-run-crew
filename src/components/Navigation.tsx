import { Button } from "@/components/ui/button";
import { MapPin, User, Plus, Home, Crown } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const Navigation = () => {
  const location = useLocation();
  const { user, hasActiveSubscription } = useAuth();
  
  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');
  
  return (
    <nav className="fixed-navigation">
      <div className="flex justify-around items-center max-w-md mx-auto py-2">
        <Link to="/">
          <Button 
            variant="ghost" 
            size="sm" 
            className={`flex flex-col items-center gap-1 h-auto py-2 px-3 transition-sport ${
              isActive('/') && location.pathname === '/' ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-primary'
            }`}
          >
            <Home size={20} />
            <span className="text-xs font-medium">Accueil</span>
          </Button>
        </Link>
        
        <Link to="/map">
          <Button 
            variant="ghost" 
            size="sm" 
            className={`flex flex-col items-center gap-1 h-auto py-2 px-3 transition-sport ${
              isActive('/map') ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-primary'
            }`}
          >
            <MapPin size={20} />
            <span className="text-xs font-medium">Carte</span>
          </Button>
        </Link>
        
<Link to="/subscription">
          <Button 
            variant="ghost" 
            size="sm" 
            className={`flex flex-col items-center gap-1 h-auto py-2 px-3 relative transition-sport ${
              isActive('/subscription') ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-primary'
            }`}
          >
            <Crown size={20} />
            <span className="text-xs font-medium">Abonnement</span>
            {user && hasActiveSubscription && (
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full shadow-sm"></div>
            )}
          </Button>
        </Link>
        
        <Link to="/create">
          <Button 
            variant="sport" 
            size="sm" 
            className="rounded-full w-12 h-12 p-0 shadow-sport hover:shadow-hover transition-sport transform hover:scale-105"
          >
            <Plus size={24} />
          </Button>
        </Link>
        
        <Link to="/profile">
          <Button 
            variant="ghost" 
            size="sm" 
            className={`flex flex-col items-center gap-1 h-auto py-2 px-3 transition-sport ${
              isActive('/profile') ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-primary'
            }`}
          >
            <User size={20} />
            <span className="text-xs font-medium">Profil</span>
          </Button>
        </Link>
      </div>
    </nav>
  );
};

export default Navigation;