// app/page.tsx
"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect } from "react";
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
  FolderOpen
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
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link href="./styles/global.css" rel="stylesheet" />

      <div className="min-h-screen bg-[#06071b] text-white overflow-hidden relative montserrat-body">
        {/* Background Elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {/* Moving Orbs */}
          <div className="glow-orb absolute w-[1000px] h-[1000px] rounded-full blur-3xl opacity-[0.15]" 
            style={{
              background: 'radial-gradient(circle at center, rgba(59, 130, 246, 0.3), transparent 70%)',
              left: '60%',
              top: '10%',
              transform: 'translate(-50%, -50%)',
              animation: 'moveAround 20s ease-in-out infinite'
            }}
          />
          <div className="glow-orb absolute w-[800px] h-[800px] rounded-full blur-3xl opacity-[0.12]"
            style={{
              background: 'radial-gradient(circle at center, rgba(99, 102, 241, 0.25), transparent 70%)',
              left: '-20%',
              top: '40%',
              transform: 'translate(-50%, -50%)',
              animation: 'moveAround 25s ease-in-out infinite reverse'
            }}
          />
          <div className="glow-orb absolute w-[600px] h-[600px] rounded-full blur-3xl opacity-[0.12]"
            style={{
              background: 'radial-gradient(circle at center, rgba(168, 85, 247, 0.25), transparent 70%)',
              right: '-10%',
              top: '60%',
              transform: 'translate(50%, -50%)',
              animation: 'moveAround 30s ease-in-out infinite'
            }}
          />

          {/* Grid Pattern */}
          <div className="absolute inset-0">
            <div className="absolute inset-0 opacity-[0.07]"
              style={{
                backgroundSize: '50px 50px',
                backgroundImage: 'linear-gradient(to right, rgba(255, 255, 255, 0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(255, 255, 255, 0.05) 1px, transparent 1px)'
              }}
            />
          </div>
        </div>

        {/* Navigation */}
        <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 backdrop-blur-md bg-white/[0.02]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-20">
              <Link href="/" className="flex items-center space-x-2 group">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center transform transition-all duration-300 group-hover:scale-110 group-hover:rotate-3">
                  <Command className="h-5 w-5 text-white" />
                </div>
                <span className="text-xl montserrat-heading bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">Kepler</span>
              </Link>
              
              {/* Navigation Links */}
              <div className="hidden md:flex items-center space-x-2">
                {['Features', 'Pricing', 'About', 'Documentation'].map((item) => (
                  <Link
                    key={item}
                    href={`#${item.toLowerCase()}`}
                    className="px-4 py-2 text-sm text-white/80 hover:text-white rounded-lg transition-all duration-300 hover:bg-white/10 backdrop-blur-sm border border-white/5 bg-white/[0.02]"
                  >
                    {item}
                  </Link>
                ))}
              </div>

              <div className="flex items-center space-x-3">
                <Link 
                  href="/sign-in" 
                  className="px-5 py-2.5 text-sm text-white/90 hover:text-white transition-all duration-300 rounded-lg hover:bg-white/10 backdrop-blur-sm border border-white/5 bg-white/[0.02]"
                >
                  Log In
                </Link>
                <Link 
                  href="/sign-up" 
                  className="px-5 py-2.5 text-sm bg-white/10 text-white rounded-lg transition-all duration-300 hover:bg-white/20 backdrop-blur-sm border border-white/10 bg-gradient-to-r from-white/[0.05] to-white/[0.02] hover:border-white/20 shadow-xl shadow-black/20"
                >
                  Sign Up
                </Link>
              </div>
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <div className="relative pt-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-32">
            {/* Announcement Banner */}
            <div className="flex justify-center mb-8">
              <div className="inline-flex items-center px-4 py-2 rounded-full bg-white/5 backdrop-blur-sm border border-white/10 text-sm hover:bg-white/10 transition-colors cursor-pointer group">
                <Sparkles className="h-4 w-4 mr-2 text-blue-400" />
                <span>Introducing AI-Powered Scientific Writing</span>
                <ChevronRight className="h-4 w-4 ml-2 text-white/70 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            {/* Main Hero Content */}
            <div className="text-center mb-16">
              <h1 className="text-6xl montserrat-heading mb-6 bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 text-transparent bg-clip-text leading-tight">
                Your Scientific Writing
                <br />
                Assistant
              </h1>
              <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-8 montserrat-light leading-relaxed">
                Kepler is an AI-powered LaTeX editor that helps researchers write better papers faster. Get suggestions, automate formatting, and focus on what matters.
              </p>
              <div className="flex items-center justify-center space-x-4">
                <Link 
                  href="/sign-up" 
                  className="group px-8 py-4 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all hover:scale-105 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40"
                >
                  <span className="flex items-center">
                    Start Writing for Free
                    <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </span>
                </Link>
                <Link 
                  href="#features" 
                  className="px-8 py-4 bg-white/5 rounded-xl hover:bg-white/10 transition-all backdrop-blur-sm border border-white/10"
                >
                  Learn More
                </Link>
              </div>

              {/* Social Proof */}
              <div className="mt-12 flex items-center justify-center space-x-8">
                <div className="flex items-center">
                  <Star className="h-5 w-5 text-yellow-400" />
                  <span className="ml-2 text-white/70">4.9/5 Rating</span>
                </div>
                <div className="flex items-center">
                  <Users className="h-5 w-5 text-blue-400" />
                  <span className="ml-2 text-white/70">10K+ Users</span>
                </div>
                <div className="flex items-center">
                  <Award className="h-5 w-5 text-purple-400" />
                  <span className="ml-2 text-white/70">Best AI Tool 2024</span>
                </div>
              </div>
            </div>

            {/* Features Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {[
                {
                  icon: FileText,
                  title: "Smart LaTeX Editor",
                  description: "Intelligent suggestions and real-time previews make writing LaTeX effortless."
                },
                {
                  icon: Brain,
                  title: "AI Assistant",
                  description: "Get intelligent suggestions for citations, equations, and improvements to your writing."
                },
                {
                  icon: Zap,
                  title: "Instant Formatting",
                  description: "Automatically format your paper according to any journal's requirements."
                }
              ].map((feature, i) => (
                <div 
                  key={i}
                  className="group p-6 rounded-2xl backdrop-blur-md bg-white/[0.02] border border-white/5
                    hover:bg-white/[0.05] hover:border-white/10 transition-all duration-500
                    shadow-2xl shadow-black/20"
                >
                  <div className="w-12 h-12 bg-gradient-to-br from-white/[0.05] to-white/[0.02] rounded-xl 
                    flex items-center justify-center mb-4 group-hover:scale-110 transition-transform
                    border border-white/5">
                    <feature.icon className="h-6 w-6 text-blue-400" />
                  </div>
                  <h3 className="text-xl montserrat-heading mb-2">{feature.title}</h3>
                  <p className="text-gray-400 montserrat-light">{feature.description}</p>
                </div>
              ))}
            </div>

            {/* Benefits Section */}
            <div className="mt-32 max-w-5xl mx-auto">
              <div className="text-center mb-16">
                <h2 className="text-4xl montserrat-heading mb-4 text-blue-400">
                  Why Choose Kepler?
                </h2>
                <p className="text-gray-400 montserrat-light max-w-2xl mx-auto">
                  Join thousands of researchers who are already using Kepler to streamline their scientific writing process.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  {
                    title: "Save Time",
                    description: "Reduce writing time by up to 40% with AI-powered suggestions and automated formatting.",
                    icon: Clock
                  },
                  {
                    title: "Improve Quality",
                    description: "Get real-time feedback on your writing and ensure your papers meet journal standards.",
                    icon: Star
                  },
                  {
                    title: "Collaborate Easily",
                    description: "Work seamlessly with co-authors using our real-time collaboration features.",
                    icon: Users
                  },
                  {
                    title: "Stay Organized",
                    description: "Keep all your research papers and references organized in one place.",
                    icon: FolderOpen
                  }
                ].map((benefit, i) => (
                  <div 
                    key={i} 
                    className="group relative p-6 rounded-2xl transition-all duration-500
                      backdrop-blur-md bg-white/[0.02] border border-white/5
                      hover:bg-white/[0.05] hover:border-white/10
                      shadow-2xl shadow-black/20"
                  >
                    {/* Glow Effect */}
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    
                    <div className="relative flex items-start space-x-4">
                      <div className="flex-shrink-0 p-2 rounded-lg bg-gradient-to-br from-white/[0.05] to-white/[0.02] border border-white/5">
                        <Check className="h-6 w-6 text-green-400" />
                      </div>
                      <div>
                        <h3 className="text-lg montserrat-heading mb-2 text-white/90">{benefit.title}</h3>
                        <p className="text-gray-400 montserrat-light leading-relaxed">{benefit.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {isLoaded && user && (
          <div className="fixed inset-0 bg-[#06071b] bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-gray-400">Redirecting to your dashboard...</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}