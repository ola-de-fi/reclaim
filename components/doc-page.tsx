import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

/** Shell for plain reading pages (Safety, About, Terms). */
export function DocPage({
  kicker,
  title,
  intro,
  children,
}: {
  kicker: string;
  title: React.ReactNode;
  intro: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-4 sm:px-6 lg:px-8">
      <SiteHeader />
      <main className="py-12 sm:py-16">
        <p className="font-mono text-[11px] tracking-[0.14em] text-ink-2 uppercase">{kicker}</p>
        <h1 className="mt-3 max-w-3xl font-serif text-5xl leading-[0.98] tracking-tight sm:text-6xl">
          {title}
        </h1>
        <div className="mt-5 max-w-2xl text-lg text-ink-2">{intro}</div>
        <div className="mt-12 flex max-w-3xl flex-col gap-12">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}

export function DocSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t-[1.5px] border-ink pt-6">
      <h2 className="font-serif text-3xl leading-tight">{title}</h2>
      <div className="mt-4 flex flex-col gap-3 text-ink-2 [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-4 [&_strong]:text-ink">
        {children}
      </div>
    </section>
  );
}
