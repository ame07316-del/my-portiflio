import { cookies } from "next/headers";
import PreloaderMount from "@/components/three/PreloaderMount";
import { Cursor, Nav, ScrollProgress } from "@/components/site/Chrome";
import Hero from "@/components/site/Hero";
import Contact from "@/components/site/Contact";
import {
  About,
  Footer,
  Marquee,
  Process,
  Services,
  Skills,
  Timeline,
  Work,
} from "@/components/site/Sections";
import { getDict, LANG_COOKIE } from "@/lib/i18n";
import GlobeSection from "@/components/site/GlobeSection";
import WorldShift from "@/components/site/WorldShift";
import QuickTour from "@/components/site/QuickTour";
import {
  getExperiences,
  getLocations,
  getProjects,
  getServices,
  getSettings,
  getSkills,
} from "@/lib/queries";
import SetupNotice from "@/components/site/SetupNotice";
import { pick, type Lang } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const store = await cookies();
  const lang = ((store.get(LANG_COOKIE)?.value as Lang) || "en") as Lang;
  const dict = getDict(lang);

  let data;
  try {
    const [settings, projects, skills, services, experiences, locations] =
      await Promise.all([
        getSettings(),
        getProjects(),
        getSkills(),
        getServices(),
        getExperiences(),
        getLocations(),
      ]);
    data = { settings, projects, skills, services, experiences, locations };
  } catch (error) {
    return <SetupNotice message={(error as Error)?.message} />;
  }

  const { settings, projects, skills, services, experiences, locations } = data;

  const name = pick(settings, "name", lang);
  const role = pick(settings, "role", lang);
  const tagline = pick(settings, "tagline", lang);
  const about = pick(settings, "about", lang);

  const marquee = skills.length
    ? skills.map((s) => s.name)
    : ["Next.js", "React", "TypeScript", "Node.js", "PostgreSQL", "WebGL"];

  return (
    <main
      style={
        {
          "--accent": settings.accent,
          "--accent-2": settings.accent2,
          "--gold": settings.globe_color,
        } as React.CSSProperties
      }
    >
      <PreloaderMount
        phases={[
          dict.loader.booting,
          dict.loader.compiling,
          dict.loader.loading,
          dict.loader.polishing,
          dict.loader.almost,
        ]}
        enterLabel={dict.loader.enter}
        hint={dict.loader.hint}
        brandMark={settings.brand_mark}
      />
      <WorldShift dayLabel={dict.tour.day} nightLabel={dict.tour.night} />
      <ScrollProgress />
      <Cursor />
      <QuickTour
        label={dict.tour.button}
        hint={dict.tour.hint}
        exitLabel={dict.tour.exit}
        sections={[
          { id: "top", label: dict.nav.home },
          { id: "about", label: dict.nav.about },
          { id: "services", label: dict.nav.services },
          { id: "work", label: dict.nav.work },
          ...(settings.show_globe && locations.length
            ? [{ id: "global", label: dict.nav.global }]
            : []),
          { id: "skills", label: dict.nav.skills },
          { id: "timeline", label: dict.timeline.label },
          { id: "process", label: dict.process.label },
          { id: "contact", label: dict.nav.contact },
        ]}
      />
      <Nav
        dict={dict}
        lang={lang}
        name={name}
        cvUrl={settings.resume_url}
        brandMark={settings.brand_mark}
        logoUrl={settings.logo_url}
        showGlobe={settings.show_globe && locations.length > 0}
      />

      <Hero
        dict={dict}
        settings={settings}
        name={name}
        role={role}
        tagline={tagline}
        heroLabel={pick(settings, "hero_label", lang)}
      />
      <Marquee items={marquee} />
      <About dict={dict} settings={settings} lang={lang} about={about} />
      <Services dict={dict} services={services} lang={lang} />
      <Work dict={dict} projects={projects} lang={lang} />
      {settings.show_globe && (
        <GlobeSection
          dict={dict}
          settings={settings}
          locations={locations}
          lang={lang}
        />
      )}
      <Skills dict={dict} skills={skills} />
      <Timeline dict={dict} items={experiences} lang={lang} />
      <Process dict={dict} />
      <Contact dict={dict} settings={settings} />
      <Footer dict={dict} settings={settings} lang={lang} />
    </main>
  );
}
