import type {
  DailyGrowthPoint,
  GrowthSceneAnalysis,
  GrowthVisualizationPlan,
  StrainVisualProfile,
} from "@/lib/growth-visualizer";

export interface RenderPlantPhotoOptions {
  backgroundImage?: HTMLImageElement | null;
  setting: "Indoor" | "Outdoor" | "Greenhouse";
  medium: string;
  soilComposition: string;
  plantName: string;
  strain: string;
  trainingMethods: string[];
  sceneAnalysis: GrowthSceneAnalysis;
  strainProfile: StrainVisualProfile;
  dayPoint: DailyGrowthPoint;
  width?: number;
  height?: number;
  showOverlay?: boolean;
  compactBadge?: boolean;
}

/** Deterministic PRNG so Day N+1 smoothly extends Day N without random flicker */
function createSeededRng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function getLeafPalette(
  hue: StrainVisualProfile["leafHue"],
  stage: DailyGrowthPoint["stage"],
  progress: number,
) {
  switch (hue) {
    case "purple-flushed":
      return {
        dark: stage === "Flowering" && progress > 0.45 ? "#2e1f3d" : "#1c4a2b",
        mid: stage === "Flowering" && progress > 0.5 ? "#3f6338" : "#2f7a44",
        light: stage === "Flowering" && progress > 0.6 ? "#75528a" : "#56a85c",
        vein: "#9bd68f",
      };
    case "deep-forest":
      return {
        dark: "#143822",
        mid: "#235c36",
        light: "#3d854f",
        vein: "#7dc286",
      };
    case "lime-vibrant":
      return {
        dark: "#265923",
        mid: "#428f34",
        light: "#7bc44f",
        vein: "#b7e68c",
      };
    case "emerald":
    default:
      return {
        dark: "#1a4b29",
        mid: "#2f7d42",
        light: "#5eb05b",
        vein: "#9be090",
      };
  }
}

function getBudPalette(accent: StrainVisualProfile["budAccent"]) {
  switch (accent) {
    case "purple-violet":
      return {
        base: "#4c2c69",
        mid: "#6c488f",
        highlight: "#9f7bc4",
        pistil: "#e88835",
        frost: "rgba(243, 232, 255, 0.72)",
      };
    case "amber-orange":
      return {
        base: "#386331",
        mid: "#548a41",
        highlight: "#89bd66",
        pistil: "#e86e1c",
        frost: "rgba(255, 249, 230, 0.72)",
      };
    case "pink-pistil":
      return {
        base: "#32613a",
        mid: "#4d8553",
        highlight: "#84ba82",
        pistil: "#e86b9a",
        frost: "rgba(255, 238, 246, 0.72)",
      };
    case "frosty-green":
    default:
      return {
        base: "#335e34",
        mid: "#528c4b",
        highlight: "#8bc97c",
        pistil: "#d97b29",
        frost: "rgba(240, 255, 242, 0.78)",
      };
  }
}

