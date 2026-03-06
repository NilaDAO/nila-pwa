import jsfeat from 'jsfeat';

// INR bill aspect ratio: ~157mm x 66mm = 2.38:1
const BILL_ASPECT = 157 / 66;
const OUT_W = 800;
const OUT_H = Math.round(OUT_W / BILL_ASPECT); // ~336

// Processing resolution — small for speed (~30ms per frame on mobile)
const PROC_W = 240;

// ── dataUrl → Blob (for FormData upload) ──────────────────────────
export const dataUrlToBlob = (dataUrl) => {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
};

// ── reusable jsfeat buffers (avoid GC pressure in the loop) ───────
let _gray = null;
let _procCanvas = null;
let _procCtx = null;

const ensureBuffers = (w, h) => {
  if (!_gray || _gray.cols !== w || _gray.rows !== h) {
    _gray = new jsfeat.matrix_t(w, h, jsfeat.U8_t | jsfeat.C1_t);
  }
  if (!_procCanvas) {
    _procCanvas = document.createElement('canvas');
    _procCtx = _procCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (_procCanvas.width !== w || _procCanvas.height !== h) {
    _procCanvas.width = w;
    _procCanvas.height = h;
  }
};

// ── fast contour trace (Moore neighbor tracing) ───────────────────
// Finds the largest contour in a binary edge image.
// Returns array of [x,y] points or null.
const traceContour = (binary, w, h) => {
  // find first edge pixel (start point)
  let startX = -1, startY = -1;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (binary[y * w + x] > 0) {
        startX = x;
        startY = y;
        break;
      }
    }
    if (startX >= 0) break;
  }
  if (startX < 0) return null;

  // Moore neighborhood: 8 directions clockwise from right
  const dx = [1, 1, 0, -1, -1, -1, 0, 1];
  const dy = [0, 1, 1, 1, 0, -1, -1, -1];

  const contours = [];
  const visited = new Uint8Array(w * h);

  // find multiple contours, keep the largest
  for (let sy = 1; sy < h - 1; sy++) {
    for (let sx = 1; sx < w - 1; sx++) {
      if (binary[sy * w + sx] === 0 || visited[sy * w + sx]) continue;

      const contour = [];
      let cx = sx, cy = sy;
      let dir = 0; // start looking right
      let steps = 0;
      const maxSteps = w * h;

      do {
        contour.push([cx, cy]);
        visited[cy * w + cx] = 1;
        let found = false;

        // search 8 neighbors starting from (dir + 5) % 8 (backtrack)
        const startDir = (dir + 5) % 8;
        for (let i = 0; i < 8; i++) {
          const d = (startDir + i) % 8;
          const nx = cx + dx[d];
          const ny = cy + dy[d];
          if (nx >= 0 && nx < w && ny >= 0 && ny < h && binary[ny * w + nx] > 0) {
            cx = nx;
            cy = ny;
            dir = d;
            found = true;
            break;
          }
        }

        if (!found) break;
        steps++;
      } while ((cx !== sx || cy !== sy) && steps < maxSteps);

      if (contour.length > 50) {
        contours.push(contour);
      }
    }
  }

  if (contours.length === 0) return null;

  // return largest contour
  contours.sort((a, b) => b.length - a.length);
  return contours[0];
};

// ── Ramer-Douglas-Peucker simplification ──────────────────────────
const rdpSimplify = (points, epsilon) => {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let maxIdx = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = pointToLineDist(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = rdpSimplify(points.slice(0, maxIdx + 1), epsilon);
    const right = rdpSimplify(points.slice(maxIdx), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
};

const pointToLineDist = (p, a, b) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
};

// ── find quadrilateral from simplified contour ────────────────────
const findQuad = (contour, w, h) => {
  // try different epsilon values to get exactly 4 points
  const perimeter = contourPerimeter(contour);

  for (let epsFactor = 0.02; epsFactor <= 0.08; epsFactor += 0.01) {
    const simplified = rdpSimplify(contour, epsFactor * perimeter);
    if (simplified.length === 4) {
      return orderCorners(simplified);
    }
    if (simplified.length === 5) {
      // try removing the point closest to a neighbor
      let minDist = Infinity, minIdx = 0;
      for (let i = 0; i < 5; i++) {
        const next = (i + 1) % 5;
        const d = Math.hypot(simplified[i][0] - simplified[next][0], simplified[i][1] - simplified[next][1]);
        if (d < minDist) { minDist = d; minIdx = i; }
      }
      const quad = simplified.filter((_, i) => i !== minIdx);
      return orderCorners(quad);
    }
  }
  return null;
};

const contourPerimeter = (pts) => {
  let p = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    p += Math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]);
  }
  return p;
};

