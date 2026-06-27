import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // bcryptjs is pure JS — no native bindings needed
  // Add image domains here as needed for supplier/product logos
  images: {
    remotePatterns: [],
  },
}

export default nextConfig
