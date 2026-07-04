"use client"

import { useRef, useState } from "react"
import { Upload, CheckCircle2, AlertCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; message: string }
  | { status: "error"; message: string }

export function ImportBackupForm() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<State>({ status: "idle" })
  const [filename, setFilename] = useState<string | null>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) setFilename(file.name)
    setState({ status: "idle" })
  }

  async function handleSubmit() {
    const file = fileRef.current?.files?.[0]
    if (!file) return

    setState({ status: "loading" })
    try {
      const text = await file.text()
      const json = JSON.parse(text)
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      })
      const data = await res.json()
      if (!res.ok) {
        setState({ status: "error", message: data.error ?? "Import failed" })
      } else {
        setState({ status: "success", message: data.message })
      }
    } catch (err: any) {
      setState({
        status: "error",
        message: err?.message?.includes("JSON")
          ? "Could not read the file — make sure it is a valid backup JSON file."
          : "Unexpected error — please try again.",
      })
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleFile}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2 h-9 px-4 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <Upload className="h-4 w-4" />
          {filename ?? "Choose backup file (.json)"}
        </button>
      </div>

      {filename && state.status !== "success" && (
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={state.status === "loading"}
        >
          {state.status === "loading" ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Importing…</>
          ) : (
            "Restore from Backup"
          )}
        </Button>
      )}

      {state.status === "success" && (
        <div className="flex gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
          <p className="text-sm text-green-800">{state.message}</p>
        </div>
      )}

      {state.status === "error" && (
        <div className="flex gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">{state.message}</p>
        </div>
      )}
    </div>
  )
}
