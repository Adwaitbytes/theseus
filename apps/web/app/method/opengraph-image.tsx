import { heroVoyage } from "@/lib/data";
import { ogSize, renderOg } from "@/lib/og";

export const alt = "Theseus method";
export const size = ogSize;
export const contentType = "image/png";
export const dynamic = "force-static";

export default async function Image() {
  return renderOg({
    title: "Method",
    subtitle: "Clean room rules, what a parity certificate proves, and what it does not.",
    sample: heroVoyage().sample,
  });
}
