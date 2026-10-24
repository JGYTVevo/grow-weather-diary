import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-router",
        "@tanstack/react-query",
        "firebase/app",
        "@firebase/app",
        "firebase/auth",
        "@firebase/auth",
        "firebase/firestore",
        "@firebase/firestore",
        "lucide-react",
        "sonner",
        "clsx",
        "tailwind-merge",
      ],
    },
    resolve: {
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-router",
        "@tanstack/react-query",
        "firebase/app",
        "@firebase/app",
        "firebase/auth",
        "@firebase/auth",
        "firebase/firestore",
        "@firebase/firestore",
      ],
    },
  },
});
