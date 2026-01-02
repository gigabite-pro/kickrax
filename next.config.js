/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.stockx.com',
      },
      {
        protocol: 'https',
        hostname: '**.goat.com',
      },
      {
        protocol: 'https',
        hostname: 'images.stockx.com',
      },
      {
        protocol: 'https',
        hostname: 'image.goat.com',
      },
      {
        protocol: 'https',
        hostname: 'media.kijiji.ca',
      },
      {
        protocol: 'https',
        hostname: '**.kijiji.ca',
      },
      {
        protocol: 'https',
        hostname: 'i.ebayimg.com',
      },
      {
        protocol: 'https',
        hostname: '**.ebayimg.com',
      },
      {
        protocol: 'https',
        hostname: '**.grailed.com',
      },
      {
        protocol: 'https',
        hostname: 'process.fs.grailed.com',
      },
    ],
  },
}

module.exports = nextConfig

