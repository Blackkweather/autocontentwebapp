import path from "node:path";
import { GlobalFonts } from "@napi-rs/canvas";

let registered = false;

/** Registers the two brand-substitute fonts once per process. Anton stands in for Impact
 *  (Impact itself isn't freely redistributable); Arimo is metric-compatible with Arial. */
export function ensureFontsRegistered() {
  if (registered) return;
  const fontsDir = path.join(process.cwd(), "assets", "fonts");
  GlobalFonts.registerFromPath(path.join(fontsDir, "Anton-Regular.ttf"), "Anton");
  GlobalFonts.registerFromPath(path.join(fontsDir, "Arimo.ttf"), "Arimo");
  registered = true;
}