// order 4 points as TL, TR, BR, BL
const orderCorners = (pts) => {
  // sort by y (top two vs bottom two)
  const sorted = [...pts].sort((a, b) => a[1] - b[1]);
  const top = sorted.slice(0, 2).sort((a, b) => a[0] - b[0]);   // left first
  const bottom = sorted.slice(2, 4).sort((a, b) => a[0] - b[0]);
  return [top[0], top[1], bottom[1], bottom[0]]; // TL TR BR BL
};

// ── validate detected quad ────────────────────────────────────────
const isValidBillQuad = (corners, frameW, frameH) => {
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const topW = dist(corners[0], corners[1]);
  const bottomW = dist(corners[3], corners[2]);
  const leftH = dist(corners[0], corners[3]);
  const rightH = dist(corners[1], corners[2]);

  const avgW = (topW + bottomW) / 2;
  const avgH = (leftH + rightH) / 2;

  // aspect ratio check — tighter range around INR bill ratio (2.38)
  const longer = Math.max(avgW, avgH);
  const shorter = Math.min(avgW, avgH);
  const aspect = longer / Math.max(1, shorter);
  if (aspect < 1.8 || aspect > 3.0) return false;

  // must be a reasonable size (at least 25% of frame longest dimension)
  if (longer < Math.max(frameW, frameH) * 0.25) return false;

  // must not be too large (not the entire frame / table edge)
  if (longer > Math.max(frameW, frameH) * 0.95) return false;

  // parallelism: opposite sides must be roughly equal length
  const topBottomRatio = Math.min(topW, bottomW) / Math.max(1, Math.max(topW, bottomW));
  const leftRightRatio = Math.min(leftH, rightH) / Math.max(1, Math.max(leftH, rightH));
  if (topBottomRatio < 0.6 || leftRightRatio < 0.6) return false;

  // quad area must be a meaningful fraction of the frame
  const quadArea = shoelaceArea(corners);
  const frameArea = frameW * frameH;
  if (quadArea < frameArea * 0.05) return false;   // too small
  if (quadArea > frameArea * 0.85) return false;    // too large (whole frame)

  // corners must not be too close to frame edges (avoids detecting the frame itself)
  const margin = Math.min(frameW, frameH) * 0.02;
  for (const [x, y] of corners) {
    if (x < margin || x > frameW - margin || y < margin || y > frameH - margin) return false;
  }

  // convexity check
  if (!isConvex(corners)) return false;

  return true;
};

// shoelace formula for polygon area
const shoelaceArea = (pts) => {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i][0] * pts[j][1];
    area -= pts[j][0] * pts[i][1];
  }
  return Math.abs(area) / 2;
};

const isConvex = (pts) => {
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const c = pts[(i + 2) % pts.length];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (cross !== 0) {
      if (sign === 0) sign = cross > 0 ? 1 : -1;
      else if ((cross > 0 ? 1 : -1) !== sign) return false;
    }
  }
  return true;
};

