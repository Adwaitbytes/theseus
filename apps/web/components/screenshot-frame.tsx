import Image from "next/image";

/** A screenshot from Kane's evidence pack, or a designed placeholder when none was committed. */
export function ScreenshotFrame({
  src,
  caption,
  tone = "neutral",
  missing,
}: {
  src: string | undefined;
  caption: string;
  tone?: "neutral" | "fail";
  missing: string;
}) {
  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <div
        className={`relative aspect-[4/3] overflow-hidden rounded-md border bg-sunken ${tone === "fail" ? "border-fail/60" : "border-rule"}`}
      >
        {src ? (
          <Image src={src} alt={caption} fill sizes="(min-width: 1024px) 24rem, 50vw" className="object-cover object-top" />
        ) : (
          <div className="absolute inset-0 grid place-items-center p-4 text-center">
            <div className="flex flex-col items-center gap-3">
              <svg width="28" height="22" viewBox="0 0 28 22" aria-hidden="true" className="text-ink-3" fill="none" stroke="currentColor" strokeWidth="1.25">
                <rect x="0.625" y="0.625" width="26.75" height="20.75" rx="2" />
                <path d="M0.625 5.5h26.75" />
                <circle cx="3.5" cy="3" r="0.6" fill="currentColor" stroke="none" />
                <circle cx="5.75" cy="3" r="0.6" fill="currentColor" stroke="none" />
              </svg>
              <p className="max-w-48 text-2xs text-ink-3">{missing}</p>
            </div>
          </div>
        )}
      </div>
      <figcaption className={`text-2xs ${tone === "fail" ? "text-fail" : "text-ink-3"}`}>{caption}</figcaption>
    </figure>
  );
}
