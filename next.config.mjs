/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    outputFileTracingIncludes: {
      "/**": ["./public/fonts/**"],
    },
  },
};

export default nextConfig;
