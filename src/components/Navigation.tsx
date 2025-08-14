import { Button } from "@/components/ui/button";
import { MapPin, User, Plus, Home } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

const Navigation = () => {
  const location = useLocation();
  
  const isActive = (path: string) => location.pathname === path;
  
  return (
    <nav className="bg-white border-t border-border px-4 py-2">
      <div className="flex justify-around items-center max-w-md mx-auto">
        <Link to="/">
          <Button 
            variant="ghost" 
            size="sm" 
            className={`flex flex-col items-center gap-1 h-auto py-2 px-3 ${
              isActive('/') ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <Home size={20} />
            <span className="text-xs">Accueil</span>
          </Button>
        </Link>
        
        <Link to="/map">
          <Button 
            variant="ghost" 
            size="sm" 
            className={`flex flex-col items-center gap-1 h-auto py-2 px-3 ${
              isActive('/map') ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <MapPin size={20} />
            <span className="text-xs">Carte</span>
          </Button>
        </Link>
        
        <Link to="/create">
          <Button 
            variant="sport" 
            size="sm" 
            className="rounded-full w-12 h-12 p-0"
          >
            <Plus size={24} />
          </Button>
        </Link>
        
        <Link to="/profile">
          <Button 
            variant="ghost" 
            size="sm" 
            className={`flex flex-col items-center gap-1 h-auto py-2 px-3 ${
              isActive('/profile') ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <User size={20} />
            <span className="text-xs">Profil</span>
          </Button>
        </Link>
      </div>
    </nav>
  );
};

export default Navigation;