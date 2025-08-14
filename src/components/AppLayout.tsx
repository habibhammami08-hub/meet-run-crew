import Navigation from "@/components/Navigation";

interface AppLayoutProps {
  children: React.ReactNode;
  hideNavigation?: boolean;
}

const AppLayout = ({ children, hideNavigation = false }: AppLayoutProps) => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 pb-16">
        {children}
      </main>
      {!hideNavigation && <Navigation />}
    </div>
  );
};

export default AppLayout;