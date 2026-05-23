import Link from "next/link";
import Image from "next/image";
import { Button, Card } from "@digimine/ui";
import { getCachedStoreItems } from "@/lib/server/catalog";
import {
    audiencePanels,
    featureCards,
    workflowSteps,
    testimonials,
    instituteSummary,
    teacherDashboardMock,
    type AudienceKey,
} from "./_home/data";
import HeroAudienceBlock from "./_home/HeroAudienceBlock";
import HomeMotion from "./_home/HomeMotion";
import HomeFeaturedProducts from "./_home/FeaturedProducts";

/**
 * Homepage (server component).
 *
 * The bulk of the page renders as a server component — hero shell, audience
 * cards, feature grid, workflow, teacher/institute value props, testimonials
 * and final CTA all render in SSR HTML so the LCP image isn't blocked behind
 * a megabyte of client JS. Three small client islands handle the bits that
 * actually need state or window APIs:
 *   - <HeroAudienceBlock>   audience tab + state-driven hero copy
 *   - <HomeFeaturedProducts> seeded grid from server-fetched cached catalog
 *   - <HomeMotion>           IntersectionObserver reveal + cursor parallax
 */
export default async function HomePage() {
    const items = await getCachedStoreItems().catch(() => []);
    const featured = items.slice(0, 4);

    return (
        <div className="bg-slate-50">
            <HomeMotion />

            {/* Announcement strip */}
            <div className="border-b border-slate-200 bg-slate-950 text-slate-100">
                <div className="container-page flex flex-wrap items-center justify-center gap-3 py-2 text-center text-xs">
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-300">Now live</span>
                    <span className="font-medium text-slate-200">Institute accounts — onboard your teachers and batches under one roof.</span>
                    <Link href="/for-institutes" className="font-semibold text-emerald-300 hover:text-emerald-200">Create your institute →</Link>
                </div>
            </div>

            {/* Hero: server-rendered shell + client audience block */}
            <section className="landing-dynamic-section relative overflow-hidden border-b border-slate-200/70">
                <Image
                    src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=70"
                    alt=""
                    fill
                    priority
                    sizes="100vw"
                    className="object-cover"
                />
                <div
                    aria-hidden="true"
                    className="absolute inset-0"
                    style={{ backgroundImage: "linear-gradient(90deg, rgba(2,6,23,0.96) 0%, rgba(2,6,23,0.86) 46%, rgba(2,6,23,0.55) 100%)" }}
                />
                <div
                    aria-hidden="true"
                    className="absolute inset-0 opacity-20"
                    style={{
                        backgroundImage: "linear-gradient(rgba(255,255,255,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.14) 1px, transparent 1px)",
                        backgroundSize: "42px 42px",
                    }}
                />
                <HeroAudienceBlock />
            </section>

            {/* Three audience cards */}
            <section className="border-b border-slate-200 bg-white">
                <div className="container-page py-16 sm:py-20">
                    <div className="landing-motion max-w-3xl" data-motion>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-700">Who is this for</p>
                        <h2 className="font-display mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">Built for everyone in the prep journey.</h2>
                        <p className="mt-3 text-sm text-slate-600 sm:text-base">
                            Whether you&apos;re studying, teaching, or running a whole institute — there&apos;s a path on PlacementRanker that fits.
                        </p>
                    </div>

                    <div className="mt-10 grid gap-5 lg:grid-cols-3">
                        {(Object.keys(audiencePanels) as AudienceKey[]).map((key) => {
                            const panel = audiencePanels[key];
                            return (
                                <Card key={key} className="landing-motion landing-lift-card group relative overflow-hidden p-6" data-motion>
                                    <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${panel.accent}`} />
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{panel.label.replace("For ", "")}</p>
                                        {panel.comingSoon && (
                                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-700 ring-1 ring-amber-200">Coming soon</span>
                                        )}
                                    </div>
                                    <h3 className="mt-3 text-xl font-bold text-slate-900">{panel.subline}</h3>
                                    <p className="mt-2 text-sm leading-6 text-slate-600">{panel.description}</p>
                                    <ul className="mt-5 space-y-2 text-sm">
                                        {panel.bullets.slice(0, 3).map((b) => (
                                            <li key={b.title} className="flex items-start gap-2">
                                                <span className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-gradient-to-br ${panel.accent}`} />
                                                <span className="text-slate-700">
                                                    <span className="font-semibold text-slate-900">{b.title}.</span> {b.text}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="mt-6 flex gap-2">
                                        <Link href={panel.ctaPrimary.href} className="flex-1">
                                            <Button variant="primary" className="w-full">{panel.ctaPrimary.label}</Button>
                                        </Link>
                                        <Link href={panel.ctaSecondary.href}>
                                            <Button variant="outline">{panel.ctaSecondary.label}</Button>
                                        </Link>
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* Feature grid */}
            <section className="border-b border-slate-200 bg-slate-50">
                <div className="container-page py-16 sm:py-20">
                    <div className="landing-motion flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between" data-motion>
                        <div className="max-w-2xl">
                            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-700">Everything you need</p>
                            <h2 className="font-display mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">One platform. Mocks, code rounds, quizzes, contests, courses.</h2>
                        </div>
                        <Link href="/tests" className="text-sm font-semibold text-primary-700 hover:text-primary-800">See it in action →</Link>
                    </div>
                    <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {featureCards.map((card) => (
                            <Card key={card.title} className="landing-motion landing-lift-card group relative overflow-hidden p-6" data-motion>
                                <div className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${card.accent} text-white shadow-lg`}>
                                    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                                        <path strokeLinecap="round" strokeLinejoin="round" d={card.icon} />
                                    </svg>
                                </div>
                                <p className="mt-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">{card.tag}</p>
                                <h3 className="mt-1 text-lg font-bold text-slate-900">{card.title}</h3>
                                <p className="mt-2 text-sm leading-6 text-slate-600">{card.description}</p>
                            </Card>
                        ))}
                    </div>
                </div>
            </section>

            {/* Student workflow */}
            <section className="border-b border-slate-200 bg-white">
                <div className="container-page py-16 sm:py-20">
                    <div className="landing-motion max-w-3xl" data-motion>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-700">For students</p>
                        <h2 className="font-display mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">The placement prep loop, done right.</h2>
                        <p className="mt-3 text-sm text-slate-600 sm:text-base">
                            A four-step rhythm that keeps you in the seat: learn, drill, mock, review. Then do it again until you&apos;re placement-ready.
                        </p>
                    </div>
                    <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        {workflowSteps.map((step) => (
                            <div key={step.step} className="landing-motion relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-6" data-motion>
                                <p className="font-display text-5xl font-black text-primary-100">{step.step}</p>
                                <h3 className="mt-3 text-lg font-bold text-slate-900">{step.title}</h3>
                                <p className="mt-1 text-sm leading-6 text-slate-600">{step.text}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Featured products / test series (SSR with cached catalog) */}
            <section className="border-b border-slate-200 bg-slate-50">
                <div className="container-page py-16 sm:py-20">
                    <div className="landing-motion flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between" data-motion>
                        <div className="max-w-2xl">
                            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-700">Browse the catalogue</p>
                            <h2 className="font-display mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">Featured test series & courses</h2>
                            <p className="mt-2 text-sm text-slate-600 sm:text-base">Hand-picked for placement and exam prep. Free and paid.</p>
                        </div>
                        <div className="flex gap-2">
                            <Link href="/tests" className="text-sm font-semibold text-primary-700 hover:text-primary-800">Tests →</Link>
                            <Link href="/courses" className="text-sm font-semibold text-primary-700 hover:text-primary-800">Courses →</Link>
                            <Link href="/products" className="text-sm font-semibold text-primary-700 hover:text-primary-800">Resources →</Link>
                        </div>
                    </div>
                    <HomeFeaturedProducts items={featured} />
                </div>
            </section>

            {/* Teacher value prop */}
            <section className="border-b border-slate-200 bg-white">
                <div className="container-page py-16 sm:py-20">
                    <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
                        <div className="landing-motion" data-motion>
                            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">For teachers</p>
                            <h2 className="font-display mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">Run your coaching online. Keep your students engaged.</h2>
                            <p className="mt-4 max-w-xl text-sm leading-7 text-slate-600 sm:text-base">
                                Stop juggling WhatsApp groups, Google Forms, and Excel sheets. Create classes, send a single invite link per class, publish quizzes and mocks in minutes, and see every attempt in one dashboard.
                            </p>
                            <ul className="mt-6 space-y-3 text-sm">
                                {audiencePanels.teacher.bullets.map((b) => (
                                    <li key={b.title} className="flex items-start gap-3">
                                        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                                            <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24" aria-hidden="true">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                            </svg>
                                        </span>
                                        <span>
                                            <span className="font-semibold text-slate-900">{b.title}. </span>
                                            <span className="text-slate-600">{b.text}</span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                            <div className="mt-7 flex flex-wrap gap-3">
                                <Link href="/register?role=teacher"><Button size="lg">Start teaching free</Button></Link>
                                <Link href="/for-teachers"><Button variant="outline" size="lg">See plans</Button></Link>
                            </div>
                        </div>

                        <div className="landing-motion" data-motion>
                            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-950 p-1 shadow-2xl">
                                <div className="rounded-[1.4rem] bg-slate-950 p-5 ring-1 ring-white/10">
                                    <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-3">
                                        <p className="text-xs font-bold uppercase tracking-widest text-amber-200">Teacher portal</p>
                                        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-300">Live</span>
                                    </div>
                                    <h3 className="mt-4 text-lg font-bold text-white">My classes</h3>
                                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                        {teacherDashboardMock.map((c) => (
                                            <div key={c.code} className="rounded-xl border border-white/10 bg-white/[0.05] p-3">
                                                <p className="text-xs font-bold text-white">{c.name}</p>
                                                <p className="mt-1 text-[10px] font-mono text-amber-200">{c.code}</p>
                                                <p className="mt-1 text-[10px] text-slate-400">{c.active} active</p>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.05] p-3">
                                        <div className="flex items-center justify-between">
                                            <p className="text-xs font-bold text-white">This week&apos;s attempts</p>
                                            <p className="text-[10px] text-slate-400">156 / 4 classes</p>
                                        </div>
                                        <div className="mt-3 grid grid-cols-7 gap-1">
                                            {[24, 18, 32, 41, 22, 14, 5].map((v, i) => (
                                                <div key={i} className="flex flex-col items-center">
                                                    <div className="w-full rounded-t bg-gradient-to-t from-amber-500 to-orange-300" style={{ height: `${(v / 41) * 80}px` }} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Institute value prop */}
            <section className="border-b border-slate-200 bg-gradient-to-br from-emerald-50 via-teal-50 to-white">
                <div className="container-page py-16 sm:py-20">
                    <div className="landing-motion grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-center" data-motion>
                        <div>
                            <div className="flex items-center gap-2">
                                <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">For institutes</p>
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-700 ring-1 ring-emerald-200">Now live</span>
                            </div>
                            <h2 className="font-display mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">A full LMS for your institute. Priced like one teacher.</h2>
                            <p className="mt-4 max-w-xl text-sm leading-7 text-slate-700 sm:text-base">
                                Coaching centres, colleges, training institutes — bring all your teachers and batches under one roof. Track every student across every test. Pay what you&apos;d pay for one Pro license.
                            </p>
                            <ul className="mt-6 space-y-3 text-sm">
                                {audiencePanels.institute.bullets.map((b) => (
                                    <li key={b.title} className="flex items-start gap-3">
                                        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                                            <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24" aria-hidden="true">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                            </svg>
                                        </span>
                                        <span>
                                            <span className="font-semibold text-slate-900">{b.title}. </span>
                                            <span className="text-slate-700">{b.text}</span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                            <div className="mt-7 flex flex-wrap gap-3">
                                <Link href="/register?intent=institute"><Button size="lg">Create your institute</Button></Link>
                                <Link href="/for-institutes"><Button variant="outline" size="lg">See plans & details</Button></Link>
                            </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            {instituteSummary.map((s) => (
                                <Card key={s.title} className="p-5">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{s.title}</p>
                                    <p className={`mt-2 bg-gradient-to-br ${s.tone} bg-clip-text text-4xl font-black text-transparent`}>{s.value}</p>
                                    <p className="mt-1 text-xs text-slate-600">{s.caption}</p>
                                </Card>
                            ))}
                            <div className="sm:col-span-2 rounded-2xl border border-emerald-200 bg-white p-5">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Volume-friendly pricing</p>
                                <p className="mt-2 text-2xl font-bold text-slate-900">From <span className="text-emerald-700">₹4,999</span>/month — unlimited batches.</p>
                                <p className="mt-1 text-xs text-slate-500">Custom plans for institutes with 500+ students.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Testimonials */}
            <section className="border-b border-slate-200 bg-slate-950 py-16 text-white sm:py-20">
                <div className="container-page">
                    <div className="landing-motion max-w-3xl" data-motion>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-200">Voices from the floor</p>
                        <h2 className="font-display mt-2 text-3xl font-bold text-white sm:text-4xl">Students, teachers, and institutes — all in one place.</h2>
                    </div>
                    <div className="mt-10 grid gap-5 lg:grid-cols-3">
                        {testimonials.map((t) => (
                            <div key={t.author} className="landing-motion landing-lift-card rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur" data-motion>
                                <svg className="h-6 w-6 text-primary-300" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                    <path d="M9.983 3v7.391c0 5.704-3.731 9.57-8.983 10.609l-.995-2.151c2.432-.917 3.995-3.638 3.995-5.849h-4v-10h9.983zm14.017 0v7.391c0 5.704-3.748 9.571-9 10.609l-.996-2.151c2.433-.917 3.996-3.638 3.996-5.849h-3.983v-10h9.983z" />
                                </svg>
                                <p className="mt-4 text-sm leading-7 text-slate-200">“{t.quote}”</p>
                                <p className="mt-5 text-sm font-bold text-white">{t.author}</p>
                                <p className="text-xs text-slate-400">{t.role}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Final CTA */}
            <section className="bg-gradient-to-br from-slate-50 via-white to-slate-50">
                <div className="container-page py-16 sm:py-24">
                    <div className="landing-motion mx-auto max-w-4xl text-center" data-motion>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-700">Get started</p>
                        <h2 className="font-display mt-2 text-3xl font-bold text-slate-900 sm:text-5xl">Whichever side you&apos;re on, there&apos;s a free start.</h2>
                        <p className="mx-auto mt-4 max-w-2xl text-sm text-slate-600 sm:text-base">
                            Sign up as a student, switch into a teacher seat anytime, or apply for early institute access — no credit card needed to start.
                        </p>
                        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                            <Link href="/register"><Button size="lg">I&apos;m a student</Button></Link>
                            <Link href="/register?role=teacher"><Button variant="outline" size="lg">I&apos;m a teacher</Button></Link>
                            <Link href="/register?intent=institute">
                                <Button variant="outline" size="lg" className="!border-emerald-200 !bg-emerald-50 !text-emerald-700 hover:!bg-emerald-100">Run an institute</Button>
                            </Link>
                        </div>
                        <p className="mt-8 text-xs text-slate-500">
                            Already have an account?{" "}
                            <Link href="/login" className="font-semibold text-primary-700 hover:text-primary-800">Sign in →</Link>
                        </p>
                    </div>
                </div>
            </section>
        </div>
    );
}
