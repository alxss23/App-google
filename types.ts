
export interface Slide {
  title: string;
  narration: string;
  imagePrompt: string;
}

export interface GeneratedSlide extends Slide {
  imageUrl: string;
}
