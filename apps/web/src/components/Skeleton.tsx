/** Shimmer placeholders sized to the screens they stand in for, so nothing jumps when content arrives. */
export function SkeletonLine({ w = "100%", h = 12, className = "" }: { w?: string | number; h?: number; className?: string }) {
  return <span aria-hidden className={`fg-skel block ${className}`} style={{ width: w, height: h }} />;
}

export function SkeletonCard({ lines = 3, className = "", height }: { lines?: number; className?: string; height?: number }) {
  return (
    <div className={`panel space-y-3 p-5 ${className}`} style={height ? { minHeight: height } : undefined} aria-hidden>
      <SkeletonLine w="38%" h={16} />
      {Array.from({ length: lines }, (_, i) => <SkeletonLine key={i} w={i === lines - 1 ? "62%" : "100%"} />)}
    </div>
  );
}

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return <div role="status" aria-busy="true" aria-live="polite"><span className="sr-only">{label}</span>{children}</div>;
}

export function DashboardSkeleton() {
  return (
    <Frame label="Loading your overview">
      <div className="space-y-4">
        <SkeletonLine w={180} h={28} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <SkeletonCard key={i} lines={1} height={104} />)}</div>
        <div className="grid gap-4 lg:grid-cols-2"><SkeletonCard lines={5} height={220} /><SkeletonCard lines={5} height={220} /></div>
      </div>
    </Frame>
  );
}

export function RulesStudioSkeleton() {
  return (
    <Frame label="Loading comment rules">
      <div className="space-y-4">
        <SkeletonLine w={200} h={28} />
        <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)_320px]">
          <div className="panel space-y-3 p-3" aria-hidden>{[0, 1, 2, 3].map((i) => <div key={i} className="space-y-1.5"><SkeletonLine w="70%" h={13} /><SkeletonLine w="45%" h={10} /></div>)}</div>
          <div className="panel space-y-5 p-5" aria-hidden>
            <SkeletonLine w={120} h={20} /><SkeletonLine h={36} /><SkeletonLine h={36} /><SkeletonLine h={96} /><SkeletonLine w="50%" h={36} />
          </div>
          <div className="mx-auto hidden w-[300px] lg:block" aria-hidden><span className="fg-skel block h-[580px] w-full rounded-[36px]" /></div>
        </div>
      </div>
    </Frame>
  );
}

export function SettingsSkeleton() {
  return (
    <Frame label="Loading settings">
      <div className="max-w-2xl space-y-4"><SkeletonLine w={140} h={28} /><SkeletonCard lines={3} height={150} /><SkeletonCard lines={4} height={220} /><SkeletonCard lines={2} height={110} /></div>
    </Frame>
  );
}

/** Welcome, persona and billing screens: a title, a form-shaped panel and a side panel. */
export function FormSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <Frame label={label}>
      <div className="space-y-4"><SkeletonLine w={220} h={28} />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]"><SkeletonCard lines={6} height={320} /><SkeletonCard lines={3} height={320} /></div>
      </div>
    </Frame>
  );
}