function drawDefaultBackdrop(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  setting: "Indoor" | "Outdoor" | "Greenhouse",
  medium: string,
  anchorY: number,
) {
  const horizonY = h * Math.max(0.45, Math.min(0.75, anchorY - 0.14));
  const isInGround = /ground|garden bed/i.test(medium);

  if (setting === "Indoor") {
    // Mylar reflective grow tent interior
    const wallGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
    wallGrad.addColorStop(0, "#1d242b");
    wallGrad.addColorStop(0.4, "#2d3740");
    wallGrad.addColorStop(1, "#222a31");
    ctx.fillStyle = wallGrad;
    ctx.fillRect(0, 0, w, horizonY);

    // Subtle LED overhead glow
    const ledGlow = ctx.createRadialGradient(w * 0.5, 0, 10, w * 0.5, h * 0.15, w * 0.65);
    ledGlow.addColorStop(0, "rgba(255, 244, 214, 0.42)");
    ledGlow.addColorStop(0.55, "rgba(255, 235, 200, 0.12)");
    ledGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = ledGlow;
    ctx.fillRect(0, 0, w, h);

    // Floor tray
    const floorGrad = ctx.createLinearGradient(0, horizonY, 0, h);
    floorGrad.addColorStop(0, "#1c2226");
    floorGrad.addColorStop(1, "#121619");
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, horizonY, w, h - horizonY);
  } else {
    // Outdoor / Greenhouse daylight sky
    const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
    skyGrad.addColorStop(0, setting === "Greenhouse" ? "#b7d7c8" : "#77b5df");
    skyGrad.addColorStop(0.65, setting === "Greenhouse" ? "#dceddf" : "#c7e5f2");
    skyGrad.addColorStop(1, "#e8f0d8");
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, horizonY);

    // Soft distant greenery / fence bokeh
    ctx.fillStyle = "rgba(47, 94, 52, 0.28)";
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      ctx.arc((w / 8) * i, horizonY - 8 - (i % 3) * 14, 48 + (i % 2) * 20, 0, Math.PI * 2);
      ctx.fill();
    }

    if (setting === "Greenhouse") {
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.lineWidth = 3;
      for (let x = w * 0.2; x < w; x += w * 0.3) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x - 16, horizonY);
        ctx.stroke();
      }
    }

    // Rich soil / lawn ground
    const soilGrad = ctx.createLinearGradient(0, horizonY, 0, h);
    soilGrad.addColorStop(0, isInGround ? "#4f3b28" : "#56703f");
    soilGrad.addColorStop(0.4, isInGround ? "#3d2c1e" : "#445c31");
    soilGrad.addColorStop(1, "#2a1f15");
    ctx.fillStyle = soilGrad;
    ctx.fillRect(0, horizonY, w, h - horizonY);
  }

  // Draw container pot OR raised living-soil bed mound
  const baseX = w * 0.5;
  const baseY = h * anchorY;
  if (isInGround) {
    // Rich mulched living-soil garden bed mound
    const moundGrad = ctx.createRadialGradient(baseX, baseY, 12, baseX, baseY + 12, w * 0.34);
    moundGrad.addColorStop(0, "#4a3320");
    moundGrad.addColorStop(0.7, "#362518");
    moundGrad.addColorStop(1, "rgba(42, 31, 21, 0)");
    ctx.fillStyle = moundGrad;
    ctx.beginPath();
    ctx.ellipse(baseX, baseY + 8, w * 0.32, h * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();

    // Straw mulch flecks
    ctx.strokeStyle = "rgba(205, 179, 120, 0.45)";
    ctx.lineWidth = 1.6;
    const rng = createSeededRng(77);
    for (let i = 0; i < 36; i++) {
      const mx = baseX + (rng() - 0.5) * w * 0.48;
      const my = baseY + (rng() - 0.4) * h * 0.1;
      const ang = rng() * Math.PI;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(mx + Math.cos(ang) * 12, my + Math.sin(ang) * 5);
      ctx.stroke();
    }
  } else {
    // Fabric grow pot
    const potTopW = w * 0.28;
    const potBotW = w * 0.23;
    const potH = h * 0.21;
    ctx.fillStyle = "#26282a";
    ctx.beginPath();
    ctx.moveTo(baseX - potTopW / 2, baseY);
    ctx.lineTo(baseX + potTopW / 2, baseY);
    ctx.lineTo(baseX + potBotW / 2, baseY + potH);
    ctx.lineTo(baseX - potBotW / 2, baseY + potH);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "#3c4043";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Soil rim inside pot
    ctx.fillStyle = /coco/i.test(medium) ? "#5a3d28" : "#3a291b";
    ctx.beginPath();
    ctx.ellipse(baseX, baseY, potTopW / 2, h * 0.032, 0, 0, Math.PI * 2);
    ctx.fill();

    // Perlite / pumice flecks
    ctx.fillStyle = "rgba(235, 232, 222, 0.55)";
    const rng = createSeededRng(109);
    for (let i = 0; i < 22; i++) {
      const px = baseX + (rng() - 0.5) * potTopW * 0.8;
      const py = baseY + (rng() - 0.5) * h * 0.04;
      ctx.beginPath();
      ctx.arc(px, py, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Draws a single realistic serrated leaflet */
function drawLeaflet(
  ctx: CanvasRenderingContext2D,
  length: number,
  width: number,
  palette: { dark: string; mid: string; light: string; vein: string },
  shadeFactor: number,
) {
  const grad = ctx.createLinearGradient(0, 0, 0, -length);
  grad.addColorStop(0, palette.dark);
  grad.addColorStop(0.55, shadeFactor > 0.5 ? palette.light : palette.mid);
  grad.addColorStop(1, palette.light);

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  // Left serrated edge
  const steps = 5;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const bulge = Math.sin(t * Math.PI);
    const x = -width * bulge;
    const y = -length * t;
    ctx.lineTo(x * 1.08, y + length * 0.04);
    ctx.lineTo(x * 0.86, y);
  }
  ctx.lineTo(0, -length * 1.05);
  // Right serrated edge
  for (let i = steps; i >= 1; i--) {
    const t = i / steps;
    const bulge = Math.sin(t * Math.PI);
    const x = width * bulge;
    const y = -length * t;
    ctx.lineTo(x * 0.86, y);
    ctx.lineTo(x * 1.08, y + length * 0.04);
  }
  ctx.closePath();
  ctx.fill();

  // Central vein highlight
  ctx.strokeStyle = palette.vein;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = Math.max(0.6, width * 0.08);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -length * 0.92);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Draws a palmately-compound fan leaf (3, 5, or 7 leaflets) */
function drawFanLeaf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  baseAngle: number,
  leafletCount: number,
  palette: { dark: string; mid: string; light: string; vein: string },
  shade: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(baseAngle);

  const count = leafletCount >= 7 ? 7 : leafletCount >= 5 ? 5 : 3;
  const half = Math.floor(count / 2);

  for (let i = -half; i <= half; i++) {
    const norm = Math.abs(i) / Math.max(1, half);
    const spread = i * (count === 7 ? 0.38 : count === 5 ? 0.44 : 0.56);
    const lLen = size * (1 - norm * 0.42);
    const lWid = size * (0.145 - norm * 0.03);
    ctx.save();
    ctx.rotate(spread);
    drawLeaflet(ctx, lLen, lWid, palette, shade);
    ctx.restore();
  }

  ctx.restore();
}

/** Draws a stacked resinous flowering cola cluster with pistils & trichome sparkle */
function drawFloweringCola(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  colaHeight: number,
  colaWidth: number,
  budDensity: number,
  budPalette: ReturnType<typeof getBudPalette>,
  leafPalette: ReturnType<typeof getLeafPalette>,
  frostLevel: number,
  rng: () => number,
) {
  if (budDensity <= 0.04) return;
  ctx.save();
  ctx.translate(x, y);

  const tiers = Math.max(3, Math.round(4 + budDensity * 7));
  // Subtle sugar leaves poking out behind cola
  for (let t = 0; t < tiers; t++) {
    const ratio = t / tiers;
    const ty = -ratio * colaHeight;
    const tw = colaWidth * (1 - ratio * 0.55);
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * tw * 0.42, ty);
      ctx.rotate(side * (0.85 + rng() * 0.35));
      drawLeaflet(ctx, tw * 1.15, tw * 0.24, leafPalette, 0.7);
      ctx.restore();
    }
  }

  // Stacked calyx bracts
  for (let t = 0; t < tiers; t++) {
    const ratio = t / tiers;
    const ty = -ratio * colaHeight;
    const tw = colaWidth * (1 - ratio * 0.58) * (0.75 + budDensity * 0.35);
    const blobs = Math.max(2, Math.round(3 + (1 - ratio) * 3));
    for (let b = 0; b < blobs; b++) {
      const bx = (rng() - 0.5) * tw * 1.1;
      const by = ty + (rng() - 0.5) * (colaHeight / tiers);
      const r = Math.max(2.5, tw * (0.34 + rng() * 0.18));
      const g = ctx.createRadialGradient(bx - r * 0.25, by - r * 0.25, r * 0.1, bx, by, r);
      g.addColorStop(0, budPalette.highlight);
      g.addColorStop(0.55, budPalette.mid);
      g.addColorStop(1, budPalette.base);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(bx, by, r * 0.95, r * 1.15, (rng() - 0.5) * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Pistil hairs (white in early flower -> amber/orange/pink in late flower)
  const pistilCount = Math.round(10 + budDensity * 28);
  ctx.lineWidth = Math.max(0.7, colaWidth * 0.045);
  for (let p = 0; p < pistilCount; p++) {
    const ratio = rng();
    const px = (rng() - 0.5) * colaWidth * (1 - ratio * 0.5) * 1.1;
    const py = -ratio * colaHeight;
    const isRipe = budDensity > 0.55 && rng() < budDensity;
    ctx.strokeStyle = isRipe ? budPalette.pistil : "rgba(248, 250, 232, 0.85)";
    ctx.beginPath();
    ctx.moveTo(px, py);
    const dx = (rng() - 0.5) * colaWidth * 0.55;
    const dy = -rng() * colaWidth * 0.45;
    ctx.quadraticCurveTo(px + dx * 0.5, py + dy * 1.2, px + dx, py + dy);
    ctx.stroke();
  }

  // Trichome frost shimmer in mid-to-late flower
  if (budDensity > 0.35) {
    const sparkleCount = Math.round(18 * budDensity * frostLevel);
    ctx.fillStyle = budPalette.frost;
    for (let s = 0; s < sparkleCount; s++) {
      const ratio = rng();
      const sx = (rng() - 0.5) * colaWidth * (1 - ratio * 0.55);
      const sy = -ratio * colaHeight;
      ctx.beginPath();
      ctx.arc(sx, sy, 0.8 + rng() * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

/**
 * Renders a photorealistic composited growth visualization frame onto a Canvas
 * and returns a JPEG data URL.
 */
export function renderPlantStageToDataUrl(options: RenderPlantPhotoOptions): string {
  const w = options.width ?? 640;
  const h = options.height ?? 480;

  if (typeof document === "undefined") {
    return "";
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return "";
  }

  const {
    backgroundImage,
    setting,
    medium,
    plantName,
    strain,
    trainingMethods,
    sceneAnalysis,
    strainProfile,
    dayPoint,
    showOverlay = true,
    compactBadge = false,
  } = options;

  // 1. Draw Background (User's uploaded Grow Area photo OR tailored garden/tent backdrop)
  if (backgroundImage && backgroundImage.naturalWidth > 0) {
    const imgRatio = backgroundImage.naturalWidth / backgroundImage.naturalHeight;
    const canvasRatio = w / h;
    let drawW = w;
    let drawH = h;
    let offsetX = 0;
    let offsetY = 0;
    if (imgRatio > canvasRatio) {
      drawW = h * imgRatio;
      offsetX = -(drawW - w) / 2;
    } else {
      drawH = w / imgRatio;
      offsetY = -(drawH - h) / 2;
    }
    ctx.drawImage(backgroundImage, offsetX, offsetY, drawW, drawH);

    // Subtle atmospheric lighting vignette so the composited plant blends seamlessly
    const tint =
      sceneAnalysis.ambientWarmth === "indoor-led"
        ? "rgba(255, 240, 225, 0.05)"
        : sceneAnalysis.ambientWarmth === "warm-sun"
          ? "rgba(255, 236, 190, 0.06)"
          : "rgba(220, 242, 255, 0.04)";
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, w, h);
  } else {
    drawDefaultBackdrop(ctx, w, h, setting, medium, sceneAnalysis.anchorY);
  }

  // 2. Compute anchor & scaling from stage & day progress
  const anchorX = w * Math.max(0.18, Math.min(0.82, sceneAnalysis.anchorX || 0.5));
  const anchorY = h * Math.max(0.55, Math.min(0.88, sceneAnalysis.anchorY || 0.76));
  const scale = sceneAnalysis.scaleFactor || 1;

  const hasLST = trainingMethods.some((t) => /lst|low.?stress/i.test(t));
  const hasTopping = trainingMethods.some((t) => /top|fim/i.test(t));
  const hasScrog = trainingMethods.some((t) => /scrog/i.test(t));
  const hasLollipop = trainingMethods.some((t) => /lollipop/i.test(t));
  const hasDefol = trainingMethods.some((t) => /defol/i.test(t));

  const leafPalette = getLeafPalette(strainProfile.leafHue, dayPoint.stage, dayPoint.stageProgress);
  const budPalette = getBudPalette(strainProfile.budAccent);

  // Use a stable seed derived from strain + day bucket so morphology grows organically
  const strainSeed =
    (strain || plantName || "plant")
      .split("")
      .reduce((acc, ch) => acc + ch.charCodeAt(0) * 13, 17) + 41;
  const rng = createSeededRng(strainSeed);

  // Normalize height relative to canvas
  const maxVisualH = h * 0.56 * scale;
  const heightNorm =
    dayPoint.stage === "Seedling"
      ? 0.09 + dayPoint.stageProgress * 0.14
      : dayPoint.stage === "Vegetative"
        ? 0.23 + dayPoint.stageProgress * 0.43
        : 0.66 + Math.min(1, dayPoint.stageProgress / 0.45) * 0.34;

  const plantH = maxVisualH * heightNorm;
  const spreadMult =
    (hasLST || hasScrog ? 1.38 : hasTopping ? 1.24 : 1.0) *
    (strainProfile.growthHabit === "bushy-indica"
      ? 1.15
      : strainProfile.growthHabit === "tall-sativa"
        ? 0.92
        : 1.0);
  const canopyW = plantH * 0.78 * spreadMult;

  // 3. Cast realistic soft ground shadow matching lightDirection
  const shadowShift =
    sceneAnalysis.lightDirection === "left"
      ? 14
      : sceneAnalysis.lightDirection === "right"
        ? -14
        : 0;
  ctx.save();
  ctx.fillStyle = "rgba(10, 18, 10, 0.36)";
  ctx.beginPath();
  ctx.ellipse(
    anchorX + shadowShift * heightNorm,
    anchorY + 3,
    Math.max(10, canopyW * 0.46),
    Math.max(4, canopyW * 0.12),
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.restore();

  // 4. Draw Plant Architecture based on Stage & Training Methods
  if (dayPoint.stage === "Seedling") {
    // Delicate young seedling stem
    const stemH = plantH;
    ctx.strokeStyle = "#6ca652";
    ctx.lineWidth = Math.max(2, w * 0.0055 * (0.7 + dayPoint.stageProgress * 0.6));
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(anchorX, anchorY);
    ctx.quadraticCurveTo(anchorX + 3, anchorY - stemH * 0.5, anchorX, anchorY - stemH);
    ctx.stroke();

    // Round cotyledons (baby leaves)
    const cotY = anchorY - stemH * 0.62;
    const cotLen = Math.max(7, stemH * 0.24);
    ctx.fillStyle = "#5da649";
    for (const dir of [-1, 1]) {
      ctx.save();
      ctx.translate(anchorX, cotY);
      ctx.rotate(dir * 1.18);
      ctx.beginPath();
      ctx.ellipse(0, -cotLen * 0.55, cotLen * 0.32, cotLen * 0.56, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // First true serrated leaves (grow from day 4 onwards)
    if (dayPoint.stageProgress > 0.15) {
      const leafSize = Math.max(12, stemH * (0.36 + dayPoint.stageProgress * 0.42));
      drawFanLeaf(
        ctx,
        anchorX,
        anchorY - stemH * 0.85,
        leafSize,
        -0.95,
        dayPoint.stageProgress > 0.65 ? 3 : 3,
        leafPalette,
        0.7,
      );
      drawFanLeaf(
        ctx,
        anchorX,
        anchorY - stemH * 0.85,
        leafSize,
        0.95,
        dayPoint.stageProgress > 0.65 ? 3 : 3,
        leafPalette,
        0.8,
      );
    }
    // Second node emerging in late seedling
    if (dayPoint.stageProgress > 0.55) {
      const topLeaf = Math.max(10, stemH * 0.48 * dayPoint.stageProgress);
      drawFanLeaf(ctx, anchorX, anchorY - stemH, topLeaf, -0.42, 3, leafPalette, 0.85);
      drawFanLeaf(ctx, anchorX, anchorY - stemH, topLeaf, 0.42, 3, leafPalette, 0.9);
    }
  } else {
    // Vegetative & Flowering full multi-branch canopy
    const trainingActive =
      dayPoint.trainingApplied.length > 0 ||
      (dayPoint.stage === "Flowering" && (hasLST || hasTopping || hasScrog));
    const applyTop = trainingActive && hasTopping;
    const applyLST = trainingActive && (hasLST || hasScrog);
    const applyLollipop =
      hasLollipop && (dayPoint.stage === "Flowering" || dayPoint.stageProgress > 0.7);
    const leafDensityScale = hasDefol && dayPoint.stage === "Flowering" ? 0.72 : 1.0;

    // Determine main stalks (1 natural, 2–4 if topped, 5–7 spread if LST/SCROG)
    const numMainTops = applyLST && applyTop ? 6 : applyLST ? 5 : applyTop ? 4 : 3;
    const stemBaseThickness = Math.max(4, w * 0.011 * (0.75 + dayPoint.overallProgress * 0.65));

    // Draw woody lower trunk
    const trunkSplitY = anchorY - plantH * (applyLollipop ? 0.28 : 0.18);
    ctx.strokeStyle = dayPoint.stage === "Flowering" ? "#5d5a3b" : "#4b753b";
    ctx.lineWidth = stemBaseThickness;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(anchorX, anchorY);
    if (applyLST) {
      // Gentle low-stress bend
      ctx.quadraticCurveTo(
        anchorX + canopyW * 0.08,
        (anchorY + trunkSplitY) * 0.5,
        anchorX,
        trunkSplitY,
      );
    } else {
      ctx.lineTo(anchorX, trunkSplitY);
    }
    ctx.stroke();

    // Draw soft garden LST tie stakes if LST active
    if (applyLST) {
      ctx.strokeStyle = "rgba(180, 210, 145, 0.65)";
      ctx.lineWidth = 1.4;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(anchorX + side * canopyW * 0.24, anchorY - plantH * 0.24);
        ctx.lineTo(anchorX + side * canopyW * 0.38, anchorY + 2);
        ctx.stroke();
      }
    }

    // Compute branch endpoints
    interface BranchTip {
      x: number;
      y: number;
      isPrimary: boolean;
      angle: number;
      sizeWeight: number;
    }
    const tips: BranchTip[] = [];

    for (let b = 0; b < numMainTops; b++) {
      const t = numMainTops === 1 ? 0 : (b / (numMainTops - 1)) * 2 - 1; // -1 .. +1
      const isCenter = Math.abs(t) < 0.22;

      // In LST/Topping/SCROG, side colas reach near-equal height to the center!
      const heightFactor = applyLST
        ? 0.88 + (1 - Math.abs(t)) * 0.12
        : applyTop
          ? 0.82 + (1 - Math.abs(t)) * 0.16
          : isCenter
            ? 1.0
            : 0.62 + (1 - Math.abs(t)) * 0.22;

      const tipX = anchorX + t * canopyW * 0.44 + (rng() - 0.5) * 10;
      const tipY = anchorY - plantH * heightFactor + (rng() - 0.5) * 8;
      const ctrlX = anchorX + t * canopyW * (applyLST ? 0.42 : 0.22);
      const ctrlY = anchorY - plantH * (applyLST ? 0.34 : 0.48);

      // Draw branch stalk
      ctx.strokeStyle = "#487537";
      ctx.lineWidth = Math.max(2, stemBaseThickness * (isCenter ? 0.62 : 0.46));
      ctx.beginPath();
      ctx.moveTo(anchorX, trunkSplitY);
      ctx.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY);
      ctx.stroke();

      // Foliage clusters along each branch
      const nodesOnBranch = Math.max(
        2,
        Math.round((applyLollipop ? 3 : 4) + dayPoint.overallProgress * 4 * leafDensityScale),
      );
      const startFrac = applyLollipop ? 0.42 : 0.18;

      for (let n = 0; n < nodesOnBranch; n++) {
        const frac = startFrac + (n / Math.max(1, nodesOnBranch - 1)) * (0.94 - startFrac);
        // Quadratic Bezier point at frac
        const inv = 1 - frac;
        const nx = inv * inv * anchorX + 2 * inv * frac * ctrlX + frac * frac * tipX;
        const ny = inv * inv * trunkSplitY + 2 * inv * frac * ctrlY + frac * frac * tipY;

        const leafSize =
          Math.max(18, plantH * 0.25) *
          (1.12 - frac * 0.35) *
          (dayPoint.stage === "Flowering" ? 0.92 : 1.05);
        const fingerCount = frac > 0.3 && dayPoint.overallProgress > 0.25 ? 7 : 5;

        for (const side of [-1, 1]) {
          const angle = side * (0.55 + (1 - frac) * 0.65) + t * 0.35 + (rng() - 0.5) * 0.24;
          drawFanLeaf(
            ctx,
            nx,
            ny,
            leafSize,
            angle,
            fingerCount,
            leafPalette,
            side > 0 ? 0.72 : 0.35,
          );
        }
      }

      tips.push({
        x: tipX,
        y: tipY,
        isPrimary: applyLST || applyTop ? true : isCenter,
        angle: t * 0.22,
        sizeWeight: heightFactor,
      });
    }

    // Optional SCROG trellis grid lines across canopy waist
    if (hasScrog && trainingActive) {
      const netY = anchorY - plantH * 0.56;
      ctx.save();
      ctx.strokeStyle = "rgba(245, 248, 240, 0.52)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(anchorX - canopyW * 0.56, netY);
      ctx.lineTo(anchorX + canopyW * 0.56, netY);
      ctx.moveTo(anchorX - canopyW * 0.52, netY - 12);
      ctx.lineTo(anchorX + canopyW * 0.52, netY - 12);
      for (let gx = -4; gx <= 4; gx++) {
        const px = anchorX + gx * (canopyW * 0.13);
        ctx.moveTo(px, netY - 16);
        ctx.lineTo(px + gx * 2, netY + 12);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Draw Flowering Colas on every branch tip & secondary upper bud sites!
    if (dayPoint.stage === "Flowering" && dayPoint.budDensity > 0.05) {
      for (const tip of tips) {
        const colaH = plantH * (tip.isPrimary ? 0.34 : 0.22) * (0.38 + dayPoint.budDensity * 0.78);
        const colaW = plantH * (tip.isPrimary ? 0.125 : 0.09) * (0.42 + dayPoint.budDensity * 0.75);
        ctx.save();
        ctx.translate(tip.x, tip.y + colaH * 0.36);
        ctx.rotate(tip.angle);
        drawFloweringCola(
          ctx,
          0,
          0,
          colaH,
          colaW,
          dayPoint.budDensity,
          budPalette,
          leafPalette,
          strainProfile.trichomeFrost,
          rng,
        );
        ctx.restore();

        // Lower secondary bud satellites
        if (dayPoint.budDensity > 0.3) {
          for (const side of [-1, 1]) {
            drawFloweringCola(
              ctx,
              tip.x + side * colaW * 0.75,
              tip.y + colaH * 0.62,
              colaH * 0.45,
              colaW * 0.55,
              dayPoint.budDensity * 0.85,
              budPalette,
              leafPalette,
              strainProfile.trichomeFrost,
              rng,
            );
          }
        }
      }
    }
  }

  // 5. Optional crisp stage & day photographic HUD badge
  if (showOverlay) {
    if (compactBadge) {
      // Compact tile overlay for Day-by-Day Collage
      const barH = Math.max(24, Math.round(h * 0.2));
      const grad = ctx.createLinearGradient(0, h - barH - 12, 0, h);
      grad.addColorStop(0, "rgba(10, 16, 12, 0)");
      grad.addColorStop(1, "rgba(10, 16, 12, 0.82)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, h - barH - 12, w, barH + 12);

      const stageColor =
        dayPoint.stage === "Seedling"
          ? "#4ade80"
          : dayPoint.stage === "Vegetative"
            ? "#22c55e"
            : "#f59e0b";

      ctx.fillStyle = "rgba(12, 20, 14, 0.78)";
      ctx.beginPath();
      ctx.roundRect(8, 8, Math.min(w - 16, 76), 22, 7);
      ctx.fill();
      ctx.fillStyle = stageColor;
      ctx.font = `700 ${Math.max(10, Math.round(w * 0.055))}px system-ui, -apple-system, sans-serif`;
      ctx.fillText(`Day ${dayPoint.day}`, 14, 23);

      ctx.fillStyle = "#f8fafc";
      ctx.font = `600 ${Math.max(9, Math.round(w * 0.048))}px system-ui, -apple-system, sans-serif`;
      ctx.fillText(`${dayPoint.stage} · ${dayPoint.heightCm}cm`, 8, h - 8);
    } else {
      // Full Stage Card overlay (for the 3-Stage Preview photos)
      const grad = ctx.createLinearGradient(0, h * 0.72, 0, h);
      grad.addColorStop(0, "rgba(8, 15, 10, 0)");
      grad.addColorStop(1, "rgba(8, 15, 10, 0.86)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, h * 0.72, w, h * 0.28);

      const stageColor =
        dayPoint.stage === "Seedling"
          ? "#4ade80"
          : dayPoint.stage === "Vegetative"
            ? "#10b981"
            : "#f59e0b";

      // Top-left stage pill
      ctx.fillStyle = "rgba(10, 18, 12, 0.82)";
      ctx.beginPath();
      ctx.roundRect(14, 14, 156, 30, 10);
      ctx.fill();
      ctx.strokeStyle = stageColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = stageColor;
      ctx.beginPath();
      ctx.arc(28, 29, 4.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = "700 13px system-ui, -apple-system, sans-serif";
      ctx.fillText(`${dayPoint.stage} · Day ${dayPoint.day}`, 40, 34);

      // Bottom info strip
      ctx.fillStyle = "#ffffff";
      ctx.font = "700 16px system-ui, -apple-system, sans-serif";
      ctx.fillText(`${plantName || strain} (${strain || "Cultivar"})`, 16, h - 34);

      ctx.fillStyle = "rgba(226, 240, 228, 0.9)";
      ctx.font = "500 12px system-ui, -apple-system, sans-serif";
      const sub = `Est. ${dayPoint.heightCm} cm tall × ${dayPoint.canopyWidthCm} cm wide · ${
        trainingMethods.length > 0 ? trainingMethods.slice(0, 2).join(" + ") : "Natural"
      }`;
      ctx.fillText(sub, 16, h - 14);
    }
  }

  return canvas.toDataURL("image/jpeg", compactBadge ? 0.76 : 0.88);
}

/**
 * Stitches an array of daily growth dataUrls into a single downloadable high-res collage PNG poster.
 */
export async function buildDownloadableCollagePoster(params: {
  dayImages: Array<{ day: number; stage: string; dataUrl: string }>;
  plan: GrowthVisualizationPlan;
  plantName: string;
  strain: string;
  soilComposition: string;
  trainingMethods: string[];
}): Promise<string> {
  if (typeof document === "undefined" || params.dayImages.length === 0) return "";

  const cols = params.dayImages.length <= 36 ? 6 : 7;
  const rows = Math.ceil(params.dayImages.length / cols);
  const tileW = 200;
  const tileH = 150;
  const gap = 8;
  const pad = 24;
  const headerH = 92;

  const totalW = pad * 2 + cols * tileW + (cols - 1) * gap;
  const totalH = pad * 2 + headerH + rows * tileH + (rows - 1) * gap;

  const canvas = document.createElement("canvas");
  canvas.width = totalW;
  canvas.height = totalH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // Dark botanical poster background
  ctx.fillStyle = "#101b13";
  ctx.fillRect(0, 0, totalW, totalH);

  // Header
  ctx.fillStyle = "#4ade80";
  ctx.font = "700 14px system-ui, -apple-system, sans-serif";
  ctx.fillText("CANOPY · DAY-BY-DAY AI GROWTH COLLAGE", pad, pad + 20);

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 24px system-ui, -apple-system, sans-serif";
  ctx.fillText(
    `${params.plantName} (${params.strain}) — ${params.dayImages.length} Days of Growth`,
    pad,
    pad + 50,
  );

  ctx.fillStyle = "#b8d0be";
  ctx.font = "500 13px system-ui, -apple-system, sans-serif";
  ctx.fillText(
    `Medium: ${params.soilComposition.slice(0, 68)} · Training: ${
      params.trainingMethods.join(", ") || "Natural"
    }`,
    pad,
    pad + 74,
  );

  // Load & draw each tile
  const loadImg = (src: string) =>
    new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });

  for (let i = 0; i < params.dayImages.length; i++) {
    const item = params.dayImages[i]!;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = pad + col * (tileW + gap);
    const y = pad + headerH + row * (tileH + gap);

    const img = await loadImg(item.dataUrl);
    if (img) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, tileW, tileH, 10);
      ctx.clip();
      ctx.drawImage(img, x, y, tileW, tileH);
      ctx.restore();
    }
  }

  return canvas.toDataURL("image/jpeg", 0.86);
}
