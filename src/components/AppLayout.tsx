import Navigation from "@/components/Navigation";

interface AppLayoutProps {
  children: React.ReactNode;
  hideNavigation?: boolean;
}

const AppLayout = ({ children, hideNavigation = false }: AppLayoutProps) => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 pb-16 relative">
        {children}
      </main>
      {/* CORRECTION: Navigation TOUJOURS fixe en bas et visible */}
      {!hideNavigation && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-border shadow-lg">
          <Navigation />
        </div>
      )}
    </div>
  );
};

export default AppLayout;