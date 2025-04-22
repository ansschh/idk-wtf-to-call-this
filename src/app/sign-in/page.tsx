import { SignIn } from "@clerk/nextjs";
import Link from "next/link";

export default function SignInPage() {
  return (
    <div className="min-h-screen relative bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Top-right gradient blob */}
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-100 rounded-full blur-3xl opacity-30 animate-pulse" />
        {/* Bottom-left gradient blob */}
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-100 rounded-full blur-3xl opacity-30 animate-pulse" />
        {/* Floating dots */}
        <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-blue-400 rounded-full opacity-20" />
        <div className="absolute top-3/4 right-1/4 w-2 h-2 bg-indigo-400 rounded-full opacity-20" />
        <div className="absolute top-1/2 left-1/3 w-1 h-1 bg-blue-300 rounded-full opacity-20" />
      </div>

      <div className="relative w-full max-w-md px-4">
        {/* Logo centered at the top */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center justify-center group">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-500/25 group-hover:shadow-blue-500/40 transition-all duration-300 group-hover:scale-105">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" />
              </svg>
            </div>
          </Link>
        </div>

        {/* Welcome text */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center gap-2 px-3 py-1 rounded-full bg-white/80 backdrop-blur-sm border border-blue-100 text-blue-600 text-sm font-medium mb-3">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
            </svg>
            Welcome back to Kepler
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Sign in to your account</h1>
          <p className="text-gray-600">
            Join thousands of researchers using AI to accelerate their scientific writing
          </p>
        </div>

        {/* Clerk SignIn with enhanced styling */}
        <SignIn
          routing="path"
          path="/sign-in"
          signUpUrl="/sign-up"
          redirectUrl="/dashboard"
          appearance={{
            elements: {
              rootBox: "w-full",
              card: "bg-white/80 backdrop-blur-sm shadow-xl shadow-blue-500/5 rounded-2xl border border-gray-100",
              cardContent: "space-y-6 p-8",
              headerTitle: "hidden",
              headerSubtitle: "hidden",
              dividerLine: "bg-gradient-to-r from-transparent via-gray-200 to-transparent",
              dividerText: "text-gray-400 text-xs bg-white px-4",
              formFieldLabel: "text-gray-700 text-sm font-medium",
              formFieldInput: "bg-white/80 backdrop-blur-sm border border-gray-200 text-gray-900 text-sm rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 block w-full p-3 transition duration-200 ease-in-out",
              formButtonPrimary: "w-full text-white bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-xl text-sm px-5 py-3 text-center transition-all duration-200 ease-in-out shadow-md hover:shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40",
              socialButtonsBlockButton: "w-full border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-medium rounded-xl text-sm px-5 py-3 text-center transition-all duration-200 ease-in-out flex items-center justify-center gap-3 hover:shadow-md",
              socialButtonsProviderIcon: "h-5 w-5",
              footerActionText: "text-sm text-gray-500",
              footerActionLink: "text-blue-600 hover:text-blue-700 text-sm font-medium transition-colors duration-200",
              alert: "border rounded-xl p-4 my-4 bg-white/80 backdrop-blur-sm",
              alertText: "text-sm flex items-center gap-2",
              ".cl-alert--danger": "bg-red-50 border-red-100 text-red-700",
              ".cl-alert--warning": "bg-yellow-50 border-yellow-100 text-yellow-700",
            }
          }}
        />

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-400">
            Kepler - AI-powered scientific writing
          </p>
          <div className="flex items-center justify-center gap-6 mt-4">
            <Link href="/privacy" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Privacy</Link>
            <Link href="/terms" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Terms</Link>
            <Link href="/contact" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Contact</Link>
          </div>
        </div>
      </div>
    </div>
  );
}