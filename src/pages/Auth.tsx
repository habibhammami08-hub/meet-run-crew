import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSupabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, Lock, User, Phone, Chrome, Users, MapPin, Heart, CheckCircle } from "lucide-react";
import logoImage from "@/assets/meetrun-logo-green.png";

const supabase = getSupabase();

const Auth = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [confirmedEmail, setConfirmedEmail] = useState<string | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const returnTo = searchParams.get('returnTo') || '/map';
  const mode = searchParams.get('mode') || 'signin';
  const confirmed = searchParams.get('confirmed') === 'true';

  // Gérer la confirmation d'email au chargement de la page
  useEffect(() => {
    if (confirmed) {
      toast({
        title: "Email confirmé !",
        description: "Votre compte a été activé avec succès. Vous pouvez maintenant vous connecter.",
      });
      
      // Nettoyer les paramètres URL
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('confirmed');
      newUrl.searchParams.delete('token');
      window.history.replaceState({}, '', newUrl.toString());
    }
  }, [confirmed, toast]);

  // Redirection des utilisateurs authentifiés
  useEffect(() => {
    if (user) {
      navigate(returnTo);
    }
  }, [user, navigate, returnTo]);

  const handleGoogleSignIn = async () => {
    if (!supabase) {
      toast({
        title: "Configuration manquante",
        description: "Impossible de se connecter - variables d'environnement manquantes",
        variant: "destructive",
      });
      return;
    }

    setIsGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}${returnTo}`,
        },
      });

      if (error) throw error;
    } catch (error: any) {
      toast({
        title: "Erreur de connexion Google",
        description: error.message,
        variant: "destructive",
      });
      setIsGoogleLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
      if (!supabase) {
        toast({
          title: "Configuration manquante",
          description: "Impossible de se connecter - variables d'environnement manquantes",
          variant: "destructive",
        });
        return;
      }
      
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message.includes('Email not confirmed')) {
          toast({
            title: "Email non confirmé",
            description: "Veuillez cliquer sur le lien de confirmation envoyé à votre adresse email.",
            variant: "destructive",
          });
        } else if (error.message.includes('Invalid login credentials')) {
          toast({
            title: "Identifiants incorrects",
            description: "Vérifiez votre email et votre mot de passe.",
            variant: "destructive",
          });
        } else {
          throw error;
        }
        return;
      }

      toast({
        title: "Connexion réussie",
        description: "Bienvenue sur MeetRun !",
      });
      navigate(returnTo);
    } catch (error: any) {
      toast({
        title: "Erreur de connexion",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const fullName = formData.get("fullName") as string;
    const age = formData.get("age") as string;
    const gender = formData.get("gender") as string;
    const phone = formData.get("phone") as string;

    try {
      // URL de redirection après confirmation d'email - MODIFIÉ
      const confirmationUrl = `${window.location.origin}/auth?confirmed=true&returnTo=${encodeURIComponent(returnTo)}`;
      
      if (!supabase) {
        toast({
          title: "Configuration manquante",
          description: "Impossible de créer le compte - variables d'environnement manquantes", 
          variant: "destructive",
        });
        return;
      }
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: confirmationUrl,
          data: {
            full_name: fullName,
            age: parseInt(age),
            gender,
            phone,
          }
        }
      });

      if (error) {
        if (error.message.includes('already registered') || error.message.includes('already exists')) {
          toast({
            title: "Compte existant",
            description: "Un compte avec cet email existe déjà. Utilisez la connexion ou réinitialisez votre mot de passe.",
            variant: "destructive",
          });
        } else {
          throw error;
        }
        return;
      }

      // Marquer que l'email a été envoyé
      setEmailSent(true);
      setConfirmedEmail(email);

      // MESSAGE CORRIGÉ
      toast({
        title: "Email de confirmation envoyé",
        description: "Vérifiez votre boîte mail et cliquez sur le lien de confirmation pour activer votre compte.",
      });
      
    } catch (error: any) {
      toast({
        title: "Erreur lors de l'inscription",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // ÉCRAN D'ATTENTE DE CONFIRMATION - NOUVEAU
  if (emailSent && confirmedEmail) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-2xl border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="text-center pb-6">
            <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Mail className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold text-foreground">
              Confirmez votre email
            </CardTitle>
            <CardDescription className="text-base">
              Un email de confirmation a été envoyé à <strong>{confirmedEmail}</strong>
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6 text-center">
            <div className="space-y-4">
              <div className="flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                <span className="text-sm">Email envoyé avec succès</span>
              </div>
              
              <div className="text-sm text-muted-foreground space-y-2">
                <p>Pour activer votre compte :</p>
                <ol className="text-left space-y-1 ml-4">
                  <li>1. Ouvrez votre boîte email</li>
                  <li>2. Recherchez l'email de MeetRun</li>
                  <li>3. Cliquez sur le lien de confirmation</li>
                  <li>4. Vous serez automatiquement redirigé</li>
                </ol>
              </div>

              <div className="bg-blue-50 p-3 rounded-lg">
                <p className="text-xs text-blue-600">
                  💡 Vérifiez aussi vos spams si vous ne trouvez pas l'email
                </p>
              </div>
            </div>
          </CardContent>
          
          <CardFooter className="flex flex-col space-y-3">
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => {
                setEmailSent(false);
                setConfirmedEmail(null);
              }}
            >
              Retour à l'inscription
            </Button>
            
            <p className="text-xs text-center text-muted-foreground">
              Déjà confirmé ? <button 
                type="button" 
                className="text-primary font-medium hover:underline"
                onClick={() => navigate(`/auth?mode=signin&returnTo=${encodeURIComponent(returnTo)}`)}
              >
                Se connecter
              </button>
            </p>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/5 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>
      
      <div className="relative z-10 w-full max-w-md">
        {/* Hero Section */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <img 
              src={logoImage} 
              alt="MeetRun" 
              className="h-10 w-auto"
            />
          </div>
          
          <div className="space-y-2 mb-6">
            <h2 className="text-xl font-semibold text-foreground">
              {mode === 'signin' 
                ? 'Connectez-vous pour créer vos sessions et rejoindre d\'autres runners près de chez vous' 
                : 'Inscrivez-vous pour rejoindre une communauté de runners près de chez vous'
              }
            </h2>
          </div>

          {/* Stats inspirantes */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center p-3 bg-white/50 backdrop-blur-sm rounded-lg border border-primary/10">
              <MapPin className="h-5 w-5 text-primary mx-auto mb-1" />
              <div className="text-sm font-semibold text-foreground">+500</div>
              <div className="text-xs text-muted-foreground">Sessions</div>
            </div>
            <div className="text-center p-3 bg-white/50 backdrop-blur-sm rounded-lg border border-primary/10">
              <Users className="h-5 w-5 text-primary mx-auto mb-1" />
              <div className="text-sm font-semibold text-foreground">+200</div>
              <div className="text-xs text-muted-foreground">Runners</div>
            </div>
            <div className="text-center p-3 bg-white/50 backdrop-blur-sm rounded-lg border border-primary/10">
              <Heart className="h-5 w-5 text-primary mx-auto mb-1" />
              <div className="text-sm font-semibold text-foreground">98%</div>
              <div className="text-xs text-muted-foreground">Satisfaction</div>
            </div>
          </div>
        </div>

        <Card className="shadow-2xl border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="text-center pb-6">
            <CardTitle className="text-2xl font-bold text-foreground">
              {mode === 'signin' ? 'Connexion' : 'Inscription'}
            </CardTitle>
          </CardHeader>
          
          <CardContent className="space-y-6">
            {/* Google Sign In Button */}
            <Button
              onClick={handleGoogleSignIn}
              disabled={isGoogleLoading}
              variant="outline"
              size="lg"
              className="w-full h-12 bg-white hover:bg-gray-50 border-2 border-gray-200 hover:border-primary/50 transition-all duration-200"
            >
              {isGoogleLoading ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Chrome className="mr-3 h-5 w-5 text-[#4285F4]" />
              )}
              <span className="text-gray-700 font-medium">
                {mode === 'signin' ? 'Continuer avec Google' : "S'inscrire avec Google"}
              </span>
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-muted" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-4 text-muted-foreground font-medium">
                  ou continuez avec votre email
                </span>
              </div>
            </div>

            <Tabs defaultValue={mode} className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-muted/50">
                <TabsTrigger value="signin" className="data-[state=active]:bg-white">
                  Connexion
                </TabsTrigger>
                <TabsTrigger value="signup" className="data-[state=active]:bg-white">
                  Inscription
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="signin" className="mt-6">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        placeholder="votre@email.com"
                        className="pl-10 h-12"
                        required
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-medium">Mot de passe</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="password"
                        name="password"
                        type="password"
                        placeholder="••••••••"
                        className="pl-10 h-12"
                        required
                      />
                    </div>
                  </div>
                  
                  <Button 
                    type="submit" 
                    className="w-full h-12 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-white font-medium shadow-lg hover:shadow-xl transition-all duration-200" 
                    disabled={isLoading}
                  >
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Se connecter
                  </Button>
                </form>
                
                <div className="mt-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    Pas encore de compte ?{" "}
                    <button
                      type="button"
                      onClick={() => navigate(`/auth?mode=signup&returnTo=${encodeURIComponent(returnTo)}`)}
                      className="text-primary font-medium hover:underline"
                    >
                      Inscrivez-vous
                    </button>
                  </p>
                </div>
              </TabsContent>
              
              <TabsContent value="signup" className="mt-6">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="fullName" className="text-sm font-medium">Nom complet</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="fullName"
                        name="fullName"
                        placeholder="Jean Dupont"
                        className="pl-10 h-12"
                        required
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="age" className="text-sm font-medium">Âge</Label>
                      <Input
                        id="age"
                        name="age"
                        type="number"
                        placeholder="25"
                        min="16"
                        max="99"
                        className="h-12"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="gender" className="text-sm font-medium">Genre</Label>
                      <select
                        id="gender"
                        name="gender"
                        className="flex h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        required
                      >
                        <option value="">Sélectionner</option>
                        <option value="homme">Homme</option>
                        <option value="femme">Femme</option>
                        <option value="autre">Autre</option>
                      </select>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-sm font-medium">Téléphone</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="phone"
                        name="phone"
                        type="tel"
                        placeholder="+64 21 123 4567"
                        className="pl-10 h-12"
                        required
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        placeholder="votre@email.com"
                        className="pl-10 h-12"
                        required
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-medium">Mot de passe</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="password"
                        name="password"
                        type="password"
                        placeholder="••••••••"
                        className="pl-10 h-12"
                        minLength={6}
                        required
                      />
                    </div>
                  </div>
                  
                  <Button 
                    type="submit" 
                    className="w-full h-12 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-white font-medium shadow-lg hover:shadow-xl transition-all duration-200" 
                    disabled={isLoading}
                  >
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Créer mon compte
                  </Button>
                </form>
                
                <div className="mt-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    Déjà un compte ?{" "}
                    <button
                      type="button"
                      onClick={() => navigate(`/auth?mode=signin&returnTo=${encodeURIComponent(returnTo)}`)}
                      className="text-primary font-medium hover:underline"
                    >
                      Connectez-vous
                    </button>
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Bottom CTA */}
        <div className="mt-8 text-center">
          <p className="text-sm text-muted-foreground mb-2">
            En vous connectant, vous acceptez nos conditions d'utilisation
          </p>
          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <span>🏃‍♂️ +200 runners actifs</span>
            <span>•</span>
            <span>📍 Toute la France</span>
            <span>•</span>
            <span>⭐ 4.9/5 étoiles</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;