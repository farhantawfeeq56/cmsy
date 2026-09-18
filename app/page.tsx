const steps = [
  { n: "01", title: "CMSy App", text: "Edit content or describe a component in the visual interface." },
  { n: "02", title: "CMSy MCP", text: "Changes become structured instructions agents can understand." },
  { n: "03", title: "AI / Agent", text: "Your coding agent reads the instructions and applies them." },
  { n: "04", title: "Codebase", text: "Your application updates — no migration, no parallel CMS." },
];

const features = [
  {
    badge: "Components Editor",
    badgeClass: "bg-mint text-ink",
    title: "Build components with AI",
    text: "Describe what you want and iterate on it directly inside CMSy instead of hand-writing every component from scratch.",
  },
  {
    badge: "No-Code Editor",
    badgeClass: "bg-butter text-ink",
    title: "Edit content, skip the code",
    text: "Blog posts, landing copy, text, images, structured data — editable by anyone, applied to the real codebase.",
  },
  {
    badge: "Agent-readable",
    badgeClass: "bg-lilac text-ink",
    title: "Instructions agents get",
    text: "Every change is translated into a copyable, structured format: Design / Edit → Instruction → Agent → Codebase.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-full flex-col bg-paper text-ink antialiased">
      {/* Floating nav */}
      <header className="sticky top-4 z-10 mx-auto w-full max-w-5xl px-4">
        <nav className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-card/90 py-3 pl-5 pr-3 backdrop-blur">
          <a href="#" className="font-primary text-lg font-semibold tracking-tight">
            CMSy
          </a>
          <div className="hidden items-center gap-6 text-sm font-medium text-smoke sm:flex">
            <a href="#editors" className="transition-colors hover:text-[var(--accent)]">
              Editors
            </a>
            <a href="#flow" className="transition-colors hover:text-[var(--accent)]">
              How it works
            </a>
            <a href="#why" className="transition-colors hover:text-[var(--accent)]">
              Why CMSy
            </a>
          </div>
          <a
            href="/dashboard"
            className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[var(--accent-ink)] transition-opacity hover:opacity-90"
          >
            Get started
          </a>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4">
        {/* Hero */}
        <section className="flex flex-col items-center py-24 text-center sm:py-32">
          <p className="flex items-center gap-2 rounded-full border border-line bg-card px-4 py-1.5 text-sm font-medium">
            <span className="inline-block size-3 rounded-full bg-[var(--accent)]" />
            AI-native CMS for codebases
          </p>
          <h1 className="font-primary mt-6 max-w-3xl text-5xl font-normal leading-[1.05] tracking-[-0.03em] sm:text-7xl">
            Edit content. Build components. Ship.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-smoke">
            CMSy sits between your codebase and a visual editing interface, so
            humans and AI agents work on your app through one shared layer.
          </p>
          <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <a
              href="/dashboard"
              className="rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-medium text-[var(--accent-ink)] transition-opacity hover:opacity-90"
            >
              Start building
            </a>
            <a
              href="#flow"
              className="rounded-lg border border-line bg-card px-6 py-3 text-sm font-medium text-ink transition-colors hover:border-ink/20"
            >
              How it works
            </a>
          </div>
          <p className="mt-8 flex items-center gap-2 text-sm text-smoke">
            <span className="inline-block size-2 rounded-full bg-[var(--accent)]" />
            Agent connected
            <span className="text-ink/20">·</span>
            <span className="inline-block size-2 rounded-full bg-ember" />
            No migration needed
          </p>
        </section>

        {/* Editors */}
        <section id="editors" className="scroll-mt-24 pb-20">
          <h2 className="font-primary text-center text-3xl font-normal tracking-[-0.02em] sm:text-4xl">
            Two editors, one codebase
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {features.map((f) => (
              <article
                key={f.title}
                className="flex flex-col rounded-xl border border-line bg-card p-6"
              >
                <span
                  className={`w-fit rounded-full px-3 py-1 text-xs font-medium ${f.badgeClass}`}
                >
                  {f.badge}
                </span>
                <h3 className="font-primary mt-4 text-xl font-medium tracking-tight">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-smoke">
                  {f.text}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* Flow */}
        <section
          id="flow"
          className="scroll-mt-24 rounded-2xl bg-card px-6 py-14 sm:px-12"
        >
          <h2 className="font-primary text-center text-3xl font-normal tracking-[-0.02em] sm:text-4xl">
            Design → Instruction → Agent → Codebase
          </h2>
          <ol className="mt-10 grid gap-4 sm:grid-cols-4">
            {steps.map((s) => (
              <li
                key={s.n}
                className="rounded-xl border border-line bg-paper p-5"
              >
                <p className="text-xs font-medium text-smoke">{s.n}</p>
                <h3 className="font-primary mt-1 font-medium tracking-tight">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-smoke">
                  {s.text}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* Why */}
        <section id="why" className="scroll-mt-24 py-20">
          <h2 className="font-primary mx-auto max-w-xl text-center text-3xl font-normal tracking-[-0.02em] sm:text-4xl">
            Not a CMS bolted on. A layer built in.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center leading-relaxed text-smoke">
            Traditional CMSs separate content from code. Agents can write code
            but aren&apos;t built for non-technical editing. CMSy is the middle
            ground — a CMS for codebases increasingly built and maintained by
            AI agents.
          </p>
        </section>

        {/* CTA */}
        <section id="cta" className="scroll-mt-24 pb-20">
          <div className="flex flex-col items-center rounded-2xl bg-ink px-6 py-16 text-center text-white sm:px-12">
            <p className="rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium">
              CMSy
            </p>
            <h2 className="font-primary mt-5 max-w-xl text-3xl font-normal tracking-[-0.02em] sm:text-5xl">
              Give your agents — and your team — one surface.
            </h2>
            <a
              href="/dashboard"
              className="mt-8 rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-medium text-[var(--accent-ink)] transition-opacity hover:opacity-90"
            >
              Get started with CMSy
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-smoke sm:flex-row">
          <p className="font-primary font-medium text-ink">CMSy</p>
          <p>Code-connected content for AI-built codebases.</p>
        </div>
      </footer>
    </div>
  );
}
