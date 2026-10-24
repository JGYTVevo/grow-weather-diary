import "../dist/server/index.mjs";
import fs from "node:fs";
import path from "node:path";

async function postbuild() {
  const ssr = globalThis.__nitro_vite_envs__?.ssr;
  if (!ssr) {
    console.error("SSR service not found on globalThis.__nitro_vite_envs__");
    process.exit(1);
  }

  try {
    const res = await ssr.fetch(new Request("http://localhost:3000/"));
    const html = await res.text();
    const distDir = path.resolve("dist");

    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true });
    }

    // Write index.html for static artifact hosting
    fs.writeFileSync(path.join(distDir, "index.html"), html, "utf8");
    // Write 200.html and 404.html for SPA static host fallbacks
    fs.writeFileSync(path.join(distDir, "200.html"), html, "utf8");
    fs.writeFileSync(path.join(distDir, "404.html"), html, "utf8");

    console.log(
      "Successfully generated dist/index.html, dist/200.html, dist/404.html (" +
        html.length +
        " bytes)",
    );
  } catch (err) {
    console.error("Failed to prerender index.html:", err);
    process.exit(1);
  }
}

postbuild();
