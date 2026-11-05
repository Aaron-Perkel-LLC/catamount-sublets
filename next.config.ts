import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native and WASM packages stay in node_modules, not the bundle.
  serverExternalPackages: ["@electric-sql/pglite", "sharp"],
  // Tailwind v4 through its Turbopack loader (what create-next-app wired up).
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
  // Development logging kept free of PII: Server Function logging prints each
  // action's arguments and return value (form values, contact details), and the
  // auth routes carry email addresses in their bodies.
  logging: {
    serverFunctions: false,
    incomingRequests: { ignore: [/\/api\/auth\//] },
  },
  // Never bundled into a server function, whatever a local build finds on disk.
  outputFileTracingExcludes: { "/*": ["sublets-legacy/**", "legacy-images/**", ".env*"] },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com" }],
  },
  // The CSP is set per request in src/proxy.ts (it carries a nonce); the
  // static headers live here.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