// ── MAIN: detect bill corners from a video element ────────────────
// Designed for real-time use (~5-10 fps). Processes at PROC_W resolution.
// Returns { corners: [[x,y]x4 in video coords], confidence } or null.
export const detectBillFromVideo = (video) => {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh || video.readyState < 2) return null;

  const scale = PROC_W / vw;
  const procH = Math.round(vh * scale);

  ensureBuffers(PROC_W, procH);

  // draw downscaled frame
  _procCtx.drawImage(video, 0, 0, PROC_W, procH);
  const imageData = _procCtx.getImageData(0, 0, PROC_W, procH);

  // jsfeat: grayscale → blur → canny
  jsfeat.imgproc.grayscale(imageData.data, PROC_W, procH, _gray);
  jsfeat.imgproc.gaussian_blur(_gray, _gray, 5, 0);
  jsfeat.imgproc.canny(_gray, _gray, 40, 100);

  // dilate edges slightly to close gaps (simple 3x3 max)
  const dilated = new Uint8Array(PROC_W * procH);
  for (let y = 1; y < procH - 1; y++) {
    for (let x = 1; x < PROC_W - 1; x++) {
      const idx = y * PROC_W + x;
      if (_gray.data[idx] > 0 ||
          _gray.data[idx - 1] > 0 || _gray.data[idx + 1] > 0 ||
          _gray.data[idx - PROC_W] > 0 || _gray.data[idx + PROC_W] > 0) {
        dilated[idx] = 255;
      }
    }
  }

  // trace the largest contour
  const contour = traceContour(dilated, PROC_W, procH);
  if (!contour || contour.length < 80) return null;

  // simplify to quadrilateral
  const quad = findQuad(contour, PROC_W, procH);
  if (!quad) return null;

  // validate
  if (!isValidBillQuad(quad, PROC_W, procH)) return null;

  // scale back to video coordinates
  const fullCorners = quad.map(([x, y]) => [x / scale, y / scale]);

  // confidence based on aspect ratio match (works for both orientations)
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const avgW = (dist(fullCorners[0], fullCorners[1]) + dist(fullCorners[3], fullCorners[2])) / 2;
  const avgH = (dist(fullCorners[0], fullCorners[3]) + dist(fullCorners[1], fullCorners[2])) / 2;
  const aspect = Math.max(avgW, avgH) / Math.max(1, Math.min(avgW, avgH));
  const aspectScore = 1 - Math.min(1, Math.abs(aspect - BILL_ASPECT) / 1.0);

  return {
    corners: fullCorners,
    confidence: Math.max(0.3, Math.min(1, aspectScore * 0.7 + 0.3)),
  };
};

// ── simple bounding-box crop from detected corners ──────────────
// Takes the axis-aligned bounding box of the 4 corners with padding.
// No perspective warping — the LLM handles slight tilt just fine.
export const boundingBoxCrop = (srcCanvas, corners) => {
  const srcW = srcCanvas.width;
  const srcH = srcCanvas.height;

  // find bounding box of corners
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of corners) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  // add 5% padding
  const padX = (maxX - minX) * 0.05;
  const padY = (maxY - minY) * 0.05;
  const cx = Math.max(0, Math.round(minX - padX));
  const cy = Math.max(0, Math.round(minY - padY));
  const cw = Math.min(srcW - cx, Math.round(maxX - minX + 2 * padX));
  const ch = Math.min(srcH - cy, Math.round(maxY - minY + 2 * padY));

  if (cw < 50 || ch < 50) return null;

  const outCanvas = document.createElement('canvas');
  outCanvas.width = cw;
  outCanvas.height = ch;
  const outCtx = outCanvas.getContext('2d');
  outCtx.drawImage(srcCanvas, cx, cy, cw, ch, 0, 0, cw, ch);
  return outCanvas;
};

// ── fallback crop (guide region only) ─────────────────────────────
export const fallbackCrop = (srcCanvas, guideRect) => {
  const inset = 0.05;
  const cx = guideRect.x + guideRect.w * inset;
  const cy = guideRect.y + guideRect.h * inset;
  const cw = guideRect.w * (1 - 2 * inset);
  const ch = guideRect.h * (1 - 2 * inset);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = OUT_W;
  outCanvas.height = OUT_H;
  const outCtx = outCanvas.getContext('2d');
  outCtx.drawImage(srcCanvas, cx, cy, cw, ch, 0, 0, OUT_W, OUT_H);
  return outCanvas;
};
