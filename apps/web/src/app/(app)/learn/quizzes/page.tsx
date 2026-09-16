import Link from "next/link";

export default function QuizzesPage() {
  return (
    <main className="p-xl">
      <Link href="/learn" className="text-sm text-muted-foreground hover:underline">
        ← Learn
      </Link>
      <h1 className="mt-xs text-2xl font-semibold text-foreground">Quizzes</h1>
      <p className="mt-md text-sm text-muted-foreground">Coming soon.</p>
    </main>
  );
}
