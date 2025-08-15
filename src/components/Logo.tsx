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
        // Gradient text effect
        "bg-gradient-to-r from-sport-green via-sport-green to-sport-dark bg-clip-text text-transparent",
        // Add shadow for better contrast on hero
        isHero && "drop-shadow-[2px_2px_4px_rgba(0,0,0,0.5)]"
      )}>
        {/* Main text with layered shadow effect */}
        <span className={cn(
          "relative z-10",
          // Add text shadow for depth
          !isHero && "drop-shadow-[1px_1px_2px_rgba(5,150,105,0.3)]"
        )}>
          Meet
          <span className={cn(
            "relative",
            // Running man icon integrated
            "after:content-['🏃'] after:absolute after:top-0 after:-right-1",
            isHero ? "after:text-2xl after:-right-2" : "after:text-sm after:-top-0.5"
          )}>
            Run
          </span>
        </span>
        
        {/* Subtle background glow for header version */}
        {!isHero && (
          <div className="absolute inset-0 bg-gradient-to-r from-sport-green/20 to-sport-dark/20 blur-sm rounded-lg -z-10" />
        )}
      </div>
      
      {/* Animated underline for header version */}
      {!isHero && (
        <div className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-sport-green to-sport-dark w-full transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
      )}
    </div>
  );
};

export default Logo;