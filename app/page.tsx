import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Flame, MapPin, Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "ISAY Fried Chicken",
  description:
    "Buttered Chicken, Buttered Chicken with Rice, and signature Letson Manok from ISAY Fried Chicken.",
  robots: { index: true, follow: true },
};

const favorites = [
  {
    name: "Buttered Chicken",
    description:
      "Crispy, juicy chicken covered in our rich garlic-butter glaze.",
    image: "/landing/buttered-chicken.png",
    accent: "bg-[#b7191f]",
  },
  {
    name: "Buttered Chicken with Rice",
    description:
      "Golden buttered chicken with hot steamed rice for one satisfying meal.",
    image: "/landing/buttered-chicken-rice.png",
    accent: "bg-[#f4b400]",
  },
  {
    name: "Letson Manok",
    description:
      "Whole roasted chicken with smoky char, juicy meat, and deeply savory flavor.",
    image: "/landing/letson-manok-hero.png",
    accent: "bg-[#171717]",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#fff8ea] text-[#24130c]">
      <header className="relative z-30 border-b border-black/10 bg-[#fff8ea]/95 backdrop-blur">
        <div className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
          <Link href="/" className="relative h-16 w-44 sm:w-52" aria-label="ISAY Fried Chicken home">
            <Image
              src="/landing/isay-logo.png"
              alt="ISAY Fried Chicken"
              fill
              priority
              sizes="(max-width: 640px) 176px, 208px"
              className="object-contain"
            />
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            <a href="#favorites" className="text-sm font-black uppercase tracking-wide hover:text-[#b7191f]">
              Our Favorites
            </a>
            <a href="#about" className="text-sm font-black uppercase tracking-wide hover:text-[#b7191f]">
              Our Chicken
            </a>
          </nav>

          <Link
            href="/login"
            className="inline-flex h-11 items-center gap-2 rounded-full border-2 border-[#24130c] px-5 text-sm font-black transition hover:bg-[#24130c] hover:text-white"
          >
            Staff Login
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <section className="relative isolate min-h-[690px] overflow-hidden bg-[#a90f19] text-white lg:min-h-[720px]">
        <div className="absolute inset-0">
          <Image
            src="/landing/letson-manok-hero.png"
            alt="ISAY Letson Manok"
            fill
            priority
            sizes="100vw"
            className="object-cover object-[65%_center]"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#8e0b13] via-[#8e0b13]/88 to-transparent lg:via-[#8e0b13]/70" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/10" />
        </div>

        <div className="relative mx-auto flex min-h-[690px] w-full max-w-7xl items-center px-5 py-20 sm:px-8 lg:min-h-[720px] lg:px-10">
          <div className="max-w-2xl">
            <div className="mb-6 inline-flex rotate-[-2deg] items-center gap-2 rounded-full bg-[#ffd33d] px-5 py-2 text-sm font-black uppercase tracking-[0.14em] text-[#711016] shadow-xl">
              <Sparkles className="h-4 w-4" />
              Juicy. Smoky. Sarap.
            </div>
            <p className="mb-3 text-base font-black uppercase tracking-[0.28em] text-[#ffd33d]">
              Signature favorite
            </p>
            <h1 className="max-w-xl text-6xl font-black uppercase leading-[0.86] tracking-[-0.065em] sm:text-7xl lg:text-[6.6rem]">
              Letson
              <span className="block text-[#ffd33d]">Manok</span>
            </h1>
            <p className="mt-7 max-w-lg text-lg font-semibold leading-8 text-white/90 sm:text-xl">
              Flame-roasted until golden, smoky on the outside, and wonderfully juicy inside. Made for sharing—if you want to.
            </p>
            <a
              href="#favorites"
              className="mt-9 inline-flex h-14 items-center gap-3 rounded-full bg-[#ffd33d] px-7 text-base font-black uppercase tracking-wide text-[#711016] shadow-2xl shadow-black/20 transition hover:-translate-y-1 hover:bg-white"
            >
              See our favorites
              <ArrowRight className="h-5 w-5" />
            </a>
          </div>
        </div>

        <div className="absolute -bottom-1 left-0 right-0 h-7 bg-[#fff8ea] [clip-path:polygon(0_70%,5%_25%,11%_70%,17%_20%,24%_67%,31%_18%,38%_70%,45%_22%,52%_68%,59%_16%,66%_70%,73%_22%,80%_65%,87%_18%,94%_68%,100%_24%,100%_100%,0_100%)]" />
      </section>

      <section id="favorites" className="relative mx-auto w-full max-w-7xl px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-[#b7191f]">Three crowd favorites</p>
          <h2 className="mt-3 text-4xl font-black uppercase tracking-[-0.045em] sm:text-6xl">
            Chicken worth craving
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-8 text-[#725448]">
            Crispy, buttery, roasted, and always served with big flavor.
          </p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {favorites.map((item, index) => (
            <article
              key={item.name}
              className="group overflow-hidden rounded-[2rem] border-2 border-black/10 bg-white shadow-[0_18px_50px_rgba(74,25,10,0.12)] transition hover:-translate-y-2"
            >
              <div className="relative aspect-[4/3] overflow-hidden">
                <Image
                  src={item.image}
                  alt={item.name}
                  fill
                  sizes="(max-width: 1024px) 100vw, 33vw"
                  className="object-cover transition duration-500 group-hover:scale-105"
                />
                <span className="absolute left-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-[#ffd33d] text-sm font-black text-[#711016] shadow-lg">
                  0{index + 1}
                </span>
              </div>
              <div className={`${item.accent} min-h-48 p-7 ${index === 1 ? "text-[#422400]" : "text-white"}`}>
                <h3 className="text-2xl font-black uppercase leading-tight tracking-[-0.03em]">
                  {item.name}
                </h3>
                <p className={`mt-3 leading-7 ${index === 1 ? "text-[#6a3a00]" : "text-white/80"}`}>
                  {item.description}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="about" className="relative overflow-hidden bg-[#ffd33d] py-20 text-[#521015]">
        <div className="absolute -left-24 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full border-[46px] border-[#b7191f]/10" />
        <div className="absolute -right-20 top-0 h-64 w-64 rounded-full bg-[#b7191f]/10" />
        <div className="relative mx-auto flex w-full max-w-5xl flex-col items-center px-5 text-center sm:px-8">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#b7191f] text-[#ffd33d] shadow-xl">
            <Flame className="h-8 w-8" />
          </span>
          <h2 className="mt-6 text-4xl font-black uppercase tracking-[-0.045em] sm:text-6xl">
            Made fresh. Served hot.
          </h2>
          <p className="mt-5 max-w-2xl text-lg font-semibold leading-8 text-[#6f2b26]">
            We make chicken the way cravings demand it: full of flavor, satisfying in every bite, and ready to bring people together.
          </p>
          <div className="mt-8 inline-flex items-center gap-2 rounded-full bg-white/70 px-5 py-3 text-sm font-black uppercase tracking-wide">
            <MapPin className="h-4 w-4 text-[#b7191f]" />
            ISAY Fried Chicken
          </div>
        </div>
      </section>

      <footer className="bg-[#24130c] text-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-5 py-9 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
          <div className="relative h-14 w-40 overflow-hidden rounded-xl bg-white px-2">
            <Image
              src="/landing/isay-logo.png"
              alt="ISAY Fried Chicken"
              fill
              sizes="160px"
              className="object-contain"
            />
          </div>
          <p className="text-sm text-white/55">© {new Date().getFullYear()} ISAY Fried Chicken. All rights reserved.</p>
          <Link href="/login" className="text-sm font-bold text-[#ffd33d] hover:text-white">
            Staff Login
          </Link>
        </div>
      </footer>
    </main>
  );
}
