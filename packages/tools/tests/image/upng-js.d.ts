declare module "upng-js" {
  type ApngFrame = { delay: number };
  type ApngImage = {
    frames: ApngFrame[];
    tabs: { acTL: { num_frames: number; num_plays: number } };
  };
  const UPNG: {
    decode(input: ArrayBuffer): ApngImage;
    toRGBA8(input: ApngImage): ArrayBuffer[];
  };
  export default UPNG;
}
