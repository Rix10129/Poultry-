"use client"

export default function OfflinePage() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 p-6">
      <div className="text-center space-y-4 max-w-sm">
        <div className="text-6xl">📡</div>
        <h1 className="text-2xl font-bold text-slate-900">You&apos;re offline</h1>
        <p className="text-slate-500 text-sm leading-relaxed">
          Check your internet connection and try again. Any invoices you created
          while offline will sync automatically when you reconnect.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
