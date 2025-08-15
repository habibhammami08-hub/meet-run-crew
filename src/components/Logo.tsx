import { cn } from "@/lib/utils";

interface LogoProps {
  variant?: "header" | "hero";
  className?: string;
}

const Logo = ({ variant = "header", className }: LogoProps) => {
  const isHero = variant === "hero";
  
  return (
    <div className={cn(
      "relative inline-flex items-center",
      className
    )}>
      <div className={cn(
        "relative font-bold tracking-wide select-none",
        isHero ? "text-4xl" : "text-xl",
        // Use proper color classes
        isHero ? "text-white" : "text-primary"
      )}>
        {/* Main text with shadow effect */}
        <span className={cn(
          "relative z-10",
          // Add text shadow using CSS
          isHero 
            ? "filter drop-shadow-[2px_2px_4px_rgba(0,0,0,0.8)]" 
            : "filter drop-shadow-[1px_1px_2px_rgba(0,0,0,0.2)]"
        )}>
          <span className="font-extrabold bg-gradient-to-r from-primary via-primary to-primary/80 bg-clip-text text-transparent">
            Meet
          </span>
          <span className={cn(
            "relative font-extrabold bg-gradient-to-r from-primary via-primary to-primary/80 bg-clip-text text-transparent",
            // Running man emoji
            "after:content-['🏃‍♂️'] after:absolute after:top-0",
            isHero 
              ? "after:text-2xl after:-right-8 after:top-1" 
              : "after:text-base after:-right-6 after:top-0"
          )}>
            Run
          </span>
        </span>
        
        {/* Subtle glow effect for header */}
        {!isHero && (
          <div className="absolute inset-0 bg-primary/10 blur-sm rounded-lg -z-10" />
        )}
      </div>
      
      {/* Animated underline for header version */}
      {!isHero && (
        <div className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-primary to-primary/60 w-full transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
      )}
    </div>
  );
};

export default Logo;