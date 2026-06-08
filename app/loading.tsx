export default function Loading() {
  return (
    <div className="min-h-screen bg-theme-bg flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-theme-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-theme-muted text-sm">Loading…</p>
      </div>
    </div>
  );
}
