import Image from "next/image";

/**
 * The maker's mark, in the corner of the sign-in pane.
 *
 * Deliberately quiet: small, muted, and outside the form's own column so
 * it belongs to the page rather than to the task. An inscription is not
 * a credit line — it should reward being noticed, not compete with the
 * thing it is signing.
 *
 * **To use a real photo:** drop the image at `public/sai.jpg` (square,
 * 96px or larger) and set `PHOTO` below to `"/sai.jpg"`. It is served
 * from the app's own origin rather than hot-linked from Google, which
 * would depend on a URL that rotates and would leak a request to Google
 * from an unauthenticated page. Null keeps the monogram.
 */
const PHOTO: string | null = null;

const NAME = "Sai Phaneendra";

export function Inscription() {
  return (
    <div className="absolute right-8 bottom-8 flex items-center gap-2.5 text-muted-foreground">
      {PHOTO ? (
        <Image
          src={PHOTO}
          alt=""
          width={28}
          height={28}
          className="size-7 rounded-full object-cover ring-1 ring-border"
        />
      ) : (
        <span
          aria-hidden
          className="flex size-7 items-center justify-center rounded-full bg-foreground/5 text-[11px] font-semibold ring-1 ring-border"
        >
          SP
        </span>
      )}
      <span className="text-xs">
        Built by <span className="font-medium text-foreground/70">{NAME}</span>
      </span>
    </div>
  );
}
