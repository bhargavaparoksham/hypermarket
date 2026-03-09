import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        canvas: "#f4efe5",
        ink: "#14231c",
        accent: "#c84c2f",
        tide: "#0f4c5c",
        moss: "#748c69",
        sand: "#dfc7a2"
      },
      boxShadow: {
        card: "0 20px 60px rgba(20, 35, 28, 0.12)"
      },
      animation: {
        drift: "drift 18s ease-in-out infinite",
        rise: "rise 900ms ease-out both"
      },
      keyframes: {
        drift: {
          "0%, 100%": {
            transform: "translate3d(0, 0, 0)"
          },
          "50%": {
            transform: "translate3d(0, -18px, 0)"
          }
        },
        rise: {
          from: {
            opacity: "0",
            transform: "translate3d(0, 16px, 0)"
          },
          to: {
            opacity: "1",
            transform: "translate3d(0, 0, 0)"
          }
        }
      }
    }
  },
  plugins: []
};

export default config;
