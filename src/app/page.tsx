// app/page.tsx
"use client";

import React, { useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Command,
  Sparkles,
  FileText,
  Brain,
  Zap,
  ArrowRight,
  Check,
  Star,
  Users,
  Award,
  ChevronRight,
  Clock,
  FolderOpen,
  BookOpen,
  MessageSquare,
  PenTool,
  Database,
  Mail,
  ArrowUpRight,
  Coffee,
  Search,
  Download,
  Laptop
} from "lucide-react";

export default function LandingPage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && user) {
      router.push("/dashboard");
    }
  }, [isLoaded, user, router]);

  return (
    <>
      {/* Font preconnect */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="anonymous"
      />
      <link
        href="https://fonts.googleapis.com/css2?family=Montserrat:wght@100;200;300;400;500;600;700;800;900&display=swap"
        rel="stylesheet"
      />
      <link href="./styles/global.css" rel="stylesheet" />

      {/* Custom styles */}
      <style jsx global>{`
        @keyframes moveAround {
          0% { transform: translate(-50%, -50%) }
          25% { transform: translate(-40%, -60%) }
          50% { transform: translate(-60%, -40%) }
          75% { transform: translate(-30%, -50%) }
          100% { transform: translate(-50%, -50%) }
        }
        @keyframes gridMove {
          0% { background-position: 0px 0px; }
          100% { background-position: 100px 100px; }
        }
        @keyframes float {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
          100% { transform: translateY(0px); }
        }
        @keyframes pulse {
          0% { opacity: 0.5; }
          50% { opacity: 0.8; }
          100% { opacity: 0.5; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes shine {
          0% { transform: translateX(-100%) rotate(-25deg); }
          100% { transform: translateX(100%) rotate(-25deg); }
        }
        @keyframes gradientBg {
          0% { background-position: 0% 50% }
          50% { background-position: 100% 50% }
          100% { background-position: 0% 50% }
        }
        * { font-family: 'Montserrat', sans-serif; }
        .montserrat-light { font-weight: 300; }
        .montserrat-body { font-weight: 400; }
        .montserrat-heading { font-weight: 700; }
        .glass-morphism {
          backdrop-filter: blur(12px);
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        }
        .btn-shine { position: relative; overflow: hidden; }
        .btn-shine::before {
          content: '';
          position: absolute; top: 0; width: 100%; height: 100%;
          background: linear-gradient(120deg, transparent, rgba(255,255,255,0.2), transparent);
          animation: shine 3s infinite linear;
        }
        .btn-glow:hover {
          box-shadow: 0 0 25px rgba(99, 102, 241, 0.7);
        }
        .animated-gradient-border { position: relative; z-index: 0; }
        .animated-gradient-border::before {
          content: '';
          position: absolute; z-index: -1; inset: -2px;
          border-radius: 1rem;
          background: linear-gradient(45deg, #3b82f6, #6366f1, #8b5cf6, #3b82f6);
          background-size: 400% 400%;
          opacity: 0;
          transition: opacity 0.3s ease;
          animation: gradientBg 8s ease infinite;
        }
        .animated-gradient-border:hover::before {
          opacity: 1;
        }
        .moving-grid {
          background-size: 50px 50px;
          background-image:
            linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px);
          animation: gridMove 20s linear infinite;
        }
      `}</style>

      <div className="min-h-screen bg-[#06071b] text-white overflow-hidden relative">
        {/* Background Elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute inset-0 moving-grid opacity-20"></div>
          <div
            className="glow-orb absolute w-[1200px] h-[1200px] rounded-full blur-[150px] opacity-20"
            style={{
              background:
                "radial-gradient(circle at center, rgba(59, 130, 246, 0.6), transparent 70%)",
              left: "60%",
              top: "10%",
              transform: "translate(-50%, -50%)",
              animation: "moveAround 20s ease-in-out infinite",
            }}
          />
          <div
            className="glow-orb absolute w-[1000px] h-[1000px] rounded-full blur-[150px] opacity-15"
            style={{
              background:
                "radial-gradient(circle at center, rgba(99, 102, 241, 0.5), transparent 70%)",
              left: "-20%",
              top: "40%",
              transform: "translate(-50%, -50%)",
              animation: "moveAround 25s ease-in-out infinite reverse",
            }}
          />
          <div
            className="glow-orb absolute w-[800px] h-[800px] rounded-full blur-[150px] opacity-15"
            style={{
              background:
                "radial-gradient(circle at center, rgba(168, 85, 247, 0.5), transparent 70%)",
              right: "-10%",
              top: "60%",
              transform: "translate(50%, -50%)",
              animation: "moveAround 30s ease-in-out infinite",
            }}
          />
          <div className="absolute top-[20%] left-[15%] opacity-30 animate-pulse">
            <div className="w-24 h-24 rounded-full border border-blue-400/20"></div>
          </div>
          <div
            className="absolute bottom-[30%] right-[25%] opacity-20"
            style={{ animation: "float 8s ease-in-out infinite" }}
          >
            <div className="w-40 h-40 rounded-full border-2 border-indigo-500/20"></div>
          </div>
          <div
            className="absolute top-[60%] left-[75%] opacity-20"
            style={{ animation: "float 12s ease-in-out infinite" }}
          >
            <div className="w-32 h-32 rounded-full border border-purple-500/20"></div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 glass-morphism rounded-full w-[95%] max-w-6xl mx-auto shadow-xl">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <Link href="/" className="flex items-center space-x-2 group">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center transform transition-all duration-300 group-hover:scale-110 group-hover:rotate-3 shadow-lg shadow-blue-500/25">
                  <Command className="h-5 w-5 text-white" />
                </div>
                <span className="text-xl montserrat-heading bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
                  Kepler
                </span>
              </Link>

              {/* Links */}
              <div className="hidden lg:flex items-center space-x-2">
                {[
                  { name: "Features", icon: Sparkles },
                  { name: "How It Works", icon: Laptop },
                  { name: "Pricing", icon: Award },
                  { name: "Resources", icon: BookOpen },
                  { name: "Blog", icon: PenTool },
                ].map((item) => (
                  <Link
                    key={item.name}
                    href={`#${item.name.toLowerCase().replace(/\s+/g, "-")}`}
                    className="px-4 py-2 text-sm text-white/80 hover:text-white rounded-full transition-all duration-300 hover:bg-white/10 border border-white/5 bg-white/[0.02] flex items-center space-x-1.5 backdrop-blur-md group hover:scale-105"
                  >
                    <item.icon className="h-3.5 w-3.5 text-blue-400 group-hover:text-blue-300 transition-colors" />
                    <span>{item.name}</span>
                  </Link>
                ))}
              </div>

              <div className="flex items-center space-x-3">
                <Link
                  href="/sign-in"
                  className="px-5 py-2.5 text-sm text-white/90 hover:text-white transition-all duration-300 rounded-full hover:bg-white/10 hover:scale-105 backdrop-blur-sm border border-white/10 bg-white/[0.02] animated-gradient-border"
                >
                  <span className="flex items-center">
                    <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                    Log In
                  </span>
                </Link>
                <Link
                  href="/sign-up"
                  className="px-5 py-2.5 text-sm bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-full transition-all duration-300 hover:from-blue-600 hover:to-indigo-700 hover:scale-105 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 btn-glow btn-shine flex items-center"
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  Start Free Trial
                </Link>
              </div>
            </div>
          </div>
        </nav>

        {/* Hero */}
        <div className="relative pt-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-32">
            <div className="flex justify-center mb-8">
              <div className="inline-flex items-center px-4 py-2 rounded-full bg-gradient-to-r from-blue-500/10 to-indigo-600/10 backdrop-blur-sm border border-white/10 text-sm hover:bg-white/10 transition-colors cursor-pointer group">
                <Sparkles className="h-4 w-4 mr-2 text-blue-400" />
                <span>Just Released: AI-Powered Citation Generator</span>
                <ChevronRight className="h-4 w-4 ml-2 text-white/70 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
            <div className="text-center mb-16">
              <h1 className="text-6xl sm:text-7xl montserrat-heading mb-6 bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 text-transparent bg-clip-text leading-tight relative z-10">
                Your Scientific Writing
                <br />
                <span className="relative">
                  Assistant
                  <svg
                    className="absolute -bottom-2 left-0 w-full"
                    viewBox="0 0 300 15"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M0,7 Q150,-7 300,7"
                      stroke="url(#gradient)"
                      strokeWidth="3"
                      fill="none"
                      strokeLinecap="round"
                    />
                    <defs>
                      <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#3b82f6" />
                        <stop offset="50%" stopColor="#6366f1" />
                        <stop offset="100%" stopColor="#8b5cf6" />
                      </linearGradient>
                    </defs>
                  </svg>
                </span>
              </h1>
              <p className="text-xl text-gray-300 max-w-2xl mx-auto mb-8 montserrat-light leading-relaxed">
                Kepler combines AI-powered LaTeX editing with smart features to help researchers write better papers faster. Get suggestions, automate formatting, and focus on what matters.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4">
                <Link
                  href="/sign-up"
                  className="group w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all hover:scale-105 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 relative overflow-hidden btn-glow"
                >
                  <span className="absolute inset-0 w-full h-full bg-gradient-to-r from-white/20 to-transparent transform -skew-x-12 transition-all duration-500 opacity-0 group-hover:opacity-100 group-hover:animate-shine"></span>
                  <span className="flex items-center justify-center relative z-10">
                    Start Writing for Free
                    <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </span>
                </Link>
                <Link
                  href="#demo"
                  className="group w-full sm:w-auto px-8 py-4 bg-white/5 rounded-xl hover:bg-white/10 transition-all backdrop-blur-sm border border-white/10 animated-gradient-border relative overflow-hidden"
                >
                  <span className="flex items-center justify-center">
                    Watch Demo
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 ml-2 text-blue-400 group-hover:text-blue-300 transition-colors"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </span>
                </Link>
              </div>
              <div className="mt-12 flex flex-wrap items-center justify-center gap-4 sm:gap-8">
                <div className="flex items-center px-4 py-2 bg-white/5 rounded-full backdrop-blur-sm">
                  <Star className="h-5 w-5 text-yellow-400" />
                  <span className="ml-2 text-white/70">4.9/5 Rating (2,800+ reviews)</span>
                </div>
                <div className="flex items-center px-4 py-2 bg-white/5 rounded-full backdrop-blur-sm">
                  <Users className="h-5 w-5 text-blue-400" />
                  <span className="ml-2 text-white/70">10K+ Active Researchers</span>
                </div>
                <div className="flex items-center px-4 py-2 bg-white/5 rounded-full backdrop-blur-sm">
                  <Award className="h-5 w-5 text-purple-400" />
                  <span className="ml-2 text-white/70">Best AI Tool 2024</span>
                </div>
              </div>
              <div className="mt-16">
                <p className="text-sm text-gray-500 mb-6">TRUSTED BY RESEARCHERS FROM</p>
                <div className="flex flex-wrap justify-center items-center gap-8">
                  {[
                    "MIT",
                    "Stanford",
                    "Berkeley",
                    "Oxford",
                    "Cambridge",
                    "ETH Zurich",
                  ].map((univ) => (
                    <div
                      key={univ}
                      className="text-gray-400 opacity-70 hover:opacity-100 transition-opacity"
                    >
                      <span className="text-lg font-semibold">{univ}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Features Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto" id="features">
              <div className="md:col-span-3 text-center mb-8">
                <h2 className="text-4xl montserrat-heading mb-4 bg-gradient-to-r from-blue-400 to-indigo-400 text-transparent bg-clip-text">
                  Powerful Features for Researchers
                </h2>
                <p className="text-gray-300 montserrat-light max-w-2xl mx-auto">
                  Everything you need to write better scientific papers in record time
                </p>
              </div>
              {[
                {
                  icon: FileText,
                  title: "Smart LaTeX Editor",
                  description:
                    "Intelligent suggestions and real-time previews make writing LaTeX effortless. Autocomplete for commands, equations, and citations.",
                },
                {
                  icon: Brain,
                  title: "AI Writing Assistant",
                  description:
                    "Get intelligent suggestions for citations, equations, and improvements. Let AI help you refine your academic prose.",
                },
                {
                  icon: Zap,
                  title: "Instant Formatting",
                  description:
                    "Automatically format your paper according to any journal's requirements. One-click export to any template or citation style.",
                },
                {
                  icon: MessageSquare,
                  title: "Collaborative Editing",
                  description:
                    "Work seamlessly with co-authors in real-time. Add comments, suggest changes, and resolve feedback all in one place.",
                },
                {
                  icon: Database,
                  title: "Reference Management",
                  description:
                    "Import and organize your references from Zotero, Mendeley, or BibTeX. Automatically format citations as you write.",
                },
                {
                  icon: PenTool,
                  title: "Figure Creation",
                  description:
                    "Create beautiful scientific figures with our integrated drawing tools. Generate data visualizations from your datasets.",
                },
              ].map((feature, i) => (
                <div
                  key={feature.title}
                  className="group p-6 rounded-2xl backdrop-blur-md bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-white/10 transition-all duration-500 shadow-2xl shadow-black/20 relative overflow-hidden animated-gradient-border"
                  style={{ animation: `float ${8 + i}s ease-in-out infinite` }}
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
                  <div className="w-12 h-12 bg-gradient-to-br from-white/[0.05] to-white/[0.02] rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform border border-white/5">
                    <feature.icon className="h-6 w-6 text-blue-400" />
                  </div>
                  <h3 className="text-xl montserrat-heading mb-2">{feature.title}</h3>
                  <p className="text-gray-400 montserrat-light">{feature.description}</p>
                </div>
              ))}
            </div>

            {/* How It Works */}
            <div className="mt-32 max-w-5xl mx-auto" id="how-it-works">
              <div className="text-center mb-16">
                <h2 className="text-4xl montserrat-heading mb-4 bg-gradient-to-r from-blue-400 to-indigo-400 text-transparent bg-clip-text">
                  How Kepler Works
                </h2>
                <p className="text-gray-400 montserrat-light max-w-2xl mx-auto">
                  Experience a seamless workflow that boosts your productivity and enhances your writing
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {[
                  {
                    step: "01",
                    title: "Start Your Document",
                    description:
                      "Begin from scratch or import existing LaTeX files. Choose from journal-specific templates to get started quickly.",
                    icon: FileText,
                  },
                  {
                    step: "02",
                    title: "Write with AI Assistance",
                    description:
                      "Let our AI suggest improvements, help with equations, and offer real-time assistance as you write.",
                    icon: Brain,
                  },
                  {
                    step: "03",
                    title: "Export & Submit",
                    description:
                      "Format according to journal requirements with one click and export your ready-to-submit manuscript.",
                    icon: ArrowUpRight,
                  },
                ].map((step, i) => (
                  <div key={step.step} className="relative">
                    <div className="p-8 rounded-2xl backdrop-blur-md bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] transition-all duration-500 relative overflow-hidden shadow-lg shadow-black/10 h-full">
                      <div className="absolute -top-2 -left-2 w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-lg z-10">
                        {step.step}
                      </div>
                      <div className="pt-6 pb-4">
                        <div className="mb-6 flex justify-center">
                          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500/10 to-indigo-600/10 flex items-center justify-center">
                            <step.icon className="h-7 w-7 text-blue-400" />
                          </div>
                        </div>
                        <h3 className="text-xl montserrat-heading mb-3 text-center">{step.title}</h3>
                        <p className="text-gray-400 montserrat-light text-center leading-relaxed">{step.description}</p>
                      </div>
                    </div>
                    {i < 2 && (
                      <div className="hidden md:block absolute top-1/2 -right-4 transform -translate-y-1/2 z-10">
                        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M20 5L35 20L20 35" stroke="rgba(99, 102, 241, 0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Testimonials */}
            <div className="mt-32 max-w-5xl mx-auto" id="testimonials">
              <div className="text-center mb-16">
                <h2 className="text-4xl montserrat-heading mb-4 bg-gradient-to-r from-blue-400 to-indigo-400 text-transparent bg-clip-text">
                  What Researchers Are Saying
                </h2>
                <p className="text-gray-400 montserrat-light max-w-2xl mx-auto">
                  Join thousands of scientists who have transformed their writing process with Kepler
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {[
                  {
                    quote:
                      "Kepler has completely transformed my paper writing process. The AI suggestions are incredibly helpful, and the LaTeX formatting is flawless.",
                    author: "Dr. Sarah Chen",
                    position: "Professor of Physics, MIT",
                    rating: 5,
                  },
                  {
                    quote:
                      "As a PhD student, I was struggling with LaTeX formatting for my thesis. Kepler not only made it easy but also improved my scientific writing substantially.",
                    author: "Michael Rodriguez",
                    position: "PhD Candidate, Stanford University",
                    rating: 5,
                  },
                  {
                    quote:
                      "The collaborative features allow our research team to work efficiently on papers, even when we're in different time zones. Game changer!",
                    author: "Dr. Emma Thompson",
                    position: "Senior Researcher, Oxford University",
                    rating: 5,
                  },
                  {
                    quote:
                      "I've tried many LaTeX editors before, but Kepler's AI assistant and citation management tools save me hours of work on every paper.",
                    author: "Prof. Hiroshi Tanaka",
                    position: "Department of Computer Science, University of Tokyo",
                    rating: 5,
                  },
                ].map((testimonial, i) => (
                  <div
                    key={i}
                    className="p-6 rounded-2xl backdrop-blur-md bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-white/10 transition-all duration-500 shadow-2xl shadow-black/20 relative overflow-hidden"
                  >
                    <div className="mb-4">
                      {Array(testimonial.rating)
                        .fill(0)
                        .map((_, j) => (
                          <Star key={j} className="inline-block h-4 w-4 text-yellow-400" />
                        ))}
                    </div>
                    <p className="text-gray-300 italic mb-6">"{testimonial.quote}"</p>
                    <div className="flex items-center">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                        <span className="text-white font-bold">{testimonial.author.charAt(0)}</span>
                      </div>
                      <div className="ml-3">
                        <h4 className="text-white montserrat-heading text-sm">{testimonial.author}</h4>
                        <p className="text-gray-400 text-xs">{testimonial.position}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pricing */}
            <div className="mt-32 max-w-5xl mx-auto" id="pricing">
              <div className="text-center mb-16">
                <h2 className="text-4xl montserrat-heading mb-4 bg-gradient-to-r from-blue-400 to-indigo-400 text-transparent bg-clip-text">
                  Simple, Transparent Pricing
                </h2>
                <p className="text-gray-400 montserrat-light max-w-2xl mx-auto">
                  Choose the plan that fits your needs. All plans include core LaTeX editing features.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {[
                  {
                    name: "Free",
                    price: "$0",
                    period: "forever",
                    description: "Perfect for occasional writers",
                    features: [
                      "Basic LaTeX editing",
                      "Real-time preview",
                      "Standard templates",
                      "1 GB storage",
                      "Community support",
                    ],
                    buttonText: "Get Started",
                    buttonStyle: "border border-white/10 bg-white/5 hover:bg-white/10",
                    popular: false,
                  },
                  {
                    name: "Pro",
                    price: "$12",
                    period: "per month",
                    description: "Ideal for serious researchers",
                    features: [
                      "Everything in Free",
                      "Advanced AI writing assistant",
                      "Citation management",
                      "10 GB storage",
                      "Collaborative editing",
                      "Priority support",
                    ],
                    buttonText: "Start 14-Day Trial",
                    buttonStyle:
                      "bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700",
                    popular: true,
                  },
                  {
                    name: "Team",
                    price: "$29",
                    period: "per month",
                    description: "For research groups & labs",
                    features: [
                      "Everything in Pro",
                      "Unlimited collaborators",
                      "Team templates",
                      "Advanced permissions",
                      "50 GB storage",
                      "Dedicated support",
                      "Admin controls",
                    ],
                    buttonText: "Contact Sales",
                    buttonStyle: "border border-white/10 bg-white/5 hover:bg-white/10",
                    popular: false,
                  },
                ].map((plan, i) => (
                  <div
                    key={plan.name}
                    className={`p-6 rounded-2xl backdrop-blur-md bg-white/[0.02] border ${
                      plan.popular ? "border-blue-500/50" : "border-white/5"
                    } transition-all duration-500 shadow-2xl shadow-black/20 relative overflow-hidden ${
                      plan.popular
                        ? "scale-105 bg-white/[0.03]"
                        : "hover:bg-white/[0.05] hover:border-white/10"
                    }`}
                  >
                    {plan.popular && (
                      <div className="absolute top-0 right-0">
                        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-xs text-white px-3 py-1 rounded-bl-lg rounded-tr-lg font-medium">
                          Most Popular
                        </div>
                      </div>
                    )}
                    <h3 className="text-xl montserrat-heading mb-2">{plan.name}</h3>
                    <div className="flex items-end mb-4">
                      <span className="text-4xl montserrat-heading">{plan.price}</span>
                      <span className="text-gray-400 ml-1 mb-1">{plan.period}</span>
                    </div>
                    <p className="text-gray-400 montserrat-light mb-6">{plan.description}</p>
                    <ul className="space-y-3 mb-8">
                      {plan.features.map((feat, idx) => (
                        <li key={idx} className="flex items-start">
                          <Check className="h-5 w-5 text-green-400 mr-2 flex-shrink-0 mt-0.5" />
                          <span className="text-gray-300">{feat}</span>
                        </li>
                      ))}
                    </ul>
                    <Link
                      href={
                        plan.popular
                          ? "/sign-up"
                          : plan.name === "Free"
                          ? "/sign-up"
                          : "#contact"
                      }
                      className={`w-full py-3 rounded-xl text-center text-white transition-all hover:scale-105 shadow-lg shadow-black/10 flex items-center justify-center ${plan.buttonStyle}`}
                    >
                      {plan.buttonText}
                    </Link>
                  </div>
                ))}
              </div>
            </div>

            {/* FAQs */}
            <div className="mt-32 max-w-4xl mx-auto" id="faq">
              <div className="text-center mb-16">
                <h2 className="text-4xl montserrat-heading mb-4 bg-gradient-to-r from-blue-400 to-indigo-400 text-transparent bg-clip-text">
                  Frequently Asked Questions
                </h2>
                <p className="text-gray-400 montserrat-light max-w-2xl mx-auto">
                  Find answers to common questions about Kepler
                </p>
              </div>
              <div className="space-y-6">
                {[
                  {
                    question: "Does Kepler support all LaTeX packages?",
                    answer:
                      "Yes, Kepler supports all standard LaTeX packages and most specialized ones. If you need a specific package that isn't supported, our team can add it quickly.",
                  },
                  {
                    question: "How does the AI writing assistant work?",
                    answer:
                      "Our AI assistant analyzes your text in real-time, offering suggestions to improve clarity, fix grammar issues, enhance scientific language, and ensure consistency. It also helps with equations, citations, and can generate content based on your instructions.",
                  },
                  {
                    question: "Can I collaborate with others who don't have a Kepler account?",
                    answer:
                      "Yes, you can invite collaborators via email, and they can view and comment on your documents even without an account. For full editing capabilities, they would need to sign up for a free account.",
                  },
                  {
                    question: "Is my data secure and private?",
                    answer:
                      "Absolutely. We employ industry-standard encryption for all your data. Your documents are private by default, and we never use your content to train our AI models without explicit permission.",
                  },
                ].map((faq, i) => (
                  <div
                    key={i}
                    className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-white/10 transition-all duration-500 shadow-lg shadow-black/10"
                  >
                    <h3 className="text-xl montserrat-heading mb-3 text-white/90">
                      {faq.question}
                    </h3>
                    <p className="text-gray-400 montserrat-light">{faq.answer}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA */}
            <div className="mt-32 max-w-4xl mx-auto">
              <div className="p-8 md:p-12 rounded-3xl bg-gradient-to-r from-blue-500/20 to-indigo-600/20 border border-white/10 backdrop-blur-md relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl"></div>
                <div className="absolute bottom-0 left-0 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl"></div>
                <div className="relative z-10">
                  <div className="text-center md:text-left">
                    <h2 className="text-3xl md:text-4xl montserrat-heading mb-4 bg-gradient-to-r from-white to-white/80 text-transparent bg-clip-text">
                      Ready to Transform Your Scientific Writing?
                    </h2>
                    <p className="text-xl text-gray-300 mb-8 montserrat-light max-w-2xl">
                      Join thousands of researchers who are writing better papers in half the time. Start your free trial today and see the difference.
                    </p>
                  </div>
                  <div className="flex flex-col md:flex-row items-center justify-center md:justify-start space-y-4 md:space-y-0 md:space-x-4">
                    <Link
                      href="/sign-up"
                      className="w-full md:w-auto px-8 py-4 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all hover:scale-105 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 btn-glow btn-shine"
                    >
                      <span className="flex items-center justify-center">
                        <Sparkles className="mr-2 h-5 w-5" />
                        Start Free 14-Day Trial
                      </span>
                    </Link>
                    <Link
                      href="#demo"
                      className="w-full md:w-auto px-8 py-4 bg-white/5 rounded-xl hover:bg-white/10 transition-all backdrop-blur-sm border border-white/10 animated-gradient-border"
                    >
                      <span className="flex items-center justify-center">
                        <Coffee className="mr-2 h-5 w-5 text-blue-400" />
                        Schedule Demo
                      </span>
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {/* Newsletter */}
            <div className="mt-24 max-w-4xl mx-auto">
              <div className="p-8 rounded-2xl backdrop-blur-md bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] transition-all duration-500 shadow-lg shadow-black/10">
                <div className="text-center mb-8">
                  <h2 className="text-2xl montserrat-heading mb-4 text-white/90">
                    Stay Updated with Research Trends
                  </h2>
                  <p className="text-gray-400 montserrat-light">
                    Get monthly tips, writing advice, and scientific news in your inbox
                  </p>
                </div>
                <div className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4">
                  <div className="flex-grow">
                    <input
                      type="email"
                      placeholder="Your email address"
                      className="w-full px-5 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent text-white"
                    />
                  </div>
                  <button className="px-6 py-3 bg-blue-500 hover:bg-blue-600 rounded-lg transition-all hover:scale-105 shadow-lg shadow-blue-500/25">
                    <span className="flex items-center justify-center">
                      <Mail className="mr-2 h-5 w-5" />
                      Subscribe
                    </span>
                  </button>
                </div>
                <div className="mt-4 text-center">
                  <p className="text-xs text-gray-500">
                    We respect your privacy. Unsubscribe at any time.
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <footer className="mt-32 pb-12">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
                  {[
                    { heading: "Product", items: ["Features", "Pricing", "Templates", "Examples", "Integrations"] },
                    { heading: "Resources", items: ["Documentation", "Guides", "API Reference", "Blog", "Tutorials"] },
                    { heading: "Company", items: ["About", "Team", "Careers", "Contact", "Press Kit"] },
                    { heading: "Legal", items: ["Terms", "Privacy", "Cookies", "Licenses", "Settings"] },
                  ].map((section) => (
                    <div key={section.heading}>
                      <h3 className="text-white montserrat-heading mb-4 text-lg">{section.heading}</h3>
                      <ul className="space-y-2">
                        {section.items.map((item) => (
                          <li key={item}>
                            <Link href={`#${item.toLowerCase()}`} className="text-gray-400 hover:text-white transition-colors">
                              {item}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center">
                  <Link href="/" className="flex items-center space-x-2 group mb-4 md:mb-0">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center transform transition-all duration-300 group-hover:scale-110 group-hover:rotate-3">
                      <Command className="h-4 w-4 text-white" />
                    </div>
                    <span className="text-lg montserrat-heading bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
                      Kepler
                    </span>
                  </Link>
                  <div className="flex items-center space-x-6">
                    {["Twitter", "GitHub", "LinkedIn", "YouTube"].map((social) => (
                      <Link key={social} href={`#${social.toLowerCase()}`} className="text-gray-400 hover:text-white transition-colors">
                        {social}
                      </Link>
                    ))}
                  </div>
                </div>
                <div className="mt-8 text-center text-gray-500 text-sm">
                  <p>&copy; {new Date().getFullYear()} Kepler AI. All rights reserved.</p>
                </div>
              </div>
            </footer>
          </div>
        </div>

        {/* Loading State */}
        {isLoaded && user && (
          <div className="fixed inset-0 bg-[#06071b] bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="text-center p-8 rounded-xl glass-morphism">
              <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
              <p className="text-xl text-white/80">Redirecting to your dashboard...</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
