/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    outputFileTracingIncludes: {
      "/**": ["./public/fonts/**"],
    },
    // Invoice import posts PDFs to a Server Action. The default cap is 1MB, which a
    // single Canva export routinely exceeds — and the request is rejected before the
    // handler runs, so the importer's own size guard and fallbacks never get a chance.
    // The client batches uploads well under this; the headroom is for one large file.
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default nextConfig;
