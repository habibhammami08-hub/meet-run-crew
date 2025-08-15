import Navigation from "@/components/Navigation";

interface AppLayoutProps {
  children: React.ReactNode;
  hideNavigation?: boolean;
}

const AppLayout = ({ children, hideNavigation = false }: AppLayoutProps) => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 main-content relative">
        {children}
      </main>
      {/* Navigation fixe en bas avec les nouvelles classes CSS */}
      {!hideNavigation && (
        <Navigation />
      )}
    </div>
  );
};

export default AppLayout;