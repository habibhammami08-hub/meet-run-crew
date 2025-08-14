import Navigation from "@/components/Navigation";

interface AppLayoutProps {
  children: React.ReactNode;
  hideNavigation?: boolean;
}

const AppLayout = ({ children, hideNavigation = false }: AppLayoutProps) => {
  console.log("AppLayout rendering with hideNavigation:", hideNavigation);
  
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 pb-16">
        {children}
      </main>
      {!hideNavigation && (
        <>
          <Navigation />
          <div style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            background: 'red',
            color: 'white',
            padding: '2px 8px',
            fontSize: '10px',
            zIndex: 9999
          }}>
            DEBUG: Navigation from AppLayout
          </div>
        </>
      )}
    </div>
  );
};

export default AppLayout;