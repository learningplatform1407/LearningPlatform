export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-md">
      {/* Arbitrary value, not max-w-sm: Tailwind v4 generates width/max-width
          utilities from the same --spacing-* scale as padding/margin, so our
          --spacing-sm (8px) would silently shadow Tailwind's usual ~24rem
          "sm" card width. Use bracket values for layout sizing; the named
          scale (p-*, gap-*, m-*) is fine since that's its actual purpose. */}
      <div className="w-full max-w-[24rem] rounded-lg border border-border bg-background p-xl shadow-sm">
        {children}
      </div>
    </main>
  );
}
