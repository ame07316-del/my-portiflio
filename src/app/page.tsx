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
import {
  getExperiences,
  getProjects,
  getServices,
  getSettings,
  getSkills,
} from "@/lib/queries";
import { pick, type Lang } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const store = await cookies();
  const lang = ((store.get(LANG_COOKIE)?.value as Lang) || "en") as Lang;
  const dict = getDict(lang);

  const [settings, projects, skills, services, experiences] = await Promise.all([
    getSettings(),
    getProjects(),
    getSkills(),
    getServices(),
    getExperiences(),
  ]);

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
      />
      <ScrollProgress />
      <Cursor />
      <Nav dict={dict} lang={lang} name={name} cvUrl={settings.resume_url} />

      <Hero
        dict={dict}
        settings={settings}
        name={name}
        role={role}
        tagline={tagline}
      />
      <Marquee items={marquee} />
      <About dict={dict} settings={settings} lang={lang} about={about} />
      <Services dict={dict} services={services} lang={lang} />
      <Work dict={dict} projects={projects} lang={lang} />
      <Skills dict={dict} skills={skills} />
      <Timeline dict={dict} items={experiences} lang={lang} />
      <Process dict={dict} />
      <Contact dict={dict} settings={settings} />
      <Footer dict={dict} settings={settings} lang={lang} />
    </main>
  );
}
