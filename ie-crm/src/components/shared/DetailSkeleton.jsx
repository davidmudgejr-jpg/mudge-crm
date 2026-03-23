import React from 'react';

function Bone({ className = '' }) {
  return (
    <div
      className={`rounded bg-crm-border/40 animate-shimmer ${className}`}
      style={{ backgroundImage: 'linear-gradient(90deg, transparent 0%, var(--crm-border) 50%, transparent 100%)', backgroundSize: '200% 100%' }}
    />
  );
}

export default function DetailSkeleton() {
  return (
    <div className="p-5 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="space-y-2 pb-4 border-b border-crm-border/50">
        <Bone className="h-5 w-48" />
        <Bone className="h-3 w-32" />
      </div>

      {/* Section 1 - grid fields */}
      <div className="space-y-3">
        <Bone className="h-3 w-24" />
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Bone className="h-2.5 w-16" />
              <Bone className="h-4 w-full" />
            </div>
          ))}
        </div>
      </div>

      {/* Section 2 - notes */}
      <div className="space-y-3">
        <Bone className="h-3 w-16" />
        <Bone className="h-16 w-full" />
      </div>

      {/* Section 3 - linked records */}
      <div className="space-y-3">
        <Bone className="h-3 w-20" />
        <div className="space-y-2">
          <Bone className="h-8 w-full" />
          <Bone className="h-8 w-full" />
        </div>
      </div>
    </div>
  );
}
