export function PageHeader({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
          {title}
        </h1>
        {desc && <p className="mt-1.5 text-sm text-white/45">{desc}</p>}
      </div>
      {children}
    </header>
  );
}
