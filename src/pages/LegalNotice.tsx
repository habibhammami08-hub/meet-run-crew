import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  CreditCard,
  Mail,
  MapPin,
  Phone,
  Scale,
  Server,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import markImage from "@/assets/meetrun-mark.png";

/** Ligne « intitulé : valeur » des blocs d'identification. */
const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:gap-3 sm:py-2">
    <dt className="shrink-0 text-sm font-medium text-muted-foreground sm:w-40">{label}</dt>
    <dd className="text-sm font-semibold text-foreground">{value}</dd>
  </div>
);

/** Section de la page : pastille d'icône, titre, contenu. */
const Section = ({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Building2;
  title: string;
  children: React.ReactNode;
}) => (
  <section className="rounded-3xl border border-border bg-card p-5 shadow-card sm:p-6">
    <header className="mb-3 flex items-center gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-deep/10 text-deep">
        <Icon size={17} />
      </span>
      <h2 className="text-base font-bold tracking-tight text-foreground sm:text-lg">{title}</h2>
    </header>
    <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
  </section>
);

const LegalNotice = () => {
  useEffect(() => {
    document.title = "Mentions légales — MeetRun";
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* En-tête discret : retour + marque */}
      <div className="sticky top-0 z-20 border-b border-border/60 bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-3 px-4">
          <Link
            to="/"
            aria-label="Retour à l'accueil"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-card text-foreground transition-opacity hover:opacity-80"
          >
            <ArrowLeft size={15} />
          </Link>
          <img src={markImage} alt="" aria-hidden="true" className="h-6 w-auto shrink-0" />
          <span className="text-sm font-bold tracking-tight text-deep">MeetRun</span>
          <span className="ml-auto text-xs font-medium text-muted-foreground">Mentions légales</span>
        </div>
      </div>

      <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-6">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Mentions légales
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Informations relatives à l'éditeur de l'application et du site MeetRun.
          </p>
          <p className="mt-3 text-xs text-muted-foreground/80">Dernière mise à jour : 8 octobre 2026</p>
        </div>

        <div className="space-y-4">
          <Section icon={Building2} title="Éditeur">
            <p>
              <strong className="font-semibold text-foreground">MeetRun</strong> est une marque détenue et
              exploitée par la société <strong className="font-semibold text-foreground">2H consulting</strong>.
            </p>
            <p>
              L'application MeetRun et le site www.meetrun.fr sont édités par cette société, qui en assure
              l'exploitation, le développement et la commercialisation.
            </p>
            <dl className="mt-1 divide-y divide-border">
              <Row label="Forme juridique" value="Société par actions simplifiée (SAS)" />
              <Row label="Capital social" value="1 000 euros" />
              <Row
                label="Immatriculation"
                value={
                  <>
                    RCS de Marseille
                    <br className="sm:hidden" /> n° 912 130 267
                  </>
                }
              />
              <Row
                label="Siège social"
                value={
                  <span className="inline-flex items-start gap-1.5">
                    <MapPin size={14} className="mt-0.5 shrink-0 text-deep" />
                    565 avenue du Prado, 13008 Marseille
                  </span>
                }
              />
              <Row
                label="E-mail"
                value={
                  <a href="mailto:contact@meetrun.fr" className="inline-flex items-center gap-1.5 text-deep underline-offset-4 hover:underline">
                    <Mail size={14} className="shrink-0" />
                    contact@meetrun.fr
                  </a>
                }
              />
              <Row
                label="Téléphone"
                value={
                  <a href="tel:+33482298088" className="inline-flex items-center gap-1.5 text-deep underline-offset-4 hover:underline">
                    <Phone size={14} className="shrink-0" />
                    04 82 29 80 88
                  </a>
                }
              />
            </dl>
          </Section>

          <Section icon={Server} title="Hébergement">
            <p>
              Le site est hébergé sur une infrastructure cloud à haute disponibilité opérée par nos prestataires
              techniques (réseau de diffusion et serveurs situés dans l'Union européenne).
            </p>
            <p>
              Les coordonnées complètes de l'hébergeur sont communiquées sur simple demande à
              {" "}
              <a href="mailto:contact@b-forbiz.com" className="text-deep underline underline-offset-4">
                contact@b-forbiz.com
              </a>
              .
            </p>
          </Section>

          <Section icon={Sparkles} title="Propriété intellectuelle">
            <p>
              L'ensemble des éléments de l'application et du site MeetRun — nom, marque, logo, interface, textes,
              photographies, icônes, base de données et code source — est la propriété de 2H consulting ou fait
              l'objet d'une autorisation d'utilisation.
            </p>
            <p>
              Toute reproduction, représentation, adaptation, extraction ou réutilisation, totale ou partielle, sans
              autorisation écrite préalable, est interdite. Les contenus publiés par les membres (titres de sessions,
              descriptions, parcours) restent leur propriété et sont mis à disposition des autres membres aux seules
              fins d'utilisation du service.
            </p>
          </Section>

          <Section icon={ShieldCheck} title="Données personnelles">
            <p>
              MeetRun collecte les données strictement nécessaires au fonctionnement du service : identité et
              photographies de profil, position géographique approximative utilisée pour rechercher les sessions
              proches, préférences de pratique et données de paiement.
            </p>
            <p>
              Conformément au Règlement général sur la protection des données et à la loi « Informatique et Libertés »,
              chaque membre peut accéder à ses données, les faire rectifier, les faire effacer, limiter leur
              traitement et s'opposer à celui-ci. La suppression d'un compte depuis la page Profil efface les données
              associées de manière définitive.
            </p>
            <p>
              Toute demande s'exerce par e-mail à{" "}
              <a href="mailto:contact@meetrun.fr" className="text-deep underline underline-offset-4">
                contact@meetrun.fr
              </a>
              .
            </p>
          </Section>

          <Section icon={CreditCard} title="Abonnement et paiement">
            <p>
              L'accès aux fonctionnalités payantes est facturé par abonnement, sans engagement, résiliable à tout
              moment depuis l'application. Les tarifs et les périodes promotionnelles en vigueur sont affichés sur la
              page « Abonnement » et dans l'application au moment de l'inscription.
            </p>
            <p>
              Les paiements sont traités par des prestataires de paiement certifiés ; MeetRun ne conserve pas les
              coordonnées bancaires des membres.
            </p>
          </Section>

          <Section icon={Scale} title="Droit applicable">
            <p>
              Les présentes mentions légales sont régies par le droit français. En cas de litige non résolu à
              l'amiable, et à défaut de disposition légale impérative contraire, les tribunaux de Marseille seront
              compétents.
            </p>
          </Section>
        </div>

        <footer className="mt-8 flex flex-col items-center gap-1 text-center">
          <span className="inline-flex items-center gap-1.5">
            <img src={markImage} alt="" aria-hidden="true" className="h-5 w-auto opacity-80" />
            <span className="text-xs font-bold tracking-tight text-deep">MeetRun</span>
          </span>
          <p className="text-xs text-muted-foreground">
            MeetRun — une marque de 2H consulting SAS
          </p>
          <p className="text-xs text-muted-foreground">
            <a href="mailto:contact@meetrun.fr" className="underline underline-offset-2">
              contact@meetrun.fr
            </a>
            <span className="px-2">·</span>
            <a href="tel:+33482298088" className="underline underline-offset-2">
              04 82 29 80 88
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
};

export default LegalNotice;
