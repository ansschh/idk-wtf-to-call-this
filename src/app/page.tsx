"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect } from "react";

export default function LandingPage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();

  // Redirect to dashboard if logged in
  useEffect(() => {
    if (isLoaded && user) {
      router.push("/dashboard");
    }
  }, [isLoaded, user, router]);

  return (
    <main className="flex flex-col items-center justify-center h-screen">
      <h1 className="text-4xl font-bold">Welcome to LaTeX Scholar</h1>
      {isLoaded && !user && (
        <p className="mt-4">
          <Link href="/sign-in" className="text-teal-600 underline">
            Sign in
          </Link>{" "}
          or{" "}
          <Link href="/sign-up" className="text-teal-600 underline">
            Sign up
          </Link>
        </p>
      )}
      {isLoaded && user && (
        <p className="mt-4">
          Redirecting to your dashboard...
        </p>
      )}
    </main>
  );
}