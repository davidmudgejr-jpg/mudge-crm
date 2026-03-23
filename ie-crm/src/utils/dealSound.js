export function playDealSound() {
  const audio = new Audio('/sounds/armstrong.mp3');
  audio.volume = 0.8;
  audio.play().catch(() => {}); // silently ignore if file missing or autoplay blocked
}
