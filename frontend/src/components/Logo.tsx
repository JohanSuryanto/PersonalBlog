/** The cartoon-face mark. Same file as the favicon, so there's one drawing to maintain. Decorative: the site name sits beside it. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return <img src="/favicon.svg" width={size} height={size} alt="" className="logo-mark" />
}
