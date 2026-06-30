import { db } from "@/lib/db"
import { NextResponse } from "next/server"

export const runtime = "nodejs"

export async function GET() {
  const start = Date.now()
  try {
    await db.$queryRaw`SELECT 1`
    const dbMs = Date.now() - start
    return NextResponse.json({
      status: "ok",
      db: "connected",
      dbMs,
      timestamp: new Date().toISOString(),
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    })
  } catch (err) {
    return NextResponse.json(
      {
        status: "error",
        db: "disconnected",
        error: String(err),
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    )
  }
}
