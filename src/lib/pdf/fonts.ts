import { Font } from "@react-pdf/renderer";
import path from "path";

let registered = false;

export function registerFonts() {
  if (registered) return;
  registered = true;

  const fontsDir = path.join(process.cwd(), "public", "fonts");

  Font.register({
    family: "Inter",
    fonts: [
      { src: path.join(fontsDir, "Inter-Regular.ttf"), fontWeight: 400 },
      { src: path.join(fontsDir, "Inter-Medium.ttf"), fontWeight: 500 },
      { src: path.join(fontsDir, "Inter-Bold.ttf"), fontWeight: 700 },
    ],
  });

  Font.register({
    family: "PlayfairDisplay",
    fonts: [
      { src: path.join(fontsDir, "PlayfairDisplay-Regular.ttf"), fontWeight: 400 },
      { src: path.join(fontsDir, "PlayfairDisplay-Bold.ttf"), fontWeight: 700 },
    ],
  });
}
