import Image from "next/image";

export function BrandMark({ small = false }: { small?: boolean }) {
  const size = small ? 44 : 64;
  return (
    <div className={`brand-mark${small ? " small" : ""}`} aria-hidden="true">
      <Image src="/brand-mark.svg" alt="" width={size} height={size} priority={!small} unoptimized />
    </div>
  );
}
