import { Button } from "@/components/ui/button";
import { Bell, Settings } from "lucide-react";

interface HeaderProps {
  title: string;
  showBack?: boolean;
  actions?: React.ReactNode;
}

const Header = ({ title, actions }: HeaderProps) => {
  return (
    <header className="bg-white border-b border-border px-4 py-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-sport-black">{title}</h1>
        <div className="flex items-center gap-2">
          {actions}
          <Button variant="ghost" size="icon" className="text-muted-foreground">
            <Bell size={20} />
          </Button>
          <Button variant="ghost" size="icon" className="text-muted-foreground">
            <Settings size={20} />
          </Button>
        </div>
      </div>
    </header>
  );
};

export default Header;